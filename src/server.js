if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const http = require('http');
const url = require('url');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.log('WS fallback');
}

let messageStore = null;
try {
  messageStore = require('./store/messageStore');
} catch (e) {
  console.warn('⚠️ messageStore module not available:', e.message);
}

class SparkServer {
  constructor(port = 7890) {
    this.port = port;
    this.clients = new Set();
    this.pendingResolvers = new Map(); // id -> callback
    this.promptQueues = new Map(); // agentId -> Array<Prompt>
    this.activeSessions = new Map(); // agentId -> { lastSeen: Date, channel: 'mcp'|'http' }
    this.onChatMessage = null; // Hook for HermesAdapter (set by main.js)
    this.currentState = {
      state: 'calm',
      agent: 'spark',
      message: 'Spark is resting...',
      lastUpdate: Date.now()
    };

    this.server = http.createServer((req, res) => this.handleHttp(req, res));
    if (WebSocket) {
      this.wss = new WebSocket.Server({ server: this.server });
      this.setupWebSockets();
    }
  }

  touchSession(agentName, channel = 'http') {
    if (!agentName) return;
    const key = agentName.toLowerCase();
    this.activeSessions.set(key, {
      lastSeen: Date.now(),
      channel
    });
  }

  handleHttp(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (req.method === 'GET' && pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, data: this.currentState }));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/prompts') {
      const agent = (parsedUrl.query.agent || 'all').toLowerCase();
      this.touchSession(agent, 'http_poll');
      const specific = this.promptQueues.get(agent) || [];
      const globalPrompts = agent !== 'all' ? (this.promptQueues.get('all') || []) : [];
      const combined = [...specific, ...globalPrompts];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, agent, prompts: combined }));
      return;
    }

    // CHAT: GET /api/chat/sessions — list all chat sessions
    if (req.method === 'GET' && pathname === '/api/chat/sessions') {
      if (!messageStore) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'messageStore unavailable' }));
        return;
      }
      const sessions = messageStore.getSessions(50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessions }));
      return;
    }

    // CHAT: GET /api/chat/messages — paginated message history
    if (req.method === 'GET' && pathname === '/api/chat/messages') {
      if (!messageStore) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'messageStore unavailable' }));
        return;
      }
      const sessionId = parsedUrl.query.session || '';
      const limit = parseInt(parsedUrl.query.limit || '50', 10);
      const offset = parseInt(parsedUrl.query.offset || '0', 10);
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'session query param required' }));
        return;
      }
      const messages = messageStore.getMessages(sessionId, limit, offset);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, messages }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let json = {};
        try {
          if (body) json = JSON.parse(body);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
          return;
        }

        if (pathname === '/api/wander') {
          const { enabled = true } = json;
          this.broadcast({ type: 'wander_toggle', enabled });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, enabled }));
          return;
        }

        if (pathname === '/api/skin') {
          const { skin = 'astro' } = json;
          this.broadcast({ type: 'set_skin', skin });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, skin }));
          return;
        }

        if (pathname === '/api/state') {
          const { state = 'calm', agent = 'spark', message = '', skin } = json;
          this.touchSession(agent, 'http_state');
          this.updateState({ state, agent, message, skin });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, state, agent, message, skin }));
          return;
        }

        if (pathname === '/api/message') {
          // 📬 Mensaje informativo — muestra toast sin botones, auto-dismiss 8s
          const id = json.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const agent = json.agent || 'hermes';
          this.touchSession(agent, 'http_message');
          const state = json.state || 'calm';
          const title = json.title || '';
          const message = json.message || '';
          const timeout = json.timeout || 8; // 8 segundos por defecto
          const sound = json.sound !== false;

          const payload = {
            id,
            agent,
            state,
            title,
            message,
            actions: [], // sin botones
            timeout,
            sound,
            type: 'info',
            timestamp: Date.now()
          };

          this.broadcast({ type: 'message', data: payload });
          this.updateState({ state, agent, message: title || message });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id, status: 'dispatched' }));
          return;
        }

        if (pathname === '/api/notify') {
          const id = json.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const agent = json.agent || 'spark';
          this.touchSession(agent, 'http_notify');
          const state = json.state || 'waiting';
          const title = json.title || 'Attention Required';
          const message = json.message || '';
          const code = json.code || '';
          const actions = json.actions || ['Approve', 'Reject'];
          const timeout = json.timeout || 0;
          const sound = json.sound !== false;

          const payload = { id, agent, state, title, message, code, actions, timeout, sound, timestamp: Date.now() };

          this.broadcast({ type: 'notification', data: payload });
          this.updateState({ state, agent, message: title || message });

          const isWaiting = parsedUrl.query.wait === 'true' || json.waitForResponse;
          if (isWaiting) {
            const timeoutMs = (timeout > 0 ? timeout : 120) * 1000;
            const timer = setTimeout(() => {
              if (this.pendingResolvers.has(id)) {
                this.pendingResolvers.delete(id);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'timeout', action: null }));
              }
            }, timeoutMs);

            this.pendingResolvers.set(id, (action) => {
              clearTimeout(timer);
              this.pendingResolvers.delete(id);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, id, action }));
            });
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, id, status: 'dispatched' }));
          }
          return;
        }

        if (pathname === '/api/action') {
          const { id, action } = json;
          this.handleActionSelected(id, action);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id, action }));
          return;
        }

        if (pathname === '/api/prompt') {
          const promptId = json.id || `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const targetAgent = (json.targetAgent || 'all').toLowerCase();
          const promptText = json.prompt || '';
          const author = json.author || 'user';

          const promptPayload = {
            id: promptId,
            targetAgent,
            prompt: promptText,
            author,
            timestamp: Date.now()
          };

          if (!this.promptQueues.has(targetAgent)) {
            this.promptQueues.set(targetAgent, []);
          }
          this.promptQueues.get(targetAgent).push(promptPayload);

          // Broadcast to connected agents and WebSockets
          this.broadcast({
            type: 'agent_prompt_dispatched',
            data: promptPayload
          });

          // Set visual working state for companion
          this.updateState({
            state: 'working',
            agent: targetAgent === 'all' ? 'spark' : targetAgent,
            message: `Dispatching task to ${targetAgent.toUpperCase()}...`
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, id: promptId, targetAgent, status: 'queued' }));
          return;
        }

        if (pathname === '/api/prompts/ack') {
          const { id, agent = 'all' } = json;
          const agentKey = agent.toLowerCase();
          if (this.promptQueues.has(agentKey)) {
            const remaining = this.promptQueues.get(agentKey).filter(p => p.id !== id);
            this.promptQueues.set(agentKey, remaining);
          }
          if (this.promptQueues.has('all')) {
            const remainingAll = this.promptQueues.get('all').filter(p => p.id !== id);
            this.promptQueues.set('all', remainingAll);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, acknowledgedId: id }));
          return;
        }

        if (pathname === '/api/dismiss') {
          this.broadcast({ type: 'dismiss' });
          this.updateState({ state: 'calm', agent: 'spark', message: 'Resting' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // =========================================================
        // CHAT ENDPOINTS (Phase 1 — additive, existing endpoints unchanged)
        // =========================================================

        if (pathname === '/api/chat/session') {
          const agent = json.agent || 'spark';
          const title = json.title || 'New Conversation';
          if (!messageStore) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'messageStore unavailable' }));
            return;
          }
          const session = messageStore.createSession(agent, title);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, session }));
          return;
        }

        if (pathname === '/api/chat/delete-session') {
          const { session_id } = json;
          if (!messageStore || !session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'session_id required' }));
            return;
          }
          messageStore.deleteSession(session_id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (pathname === '/api/chat/send') {
          const { session_id, role = 'user', content, agent, metadata } = json;
          if (!messageStore || !session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'session_id required' }));
            return;
          }
          const message = messageStore.addMessage(session_id, role, content, agent, metadata);
          this.broadcast({ type: 'chat_message', data: message });
          // Hook for HermesAdapter — called after broadcast, if set
          if (typeof this.onChatMessage === 'function') {
            try {
              this.onChatMessage(session_id, content, agent);
            } catch (e) {
              console.error('onChatMessage hook error:', e);
            }
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message }));
          return;
        }

        if (pathname === '/api/chat/reply') {
          const { session_id, content, agent, metadata, stream_id } = json;
          if (!messageStore || !session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'session_id required' }));
            return;
          }
          const message = messageStore.addMessage(session_id, 'agent', content, agent, metadata);
          this.broadcast({ type: 'chat_message', data: message });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, message }));
          return;
        }

        if (pathname === '/api/chat/stream') {
          const { session_id, stream_id, chunk, done, full_content, agent } = json;
          if (!session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'session_id required' }));
            return;
          }
          this.broadcast({
            type: 'chat_stream',
            data: { session_id, stream_id, chunk: chunk || '', done: !!done, full_content: full_content || '', agent: agent || 'agent' }
          });
          if (done && messageStore && full_content) {
            messageStore.addMessage(session_id, 'agent', full_content, agent);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, streamed: true, done: !!done }));
          return;
        }

        if (pathname === '/api/chat/typing') {
          const { session_id, agent, is_typing } = json;
          this.broadcast({
            type: 'chat_typing',
            data: { session_id, agent: agent || 'agent', is_typing: !!is_typing }
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        // =========================================================
        // HERMES WEBHOOK (Phase 2 — async event receiver)
        // =========================================================

        if (pathname === '/api/hermes-webhook') {
          const { event, data } = json;
          if (!event) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'event required' }));
            return;
          }
          if (event === 'message_response' && data) {
            if (messageStore && data.session_id) {
              const message = messageStore.addMessage(
                data.session_id,
                data.role || 'agent',
                data.content || '',
                data.agent || 'hermes'
              );
              this.broadcast({ type: 'chat_message', data: message });
            } else {
              this.broadcast({ type: 'chat_message', data });
            }
          } else if (event === 'task_completed' && data) {
            this.broadcast({
              type: 'notification',
              data: {
                id: `webhook_${Date.now()}`,
                agent: data.agent || 'hermes',
                state: 'done',
                title: data.title || 'Task Completed',
                message: data.message || '',
                actions: ['OK'],
                timeout: 8,
                sound: true,
                timestamp: Date.now()
              }
            });
          } else if (event === 'task_started' && data) {
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

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  }

  setupWebSockets() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type: 'init', data: this.currentState }));

      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.type === 'action_clicked') {
            this.handleActionSelected(parsed.id, parsed.action);
          } else if (parsed.type === 'update_state') {
            this.updateState(parsed.data);
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  handleActionSelected(id, action) {
    if (this.pendingResolvers.has(id)) {
      const resolver = this.pendingResolvers.get(id);
      resolver(action);
    }
    this.broadcast({
      type: 'action_resolved',
      id,
      action,
      timestamp: Date.now()
    });
  }

  updateState(stateData) {
    this.currentState = { ...this.currentState, ...stateData, lastUpdate: Date.now() };
    this.broadcast({ type: 'state_changed', data: this.currentState });
  }

  broadcast(messageObj) {
    const jsonStr = JSON.stringify(messageObj);
    for (const client of this.clients) {
      if (client.readyState === (WebSocket ? WebSocket.OPEN : 1)) {
        client.send(jsonStr);
      }
    }
  }

  start() {
    return new Promise((resolve) => {
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`⚠️ Port ${this.port} is already in use by another instance.`);
        } else {
          console.error('HTTP Server Error:', err);
        }
        resolve(this.port);
      });

      this.server.listen(this.port, () => {
        console.log(`⚡ Spark Server listening on http://localhost:${this.port}`);
        resolve(this.port);
      });
    });
  }
}

module.exports = SparkServer;
