// MessageStore — SQLite persistence for chat sessions and messages
// Uses better-sqlite3 from external runtime directory
// Falls back to in-memory storage if native addon has ABI mismatch with Electron

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const path = require('path');

let db = null;
let useInMemory = false;

// In-memory fallback storage
const memSessions = new Map();
const memMessages = [];

function generateId(prefix) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substr(2, 6);
  return `${prefix}_${ts}_${rand}`;
}

function initDb() {
  if (db || useInMemory) return db;

  // better-sqlite3 is a native C++ addon compiled for Node.js's V8 ABI.
  // Electron uses a DIFFERENT V8 ABI, so `new Database()` causes SIGABRT
  // that kills the process — try/catch cannot intercept native crashes.
  // FIX: Run `npx electron-rebuild -f -w better-sqlite3` in the external
  // runtime dir to recompile for Electron's ABI and enable SQLite persistence.
  // Until then, use in-memory storage (fully functional, just no persistence).
  const isElectron = !!process.versions.electron;

  if (isElectron) {
    // TODO: Run `npx electron-rebuild -f -w better-sqlite3` in the external
    // runtime to recompile for Electron's ABI and enable SQLite persistence.
    // For now, in-memory is the safe default — fully functional, no persistence.
    console.warn('MessageStore: using in-memory (run electron-rebuild for SQLite persistence)');
    useInMemory = true;
    return null;
  }

  // Plain Node.js — safe to use directly
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(process.cwd(), 'spark-messages.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, agent TEXT, title TEXT, created_at INTEGER, last_message_at INTEGER); CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, agent TEXT, timestamp INTEGER, metadata TEXT); CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`);
    return db;
  } catch (e) {
    console.warn('MessageStore: in-memory fallback:', e.message);
    useInMemory = true;
    return null;
  }
}

function closeDb() {
  if (db) {
    try { db.close(); } catch (e) { console.error('Error closing DB:', e); }
    db = null;
  }
  memSessions.clear();
  memMessages.length = 0;
}

function createSession(agent = 'spark', title = 'New Conversation') {
  const id = generateId('sess');
  const now = Date.now();
  const session = { id, agent, title, created_at: now, last_message_at: now };

  if (useInMemory || !db) {
    memSessions.set(id, session);
    return session;
  }

  db.prepare('INSERT INTO sessions (id, agent, title, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, agent, title, now, now);
  return session;
}

function getSession(sessionId) {
  if (useInMemory || !db) {
    return memSessions.get(sessionId);
  }
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

function getSessions(limit = 50) {
  if (useInMemory || !db) {
    return Array.from(memSessions.values())
      .sort((a, b) => b.last_message_at - a.last_message_at)
      .slice(0, limit);
  }
  return db.prepare('SELECT * FROM sessions ORDER BY last_message_at DESC LIMIT ?').all(limit);
}

function deleteSession(sessionId) {
  if (useInMemory || !db) {
    memSessions.delete(sessionId);
    for (let i = memMessages.length - 1; i >= 0; i--) {
      if (memMessages[i].session_id === sessionId) {
        memMessages.splice(i, 1);
      }
    }
    return;
  }
  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function addMessage(sessionId, role, content, agent = null, metadata = {}) {
  const id = generateId('msg');
  const now = Date.now();
  const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
  const message = { id, session_id: sessionId, role, content, agent, timestamp: now, metadata: metaStr };

  if (useInMemory || !db) {
    memMessages.push(message);
    const sess = memSessions.get(sessionId);
    if (sess) sess.last_message_at = now;
    return message;
  }

  db.prepare('INSERT INTO messages (id, session_id, role, content, agent, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, sessionId, role, content, agent, now, metaStr);
  db.prepare('UPDATE sessions SET last_message_at = ? WHERE id = ?').run(now, sessionId);
  return message;
}

function getMessages(sessionId, limit = 50, offset = 0) {
  if (useInMemory || !db) {
    return memMessages
      .filter(m => m.session_id === sessionId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(offset, offset + limit);
  }
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?')
    .all(sessionId, limit, offset);
}

function getMessageCount(sessionId) {
  if (useInMemory || !db) {
    return memMessages.filter(m => m.session_id === sessionId).length;
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId);
  return row ? row.count : 0;
}

function updateMessage(id, content) {
  if (useInMemory || !db) {
    const msg = memMessages.find(m => m.id === id);
    if (msg) msg.content = content;
    return;
  }
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
}

module.exports = {
  initDb,
  closeDb,
  createSession,
  getSession,
  getSessions,
  deleteSession,
  addMessage,
  getMessages,
  getMessageCount,
  updateMessage,
  isUsingFallback: () => useInMemory
};