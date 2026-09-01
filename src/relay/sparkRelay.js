#!/usr/bin/env node
// src/relay/sparkRelay.js — Standalone Spark Relay Server
// Task 3.3: VPS relay server for bridging remote Spark instances and agents
//
// Usage: node sparkRelay.js --port 7891 --token MY_SECRET
//        node sparkRelay.js --config relayConfig.json
//
// WebSocket paths:
//   /spark  — Spark Desktop clients connect here
//   /agent  — Remote agent adapters connect here
//
// GET /health — returns { ok, sparkClients, agentClients, uptime }
//
// Fix F5: Messages bridged through the relay are tagged with _fromRelay: true
// so RelayClient doesn't re-forward them back, preventing infinite echo loops.

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.error('FATAL: ws package not found. Install in runtime dir:');
  console.error('  cd C:/Users/FERNA/.spark_desktop_runtime && npm install ws');
  process.exit(1);
}

// --- Parse CLI args ---
function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function loadConfigFile(filepath) {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error loading config file ${filepath}: ${e.message}`);
    return null;
  }
}

const args = parseArgs();
let config = {
  port: 7891,
  token: null,
  tls: false
};

// Load from config file if specified
if (args.config) {
  const fileConfig = loadConfigFile(args.config);
  if (fileConfig) {
    config = { ...config, ...fileConfig };
  }
}

// CLI args override config file
if (args.port) config.port = parseInt(args.port, 10);
if (args.token) config.token = args.token;

if (!config.token) {
  console.error('ERROR: --token is required (or set "token" in config file)');
  console.error('Usage: node sparkRelay.js --port 7891 --token MY_SECRET');
  process.exit(1);
}

// --- Relay state ---
const sparkClients = new Set();
const agentClients = new Set();
const startTime = Date.now();

/**
 * Validate token from request (query param or Authorization header).
 */
function validateToken(req) {
  const parsedUrl = url.parse(req.url || '', true);
  const queryToken = parsedUrl.query.token || parsedUrl.query.auth;
  if (queryToken && queryToken === config.token) return true;

  const authHeader = req.headers && req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(/\s+/);
    const candidate = parts.length > 1 ? parts[1] : parts[0];
    if (candidate === config.token) return true;
  }
  return false;
}

/**
 * Broadcast a message to all clients in a set, tagging it with _fromRelay.
 * Fix F5: The _fromRelay flag tells RelayClient not to re-forward the message.
 */
function relayTo(targetSet, message) {
  // Tag with _fromRelay to prevent echo loops (F5)
  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message);
      parsed._fromRelay = true;
      message = JSON.stringify(parsed);
    } catch (e) {
      // Non-JSON message, send as-is with a wrapper
      message = JSON.stringify({ type: 'raw', data: message, _fromRelay: true });
    }
  } else if (typeof message === 'object') {
    message = JSON.stringify({ ...message, _fromRelay: true });
  }

  for (const client of targetSet) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// --- HTTP server for health check ---
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      sparkClients: sparkClients.size,
      agentClients: agentClients.size,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      port: config.port
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

// --- WebSocket server with path routing ---
const wss = new WebSocket.Server({ server: httpServer, path: '/' });

wss.on('connection', (ws, req) => {
  // Validate token on connection
  if (!validateToken(req)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  let clientSet = null;
  let targetSet = null;
  let clientLabel = '';

  if (pathname === '/spark') {
    clientSet = sparkClients;
    targetSet = agentClients; // spark→agent forwarding
    clientLabel = 'spark';
    sparkClients.add(ws);
    console.log(`[Relay] Spark client connected (total: ${sparkClients.size})`);
  } else if (pathname === '/agent') {
    clientSet = agentClients;
    targetSet = sparkClients; // agent→spark forwarding
    clientLabel = 'agent';
    agentClients.add(ws);
    console.log(`[Relay] Agent client connected (total: ${agentClients.size})`);
  } else {
    ws.close(4004, 'Unknown path');
    return;
  }

  ws.on('message', (data) => {
    // Forward to the opposite set, tagged with _fromRelay
    relayTo(targetSet, data);
  });

  ws.on('close', () => {
    clientSet.delete(ws);
    console.log(`[Relay] ${clientLabel} client disconnected (total: ${clientSet.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[Relay] ${clientLabel} client error:`, err.message);
    clientSet.delete(ws);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'relay_connected',
    role: clientLabel,
    _fromRelay: true
  }));
});

// --- Start server ---
httpServer.listen(config.port, () => {
  console.log(`🚀 Spark Relay Server running on port ${config.port}`);
  console.log(`   WebSocket paths: /spark, /agent`);
  console.log(`   Health check: http://localhost:${config.port}/health`);
  console.log(`   Auth: ${config.token ? 'enabled' : 'DISABLED'}`);
  console.log(`   TLS: ${config.tls ? 'configured (use reverse proxy)' : 'not configured (use reverse proxy for TLS)'}`);
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n Shutting down relay server...');
  for (const ws of [...sparkClients, ...agentClients]) {
    ws.close(1001, 'Server shutting down');
  }
  httpServer.close(() => process.exit(0));
});