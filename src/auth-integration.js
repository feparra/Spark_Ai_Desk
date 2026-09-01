// src/auth-integration.js — Auth + CORS integration for SparkServer
// Task 3.2: Patches server.handleHttp and server.setupWebSockets to add auth
// without editing server.js directly. Also provides configurable CORS.

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const url = require('url');

/**
 * Patch a SparkServer instance to enforce auth on HTTP and WebSocket connections.
 * @param {object} server - SparkServer instance
 * @param {object} authInstance - SparkAuth instance
 */
function applyAuth(server, authInstance) {
  // --- Patch handleHttp: add auth check before any route handler ---
  const originalHandleHttp = server.handleHttp.bind(server);

  server.handleHttp = function (req, res) {
    // Auth check — early 401 if enabled and validation fails
    if (authInstance.isEnabled() && !authInstance.validateRequest(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
      return;
    }
    return originalHandleHttp(req, res);
  };

  // --- Patch setupWebSockets: validate on WS connection ---
  if (server.wss) {
    // Remove existing listeners and re-add with auth
    const originalListeners = server.wss.listeners('connection').slice();
    server.wss.removeAllListeners('connection');

    server.wss.on('connection', (ws, req) => {
      // Validate auth on WS upgrade
      if (authInstance.isEnabled() && !authInstance.validateRequest(req)) {
        ws.close(4001, 'Unauthorized');
        return;
      }
      // Call the original connection handlers
      for (const listener of originalListeners) {
        listener.call(server.wss, ws, req);
      }
    });
  }
}

/**
 * Patch a SparkServer instance to use configurable CORS.
 * Reads SPARK_CORS_ORIGIN env var (default '*' for backward compat).
 * @param {object} server - SparkServer instance
 * @param {string} [origin] - CORS origin override (defaults to SPARK_CORS_ORIGIN env or '*')
 */
function applyCors(server, origin) {
  const corsOrigin = origin || process.env.SPARK_CORS_ORIGIN || '*';
  const originalHandleHttp = server.handleHttp.bind(server);

  server.handleHttp = function (req, res) {
    // Set configurable CORS headers before the original handler runs
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    return originalHandleHttp(req, res);
  };

  // Store the cors origin for reference
  server._corsOrigin = corsOrigin;
}

module.exports = { applyAuth, applyCors };