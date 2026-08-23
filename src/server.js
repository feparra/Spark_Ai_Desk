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

class SparkServer {
  constructor(port = 7890) {
    this.port = port;
    this.clients = new Set();
    this.pendingResolvers = new Map(); // id -> callback
    this.promptQueues = new Map(); // agentId -> Array<Prompt>
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
      const specific = this.promptQueues.get(agent) || [];
      const globalPrompts = agent !== 'all' ? (this.promptQueues.get('all') || []) : [];
      const combined = [...specific, ...globalPrompts];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, agent, prompts: combined }));
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
          this.updateState({ state, agent, message, skin });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, state, agent, message, skin }));
          return;
        }

        if (pathname === '/api/notify') {
          const id = json.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const agent = json.agent || 'spark';
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
