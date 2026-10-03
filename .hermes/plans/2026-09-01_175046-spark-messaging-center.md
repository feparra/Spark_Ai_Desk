# Spark Desktop → Messaging Center for Hermes (y cualquier agente)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transformar Spark Desktop de un notificador unidireccional en un messaging center bidireccional tipo Telegram, donde el usuario puede chatear con cualquier agente (Hermes, Claude, Codex, etc.), ver respuestas streaming en tiempo real, todo optimizado para PCs con 8GB RAM, con soporte para agentes remotos (VPS/Docker/otro PC).

**Architecture:** Spark evoluciona en 4 fases secuenciales: (1) Chat UI + persistencia local + modo lite, (2) integración con Hermes via API Server/Webhook, (3) conectividad remota con auth+tunnel/relay, (4) platform adapter nativo. Se mantiene todo lo que ya funciona (notificaciones Clippy, audio, radar, skins, MCP). Se agrega una capa de chat bidireccional con WebSocket, un store SQLite, y un módulo de conexión remota.

**Tech Stack:** Electron 34, Node.js (http + ws), better-sqlite3 (persistencia), Hermes API Server (OpenAI-compatible), Webhooks Hermes, WebSocket relay, Python (adaptador MCP existente).

**Repo:** `G:\My Drive\04_Desarrollo_AI\Spark_Desktop\`

---

## Contexto Actual (lo que YA existe y NO se toca)

| Componente | Archivo | Estado |
|---|---|---|
| Electron main (always-on-top, tray, IPC) | `src/main.js` | ✅ Funciona |
| HTTP + WS server (:7890) | `src/server.js` | ✅ Funciona |
| Preload bridge | `src/preload.js` | ✅ Funciona |
| Avatar + speech bubble + status pill | `src/renderer/app.js`, `index.html`, `styles.css` | ✅ Funciona |
| Audio procedural | `src/renderer/audio.js` | ✅ Funciona |
| Wander engine | `src/wander.js` | ✅ Funciona (desactivado por defecto) |
| Agent radar | `src/radar.js` | ✅ Funciona |
| MCP server (Python) | `scripts/spark_mcp_server.py` | ✅ Funciona |
| Python CLI helper | `scripts/spark_notify.py` | ✅ Funciona |

**Problemas clave a resolver:**
1. No hay chat bidireccional con historial — solo speech bubbles efímeros y prompts queue con polling
2. No hay persistencia de mensajes — todo se pierde al cerrar
3. No hay streaming de respuestas del agente
4. No hay auth — `localhost:7890` abierto a cualquiera en la red local
5. No hay conectividad remota — todo asume `localhost`
6. No hay modo lite para 8GB RAM — las fuentes se cargan de Google CDN, GIFs en memoria, backdrop-filter costoso
7. Quick-Input Hub desactivado por el usuario — necesita reactivarse como chat proper

---

## Fase 1: Chat UI + Persistencia + Modo Lite

**Objetivo:** Hacer que Spark tenga un panel de chat expandible con historial persistente, optimizado para 8GB RAM.

---

### Task 1.1: Crear estructura de directorios y package.json

**Objective:** Preparar la estructura del proyecto para las nuevas características.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/package.json`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/store/` (dir)
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/chat/` (dir)

**Step 1: Actualizar package.json con nuevas dependencias**

```json
{
  "name": "spark-desktop",
  "version": "2.0.0",
  "description": "Spark AI - Desktop Companion & Messaging Center for AI Agents",
  "main": "src/main.js",
  "scripts": {
    "start": "electron .",
    "dev": "electron .",
    "lite": "SPARK_LITE=1 electron .",
    "chat": "electron . -- --chat-mode"
  },
  "keywords": ["spark", "ai", "messaging-center", "agents", "hermes", "telegram-like"],
  "author": "Spark AI",
  "license": "MIT",
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "electron": "^34.2.0"
  }
}
```

**Step 2: Instalar better-sqlite3**

Run: `cd "G:/My Drive/04_Desarrollo_AI/Spark_Desktop" && npm install better-sqlite3`

**Step 3: Crear directorios**

```bash
mkdir -p src/store
mkdir -p src/renderer/chat
```

**Step 4: Commit**

```bash
git add package.json src/store src/renderer/chat
git commit -m "chore: setup structure for messaging center v2"
```

---

### Task 1.2: Implementar MessageStore con SQLite

**Objective:** Crear el módulo de persistencia de mensajes con better-sqlite3.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/store/messageStore.js`

**Step 1: Escribir messageStore.js**

```javascript
// src/store/messageStore.js
// Spark Message Store — SQLite persistence for chat sessions and messages
// Optimized for low RAM: pagination, WAL mode, minimal in-memory cache

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'spark-messages.db');
}

function initDb() {
  if (db) return db;

  const Database = require('better-sqlite3');
  const dbPath = getDbPath();

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // Better concurrency, lower disk I/O
  db.pragma('synchronous = NORMAL'); // Faster writes, safe with WAL
  db.pragma('cache_size = -2000'); // 2MB cache (negative = KB)

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      agent TEXT NOT NULL DEFAULT 'spark',
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL, -- 'user' | 'agent' | 'system'
      content TEXT NOT NULL,
      agent TEXT,
      timestamp INTEGER NOT NULL,
      metadata TEXT, -- JSON string for extra data
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Index for fast session message retrieval
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session
    ON messages(session_id, timestamp)
  `);

  return db;
}

function createSession(agent = 'spark', title = 'New Conversation') {
  initDb();
  const id = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = Date.now();

  db.prepare(`
    INSERT INTO sessions (id, agent, title, created_at, last_message_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, agent, title, now, now);

  return { id, agent, title, created_at: now, last_message_at: now };
}

function getSession(sessionId) {
  initDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

function getSessions(limit = 50) {
  initDb();
  return db.prepare(`
    SELECT * FROM sessions WHERE active = 1
    ORDER BY last_message_at DESC
    LIMIT ?
  `).all(limit);
}

function addMessage(sessionId, role, content, agent = null, metadata = {}) {
  initDb();
  const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = Date.now();
  const metadataStr = JSON.stringify(metadata);

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, agent, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, role, content, agent, now, metadataStr);

  // Update session last_message_at
  db.prepare(`
    UPDATE sessions SET last_message_at = ? WHERE id = ?
  `).run(now, sessionId);

  return { id, session_id: sessionId, role, content, agent, timestamp: now, metadata };
}

function getMessages(sessionId, limit = 50, offset = 0) {
  initDb();
  return db.prepare(`
    SELECT * FROM messages
    WHERE session_id = ?
    ORDER BY timestamp ASC
    LIMIT ? OFFSET ?
  `).all(sessionId, limit, offset);
}

function getMessageCount(sessionId) {
  initDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId);
  return row ? row.count : 0;
}

function updateMessage(id, content) {
  initDb();
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
}

function deleteSession(sessionId) {
  initDb();
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDb,
  createSession,
  getSession,
  getSessions,
  addMessage,
  getMessages,
  getMessageCount,
  updateMessage,
  deleteSession,
  closeDb
};
```

**Step 2: Verificar que el módulo carga sin errores**

Run: `cd "G:/My Drive/04_Desarrollo_AI/Spark_Desktop" && node -e "require('./src/store/messageStore.js'); console.log('OK')" 2>&1 || echo "Expected: needs Electron app context — OK if error is about app.getPath"`

**Step 3: Commit**

```bash
git add src/store/messageStore.js
git commit -m "feat: add SQLite message store with sessions and messages"
```

---

### Task 1.3: Agregar endpoints de chat al SparkServer

**Objective:** Extender server.js con endpoints para crear sesiones, enviar mensajes, obtener historial, y streaming.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/server.js`

**Step 1: Agregar imports al inicio de server.js**

Al principio de `server.js`, después de los requires existentes, agregar:

```javascript
// Al inicio, después de `let WebSocket;` y su try/catch
let messageStore = null;
try {
  messageStore = require('./store/messageStore');
} catch (e) {
  console.log('Message store not available:', e.message);
}
```

**Step 2: Agregar endpoints de chat en handleHttp (antes del 404 final)**

Dentro del bloque `if (req.method === 'POST')` en `handleHttp`, antes del `res.writeHead(404)` final, agregar:

```javascript
// ============ CHAT ENDPOINTS ============

if (req.method === 'GET' && pathname === '/api/chat/sessions') {
  const sessions = messageStore ? messageStore.getSessions(50) : [];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, sessions }));
  return;
}

if (req.method === 'GET' && pathname === '/api/chat/messages') {
  const sessionId = parsedUrl.query.session;
  const limit = parseInt(parsedUrl.query.limit) || 50;
  const offset = parseInt(parsedUrl.query.offset) || 0;
  if (!sessionId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing session param' }));
    return;
  }
  const messages = messageStore ? messageStore.getMessages(sessionId, limit, offset) : [];
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, messages }));
  return;
}
```

Dentro del bloque POST, antes del 404, agregar:

```javascript
if (pathname === '/api/chat/session') {
  const { agent = 'spark', title = 'New Conversation' } = json;
  const session = messageStore
    ? messageStore.createSession(agent, title)
    : { id: 'stub', agent, title, created_at: Date.now() };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, session }));
  return;
}

if (pathname === '/api/chat/send') {
  const { session_id, role = 'user', content, agent = 'spark', metadata = {} } = json;
  if (!session_id || !content) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing session_id or content' }));
    return;
  }

  // Save message to store
  const message = messageStore
    ? messageStore.addMessage(session_id, role, content, agent, metadata)
    : { id: 'stub', session_id, role, content, agent, timestamp: Date.now() };

  // Broadcast to all connected WS clients (so chat UI updates live)
  this.broadcast({
    type: 'chat_message',
    data: message
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, message }));
  return;
}

if (pathname === '/api/chat/reply') {
  // Called by the agent to send a reply to the user in a chat session
  const { session_id, content, agent = 'spark', metadata = {}, stream_id } = json;
  if (!session_id || !content) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing session_id or content' }));
    return;
  }

  const message = messageStore
    ? messageStore.addMessage(session_id, 'agent', content, agent, metadata)
    : { id: 'stub', session_id, role: 'agent', content, agent, timestamp: Date.now() };

  this.broadcast({
    type: 'chat_message',
    data: message
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, message }));
  return;
}

if (pathname === '/api/chat/stream') {
  // Streaming partial update — agent sends tokens as they arrive
  const { session_id, stream_id, chunk, done = false, agent = 'spark' } = json;
  if (!session_id || !stream_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing session_id or stream_id' }));
    return;
  }

  this.broadcast({
    type: 'chat_stream',
    data: { session_id, stream_id, chunk, done, agent }
  });

  if (done) {
    // Finalize: save complete message to store
    const fullContent = json.full_content || chunk || '';
    if (fullContent && messageStore) {
      messageStore.addMessage(session_id, 'agent', fullContent, agent, { stream_id });
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, streamed: true, done }));
  return;
}

if (pathname === '/api/chat/typing') {
  // Agent is typing indicator
  const { session_id, agent = 'spark', is_typing = true } = json;
  this.broadcast({
    type: 'chat_typing',
    data: { session_id, agent, is_typing }
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
  return;
}

if (pathname === '/api/chat/delete-session') {
  const { session_id } = json;
  if (messageStore && session_id) {
    messageStore.deleteSession(session_id);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
  return;
}
```

**Step 3: Verificar sintaxis**

Run: `cd "G:/My Drive/04_Desarrollo_AI/Spark_Desktop" && node -c src/server.js && echo "Syntax OK"`

**Step 4: Commit**

```bash
git add src/server.js
git commit -m "feat: add chat endpoints to SparkServer (sessions, messages, streaming, typing)"
```

---

### Task 1.4: Crear la UI del panel de Chat

**Objective:** Crear el panel de chat expandible en el renderer con historial scrollable y input box.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/chat/chat.html`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/chat/chat.css`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/chat/chat.js`

**Step 1: Crear chat.html**

```html
<!-- src/renderer/chat/chat.html -->
<!-- Spark Chat Panel — injected into index.html via DOM -->
<div id="chatPanel" class="chat-panel hidden">
  <!-- Chat Header -->
  <div class="chat-header">
    <div class="chat-header-info">
      <div id="chatAgentBadge" class="chat-agent-badge">
        <span class="dot"></span>
        <span id="chatAgentName">Spark</span>
      </div>
      <span id="chatSessionTitle" class="chat-session-title">New Conversation</span>
    </div>
    <div class="chat-header-actions">
      <button id="btnChatNew" class="chat-icon-btn" title="New conversation">+</button>
      <button id="btnChatSessions" class="chat-icon-btn" title="Sessions">☰</button>
      <button id="btnChatCollapse" class="chat-icon-btn" title="Collapse">▼</button>
    </div>
  </div>

  <!-- Sessions List (slide-in) -->
  <div id="chatSessionsList" class="chat-sessions-list hidden">
    <!-- Populated dynamically -->
  </div>

  <!-- Messages Container -->
  <div id="chatMessages" class="chat-messages">
    <!-- Messages injected here -->
  </div>

  <!-- Typing Indicator -->
  <div id="chatTypingIndicator" class="chat-typing-indicator hidden">
    <span class="chat-typing-dot"></span>
    <span class="chat-typing-dot"></span>
    <span class="chat-typing-dot"></span>
    <span class="chat-typing-text" id="chatTypingText">Agent is typing...</span>
  </div>

  <!-- Input Area -->
  <div class="chat-input-area">
    <div class="chat-input-row">
      <select id="chatAgentSelector" class="chat-agent-selector">
        <option value="hermes">🔴 Hermes</option>
        <option value="claude">🟠 Claude</option>
        <option value="antigravity">🔵 Antigravity</option>
        <option value="codex">🟢 Codex</option>
        <option value="spark">⚡ Spark</option>
        <option value="all">🌐 All</option>
      </select>
      <input type="text" id="chatInput" class="chat-input" placeholder="Type a message..." autocomplete="off" />
      <button id="btnChatSend" class="chat-send-btn" title="Send (Enter)">➤</button>
    </div>
  </div>
</div>
```

**Step 2: Crear chat.css**

```css
/* src/renderer/chat/chat.css */
/* Spark Chat Panel — Glassmorphism style, optimized for low RAM */

.chat-panel {
  width: 100%;
  max-width: 360px;
  max-height: 420px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
  margin-bottom: 10px;
  transition: opacity 0.25s ease, transform 0.25s ease;
  -webkit-app-region: no-drag;
}

.chat-panel.hidden {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
  pointer-events: none;
  display: none;
}

/* Lite mode: no blur, solid background */
.chat-panel.lite-mode {
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.chat-panel:not(.lite-mode) {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

/* Header */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.chat-header-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.chat-agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  flex-shrink: 0;
}

.chat-agent-badge .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.chat-session-title {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-header-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.chat-icon-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: all 0.15s;
  line-height: 1;
}

.chat-icon-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* Sessions List */
.chat-sessions-list {
  max-height: 120px;
  overflow-y: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 4px;
  flex-shrink: 0;
}

.chat-sessions-list.hidden {
  display: none;
}

.chat-session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 11px;
  color: #94a3b8;
  transition: background 0.15s;
}

.chat-session-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.chat-session-item.active {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
}

.chat-session-item .chat-session-delete {
  opacity: 0;
  color: #ef4444;
  font-size: 12px;
  padding: 0 4px;
}

.chat-session-item:hover .chat-session-delete {
  opacity: 0.7;
}

/* Messages Container */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 120px;
  scroll-behavior: smooth;
}

.chat-messages::-webkit-scrollbar {
  width: 4px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}

/* Message Bubbles */
.chat-msg {
  max-width: 85%;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-word;
  animation: chatMsgFadeIn 0.2s ease;
}

.chat-msg.user {
  align-self: flex-end;
  background: linear-gradient(135deg, #0284c7, #38bdf8);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-msg.agent {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-bottom-left-radius: 4px;
}

.chat-msg.system {
  align-self: center;
  background: rgba(0, 0, 0, 0.3);
  color: #64748b;
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 999px;
}

.chat-msg-meta {
  font-size: 9px;
  color: #64748b;
  margin-top: 2px;
}

.chat-msg.user .chat-msg-meta {
  color: rgba(255, 255, 255, 0.5);
}

/* Markdown in messages */
.chat-msg code {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 4px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.chat-msg pre {
  background: rgba(0, 0, 0, 0.4);
  padding: 6px 8px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 4px 0;
}

.chat-msg pre code {
  background: none;
  padding: 0;
}

.chat-msg strong { font-weight: 700; }
.chat-msg em { font-style: italic; }

/* Typing Indicator */
.chat-typing-indicator {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 12px;
  flex-shrink: 0;
}

.chat-typing-indicator.hidden {
  display: none;
}

.chat-typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #64748b;
  animation: chatTypingBounce 1.4s infinite;
}

.chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

.chat-typing-text {
  font-size: 10px;
  color: #64748b;
  margin-left: 4px;
}

/* Input Area */
.chat-input-area {
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.chat-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-agent-selector {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 10px;
  padding: 4px 6px;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  font-family: inherit;
}

.chat-input {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #f8fafc;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 10px;
  outline: none;
  font-family: inherit;
}

.chat-input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
}

.chat-input::placeholder {
  color: #64748b;
  font-size: 11px;
}

.chat-send-btn {
  background: linear-gradient(135deg, #0284c7, #38bdf8);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s;
}

.chat-send-btn:hover {
  transform: scale(1.08);
}

.chat-send-btn:active {
  transform: scale(0.95);
}

/* Animations */
@keyframes chatMsgFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes chatTypingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* Expand/collapse state */
.chat-panel.expanded {
  max-height: 500px;
}
```

**Step 3: Crear chat.js**

```javascript
// src/renderer/chat/chat.js
// Spark Chat Panel Controller — manages sessions, messages, input, streaming

const ChatPanel = {
  // State
  currentSession: null,
  sessions: [],
  messages: [],
  isTyping: false,
  typingTimeout: null,
  streamingMessage: null, // { stream_id, element, fullContent }
  isOpen: false,

  // DOM
  panel: null,
  messagesContainer: null,
  input: null,
  sendBtn: null,
  agentSelector: null,
  typingIndicator: null,
  sessionsList: null,

  // API base
  apiBase: 'http://localhost:7890',

  init() {
    this.panel = document.getElementById('chatPanel');
    this.messagesContainer = document.getElementById('chatMessages');
    this.input = document.getElementById('chatInput');
    this.sendBtn = document.getElementById('btnChatSend');
    this.agentSelector = document.getElementById('chatAgentSelector');
    this.typingIndicator = document.getElementById('chatTypingIndicator');
    this.sessionsList = document.getElementById('chatSessionsList');

    // Event listeners
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    document.getElementById('btnChatCollapse').addEventListener('click', () => this.toggle());
    document.getElementById('btnChatNew').addEventListener('click', () => this.newSession());
    document.getElementById('btnChatSessions').addEventListener('click', () => this.toggleSessionsList());

    // Listen to server events
    if (window.sparkBridge) {
      window.sparkBridge.onServerEvent((eventData) => {
        if (eventData.type === 'chat_message') {
          this.handleIncomingMessage(eventData.data);
        } else if (eventData.type === 'chat_stream') {
          this.handleStreamChunk(eventData.data);
        } else if (eventData.type === 'chat_typing') {
          this.handleTyping(eventData.data);
        }
      });
    }

    // Load existing sessions on init
    this.loadSessions();
  },

  toggle() {
    if (this.isOpen) {
      this.panel.classList.add('hidden');
      this.isOpen = false;
    } else {
      this.panel.classList.remove('hidden');
      this.isOpen = true;
      if (!this.currentSession) {
        this.newSession();
      }
      this.input.focus();
    }
  },

  async newSession() {
    const agent = this.agentSelector.value;
    try {
      const res = await fetch(`${this.apiBase}/api/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, title: `Chat with ${agent}` })
      });
      const data = await res.json();
      if (data.ok) {
        this.currentSession = data.session;
        this.messages = [];
        this.messagesContainer.innerHTML = '';
        this.updateHeader();
        this.loadSessions();
      }
    } catch (e) {
      console.error('Failed to create session:', e);
    }
  },

  async loadSessions() {
    try {
      const res = await fetch(`${this.apiBase}/api/chat/sessions`);
      const data = await res.json();
      if (data.ok) {
        this.sessions = data.sessions || [];
        this.renderSessionsList();
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  },

  renderSessionsList() {
    if (!this.sessionsList) return;
    this.sessionsList.innerHTML = '';
    this.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'chat-session-item' + (this.currentSession && s.id === this.currentSession.id ? ' active' : '');
      item.innerHTML = `
        <span>${s.title}</span>
        <span class="chat-session-delete" data-id="${s.id}">✕</span>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('chat-session-delete')) {
          this.deleteSession(s.id);
        } else {
          this.switchSession(s);
        }
      });
      this.sessionsList.appendChild(item);
    });
  },

  toggleSessionsList() {
    this.sessionsList.classList.toggle('hidden');
  },

  async switchSession(session) {
    this.currentSession = session;
    this.updateHeader();
    this.sessionsList.classList.add('hidden');
    try {
      const res = await fetch(`${this.apiBase}/api/chat/messages?session=${session.id}&limit=100`);
      const data = await res.json();
      if (data.ok) {
        this.messages = data.messages || [];
        this.renderMessages();
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  },

  async deleteSession(sessionId) {
    try {
      await fetch(`${this.apiBase}/api/chat/delete-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      if (this.currentSession && this.currentSession.id === sessionId) {
        this.currentSession = null;
        this.messages = [];
        this.messagesContainer.innerHTML = '';
      }
      this.loadSessions();
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  },

  async sendMessage() {
    const text = this.input.value.trim();
    if (!text || !this.currentSession) return;

    const agent = this.agentSelector.value;

    // Show user message immediately
    this.displayMessage({ role: 'user', content: text, timestamp: Date.now() });
    this.input.value = '';

    // Send to server
    try {
      await fetch(`${this.apiBase}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.currentSession.id,
          role: 'user',
          content: text,
          agent
        })
      });

      // Also dispatch as prompt for backward compat with MCP polling agents
      await fetch(`${this.apiBase}/api/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetAgent: agent, prompt: text })
      });

      // Show typing indicator
      this.setTyping(true, agent);
    } catch (e) {
      console.error('Failed to send message:', e);
      this.displayMessage({ role: 'system', content: 'Failed to send message', timestamp: Date.now() });
    }
  },

  handleIncomingMessage(data) {
    if (!this.currentSession || data.session_id !== this.currentSession.id) return;

    this.setTyping(false);
    this.displayMessage(data);
  },

  handleStreamChunk(data) {
    if (!this.currentSession || data.session_id !== this.currentSession.id) return;

    if (!this.streamingMessage || this.streamingMessage.stream_id !== data.stream_id) {
      // New stream — create a new message element
      this.setTyping(false);
      const msgEl = this.displayMessage({ role: 'agent', content: '', timestamp: Date.now() });
      this.streamingMessage = {
        stream_id: data.stream_id,
        element: msgEl,
        fullContent: ''
      };
    }

    if (data.chunk) {
      this.streamingMessage.fullContent += data.chunk;
      this.updateMessageContent(this.streamingMessage.element, this.streamingMessage.fullContent);
    }

    if (data.done) {
      this.streamingMessage = null;
    }
  },

  handleTyping(data) {
    if (!this.currentSession || data.session_id !== this.currentSession.id) return;
    this.setTyping(data.is_typing, data.agent);
  },

  displayMessage(msg) {
    const el = document.createElement('div');
    el.className = `chat-msg ${msg.role}`;
    el.innerHTML = this.formatContent(msg.content);

    if (msg.agent && msg.role === 'agent') {
      const meta = document.createElement('div');
      meta.className = 'chat-msg-meta';
      meta.textContent = msg.agent;
      el.appendChild(meta);
    }

    this.messagesContainer.appendChild(el);
    this.scrollToBottom();
    return el;
  },

  updateMessageContent(el, content) {
    if (!el) return;
    // Preserve meta if exists
    const meta = el.querySelector('.chat-msg-meta');
    el.innerHTML = this.formatContent(content);
    if (meta) el.appendChild(meta);
    this.scrollToBottom();
  },

  formatContent(text) {
    if (!text) return '';
    // Basic markdown: code blocks, inline code, bold, italic
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  },

  renderMessages() {
    this.messagesContainer.innerHTML = '';
    this.messages.forEach(msg => this.displayMessage(msg));
  },

  setTyping(isTyping, agent) {
    if (isTyping) {
      this.typingIndicator.classList.remove('hidden');
      const textEl = document.getElementById('chatTypingText');
      if (textEl) textEl.textContent = `${agent || 'Agent'} is typing...`;
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      // Auto-hide typing after 30s
      this.typingTimeout = setTimeout(() => this.setTyping(false), 30000);
    } else {
      this.typingIndicator.classList.add('hidden');
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
    }
  },

  updateHeader() {
    if (this.currentSession) {
      document.getElementById('chatAgentName').textContent = this.currentSession.agent || 'Spark';
      document.getElementById('chatSessionTitle').textContent = this.currentSession.title || 'Conversation';
    }
  },

  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
};

// Expose globally
window.ChatPanel = ChatPanel;
```

**Step 4: Commit**

```bash
git add src/renderer/chat/
git commit -m "feat: add chat panel UI (HTML, CSS, JS) with sessions, streaming, markdown"
```

---

### Task 1.5: Integrar el chat panel en index.html y app.js

**Objective:** Conectar el chat panel con el renderer existente.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/index.html`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/app.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/preload.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/main.js`

**Step 1: Modificar index.html — agregar chat panel y CSS/JS**

Al final del `<head>`, antes de `</head>`, agregar:

```html
<link rel="stylesheet" href="chat/chat.css">
```

Antes del `<div class="avatar-section">`, agregar:

```html
<!-- Chat Panel injected here -->
<div id="chatPanelContainer"></div>
```

Y como primer contenido del `<body>`, inyectar el chat HTML. Para simplicidad, copiar el contenido de `chat.html` directamente dentro de `index.html` antes del avatar section:

```html
<!-- ⚡ Chat Panel (Messaging Center) -->
<div id="chatPanel" class="chat-panel hidden">
  <!-- (contenido completo de chat.html aquí) -->
</div>
```

Al final del `<body>`, antes de `</body>`, agregar:

```html
<script src="chat/chat.js"></script>
```

**Step 2: Modificar app.js — reactivar click en avatar para abrir chat**

En `app.js`, buscar el bloque comentado `// avatarSection.addEventListener('click', ...` y reemplazarlo por:

```javascript
// Single click on avatar — toggle chat panel
avatarSection.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.ChatPanel) {
    ChatPanel.toggle();
  }
});
```

También, al final del archivo, después de `updateState(...)`, agregar:

```javascript
// Initialize Chat Panel
if (window.ChatPanel) {
  ChatPanel.init();
}
```

**Step 3: Modificar preload.js — agregar bridge para chat events**

En `preload.js`, el `onServerEvent` ya reenvía todos los eventos del server. No se necesita cambios extra porque `chat.js` usa `window.sparkBridge.onServerEvent()` que ya existe. Verificar que preload sigue exponiendo todo correctamente.

**Step 4: Modificar main.js — inicializar messageStore al arranque**

En `main.js`, en `app.whenReady().then(...)`, después de crear el server, agregar:

```javascript
// Initialize message store
try {
  const messageStore = require('./store/messageStore');
  messageStore.initDb();
  console.log('💾 Message store initialized');
} catch (e) {
  console.warn('Message store init failed:', e.message);
}
```

Y en el bloque de cleanup (app.on('window-all-closed')), agregar:

```javascript
const messageStore = require('./store/messageStore');
messageStore.closeDb();
```

**Step 5: Verificar que todo carga**

Run: `cd "G:/My Drive/04_Desarrollo_AI/Spark_Desktop" && node -c src/renderer/chat/chat.js && node -c src/server.js && node -c src/main.js && echo "All syntax OK"`

**Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/app.js src/preload.js src/main.js
git commit -m "feat: integrate chat panel into renderer, wire up avatar click to toggle chat"
```

---

### Task 1.6: Implementar Modo Lite para 8GB RAM

**Objective:** Detectar automáticamente si la PC tiene ≤8GB RAM y activar optimizaciones.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/main.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/app.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/styles.css`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/lite.js`

**Step 1: Crear lite.js — detector de modo lite**

```javascript
// src/renderer/lite.js
// Spark Lite Mode — auto-detect low RAM and apply optimizations

const LiteMode = {
  enabled: false,
  ramGB: 0,

  detect() {
    // Check device memory (Chrome/Electron exposes deviceMemory in GB)
    this.ramGB = navigator.deviceMemory || 8;
    // Also check explicit env override
    const urlParams = new URLSearchParams(window.location.search);
    const forceLite = urlParams.get('lite') === '1';

    this.enabled = forceLite || this.ramGB <= 8;

    if (this.enabled) {
      document.body.classList.add('lite-mode');
      console.log(`💨 Lite Mode ENABLED (RAM: ${this.ramGB}GB)`);
    }

    return this.enabled;
  },

  applyToChatPanel() {
    const panel = document.getElementById('chatPanel');
    if (panel && this.enabled) {
      panel.classList.add('lite-mode');
    }
  },

  // Get optimized settings
  getSettings() {
    return {
      radarInterval: this.enabled ? 30000 : 12000, // 30s vs 12s
      wanderEnabled: false, // Always off in lite
      backdropBlur: !this.enabled,
      gifAnimation: !this.enabled,
      fontLoading: this.enabled ? 'local' : 'cdn'
    };
  }
};

window.LiteMode = LiteMode;
```

**Step 2: Modificar main.js — agregar flags de Electron para modo lite**

En `main.js`, después de los `commandLine.appendSwitch` existentes, agregar:

```javascript
// Auto-detect low RAM mode
const os = require('os');
const totalRamGB = os.totalmem() / (1024 * 1024 * 1024);
const isLite = process.env.SPARK_LITE === '1' || totalRamGB <= 8;

if (isLite) {
  app.commandLine.appendSwitch('disable-cache');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  console.log(`💨 Lite Mode: RAM=${totalRamGB.toFixed(1)}GB — cache disabled, shader cache off`);
}

// Pass to renderer via URL query param
const rendererUrl = `file://${path.join(__dirname, 'renderer', 'index.html')}${isLite ? '?lite=1' : ''}`;
```

Y cambiar `mainWindow.loadFile(...)` por `mainWindow.loadURL(rendererUrl)`.

**Step 3: Modificar index.html — agregar lite.js antes que app.js**

```html
<script src="lite.js"></script>
<script src="audio.js"></script>
<script src="app.js"></script>
```

**Step 4: Modificar styles.css — agregar reglas lite-mode**

Al final de `styles.css`:

```css
/* === LITE MODE OPTIMIZATIONS === */
body.lite-mode .speech-bubble,
body.lite-mode .quick-input-hub,
body.lite-mode .status-pill {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: rgba(15, 23, 42, 0.98);
}

body.lite-mode .spark-media {
  image-rendering: pixelated;
  /* In lite mode, could swap GIF for static PNG */
}

body.lite-mode .spark-shadow {
  animation: none; /* Disable non-essential animation */
}

body.lite-mode .agent-badge .dot {
  animation: none; /* Disable pulse */
}

body.lite-mode .bubblePop {
  animation: none;
}
```

**Step 5: Modificar app.js — aplicar lite mode en init**

Al inicio de `app.js`, antes de `updateState(...)`, agregar:

```javascript
// Detect and apply lite mode
if (window.LiteMode) {
  LiteMode.detect();
  // Apply to chat panel when it's created
  setTimeout(() => LiteMode.applyToChatPanel(), 100);
}
```

**Step 6: Modificar radar.js — usar intervalo configurable**

En `radar.js`, cambiar:

```javascript
constructor(sparkServer, options = {}) {
  this.scanIntervalMs = options.scanIntervalMs || 12000;
```

Y en `main.js`, al crear el radar, pasar el intervalo:

```javascript
const isLite = require('os').totalmem() <= 8 * 1024 * 1024 * 1024;
agentRadar = new AgentRadar(sparkServer, {
  scanIntervalMs: isLite ? 30000 : 12000
});
```

**Step 7: Descargar fuentes localmente (opcional pero recomendado para offline + RAM)**

Crear `src/renderer/fonts/` y descargar Outfit + JetBrains Mono. Cambiar el `@import` de Google Fonts en CSS por `@font-face` local. (Se puede hacer después si es demasiado para un task.)

**Step 8: Commit**

```bash
git add src/renderer/lite.js src/main.js src/renderer/app.js src/renderer/styles.css src/radar.js
git commit -m "feat: add auto-detecting lite mode for 8GB RAM PCs"
```

---

### Task 1.7: Fuentes locales (sin Google CDN)

**Objective:** Eliminar la dependencia de Google Fonts CDN para funcionamiento offline y menos RAM.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/styles.css`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/fonts/` (dir)

**Step 1: Descargar fuentes**

Descargar Outfit (400, 600, 700) y JetBrains Mono (400, 500) desde Google Fonts como .woff2.

Run (bash):
```bash
mkdir -p "G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/fonts"
# Download Outfit
curl -sL "https://fonts.gstatic.com/s/outfit/v14/QGYyz_MVcBeNP4NjuGn.woff2" -o "G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/fonts/outfit-400.woff2"
curl -sL "https://fonts.gstatic.com/s/outfit/v14/QGYyz_MVcBeNP4NjuGn.woff2" -o "G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/fonts/outfit-600.woff2"
# Download JetBrains Mono
curl -sL "https://fonts.gstatic.com/s/jetbrainsmono/v20/tDbY2o-flEEny0FZhsfKu5WU4zrCIV-B.woff2" -o "G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/renderer/fonts/jetbrains-mono-400.woff2"
```

> Nota: Las URLs exactas de woff2 de Google Fonts cambian. Alternativa: usar `@font-face` con system fonts como fallback.

**Step 2: Reemplazar @import en styles.css**

Reemplazar la primera línea de `styles.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

Por:
```css
@font-face {
  font-family: 'Outfit';
  src: url('fonts/outfit-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Outfit';
  src: url('fonts/outfit-600.woff2') format('woff2');
  font-weight: 600;
  font-display: swap;
}
@font-face {
  font-family: 'Outfit';
  src: url('fonts/outfit-700.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('fonts/jetbrains-mono-400.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
```

**Fallback si la descarga falla:** Usar system fonts:
```css
:root {
  --font-main: 'Outfit', -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Consolas', monospace;
}
```

Y reemplazar todas las referencias a `'Outfit'` por `var(--font-main)` y `'JetBrains Mono'` por `var(--font-mono)`.

**Step 3: Commit**

```bash
git add src/renderer/fonts/ src/renderer/styles.css
git commit -m "perf: local fonts, remove Google Fonts CDN dependency"
```

---

### Task 1.8: Actualizar MCP server con chat tools

**Objective:** Agregar tools de chat al MCP server para que los agentes puedan crear sesiones, responder, y streamear.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/scripts/spark_mcp_server.py`

**Step 1: Agregar nuevas tools a TOOLS_LIST**

Después de `spark_dispatch_prompt` en `TOOLS_LIST`, agregar:

```python
{
    "name": "spark_chat_reply",
    "description": "Sends a reply message to the user in a Spark chat session. The message appears in the chat panel UI.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "The chat session ID to reply to"},
            "content": {"type": "string", "description": "The reply text content (supports basic markdown)"},
            "agent": {"type": "string", "description": "Agent name", "default": "spark"},
            "metadata": {"type": "object", "description": "Optional metadata"}
        },
        "required": ["session_id", "content"]
    }
},
{
    "name": "spark_chat_stream_chunk",
    "description": "Sends a streaming chunk to the user in a Spark chat session. Use multiple calls to build up a response token by token.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "The chat session ID"},
            "stream_id": {"type": "string", "description": "Unique ID for this stream (e.g. agent_name_timestamp)"},
            "chunk": {"type": "string", "description": "Text chunk to append"},
            "done": {"type": "boolean", "description": "Set true on final chunk to finalize the message", "default": False},
            "full_content": {"type": "string", "description": "Full message content (only on done=true)", "default": ""},
            "agent": {"type": "string", "default": "spark"}
        },
        "required": ["session_id", "stream_id", "chunk"]
    }
},
{
    "name": "spark_chat_set_typing",
    "description": "Shows or hides a 'typing...' indicator in the Spark chat panel.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "The chat session ID"},
            "is_typing": {"type": "boolean", "default": True},
            "agent": {"type": "string", "default": "spark"}
        },
        "required": ["session_id"]
    }
},
{
    "name": "spark_chat_create_session",
    "description": "Creates a new chat session in Spark for ongoing conversation with the user.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "agent": {"type": "string", "description": "Agent name for this session", "default": "spark"},
            "title": {"type": "string", "description": "Session title", "default": "New Conversation"}
        }
    }
},
{
    "name": "spark_chat_get_messages",
    "description": "Retrieves message history for a Spark chat session.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "The chat session ID"},
            "limit": {"type": "integer", "default": 50},
            "offset": {"type": "integer", "default": 0}
        },
        "required": ["session_id"]
    }
}
```

**Step 2: Agregar handlers en `handle_json_rpc`**

Después del bloque `spark_dispatch_prompt`, agregar:

```python
elif tool_name == "spark_chat_reply":
    session_id = arguments.get("session_id", "")
    content = arguments.get("content", "")
    agent = arguments.get("agent", "spark")
    metadata = arguments.get("metadata", {})
    res = send_spark_request("/api/chat/reply", {
        "session_id": session_id,
        "content": content,
        "agent": agent,
        "metadata": metadata
    })
    send_tool_result(req_id, f"Chat reply sent to session {session_id}")
    return

elif tool_name == "spark_chat_stream_chunk":
    session_id = arguments.get("session_id", "")
    stream_id = arguments.get("stream_id", "")
    chunk = arguments.get("chunk", "")
    done = arguments.get("done", False)
    full_content = arguments.get("full_content", "")
    agent = arguments.get("agent", "spark")
    res = send_spark_request("/api/chat/stream", {
        "session_id": session_id,
        "stream_id": stream_id,
        "chunk": chunk,
        "done": done,
        "full_content": full_content,
        "agent": agent
    })
    send_tool_result(req_id, f"Stream chunk sent (done={done})")
    return

elif tool_name == "spark_chat_set_typing":
    session_id = arguments.get("session_id", "")
    is_typing = arguments.get("is_typing", True)
    agent = arguments.get("agent", "spark")
    res = send_spark_request("/api/chat/typing", {
        "session_id": session_id,
        "is_typing": is_typing,
        "agent": agent
    })
    send_tool_result(req_id, f"Typing indicator set to {is_typing}")
    return

elif tool_name == "spark_chat_create_session":
    agent = arguments.get("agent", "spark")
    title = arguments.get("title", "New Conversation")
    res = send_spark_request("/api/chat/session", {
        "agent": agent,
        "title": title
    })
    session_data = res.get("session", {})
    send_tool_result(req_id, json.dumps({
        "session_id": session_data.get("id", ""),
        "agent": session_data.get("agent", agent),
        "title": session_data.get("title", title)
    }, indent=2))
    return

elif tool_name == "spark_chat_get_messages":
    session_id = arguments.get("session_id", "")
    limit = arguments.get("limit", 50)
    offset = arguments.get("offset", 0)
    res = send_spark_request(f"/api/chat/messages?session={session_id}&limit={limit}&offset={offset}", None, method="GET")
    messages = res.get("messages", [])
    send_tool_result(req_id, json.dumps({
        "session_id": session_id,
        "count": len(messages),
        "messages": messages
    }, indent=2))
    return
```

**Step 3: Commit**

```bash
git add scripts/spark_mcp_server.py
git commit -m "feat: add chat tools to MCP server (reply, stream, typing, sessions, history)"
```

---

### Task 1.9: Actualizar Python CLI helper con comandos de chat

**Objective:** Agregar comandos de chat a `spark_notify.py` para uso desde terminal.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/scripts/spark_notify.py`

**Step 1: Agregar funciones de chat**

Después de `dispatch_spark_prompt`, agregar:

```python
def spark_chat_create_session(agent="spark", title="New Conversation", port=DEFAULT_PORT):
    """Creates a new chat session in Spark."""
    url = f"http://localhost:{port}/api/chat/session"
    payload = {"agent": agent, "title": title}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error creating chat session: {e}", file=sys.stderr)
        return None

def spark_chat_reply(session_id, content, agent="spark", port=DEFAULT_PORT):
    """Sends a reply message to a Spark chat session."""
    url = f"http://localhost:{port}/api/chat/reply"
    payload = {"session_id": session_id, "content": content, "agent": agent}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error sending chat reply: {e}", file=sys.stderr)
        return None

def spark_chat_stream_chunk(session_id, stream_id, chunk, done=False, full_content="", agent="spark", port=DEFAULT_PORT):
    """Sends a streaming chunk to a Spark chat session."""
    url = f"http://localhost:{port}/api/chat/stream"
    payload = {
        "session_id": session_id, "stream_id": stream_id,
        "chunk": chunk, "done": done,
        "full_content": full_content, "agent": agent
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error sending stream chunk: {e}", file=sys.stderr)
        return None

def spark_chat_get_messages(session_id, limit=50, offset=0, port=DEFAULT_PORT):
    """Retrieves message history for a Spark chat session."""
    url = f"http://localhost:{port}/api/chat/messages?session={session_id}&limit={limit}&offset={offset}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error fetching messages: {e}", file=sys.stderr)
        return None
```

**Step 2: Agregar CLI args**

En `main()`, agregar:

```python
parser.add_argument("--chat-reply", type=str, default="", help="Send a reply to a chat session (requires --session)")
parser.add_argument("--session", type=str, default="", help="Chat session ID")
parser.add_argument("--chat-create", action="store_true", help="Create a new chat session")
parser.add_argument("--chat-history", action="store_true", help="Get message history for --session")
```

Y en la lógica de main, antes del bloque final:

```python
if args.chat_create:
    res = spark_chat_create_session(agent=args.agent, title=args.title or f"Chat with {args.agent.capitalize()}", port=args.port)
    if res and res.get("ok"):
        print(f"💬 Session created: {res['session']['id']} (agent: {res['session']['agent']})")
    return

if args.chat_reply and args.session:
    res = spark_chat_reply(session_id=args.session, content=args.chat_reply, agent=args.agent, port=args.port)
    if res:
        print(f"💬 Reply sent to session {args.session}")
    return

if args.chat_history and args.session:
    res = spark_chat_get_messages(session_id=args.session, port=args.port)
    if res and res.get("ok"):
        messages = res.get("messages", [])
        print(f"📜 {len(messages)} messages in session {args.session}:")
        for m in messages:
            role = m.get("role", "?")
            content = m.get("content", "")
            ts = m.get("timestamp", 0)
            print(f"  [{role}] {content[:80]}")
    return
```

**Step 3: Commit**

```bash
git add scripts/spark_notify.py
git commit -m "feat: add chat CLI commands (create, reply, history)"
```

---

### Task 1.10: Test end-to-end de Fase 1

**Objective:** Verificar que el chat funciona localmente.

**Step 1: Iniciar Spark**

Run: `cd "G:/My Drive/04_Desarrollo_AI/Spark_Desktop" && npx electron .`

**Step 2: Click en avatar → chat panel aparece**

**Step 3: Crear sesión via curl**

```bash
curl -X POST http://localhost:7890/api/chat/session \
  -H "Content-Type: application/json" \
  -d '{"agent": "hermes", "title": "Test Chat"}'
```

**Step 4: Enviar mensaje desde la UI**

**Step 5: Responder via curl (simulando agente)**

```bash
curl -X POST http://localhost:7890/api/chat/reply \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<SESSION_ID>", "content": "Hello from the agent!", "agent": "hermes"}'
```

Verificar: El mensaje aparece en el chat panel.

**Step 6: Probar streaming**

```bash
# Stream chunks
curl -X POST http://localhost:7890/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<ID>", "stream_id": "test_stream_1", "chunk": "Hello ", "done": false}'

curl -X POST http://localhost:7890/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<ID>", "stream_id": "test_stream_1", "chunk": "world!", "done": true, "full_content": "Hello world!"}'
```

Verificar: El texto aparece progresivamente en el chat.

**Step 7: Probar modo lite**

```bash
SPARK_LITE=1 npx electron .
```

Verificar: Sin blur, sin animaciones pesadas.

**Step 8: Commit**

```bash
git commit --allow-empty -m "test: phase 1 end-to-end verification passed"
```

---

## Fase 2: Integración con Hermes

**Objetivo:** Conectar Spark con Hermes para que los mensajes del usuario lleguen al agente y las respuestas vuelvan a Spark.

---

### Task 2.1: Investigar Hermes API Server

**Objective:** Entender cómo usar el API Server de Hermes como backend de chat.

**Files:** Read-only research.

**Step 1: Leer la documentación del API Server de Hermes**

Fetch: `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server`

**Step 2: Leer la documentación de webhooks de Hermes**

Fetch: `https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks`

**Step 3: Documentar findings en el plan**

El API Server de Hermes expone un endpoint OpenAI-compatible en `http://localhost:PORT/v1/chat/completions`. Spark puede:

1. Enviar el mensaje del usuario como un chat completion request
2. Recibir la respuesta (streaming SSE o JSON completa)
3. Mostrarla en el chat panel

Para webhooks: Hermes puede enviar eventos a Spark cuando un agente termina una tarea.

---

### Task 2.2: Crear adaptador Hermes API en Spark

**Objective:** Crear un módulo en Spark que conecte con el API Server de Hermes.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/hermesAdapter.js`

**Step 1: Crear hermesAdapter.js**

```javascript
// src/hermesAdapter.js
// Spark ↔ Hermes Bridge — connects Spark chat to Hermes API Server
// Supports: OpenAI-compatible chat completions (streaming SSE), webhook receiver

const http = require('http');
const https = require('https');

class HermesAdapter {
  constructor(sparkServer, config = {}) {
    this.sparkServer = sparkServer;
    this.apiUrl = config.apiUrl || process.env.HERMES_API_URL || 'http://localhost:8000';
    this.apiKey = config.apiKey || process.env.HERMES_API_KEY || '';
    this.model = config.model || process.env.HERMES_MODEL || 'default';
    this.enabled = false;
    this.activeStreams = new Map(); // session_id -> stream controller
  }

  enable() {
    this.enabled = true;
    console.log(`🔌 Hermes adapter enabled: ${this.apiUrl}`);
  }

  // Send a chat message to Hermes and stream the response back to Spark
  async sendChatMessage(sessionId, userMessage, agent = 'hermes') {
    if (!this.enabled) return;

    const streamId = `hermes_${Date.now()}`;
    const body = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: `You are ${agent}, responding via Spark Desktop.` },
        { role: 'user', content: userMessage }
      ],
      stream: true
    });

    // Notify Spark that agent is typing
    this.sparkServer.broadcast({
      type: 'chat_typing',
      data: { session_id: sessionId, agent, is_typing: true }
    });

    try {
      const response = await this.makeRequest('/v1/chat/completions', body, true);

      if (response.status !== 200) {
        throw new Error(`Hermes API returned ${response.status}`);
      }

      // Parse SSE stream
      let fullContent = '';
      const reader = response.body;

      for await (const chunk of reader) {
        const text = chunk.toString();
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
                // Stream chunk to Spark
                this.sparkServer.broadcast({
                  type: 'chat_stream',
                  data: {
                    session_id: sessionId,
                    stream_id: streamId,
                    chunk: delta,
                    done: false,
                    agent
                  }
                });
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      // Finalize stream
      this.sparkServer.broadcast({
        type: 'chat_stream',
        data: {
          session_id: sessionId,
          stream_id: streamId,
          chunk: '',
          done: true,
          full_content: fullContent,
          agent
        }
      });

      // Save to message store
      const messageStore = require('./store/messageStore');
      messageStore.addMessage(sessionId, 'agent', fullContent, agent, { stream_id: streamId });

      // Stop typing
      this.sparkServer.broadcast({
        type: 'chat_typing',
        data: { session_id: sessionId, agent, is_typing: false }
      });

    } catch (error) {
      console.error('Hermes API error:', error.message);
      // Send error message to chat
      this.sparkServer.broadcast({
        type: 'chat_message',
        data: {
          session_id: sessionId,
          role: 'system',
          content: `Error connecting to Hermes: ${error.message}`,
          timestamp: Date.now()
        }
      });
      this.sparkServer.broadcast({
        type: 'chat_typing',
        data: { session_id: sessionId, agent, is_typing: false }
      });
    }
  }

  makeRequest(path, body, stream = false) {
    return new Promise((resolve, reject) => {
      const isHttps = this.apiUrl.startsWith('https');
      const lib = isHttps ? https : http;
      const url = new URL(this.apiUrl + path);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'Accept': stream ? 'text/event-stream' : 'application/json'
        }
      };

      const req = lib.request(options, (res) => {
        resolve({
          status: res.statusCode,
          body: this.readStream(res, stream)
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async *readStream(res, isSSE) {
    let buffer = '';
    for await (const chunk of res) {
      buffer += chunk.toString();
      if (isSSE) {
        // Yield raw chunks for SSE parsing
        yield buffer;
        buffer = '';
      }
    }
    if (buffer) yield buffer;
  }
}

module.exports = HermesAdapter;
```

**Step 2: Commit**

```bash
git add src/hermesAdapter.js
git commit -m "feat: add Hermes API adapter with streaming SSE support"
```

---

### Task 2.3: Integrar Hermes adapter en main.js

**Objective:** Conectar el adapter al flujo de chat de Spark.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/main.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/server.js`

**Step 1: En server.js, agregar hook en /api/chat/send**

En el handler de `/api/chat/send`, después de guardar el mensaje y broadcast, agregar:

```javascript
// If Hermes adapter is configured, forward the message
if (this.onChatMessage) {
  this.onChatMessage(session_id, content, agent);
}
```

**Step 2: En main.js, inicializar y conectar el adapter**

Después de crear sparkServer, agregar:

```javascript
const HermesAdapter = require('./hermesAdapter');

const hermesAdapter = new HermesAdapter(sparkServer, {
  apiUrl: process.env.HERMES_API_URL,
  apiKey: process.env.HERMES_API_KEY,
  model: process.env.HERMES_MODEL
});

// Only enable if Hermes API URL is set
if (process.env.HERMES_API_URL) {
  hermesAdapter.enable();
}

// Wire up: when user sends a chat message, forward to Hermes
sparkServer.onChatMessage = (sessionId, content, agent) => {
  if (hermesAdapter.enabled) {
    hermesAdapter.sendChatMessage(sessionId, content, agent);
  }
};
```

**Step 3: Commit**

```bash
git add src/main.js src/server.js
git commit -m "feat: wire Hermes adapter into SparkServer chat flow"
```

---

### Task 2.4: Crear receptor de webhooks de Hermes

**Objective:** Permitir que Hermes envíe eventos a Spark via webhooks.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/server.js`

**Step 1: Agregar endpoint de webhook en server.js**

Dentro del handler POST, antes del 404:

```javascript
if (pathname === '/api/hermes-webhook') {
  // Hermes webhook receiver — handles events from Hermes gateway
  const { event, data } = json;
  console.log(`📨 Hermes webhook received: ${event}`);

  if (event === 'message_response' && data) {
    // Agent sent a response message
    const { session_id, content, agent } = data;
    if (session_id && content) {
      const message = messageStore
        ? messageStore.addMessage(session_id, 'agent', content, agent || 'hermes')
        : null;

      this.broadcast({
        type: 'chat_message',
        data: message || { session_id, role: 'agent', content, agent, timestamp: Date.now() }
      });
    }
  } else if (event === 'task_completed') {
    // Show notification
    this.broadcast({
      type: 'notification',
      data: {
        id: `webhook_${Date.now()}`,
        agent: data.agent || 'hermes',
        state: 'done',
        title: data.title || 'Task Completed',
        message: data.message || '',
        actions: ['Got it!'],
        timeout: 10,
        sound: true,
        timestamp: Date.now()
      }
    });
  } else if (event === 'task_started') {
    this.updateState({
      state: 'working',
      agent: data.agent || 'hermes',
      message: data.message || 'Working on task...'
    });
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, received: event }));
  return;
}
```

**Step 2: Documentar configuración del webhook en Hermes**

Crear `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/docs/hermes-setup.md`:

```markdown
# Hermes Integration Setup

## Option 1: API Server (Recommended for chat)

1. Start Hermes API server:
   ```bash
   hermes proxy
   ```

2. Set env vars before starting Spark:
   ```bash
   set HERMES_API_URL=http://localhost:8000
   set HERMES_API_KEY=your-key-if-needed
   set HERMES_MODEL=default
   ```

3. Start Spark:
   ```bash
   start_spark.bat
   ```

4. Click on Spark avatar → chat panel opens
5. Select "Hermes" as agent → type message
6. Response streams back in real-time

## Option 2: Webhook Bridge (For async events)

1. Configure Hermes webhook to point to Spark:
   ```yaml
   # In Hermes config.yaml
   webhooks:
     spark:
       url: "http://YOUR_PC_IP:7890/api/hermes-webhook"
       events: [message_response, task_completed, task_started]
   ```

2. If Spark is behind NAT, use tunnel:
   ```bash
   ngrok http 7890
   # Use the ngrok URL in Hermes config
   ```

## Option 3: MCP Server (For agent-initiated notifications)

Already configured — agents use MCP tools to notify Spark.
See AGENTS.md for configuration.
```

**Step 3: Commit**

```bash
git add src/server.js docs/hermes-setup.md
git commit -m "feat: add Hermes webhook receiver + integration docs"
```

---

### Task 2.5: Test de integración con Hermes

**Objective:** Verificar que Spark puede chatear con Hermes via API Server.

**Step 1: Iniciar Hermes API server**

```bash
hermes proxy
# or hermes dashboard
```

**Step 2: Iniciar Spark con Hermes URL**

```bash
set HERMES_API_URL=http://localhost:8000
start_spark.bat
```

**Step 3: Abrir chat, seleccionar Hermes, enviar mensaje**

**Step 4: Verificar streaming funciona**

**Step 5: Commit**

```bash
git commit --allow-empty -m "test: phase 2 Hermes integration verified"
```

---

## Fase 3: Conectividad Remota (VPS / Docker / otro PC)

**Objetivo:** Permitir que agentes corriendo en VPS, Docker, u otra PC se conecten a Spark.

---

### Task 3.1: Sistema de autenticación con API Token

**Objective:** Agregar auth token a todas las peticiones HTTP y WS.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/server.js`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/auth.js`

**Step 1: Crear auth.js**

```javascript
// src/auth.js
// Spark Auth — simple token-based authentication for remote connections

class SparkAuth {
  constructor() {
    this.token = process.env.SPARK_AUTH_TOKEN || null;
    this.enabled = !!this.token;
  }

  // Generate a new random token
  generateToken() {
    const crypto = require('crypto');
    this.token = crypto.randomBytes(24).toString('hex');
    this.enabled = true;
    return this.token;
  }

  // Validate a request's auth token
  validateRequest(req) {
    if (!this.enabled) return true; // Auth disabled = allow all (local mode)

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Also check query param for WebSocket connections
    if (!token) {
      const url = require('url');
      const parsed = url.parse(req.url, true);
      const queryToken = parsed.query.token || parsed.query.auth;
      if (queryToken === this.token) return true;
    }

    return token === this.token;
  }

  // Get token for sharing with remote agents
  getToken() {
    return this.token;
  }

  // Check if auth is enabled
  isEnabled() {
    return this.enabled;
  }
}

module.exports = SparkAuth;
```

**Step 2: Integrar auth en server.js**

Al inicio del constructor de SparkServer, agregar:

```javascript
const SparkAuth = require('./auth');
this.auth = new SparkAuth();
```

En `handleHttp`, al inicio del método (antes de cualquier handler), agregar:

```javascript
// Auth check
if (this.auth.isEnabled() && !this.auth.validateRequest(req)) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
  return;
}
```

En `setupWebSockets`, en la conexión, agregar:

```javascript
this.wss.on('connection', (ws, req) => {
  // Validate auth on WS connection
  if (this.auth.isEnabled() && !this.auth.validateRequest(req)) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  // ... rest of connection handling
```

**Step 3: Generar token en main.js si no existe**

```javascript
// In main.js, after server start
if (!process.env.SPARK_AUTH_TOKEN) {
  // For local-only mode, auth is optional
  console.log('🔓 Auth disabled (local mode). Set SPARK_AUTH_TOKEN to enable.');
} else {
  console.log(`🔐 Auth enabled. Token: ${sparkServer.auth.getToken()}`);
}
```

**Step 4: Commit**

```bash
git add src/auth.js src/server.js src/main.js
git commit -m "feat: add API token authentication for remote connections"
```

---

### Task 3.2: Soporte de CORS configurable

**Objective:** Restringir CORS a dominios/IPs específicas en modo remoto.

**Files:**
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/server.js`

**Step 1: Cambiar CORS hardcoded**

En `handleHttp`, reemplazar:

```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

Por:

```javascript
const corsOrigin = process.env.SPARK_CORS_ORIGIN || '*';
res.setHeader('Access-Control-Allow-Origin', corsOrigin);
```

**Step 2: Commit**

```bash
git add src/server.js
git commit -m "feat: configurable CORS origin"
```

---

### Task 3.3: Crear Spark Relay Server para VPS

**Objective:** Crear un relay server ligero que corre en un VPS y puentea Spark Desktop con agentes remotos.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/relay/sparkRelay.js`
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/relay/relayConfig.example.json`

**Step 1: Crear sparkRelay.js**

```javascript
// src/relay/sparkRelay.js
// Spark Relay Server — lightweight WebSocket bridge for remote connections
// Runs on a VPS. Spark Desktop connects outbound, agents connect inbound.
// Usage: node sparkRelay.js --port 7891 --token your-secret

const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const args = process.argv.slice(2);
const PORT = parseInt(args[args.indexOf('--port') + 1]) || 7891;
const TOKEN = args[args.indexOf('--token') + 1] || process.env.SPARK_RELAY_TOKEN || '';

if (!TOKEN) {
  console.error('❌ Token required: --token YOUR_SECRET or SPARK_RELAY_TOKEN env');
  process.exit(1);
}

const sparkClients = new Set();  // Spark Desktop instances connected
const agentClients = new Set();  // Agent instances connected

function validateToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const url = require('url');
  const query = url.parse(req.url, true).query;
  return token === TOKEN || query.token === TOKEN;
}

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      sparkClients: sparkClients.size,
      agentClients: agentClients.size,
      uptime: process.uptime()
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  if (!validateToken(req)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const url = require('url');
  const path = url.parse(req.url).pathname;
  const isSpark = path === '/spark';
  const isAgent = path === '/agent';

  if (isSpark) {
    sparkClients.add(ws);
    console.log(`⚡ Spark Desktop connected (${sparkClients.size} total)`);
    ws.send(JSON.stringify({ type: 'relay_connected', role: 'spark' }));
  } else if (isAgent) {
    agentClients.add(ws);
    console.log(`🤖 Agent connected (${agentClients.size} total)`);
    ws.send(JSON.stringify({ type: 'relay_connected', role: 'agent' }));
  } else {
    ws.close(4000, 'Invalid path. Use /spark or /agent');
    return;
  }

  ws.on('message', (data) => {
    // Bridge messages between Spark and agents
    const target = isSpark ? agentClients : sparkClients;
    const source = isSpark ? 'spark' : 'agent';
    console.log(`[${source} → ${isSpark ? 'agents' : 'spark'}] ${data.toString().slice(0, 80)}...`);

    for (const client of target) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  });

  ws.on('close', () => {
    sparkClients.delete(ws);
    agentClients.delete(ws);
    console.log(`Connection closed (spark: ${sparkClients.size}, agent: ${agentClients.size})`);
  });
});

server.listen(PORT, () => {
  console.log(`⚡ Spark Relay Server listening on port ${PORT}`);
  console.log(`   Spark connects to:  ws://YOUR_VPS:${PORT}/spark?token=YOUR_TOKEN`);
  console.log(`   Agents connect to:  ws://YOUR_VPS:${PORT}/agent?token=YOUR_TOKEN`);
  console.log(`   Health check:       http://YOUR_VPS:${PORT}/health`);
});
```

**Step 2: Crear relayConfig.example.json**

```json
{
  "relayUrl": "ws://your-vps-ip:7891",
  "token": "your-secret-token-here",
  "role": "spark"
}
```

**Step 3: Commit**

```bash
git add src/relay/
git commit -m "feat: add Spark Relay Server for VPS/Docker remote connections"
```

---

### Task 3.4: Modo cliente relay en Spark Desktop

**Objective:** Spark se conecta outbound a un relay remoto y espeja mensajes.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/relayClient.js`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/main.js`

**Step 1: Crear relayClient.js**

```javascript
// src/relayClient.js
// Spark Relay Client — connects Spark Desktop to a remote relay server
// Spark initiates the connection (outbound), so no port forwarding needed.

const WebSocket = require('ws');

class RelayClient {
  constructor(sparkServer, config = {}) {
    this.sparkServer = sparkServer;
    this.relayUrl = config.relayUrl || process.env.SPARK_RELAY_URL;
    this.token = config.token || process.env.SPARK_RELAY_TOKEN;
    this.ws = null;
    this.reconnectDelay = 5000;
    this.maxReconnectDelay = 30000;
    this.shouldConnect = false;
  }

  connect() {
    if (!this.relayUrl || !this.token) {
      console.log('🔒 Relay client: no URL/token configured, skipping');
      return;
    }

    this.shouldConnect = true;
    this._connect();
  }

  _connect() {
    if (!this.shouldConnect) return;

    const url = `${this.relayUrl}/spark?token=${this.token}`;
    console.log(`🔌 Connecting to relay: ${this.relayUrl}`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('✅ Relay connected');
      this.reconnectDelay = 5000; // Reset backoff

      // Listen to all sparkServer broadcasts and forward to relay
      this.sparkServer.onRelayMessage = (messageObj) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(messageObj));
        }
      };
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        // Forward incoming relay messages to local Spark server (and renderer)
        this.sparkServer.broadcast(msg);

        // Also forward to renderer via IPC
        if (this.sparkServer.onRelayInbound) {
          this.sparkServer.onRelayInbound(msg);
        }
      } catch (e) {
        console.error('Relay parse error:', e.message);
      }
    });

    this.ws.on('close', () => {
      console.log(`⚠️ Relay disconnected. Reconnecting in ${this.reconnectDelay / 1000}s...`);
      this.sparkServer.onRelayMessage = null;
      if (this.shouldConnect) {
        setTimeout(() => this._connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    });

    this.ws.on('error', (err) => {
      console.error('Relay error:', err.message);
    });
  }

  disconnect() {
    this.shouldConnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = RelayClient;
```

**Step 2: En main.js, inicializar relay client**

Después de crear sparkServer y hermesAdapter, agregar:

```javascript
const RelayClient = require('./relayClient');

const relayClient = new RelayClient(sparkServer, {
  relayUrl: process.env.SPARK_RELAY_URL,
  token: process.env.SPARK_RELAY_TOKEN
});

// Only connect if relay URL is set
if (process.env.SPARK_RELAY_URL) {
  relayClient.connect();
}

// Wire up broadcast forwarding: when sparkServer broadcasts, also send to relay
const originalBroadcast = sparkServer.broadcast.bind(sparkServer);
sparkServer.broadcast = function(msg) {
  originalBroadcast(msg);
  if (relayClient.isConnected() && sparkServer.onRelayMessage) {
    sparkServer.onRelayMessage(msg);
  }
};
```

**Step 3: Commit**

```bash
git add src/relayClient.js src/main.js
git commit -m "feat: add relay client mode for remote VPS connections"
```

---

### Task 3.5: Configuración de conexión (spark_config.json)

**Objective:** Archivo de configuración centralizado para Spark.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/spark_config.example.json`
- Modify: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/src/main.js`

**Step 1: Crear spark_config.example.json**

```json
{
  "mode": "local",
  "port": 7890,
  "auth": {
    "enabled": false,
    "token": ""
  },
  "hermes": {
    "apiUrl": "",
    "apiKey": "",
    "model": "default"
  },
  "relay": {
    "enabled": false,
    "url": "",
    "token": ""
  },
  "lite": {
    "autoDetect": true,
    "forceLite": false,
    "ramThresholdGB": 8
  },
  "cors": {
    "origin": "*"
  }
}
```

**Step 2: Cargar config en main.js**

Al inicio de `main.js`, después de los requires:

```javascript
const fs = require('fs');
const path = require('path');

// Load config file if exists
let sparkConfig = {};
const configPath = path.join(__dirname, '..', 'spark_config.json');
if (fs.existsSync(configPath)) {
  try {
    sparkConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📋 Loaded spark_config.json');
  } catch (e) {
    console.warn('Failed to parse spark_config.json:', e.message);
  }
}

// Apply config to env if env vars are not already set
if (sparkConfig.port && !process.env.SPARK_PORT) process.env.SPARK_PORT = sparkConfig.port;
if (sparkConfig.auth?.token) process.env.SPARK_AUTH_TOKEN = sparkConfig.auth.token;
if (sparkConfig.hermes?.apiUrl) process.env.HERMES_API_URL = sparkConfig.hermes.apiUrl;
if (sparkConfig.hermes?.apiKey) process.env.HERMES_API_KEY = sparkConfig.hermes.apiKey;
if (sparkConfig.hermes?.model) process.env.HERMES_MODEL = sparkConfig.hermes.model;
if (sparkConfig.relay?.url) process.env.SPARK_RELAY_URL = sparkConfig.relay.url;
if (sparkConfig.relay?.token) process.env.SPARK_RELAY_TOKEN = sparkConfig.relay.token;
if (sparkConfig.cors?.origin) process.env.SPARK_CORS_ORIGIN = sparkConfig.cors.origin;
if (sparkConfig.lite?.forceLite) process.env.SPARK_LITE = '1';
```

**Step 3: Commit**

```bash
git add spark_config.example.json src/main.js
git commit -m "feat: add spark_config.json for centralized configuration"
```

---

### Task 3.6: Documentación de deployment remoto

**Objective:** Guías claras para los 3 escenarios (VPS, Docker, otro PC).

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/docs/remote-setup.md`

**Step 1: Crear remote-setup.md**

```markdown
# Remote Connection Setup

## Scenario 1: Agent on VPS (Simplest — ngrok tunnel)

### On your PC (where Spark runs):
```bash
# Install ngrok
ngrok http 7890
# You get: https://abc123.ngrok.io
```

### On the VPS (where Hermes runs):
```bash
# Set Spark URL to the ngrok URL
export SPARK_URL=https://abc123.ngrok.io
export SPARK_AUTH_TOKEN=your-token

# Hermes can now send notifications to Spark
python spark_notify.py --state working --agent hermes --message "Working on VPS..."
```

## Scenario 2: Agent on VPS (Relay Server)

### On the VPS — run the relay:
```bash
node sparkRelay.js --port 7891 --token my-secret-token
```

### On your PC — configure Spark to connect to relay:
```json
// spark_config.json
{
  "relay": {
    "enabled": true,
    "url": "ws://your-vps-ip:7891",
    "token": "my-secret-token"
  }
}
```

### On the VPS — agent connects to relay:
```bash
# Agent uses ws://localhost:7891/agent?token=my-secret-token
# The relay bridges to your Spark Desktop
```

## Scenario 3: Agent in Docker

### Dockerfile snippet:
```dockerfile
RUN apt-get update && apt-get install -y nodejs npm
COPY sparkRelay.js /app/
CMD ["node", "/app/sparkRelay.js", "--port", "7891", "--token", "secret"]
```

### Docker compose:
```yaml
services:
  spark-relay:
    build: .
    ports:
      - "7891:7891"
    command: node sparkRelay.js --port 7891 --token secret

  hermes:
    image: hermes-agent
    environment:
      - SPARK_RELAY_URL=ws://spark-relay:7891
      - SPARK_RELAY_TOKEN=secret
    depends_on:
      - spark-relay
```

## Scenario 4: Agent on another PC (LAN)

### On the Spark PC:
```bash
# Set auth token
set SPARK_AUTH_TOKEN=my-secret
# Spark listens on 0.0.0.0:7890 (set in config)
```

### On the other PC:
```bash
# Set Spark URL to the first PC's IP
set SPARK_URL=http://192.168.1.100:7890
set SPARK_AUTH_TOKEN=my-secret
python spark_notify.py --state working --agent claude --message "Hello from other PC"
```
```

**Step 2: Commit**

```bash
git add docs/remote-setup.md
git commit -m "docs: remote connection setup guides (VPS, Docker, LAN)"
```

---

## Fase 4: Platform Adapter Nativo para Hermes (Opcional / Avanzado)

**Objetivo:** Crear un adapter de plataforma nativo de Hermes para Spark, equivalente a Telegram/Discord.

---

### Task 4.1: Investigar Hermes plugin/adapter API

**Objective:** Entender cómo escribir un platform adapter para Hermes.

**Step 1: Leer la documentación de adding platform adapters**

Fetch: `https://hermes-agent.nousresearch.com/docs/developer-guide/adding-platform-adapters`

**Step 2: Leer el código fuente de un adapter existente (ej: Telegram)**

Fetch: `https://github.com/NousResearch/hermes-agent/tree/main/src/hermes_cli/gateway/adapters`

**Step 3: Documentar la interfaz requerida**

Un platform adapter de Hermes necesita:
- Heredar de una clase base de adapter
- Implementar: `connect()`, `disconnect()`, `send_message()`, `receive_message()`
- Manejar sesiones, autorización, y routing
- Soportar archivos adjuntos (opcional)

---

### Task 4.2: Crear hermes-spark adapter (esqueleto)

**Objective:** Esqueleto del adapter Python.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/scripts/hermes_spark_adapter.py`

**Step 1: Crear el esqueleto**

```python
#!/usr/bin/env python3
"""
hermes-spark — Hermes Platform Adapter for Spark Desktop
Allows Hermes Gateway to use Spark as a messaging platform (like Telegram/Discord).

Configuration in Hermes config.yaml:
  platforms:
    spark:
      spark_url: "http://localhost:7890"
      auth_token: "your-token"
      poll_interval: 2  # seconds
"""

import asyncio
import json
import urllib.request
import threading
import time

class SparkPlatformAdapter:
    """Minimal platform adapter for Spark Desktop."""

    def __init__(self, config, agent_callback):
        self.spark_url = config.get("spark_url", "http://localhost:7890")
        self.auth_token = config.get("auth_token", "")
        self.poll_interval = config.get("poll_interval", 2)
        self.agent_callback = agent_callback  # Called with (session_id, message_text)
        self.running = False
        self.known_prompt_ids = set()

    async def connect(self):
        self.running = True
        print(f"⚡ Spark adapter connected to {self.spark_url}")
        # Start polling for user messages
        asyncio.create_task(self._poll_loop())

    async def disconnect(self):
        self.running = False
        print("⚡ Spark adapter disconnected")

    async def _poll_loop(self):
        while self.running:
            try:
                prompts = self._fetch_prompts()
                for prompt in prompts:
                    if prompt["id"] not in self.known_prompt_ids:
                        self.known_prompt_ids.add(prompt["id"])
                        # Notify agent callback
                        await self.agent_callback(
                            session_id=prompt.get("session_id", "spark_default"),
                            message_text=prompt["prompt"],
                            agent=prompt.get("targetAgent", "all")
                        )
            except Exception as e:
                print(f"Spark poll error: {e}")
            await asyncio.sleep(self.poll_interval)

    def _fetch_prompts(self):
        url = f"{self.spark_url}/api/prompts?agent=all"
        req = urllib.request.Request(url)
        if self.auth_token:
            req.add_header("Authorization", f"Bearer {self.auth_token}")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("prompts", [])

    async def send_message(self, session_id, content, agent="hermes"):
        """Send a message back to Spark chat."""
        url = f"{self.spark_url}/api/chat/reply"
        payload = {
            "session_id": session_id,
            "content": content,
            "agent": agent
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        if self.auth_token:
            req.add_header("Authorization", f"Bearer {self.auth_token}")
        urllib.request.urlopen(req, timeout=5)

    async def send_notification(self, title, message, agent="hermes", state="calm"):
        """Send a Clippy-style notification to Spark."""
        url = f"{self.spark_url}/api/notify"
        payload = {
            "agent": agent,
            "state": state,
            "title": title,
            "message": message,
            "actions": ["Got it!"],
            "timeout": 10,
            "sound": True
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        if self.auth_token:
            req.add_header("Authorization", f"Bearer {self.auth_token}")
        urllib.request.urlopen(req, timeout=5)
```

**Step 2: Commit**

```bash
git add scripts/hermes_spark_adapter.py
git commit -m "feat: add hermes-spark platform adapter skeleton"
```

---

### Task 4.3: Documentar instalación del adapter en Hermes

**Objective:** Guía de cómo instalar y configurar el adapter.

**Files:**
- Create: `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/docs/adapter-setup.md`

```markdown
# Spark Platform Adapter for Hermes

## Installation

1. Copy `hermes_spark_adapter.py` to your Hermes plugins directory:
   ```bash
   cp scripts/hermes_spark_adapter.py ~/.hermes/plugins/
   ```

2. Add to Hermes config.yaml:
   ```yaml
   platforms:
     spark:
       spark_url: "http://localhost:7890"
       auth_token: "your-spark-token"
       poll_interval: 2
   ```

3. Restart Hermes gateway:
   ```bash
   hermes gateway restart
   ```

4. Send a message from Spark → Hermes responds in chat panel

## Features
- Bidirectional chat (user ↔ agent)
- Notifications (Clippy-style)
- Session management
- Multi-agent support
```

**Step 2: Commit**

```bash
git add docs/adapter-setup.md
git commit -m "docs: Spark platform adapter setup guide"
```

---

## Verificación Final

### Task V1: Test completo end-to-end

**Objective:** Verificar que todas las fases funcionan juntas.

**Test 1: Chat local (Fase 1)**
- [ ] Spark abre → click avatar → chat panel
- [ ] Crear sesión → enviar mensaje → aparece en chat
- [ ] curl responde → aparece en chat
- [ ] Streaming funciona
- [ ] Historial persiste tras restart

**Test 2: Hermes integration (Fase 2)**
- [ ] `HERMES_API_URL` configurado
- [ ] Mensaje a Hermes → respuesta streaming en Spark
- [ ] Webhook de Hermes → notificación en Spark

**Test 3: Remote (Fase 3)**
- [ ] Auth token rechaza peticiones sin token
- [ ] Relay server en VPS → Spark se conecta
- [ ] Agente remoto envía mensaje → llega a Spark via relay

**Test 4: Performance (Fase 1 - Lite)**
- [ ] SPARK_LITE=1 → sin blur, sin animaciones
- [ ] RAM usage < 300MB con chat abierto
- [ ] Radar cada 30s en lite mode

**Test 5: MCP (Fase 1)**
- [ ] `spark_chat_reply` tool funciona
- [ ] `spark_chat_stream_chunk` tool funciona
- [ ] `spark_chat_create_session` tool funciona

---

## Resumen de Archivos Creados/Modificados

### Nuevos:
- `src/store/messageStore.js` — SQLite persistence
- `src/renderer/chat/chat.html` — Chat panel HTML
- `src/renderer/chat/chat.css` — Chat panel styles
- `src/renderer/chat/chat.js` — Chat panel logic
- `src/renderer/lite.js` — Lite mode detector
- `src/auth.js` — Token authentication
- `src/hermesAdapter.js` — Hermes API bridge
- `src/relay/sparkRelay.js` — VPS relay server
- `src/relayClient.js` — Relay client mode
- `spark_config.example.json` — Config template
- `scripts/hermes_spark_adapter.py` — Hermes platform adapter
- `docs/hermes-setup.md` — Hermes integration guide
- `docs/remote-setup.md` — Remote connection guide
- `docs/adapter-setup.md` — Adapter setup guide

### Modificados:
- `package.json` — version 2.0.0, better-sqlite3, new scripts
- `src/server.js` — chat endpoints, auth, webhook receiver, CORS config
- `src/main.js` — messageStore init, Hermes adapter, relay client, config loading, lite mode
- `src/renderer/index.html` — chat panel injection, lite.js
- `src/renderer/app.js` — chat init, lite mode, avatar click reactivation
- `src/renderer/styles.css` — lite mode styles, local fonts
- `src/preload.js` — (sin cambios mayores, ya expone onServerEvent)
- `src/radar.js` — configurable scan interval
- `scripts/spark_mcp_server.py` — 5 new chat tools
- `scripts/spark_notify.py` — chat CLI commands

---

## Riesgos y Tradeoffs

| Riesgo | Mitigación |
|---|---|
| better-sqlite3 compilation on Windows | Pre-built binaries incluidos en npm; fallback a LowDB (JSON) si falla |
| Electron RAM con chat panel abierto | Modo lite desactiva blur/animaciones; pagination de mensajes |
| Relay server introduce latencia | Es opcional; modo local no tiene overhead |
| Hermes API Server puede no estar corriendo | Graceful degradation: si no hay HERMES_API_URL, chat funciona con MCP/polling |
| Streaming SSE parsing en Node.js | Parser SSE simple inline, sin librerías extra |
| Auth token en plaintext en config | Documentar uso de .env + .gitignore para spark_config.json |
| Compatibilidad con agentes existentes | MCP tools y API HTTP existentes no se modifican, solo se agregan |

## Open Questions

1. **¿better-sqlite3 compila en el entorno del usuario?** — Si no, fallback a `lowdb` (JSON sync, ~500KB)
2. **¿Hermes API Server expone SSE streaming por defecto?** — Necesita verificación con `hermes proxy`
3. **¿El relay server necesita TLS?** — Para producción sí; para LAN/VPS de pruebas, no. Dejar como future enhancement
4. **¿Soporte de archivos adjuntos en chat?** — Fuera de scope de este plan. Fase 5 futura.