# Design: spark-messaging-center

> Technical design document for transforming Spark Desktop from a unidirectional notifier into a bidirectional messaging center.
> SDD mode: openspec. Change: `spark-messaging-center`.
> Companion documents: [proposal.md](./proposal.md) · [Implementation plan](../../../.hermes/plans/2026-09-01_175046-spark-messaging-center.md)

---

## 1. Architecture Overview

### 1.1 Current Architecture (v1.0.0)

Spark Desktop is an Electron app with three processes and a co-located HTTP/WebSocket server:

```
┌──────────────────────────────────────────────────────┐
│  Electron Main Process (src/main.js)                 │
│  • BrowserWindow: transparent, frameless, on-top     │
│  • Tray + context menu (7 character skins)           │
│  • GPU command-line switches                         │
│  • IPC handlers (user-action, window-close, etc.)    │
│  • WanderEngine, AgentRadar lifecycle                │
│  • Wraps sparkServer.broadcast() to also send IPC    │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
            ▼                      ▼
┌───────────────────┐    ┌────────────────────────────┐
│  SparkServer      │    │  Renderer Process          │
│  (src/server.js)  │    │  (src/renderer/)           │
│  • HTTP :7890     │    │  • app.js — UI, skins,     │
│  • WebSocket      │    │    speech bubbles, state   │
│    broadcast()    │    │  • audio.js — Web Audio    │
│  • 10 endpoints   │    │  • preload.js bridge       │
│  • promptQueues   │    │  • styles.css              │
└───────────────────┘    └────────────────────────────┘
```

**Key integration points:**
- `sparkServer.broadcast(msg)` sends to all WS clients AND `mainWindow.webContents.send('server-event', msg)` (via the wrapper in main.js).
- `preload.js` exposes `sparkBridge.onServerEvent(cb)` which listens for `server-event` IPC.
- Renderer has **no Node access** (`contextIsolation: true`, `nodeIntegration: false`) — all communication goes through IPC or HTTP `fetch()` from the renderer.
- External `node_modules` at `C:/Users/FERNA/.spark_desktop_runtime/node_modules` — `NODE_PATH` pushed in `module.paths` at top of `server.js` and `main.js`.

### 1.2 Target Architecture (v2.0.0)

The messaging center adds a persistence layer, a chat UI, an optional Hermes bridge, optional remote relay, and a lite-mode optimizer — all additive:

```
┌──────────────────────────────────────────────────────────────────┐
│  Electron Main Process (src/main.js)                             │
│  • Loads spark_config.json → sets env vars                       │
│  • Initializes: messageStore, HermesAdapter, RelayClient         │
│  • Lite-mode: os.totalmem() check → Electron flags + URL param   │
│  • Wraps broadcast() to also forward to relay                    │
└───────┬────────────────┬───────────────┬────────────────────────┘
        │                │               │
        ▼                ▼               ▼
┌───────────────┐ ┌────────────┐ ┌──────────────────┐
│ SparkServer   │ │ HermesAdap │ │ RelayClient      │
│ (server.js)   │ │ (hermesAd  │ │ (relayClient.js) │
│ + auth.js     │ │ apter.js)  │ │ outbound WS to   │
│ + chat routes │ │ SSE stream │ │ VPS relay        │
│ + webhook     │ │ to Hermes  │ └──────────────────┘
└───────┬───────┘ └────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│  Renderer Process (src/renderer/)            │
│  • app.js — existing UI + chat init          │
│  • chat/chat.js — ChatPanel controller       │
│  • chat/chat.css — glassmorphism panel       │
│  • lite.js — RAM detection, CSS class flags  │
│  • styles.css — lite-mode rules, local fonts │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│  SQLite (spark-messages.db in userData/)     │
│  • messageStore.js — better-sqlite3, WAL     │
│  • sessions + messages tables                │
└──────────────────────────────────────────────┘
```

**Design principle:** Every new feature is opt-in via environment variables or `spark_config.json`. Default behavior = local unauthenticated mode, identical to v1.0.0 plus the chat panel UI.

---

## 2. Component Design

### 2.1 MessageStore — `src/store/messageStore.js`

**Responsibility:** SQLite-backed CRUD for chat sessions and messages. Runs in the Electron main process (requires `electron` for `app.getPath('userData')`).

**Dependency:** `better-sqlite3` (installed in external runtime directory).

**Database location:** `app.getPath('userData')/spark-messages.db` — survives app updates, outside the git repo.

**Pragmas:**
- `journal_mode = WAL` — write-ahead logging for concurrent reads during writes, lower disk I/O.
- `synchronous = NORMAL` — safe with WAL, faster than FULL.
- `cache_size = -2000` — 2 MB page cache (negative = KB), keeps RAM footprint minimal.

**Fallback:** If `require('better-sqlite3')` throws (native module missing/failed), all functions return stub objects. Chat works but history is lost on restart. The server checks `messageStore` truthiness before calling.

**Exported functions:**

```javascript
// Lifecycle
function initDb()                                    // → Database (idempotent, creates tables if not exist)
function closeDb()                                   // → void

// Sessions
function createSession(agent='spark', title='New Conversation')
  // → { id, agent, title, created_at, last_message_at }
function getSession(sessionId)                       // → session row | undefined
function getSessions(limit=50)                       // → session[] ordered by last_message_at DESC
function deleteSession(sessionId)                    // → void (cascades to messages)

// Messages
function addMessage(sessionId, role, content, agent=null, metadata={})
  // → { id, session_id, role, content, agent, timestamp, metadata }
function getMessages(sessionId, limit=50, offset=0)  // → message[] ordered by timestamp ASC
function getMessageCount(sessionId)                  // → number
function updateMessage(id, content)                  // → void
```

**ID generation:** `sess_{timestamp}_{random6}` and `msg_{timestamp}_{random6}` — no external UUID dependency.

**Integration point:** Required by `server.js` at module load (wrapped in try/catch). Initialized explicitly in `main.js` during `app.whenReady()`.

### 2.2 Chat Panel UI — `src/renderer/chat/`

Three files, loaded directly by `index.html` (no build step):

#### chat.html
Static HTML structure injected into `index.html` before the avatar section. Contains:
- `#chatPanel` — root container, starts with `hidden` class
- `.chat-header` — agent badge, session title, action buttons (new, sessions list, collapse)
- `#chatSessionsList` — slide-in session list, populated dynamically
- `#chatMessages` — scrollable message container
- `#chatTypingIndicator` — three-dot animation + "Agent is typing..." text
- `.chat-input-area` — agent selector `<select>`, text `<input>`, send button

#### chat.css
Glassmorphism styling matching existing Spark visual language:
- `backdrop-filter: blur(20px) saturate(180%)` in normal mode
- `.lite-mode` class: solid background, no blur
- Message bubbles: `.user` (blue gradient, right-aligned), `.agent` (translucent, left-aligned), `.system` (centered pill)
- Typing dots animation, fade-in message animation
- Scrollbar styling, responsive max-width 360px / max-height 420px

#### chat.js
`ChatPanel` object exposed as `window.ChatPanel`. No Node access — communicates via `fetch()` to `http://localhost:7890` and `window.sparkBridge.onServerEvent()`.

**State:**
```javascript
{
  currentSession: null,      // { id, agent, title, ... }
  sessions: [],              // session[]
  messages: [],              // message[]
  isTyping: false,
  typingTimeout: null,       // setTimeout handle (30s auto-hide)
  streamingMessage: null,    // { stream_id, element, fullContent }
  isOpen: false
}
```

**Methods:**
```javascript
init()                           // Wire DOM, listeners, load sessions
toggle()                         // Show/hide panel, auto-create session on first open
newSession()                     // POST /api/chat/session → set currentSession
loadSessions()                   // GET /api/chat/sessions → render list
switchSession(session)           // GET /api/chat/messages → render messages
deleteSession(sessionId)         // POST /api/chat/delete-session
sendMessage()                    // Display locally + POST /api/chat/send + POST /api/prompt (backward compat)
handleIncomingMessage(data)      // chat_message WS event → displayMessage
handleStreamChunk(data)          // chat_stream WS event → progressive render
handleTyping(data)               // chat_typing WS event → toggle indicator
displayMessage(msg)              // → DOM element
formatContent(text)              // Basic markdown: code blocks, inline code, bold, italic, line breaks
```

**Streaming render:** On first `chat_stream` chunk for a new `stream_id`, creates an empty agent message element. Subsequent chunks append to `fullContent` and re-render via `formatContent()`. On `done: true`, clears `streamingMessage` state.

**Backward compatibility:** `sendMessage()` also fires `POST /api/prompt` with the same text, so MCP-polling agents that don't understand chat endpoints still receive the prompt.

### 2.3 HermesAdapter — `src/hermesAdapter.js`

**Responsibility:** Bridge between Spark chat and a Hermes API Server's OpenAI-compatible endpoint. Runs in the Electron main process.

**Activation:** Only when `HERMES_API_URL` environment variable is set. Otherwise `this.enabled = false` and `sendChatMessage()` returns immediately.

**Configuration:**
```javascript
new HermesAdapter(sparkServer, {
  apiUrl:  process.env.HERMES_API_URL,   // e.g. 'http://localhost:8000'
  apiKey:  process.env.HERMES_API_KEY,   // Bearer token, optional
  model:   process.env.HERMES_MODEL       // e.g. 'default'
})
```

**Core method:**
```javascript
async sendChatMessage(sessionId, userMessage, agent='hermes')
```

**Flow:**
1. Broadcast `chat_typing` (is_typing: true) to Spark clients.
2. POST to `{apiUrl}/v1/chat/completions` with `stream: true`, `Accept: text/event-stream`.
3. Parse SSE chunks inline: split on `\n`, extract `data: ` prefix, JSON.parse, read `choices[0].delta.content`.
4. For each delta: broadcast `chat_stream` (chunk: delta, done: false).
5. On `[DONE]` or stream end: broadcast `chat_stream` (done: true, full_content), persist via `messageStore.addMessage()`.
6. Broadcast `chat_typing` (is_typing: false).
7. On error: broadcast `chat_message` with role `system` and error text, stop typing.

**SSE parsing:** Inline, no library. Splits raw response chunks on newlines, handles `data: [DONE]` sentinel, try/catch per JSON.parse (partial lines are skipped, not fatal). A buffer accumulates partial lines that don't end with `\n`.

**Integration point:** `server.js` calls `this.onChatMessage(sessionId, content, agent)` at the end of the `/api/chat/send` handler. `main.js` wires this callback to `hermesAdapter.sendChatMessage()`.

### 2.4 SparkAuth — `src/auth.js`

**Responsibility:** Token-based authentication for HTTP and WebSocket connections. Runs inside `SparkServer`.

**Activation:** When `SPARK_AUTH_TOKEN` environment variable is set. When unset, `this.enabled = false` and `validateRequest()` always returns `true` (local mode, allow all — identical to v1.0.0 behavior).

**Class:**
```javascript
class SparkAuth {
  constructor()                              // Reads SPARK_AUTH_TOKEN from env
  generateToken()                            // → random 48-char hex (crypto.randomBytes)
  validateRequest(req)                       // → boolean (checks Bearer header, then ?token= query param)
  getToken()                                 // → string | null
  isEnabled()                                // → boolean
}
```

**Token validation order:**
1. `Authorization: Bearer <token>` header
2. `?token=<token>` or `?auth=<token>` query parameter (needed for WebSocket connections where headers are awkward)

**Integration points:**
- `server.js handleHttp()`: Early return 401 if `auth.isEnabled() && !auth.validateRequest(req)`, before any route handler.
- `server.js setupWebSockets()`: `ws.close(4001, 'Unauthorized')` on failed validation at connection time.

### 2.5 RelayServer — `src/relay/sparkRelay.js`

**Responsibility:** Standalone Node.js script deployed on a VPS. Bridges Spark Desktop (connected outbound) with remote agents (connected inbound) via WebSocket.

**Usage:** `node sparkRelay.js --port 7891 --token your-secret`

**Architecture:**
```
Spark Desktop (home PC)                    Remote Agent (VPS/Docker)
    │                                           │
    │  ws://vps:7891/spark?token=X              │  ws://vps:7891/agent?token=X
    │  (outbound — no port forwarding)          │  (local to VPS)
    └──────────────┐                ┌───────────┘
                   ▼                ▼
              ┌─────────────────────────┐
              │   Spark Relay Server    │
              │   (sparkRelay.js)       │
              │   • /spark → sparkClients│
              │   • /agent → agentClients│
              │   • /health → HTTP 200  │
              │   Bridges messages      │
              │   bidirectionally       │
              └─────────────────────────┘
```

**State:**
- `sparkClients` — Set of WebSocket connections from Spark Desktop instances
- `agentClients` — Set of WebSocket connections from remote agents

**Message routing:** When a Spark client sends a message, it's forwarded to all `agentClients`. When an agent sends a message, it's forwarded to all `sparkClients`. Token validated on connection.

**Health endpoint:** `GET /health` returns `{ ok, sparkClients, agentClients, uptime }`.

### 2.6 RelayClient — `src/relayClient.js`

**Responsibility:** Connects Spark Desktop **outbound** to a remote relay server. No port forwarding needed on the user's machine.

**Activation:** When `SPARK_RELAY_URL` environment variable is set.

**Class:**
```javascript
class RelayClient {
  constructor(sparkServer, { relayUrl, token })
  connect()                      // Initiates WebSocket connection to {relayUrl}/spark?token={token}
  disconnect()                   // Cleans up, stops reconnection
  isConnected()                  // → boolean
}
```

**Reconnection:** Exponential backoff: 5s → 10s → 20s → 30s (max). Reset to 5s on successful connection.

**Message forwarding:**
- **Outbound:** `sparkServer.onRelayMessage` callback is set when connected. The `broadcast()` wrapper in `main.js` calls it after each local broadcast, forwarding the message to the relay.
- **Inbound:** Messages from the relay are JSON-parsed and injected into `sparkServer.broadcast()`, which delivers them to local WS clients and the renderer via IPC.

**Integration point:** `main.js` wraps `sparkServer.broadcast()` to also call `sparkServer.onRelayMessage(msg)` if the relay is connected. This is a second wrapper layered on top of the existing broadcast wrapper (which sends to `mainWindow.webContents.send`).

### 2.7 LiteMode — `src/renderer/lite.js`

**Responsibility:** Auto-detect low-RAM machines and apply CSS/behavior optimizations. Runs in the renderer process.

**Detection logic:**
```javascript
LiteMode.detect()
// 1. navigator.deviceMemory (Chrome/Electron exposes in GB, may be undefined)
// 2. URL param ?lite=1 (passed by main.js when os.totalmem() <= 8GB or SPARK_LITE=1)
// 3. If either is true → document.body.classList.add('lite-mode')
```

**Main process detection (main.js):**
```javascript
const totalRamGB = os.totalmem() / (1024 * 1024 * 1024);
const isLite = process.env.SPARK_LITE === '1' || totalRamGB <= 8;
// If lite: append --disable-cache, --disable-gpu-shader-disk-cache
// Pass ?lite=1 in renderer URL
```

**Lite mode effects:**

| Aspect | Normal | Lite |
|--------|--------|------|
| `backdrop-filter` blur | Enabled (glassmorphism) | Disabled (solid `rgba(15,23,42,0.98)`) |
| CSS animations (bubble pop, pulse, shadow) | Enabled | `animation: none` |
| Radar scan interval | 12s | 30s |
| Wander engine | User-configurable | Always off |
| Fonts | Google Fonts CDN | Local `.woff2` files (with system font fallback) |
| Electron flags | Standard GPU flags | + `--disable-cache`, `--disable-gpu-shader-disk-cache` |

**`getSettings()` returns:** `{ radarInterval, wanderEnabled, backdropBlur, gifAnimation, fontLoading }` — consumed by main process for radar interval and by renderer for CSS class application.

---

## 3. Data Flow

### 3.1 Local Chat (user → agent via HTTP/MCP)

```
User types in chat panel
  → chat.js: displayMessage({role:'user'}) immediately (optimistic)
  → chat.js: POST /api/chat/send {session_id, role:'user', content, agent}
  → server.js: messageStore.addMessage(session_id, 'user', content, agent)
  → server.js: broadcast({type:'chat_message', data:message})
    → WS clients receive
    → mainWindow.webContents.send('server-event', msg) → renderer
  → server.js: if this.onChatMessage → hermesAdapter.sendChatMessage() (if enabled)
  → server.js: POST /api/prompt also fired by chat.js for MCP-polling backward compat
```

### 3.2 Hermes Streaming Response

```
HermesAdapter.sendChatMessage(sessionId, userMessage, agent)
  → broadcast({type:'chat_typing', is_typing:true})
  → POST {HERMES_API_URL}/v1/chat/completions {stream:true}
  → SSE chunks arrive:
    → for each delta: broadcast({type:'chat_stream', chunk:delta, done:false})
    → chat.js: handleStreamChunk → append to streamingMessage.fullContent → re-render
  → stream done:
    → broadcast({type:'chat_stream', chunk:'', done:true, full_content})
    → messageStore.addMessage(sessionId, 'agent', fullContent, agent)
    → broadcast({type:'chat_typing', is_typing:false})
    → chat.js: streamingMessage = null
```

### 3.3 Agent Reply via HTTP/MCP

```
Agent (via MCP tool or HTTP POST)
  → POST /api/chat/reply {session_id, content, agent}
  → server.js: messageStore.addMessage(session_id, 'agent', content, agent)
  → broadcast({type:'chat_message', data:message})
  → chat.js: handleIncomingMessage → displayMessage
```

### 3.4 Agent Streaming via MCP/HTTP

```
Agent sends multiple POST /api/chat/stream {session_id, stream_id, chunk, done}
  → server.js: broadcast({type:'chat_stream', data:{chunk, done, ...}})
  → if done: messageStore.addMessage(session_id, 'agent', full_content, agent)
  → chat.js: handleStreamChunk → progressive render
```

### 3.5 Remote Agent via Relay

```
Remote agent (VPS)
  → connects to ws://vps:7891/agent?token=X
  → sends chat message via relay
  → relay forwards to sparkClients
  → RelayClient.ws.on('message') in Spark Desktop
  → sparkServer.broadcast(msg) — injects into local pipeline
  → renderer receives via IPC → chat.js renders

Reverse (Spark → remote agent):
  → sparkServer.broadcast(msg)
  → main.js wrapper calls sparkServer.onRelayMessage(msg)
  → RelayClient forwards via WebSocket to relay
  → relay forwards to agentClients
```

### 3.6 Hermes Webhook (async events)

```
Hermes gateway
  → POST /api/hermes-webhook {event:'message_response'|'task_completed'|'task_started', data}
  → server.js:
    → message_response: messageStore.addMessage + broadcast chat_message
    → task_completed: broadcast notification (Clippy bubble)
    → task_started: updateState({state:'working'})
```

---

## 4. New API Endpoints

All endpoints are additive — existing 10 endpoints are unchanged. All serve on port 7890 alongside the existing API.

| Method | Path | Body / Query | Response | Purpose |
|--------|------|-------------|----------|---------|
| POST | `/api/chat/session` | `{agent, title}` | `{ok, session:{id,agent,title,created_at,last_message_at}}` | Create a new chat session |
| GET | `/api/chat/sessions` | — | `{ok, sessions:[...]}` | List sessions (limit 50, ordered by last_message_at DESC) |
| POST | `/api/chat/delete-session` | `{session_id}` | `{ok}` | Delete session + cascade-delete messages |
| POST | `/api/chat/send` | `{session_id, role, content, agent, metadata}` | `{ok, message:{...}}` | User sends a message; saves to DB + broadcasts + triggers HermesAdapter |
| POST | `/api/chat/reply` | `{session_id, content, agent, metadata, stream_id?}` | `{ok, message:{...}}` | Agent sends a reply; saves to DB + broadcasts |
| POST | `/api/chat/stream` | `{session_id, stream_id, chunk, done, full_content?, agent}` | `{ok, streamed:true, done}` | Streaming chunk; broadcasts each chunk; on done, persists full message |
| POST | `/api/chat/typing` | `{session_id, agent, is_typing}` | `{ok}` | Toggle typing indicator |
| GET | `/api/chat/messages` | `?session=X&limit=N&offset=O` | `{ok, messages:[...]}` | Paginated message history (default limit=50) |
| POST | `/api/hermes-webhook` | `{event, data}` | `{ok, received:event}` | Hermes webhook receiver (message_response, task_completed, task_started) |

**Auth:** When `SPARK_AUTH_TOKEN` is set, all endpoints (including existing ones) require a valid Bearer token or `?token=` query param. Unauthenticated requests receive HTTP 401.

**CORS:** `Access-Control-Allow-Origin` is now configurable via `SPARK_CORS_ORIGIN` (defaults to `*` for backward compatibility).

---

## 5. WebSocket Events

The existing WebSocket setup (`setupWebSockets()` in server.js) already broadcasts to all connected WS clients and the renderer via IPC. Three new event types are added to the broadcast vocabulary:

| Event Type | Direction | Payload | Triggered By |
|------------|-----------|---------|-------------|
| `chat_message` | Server → All | `{session_id, role, content, agent, timestamp, metadata, id}` | `/api/chat/send`, `/api/chat/reply`, Hermes webhook `message_response` |
| `chat_stream` | Server → All | `{session_id, stream_id, chunk, done, agent, full_content?}` | `/api/chat/stream`, HermesAdapter SSE streaming |
| `chat_typing` | Server → All | `{session_id, agent, is_typing}` | `/api/chat/typing`, HermesAdapter (auto on stream start/end) |

**Existing WS events (unchanged):** `init`, `state_changed`, `notification`, `message`, `dismiss`, `set_skin`, `wander_toggle`, `action_resolved`, `agent_prompt_dispatched`, `agents_radar_update`, `facing_changed`.

**Relay events:** `relay_connected` (sent by RelayServer on connection, with `role: 'spark'|'agent'`).

**Renderer handling:** `chat.js` registers a second `onServerEvent` listener (alongside `app.js`'s existing one) that filters for `chat_message`, `chat_stream`, and `chat_typing` types. Both listeners receive all events; each ignores types it doesn't handle.

---

## 6. IPC Changes

### 6.1 preload.js

The existing `sparkBridge.onServerEvent(callback)` already forwards **all** `server-event` IPC messages to the renderer. No new IPC channels are needed for chat — `chat.js` calls `window.sparkBridge.onServerEvent()` with its own callback that filters for chat event types.

**No changes required to preload.js.** The existing bridge is sufficient:
- `sendAction(id, action)` — existing
- `sendPrompt(targetAgent, prompt)` — existing (used by Quick-Input, re-enabled for chat)
- `onServerEvent(callback)` — existing, now consumed by both `app.js` and `chat.js`
- `showContextMenu()` — existing
- `closeWindow()`, `minimizeWindow()`, `toggleAlwaysOnTop()` — existing

### 6.2 main.js — New IPC Handlers

No new `ipcMain.on()` handlers are required for Phase 1–3. Chat communication flows through HTTP (`fetch()` from renderer) and the existing `server-event` IPC channel (main → renderer).

The `user-prompt` IPC handler (currently commented out) is **not** re-enabled — chat uses HTTP `fetch()` directly, not IPC. The commented `Alt+Space` global shortcut remains disabled.

### 6.3 main.js — New Module Initializations

Added inside `app.whenReady().then(...)`:

```javascript
// 1. Load spark_config.json → set env vars (before server start)
// 2. Initialize messageStore
require('./store/messageStore').initDb();

// 3. Initialize HermesAdapter (if HERMES_API_URL set)
const hermesAdapter = new HermesAdapter(sparkServer, {...});
if (process.env.HERMES_API_URL) hermesAdapter.enable();
sparkServer.onChatMessage = (sessionId, content, agent) => {
  if (hermesAdapter.enabled) hermesAdapter.sendChatMessage(sessionId, content, agent);
};

// 4. Initialize RelayClient (if SPARK_RELAY_URL set)
const relayClient = new RelayClient(sparkServer, {...});
if (process.env.SPARK_RELAY_URL) relayClient.connect();

// 5. Wrap broadcast() to also forward to relay
// (layered on top of existing wrapper that sends to mainWindow.webContents)

// 6. Lite-mode: os.totalmem() check → Electron flags + URL param
```

Added in cleanup (`app.on('window-all-closed')`):
```javascript
require('./store/messageStore').closeDb();
```

---

## 7. Database Schema

### 7.1 Tables

#### `sessions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | `sess_{timestamp}_{random6}` |
| `agent` | TEXT | NOT NULL DEFAULT 'spark' | Associated agent name |
| `title` | TEXT | NOT NULL DEFAULT 'New Conversation' | Display title |
| `created_at` | INTEGER | NOT NULL | Unix epoch ms |
| `last_message_at` | INTEGER | NOT NULL | Unix epoch ms, updated on each message |
| `active` | INTEGER | NOT NULL DEFAULT 1 | Soft-delete flag (1=active, 0=archived) |

#### `messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | `msg_{timestamp}_{random6}` |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) ON DELETE CASCADE | Parent session |
| `role` | TEXT | NOT NULL | `'user'`, `'agent'`, or `'system'` |
| `content` | TEXT | NOT NULL | Message text (supports markdown) |
| `agent` | TEXT | nullable | Agent name (for agent/system messages) |
| `timestamp` | INTEGER | NOT NULL | Unix epoch ms |
| `metadata` | TEXT | nullable | JSON string for extra data (e.g., `{stream_id}`) |

### 7.2 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, timestamp);
```

This composite index optimizes the most common query: `SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`.

### 7.3 DDL

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL DEFAULT 'spark',
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent TEXT,
  timestamp INTEGER NOT NULL,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages(session_id, timestamp);
```

**Note on cascade:** `better-sqlite3` does not enforce foreign keys by default. `deleteSession()` explicitly deletes messages first, then the session, so `ON DELETE CASCADE` is a documentation hint — the application code handles the cascade manually.

---

## 8. Architecture Decisions (ADRs)

### ADR-1: better-sqlite3 over LowDB/JSON for message persistence

**Context:** The messaging center needs persistent conversation history across restarts. The project has no existing database — all state is in-memory (`promptQueues`, `currentState`, `activeSessions` Maps). The target platform is Windows 11 with 8 GB RAM. The project convention is no build step and external `node_modules`.

**Decision:** Use `better-sqlite3` (synchronous, native SQLite binding) with WAL mode and a 2 MB cache.

**Alternatives considered:**
1. **LowDB / JSON file** — Simpler, no native compilation. But: O(n) reads for any query, entire file loaded into memory, no pagination, write contention risk, ~500 KB limit before performance degrades. Would need to load all messages to paginate.
2. **In-memory Map + periodic JSON save** — Fastest reads, but loses data on crash between saves. No query support.
3. **LevelDB (level/level)** — Key-value store, good for append-only, but range queries need manual index management. No SQL, harder to reason about.

**Consequences:**
- **Positive:** O(log n) indexed lookups, built-in pagination via LIMIT/OFFSET, WAL mode handles concurrent reads during writes, SQLite is the most deployed database in the world (battle-tested), 2 MB cache keeps RAM bounded.
- **Negative:** Native compilation required — if pre-built binary doesn't match the Electron ABI, `require('better-sqlite3')` fails. Mitigated by graceful fallback to in-memory stub (chat works, history lost on restart). npm ships pre-built Windows x64 binaries matching Node.js ABI.
- **Negative:** `better-sqlite3` must be installed in the external runtime directory (`C:/Users/FERNA/.spark_desktop_runtime/node_modules`), not the project's gitignored `node_modules/`. The `module.paths` push at the top of `messageStore.js`'s parent modules handles this.

### ADR-2: Inline SSE parsing vs eventsource library

**Context:** `HermesAdapter` needs to parse Server-Sent Events from the Hermes API Server's `/v1/chat/completions` endpoint with `stream: true`. The SSE format is `data: {json}\n\n` with a `data: [DONE]` terminator.

**Decision:** Parse SSE inline in `hermesAdapter.js` using string splitting and `JSON.parse()`, no external library.

**Alternatives considered:**
1. **`eventsource` npm package** — Standard SSE client library. But: it's designed for browser EventSource API compatibility, adds an dependency, and the Node.js `http` response stream is already accessible as an async iterator. The actual parsing logic is ~20 lines.
2. **`sse-stream` or similar** — Niche packages with uncertain maintenance.
3. **Use `fetch()` with `ReadableStream`** — Not available in Node.js 18 without experimental flags in all environments. Electron 34's Node.js version supports it, but `http.request` is already used elsewhere in the codebase.

**Consequences:**
- **Positive:** Zero new dependencies, full control over error handling, ~20 lines of code, works with existing `http`/`https` modules.
- **Positive:** Try/catch per `JSON.parse` means partial chunks are skipped, not fatal. A buffer accumulates incomplete lines.
- **Negative:** Must handle edge cases manually: partial lines across TCP chunk boundaries, `data: [DONE]` sentinel, empty lines between events. All handled in the implementation.
- **Negative:** No automatic reconnection (unlike `eventsource`). Acceptable because HermesAdapter creates a new request per message, not a long-lived subscription.

### ADR-3: Relay server vs direct connection for remote agents

**Context:** Remote agents (running on VPS, Docker, or another PC) need to send messages to Spark Desktop. The user's home machine is typically behind NAT without port forwarding. Three options were considered: ngrok tunnel, relay server, and direct LAN connection.

**Decision:** Implement a lightweight relay server (`sparkRelay.js`) that Spark connects to **outbound** (no port forwarding needed). Also support direct HTTP for LAN scenarios.

**Alternatives considered:**
1. **ngrok tunnel only** — Simplest for quick testing, but: requires ngrok account, introduces a third-party dependency, tunnel URL changes on restart (free tier), adds latency through ngrok's servers.
2. **Direct HTTP from VPS to home PC** — Requires port forwarding on the user's router, which most users can't or won't configure. Security risk exposing port 7890 to the internet.
3. **Reverse SSH tunnel** — Works but requires SSH access to the VPS, manual setup, and isn't user-friendly.

**Consequences:**
- **Positive:** Spark initiates the connection outbound (ws://vps:7891/spark), so no port forwarding or router configuration is needed on the user's machine.
- **Positive:** The relay is a single ~100-line Node.js file with no dependencies beyond `ws`. Deployable on any VPS with `node sparkRelay.js --port 7891 --token X`.
- **Positive:** Bidirectional — the relay bridges messages both ways (Spark → agents, agents → Spark).
- **Negative:** Introduces a network hop (Spark → relay → agent), adding latency. Mitigated by the fact that this is only for remote scenarios; local mode has zero overhead.
- **Negative:** The relay server must be deployed and maintained separately. Mitigated by providing Docker compose examples and a single-file deployment.
- **Negative:** No TLS on the relay itself — TLS termination is left to a reverse proxy (nginx, Caddy). Documented as out of scope.

### ADR-4: Lite mode auto-detect vs manual config

**Context:** Spark Desktop targets 8 GB RAM machines. The current UI uses `backdrop-filter: blur(20px)`, CSS animations, Google Fonts CDN, and 12-second radar scans — all of which consume RAM and CPU on low-end machines.

**Decision:** Auto-detect RAM via `os.totalmem()` in the main process and `navigator.deviceMemory` in the renderer. Activate lite mode automatically when ≤ 8 GB. Also allow manual override via `SPARK_LITE=1` env var or `?lite=1` URL param.

**Alternatives considered:**
1. **Manual config only** — User sets `SPARK_LITE=1` if needed. But: users don't know their RAM is the problem, and the app "just works" on their machine but is sluggish. Auto-detection provides a better first-run experience.
2. **Performance profiling at runtime** — Measure frame times, adjust dynamically. Over-engineered for a desktop companion. Adds complexity and runtime overhead to measure.
3. **Always-on lite mode** — Degraded visual experience for all users, including those with 32 GB RAM and dedicated GPUs.

**Consequences:**
- **Positive:** Users on 8 GB machines get a good experience without configuration. Users on 16+ GB machines get full glassmorphism and animations.
- **Positive:** Manual override exists for edge cases (e.g., 12 GB machine with integrated GPU that struggles with blur).
- **Positive:** `navigator.deviceMemory` is a rough estimate but combined with `os.totalmem()` (exact) provides reliable detection.
- **Negative:** `navigator.deviceMemory` may be undefined in some Electron versions, falling back to the `?lite=1` URL param passed from main process (which uses exact `os.totalmem()`).
- **Negative:** Some 8 GB machines with dedicated GPUs handle blur fine — they'll get degraded visuals unnecessarily. Acceptable trade-off for broad compatibility.

### ADR-5: WebSocket broadcast vs targeted delivery

**Context:** The existing `sparkServer.broadcast()` sends every message to all connected WS clients and the renderer. With chat events, multiple sessions could generate messages, and a client might only care about its active session.

**Decision:** Continue using broadcast for all chat events. The renderer's `chat.js` filters events client-side by checking `data.session_id === this.currentSession.id`.

**Alternatives considered:**
1. **Targeted WS delivery** — Track which client is viewing which session, send only relevant events. Requires session-to-client mapping, per-client state on the server, and handling client disconnection/reconnection. Significant complexity for a desktop app with typically 1–2 WS clients.
2. **Session-scoped WS channels** — `ws://localhost:7890?session=X`. Requires channel subscription/unsubscription protocol. Over-engineered for the current use case.
3. **EventSource per session** — Server-sent events for each active session. Multiple HTTP connections, no bidirectional communication.

**Consequences:**
- **Positive:** Zero changes to the existing broadcast infrastructure. The `broadcast()` wrapper in `main.js` (which also sends to `mainWindow.webContents.send`) continues to work unchanged for chat events.
- **Positive:** Simpler server code — no session-to-client tracking, no disconnection edge cases.
- **Positive:** Works naturally with the relay — broadcast messages are forwarded to all remote clients, which filter locally.
- **Negative:** All clients receive all chat events for all sessions, even ones they're not viewing. For a desktop companion with 1–2 clients and ≤ 50 messages per session, this is negligible bandwidth (each event is < 1 KB).
- **Negative:** If the app scales to many concurrent sessions with high message volume, broadcast would waste bandwidth. This is not a concern for the single-user desktop companion use case.

---

## 9. File Change Inventory

### 9.1 New Files (14)

| File | Phase | Purpose |
|------|-------|---------|
| `src/store/messageStore.js` | 1 | SQLite persistence (sessions + messages CRUD) |
| `src/renderer/chat/chat.html` | 1 | Chat panel HTML structure |
| `src/renderer/chat/chat.css` | 1 | Chat panel glassmorphism styling + lite-mode rules |
| `src/renderer/chat/chat.js` | 1 | ChatPanel controller (sessions, messages, streaming, input) |
| `src/renderer/lite.js` | 1 | Lite mode auto-detection and CSS class application |
| `src/renderer/fonts/outfit-400.woff2` | 1 | Local font (Outfit 400) |
| `src/renderer/fonts/outfit-600.woff2` | 1 | Local font (Outfit 600) |
| `src/renderer/fonts/outfit-700.woff2` | 1 | Local font (Outfit 700) |
| `src/renderer/fonts/jetbrains-mono-400.woff2` | 1 | Local font (JetBrains Mono 400) |
| `src/hermesAdapter.js` | 2 | Hermes API bridge with SSE streaming |
| `src/auth.js` | 3 | Token-based authentication (HTTP + WS) |
| `src/relay/sparkRelay.js` | 3 | VPS relay server (standalone Node.js script) |
| `src/relay/relayConfig.example.json` | 3 | Relay config template |
| `src/relayClient.js` | 3 | Outbound relay client with exponential backoff |
| `spark_config.example.json` | 3 | Centralized config template |
| `scripts/hermes_spark_adapter.py` | 4 | Hermes platform adapter skeleton (Python) |
| `docs/hermes-setup.md` | 2 | Hermes integration guide (API + webhook) |
| `docs/remote-setup.md` | 3 | Remote connection guide (VPS, Docker, LAN) |
| `docs/adapter-setup.md` | 4 | Platform adapter installation guide |

### 9.2 Modified Files (9)

| File | Phase | Changes |
|------|-------|---------|
| `package.json` | 1 | Version `1.0.0` → `2.0.0`; add `better-sqlite3` dependency; add `lite` and `chat` scripts; update description and keywords |
| `src/server.js` | 1–3 | Add `messageStore` require (try/catch); add 9 new HTTP endpoints (chat session/message/stream/typing/webhook); add `SparkAuth` integration (401 check); configurable CORS origin; add `onChatMessage` hook for HermesAdapter; `setupWebSockets` auth validation |
| `src/main.js` | 1–3 | Load `spark_config.json` → env vars; initialize `messageStore`; initialize `HermesAdapter` + wire `onChatMessage`; initialize `RelayClient` + wrap broadcast; lite-mode detection (`os.totalmem()`) + Electron flags + `?lite=1` URL param; configurable `AgentRadar` scan interval; `messageStore.closeDb()` on cleanup |
| `src/renderer/index.html` | 1 | Inject chat panel HTML before avatar section; add `<link>` for `chat/chat.css`; add `<script>` for `lite.js` and `chat/chat.js` |
| `src/renderer/app.js` | 1 | Reactivate avatar single-click handler → `ChatPanel.toggle()`; call `LiteMode.detect()` on init; call `LiteMode.applyToChatPanel()`; call `ChatPanel.init()` on startup |
| `src/renderer/styles.css` | 1 | Add `body.lite-mode` rules (disable blur, animations, pulse); replace Google Fonts `@import` with local `@font-face` declarations; add CSS variables `--font-main` / `--font-mono` with system font fallback |
| `src/preload.js` | — | **No changes needed** — existing `onServerEvent` already forwards all events |
| `src/radar.js` | 1 | Constructor already accepts `options.scanIntervalMs` — no code change, but `main.js` now passes `{scanIntervalMs: isLite ? 30000 : 12000}` |
| `scripts/spark_mcp_server.py` | 1 | Add 5 new tools to `TOOLS_LIST` and handlers: `spark_chat_create_session`, `spark_chat_reply`, `spark_chat_stream_chunk`, `spark_chat_set_typing`, `spark_chat_get_messages` (total 11 tools) |
| `scripts/spark_notify.py` | 1 | Add chat CLI functions + `--chat-create`, `--chat-reply`, `--chat-history`, `--session` arguments |
| `.gitignore` | 3 | Add `spark_config.json` (contains auth token, must not be committed) |

### 9.3 Files NOT Modified (explicitly preserved)

| File | Reason |
|------|--------|
| `src/preload.js` | Existing `sparkBridge.onServerEvent()` forwards all server events — chat.js uses it directly |
| `src/renderer/audio.js` | No new audio features in scope |
| `src/wander.js` | Lite mode disables it via `main.js` flag, no code change to wander.js itself |
| `assets/` | No new character skins or GIFs in scope |

---

## 10. Configuration Reference

### 10.1 Environment Variables

| Variable | Default | Phase | Purpose |
|----------|---------|-------|---------|
| `SPARK_PORT` | `7890` | existing | HTTP/WS server port |
| `SPARK_LITE` | unset | 1 | Force lite mode (`1` = on) |
| `HERMES_API_URL` | unset | 2 | Hermes API Server URL (enables adapter) |
| `HERMES_API_KEY` | unset | 2 | Bearer token for Hermes API |
| `HERMES_MODEL` | `default` | 2 | Model name for chat completions |
| `SPARK_AUTH_TOKEN` | unset | 3 | Auth token (enables auth when set) |
| `SPARK_CORS_ORIGIN` | `*` | 3 | Allowed CORS origin(s) |
| `SPARK_RELAY_URL` | unset | 3 | Relay server URL (enables relay client) |
| `SPARK_RELAY_TOKEN` | unset | 3 | Auth token for relay server |

**Precedence:** Environment variables take precedence over `spark_config.json` values. Config file is loaded first in `main.js`; it only sets env vars if they're not already set.

### 10.2 spark_config.json Structure

```json
{
  "mode": "local",
  "port": 7890,
  "auth": { "enabled": false, "token": "" },
  "hermes": { "apiUrl": "", "apiKey": "", "model": "default" },
  "relay": { "enabled": false, "url": "", "token": "" },
  "lite": { "autoDetect": true, "forceLite": false, "ramThresholdGB": 8 },
  "cors": { "origin": "*" }
}
```

File is gitignored. `spark_config.example.json` is committed as a template.