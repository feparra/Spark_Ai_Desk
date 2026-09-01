// src/remote-init.js — Remote connectivity initialization
// Tasks 3.6 + 3.8: Exports initRemote(sparkServer, mainWindow) that:
//   1. Loads spark_config.json (if exists) → sets env vars (env vars take precedence)
//   2. Creates SparkAuth instance
//   3. Wires auth into the server (HTTP 401 + WS validation)
//   4. Applies configurable CORS
//   5. Creates RelayClient and connects if relay URL is configured
//   6. Wraps sparkServer.broadcast to also forward to relay (with F5 echo prevention)
//
// This module is designed to be called from main.js in the merge step:
//   const { initRemote } = require('./remote-init');
//   initRemote(sparkServer, mainWindow);

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const fs = require('fs');
const path = require('path');
const SparkAuth = require('./auth');
const { applyAuth, applyCors } = require('./auth-integration');
const RelayClient = require('./relayClient');

/**
 * Load spark_config.json from the project root, if it exists.
 * Sets env vars from config, but existing env vars take precedence.
 * @param {string} configPath - path to spark_config.json
 * @returns {object|null} parsed config or null
 */
function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);

    // Set env vars from config (only if not already set)
    // Env vars take precedence over config file

    if (config.port && !process.env.SPARK_PORT) {
      process.env.SPARK_PORT = String(config.port);
    }

    if (config.auth) {
      if (config.auth.enabled && !process.env.SPARK_AUTH_TOKEN) {
        process.env.SPARK_AUTH_TOKEN = config.auth.token || '';
      }
    }

    if (config.hermes) {
      if (config.hermes.apiUrl && !process.env.HERMES_API_URL) {
        process.env.HERMES_API_URL = config.hermes.apiUrl;
      }
      if (config.hermes.apiKey && !process.env.HERMES_API_KEY) {
        process.env.HERMES_API_KEY = config.hermes.apiKey;
      }
      if (config.hermes.model && !process.env.HERMES_MODEL) {
        process.env.HERMES_MODEL = config.hermes.model;
      }
    }

    if (config.relay) {
      if (config.relay.url && !process.env.SPARK_RELAY_URL) {
        process.env.SPARK_RELAY_URL = config.relay.url;
      }
      if (config.relay.token && !process.env.SPARK_AUTH_TOKEN) {
        process.env.SPARK_AUTH_TOKEN = config.relay.token;
      }
    }

    if (config.cors) {
      if (config.cors.origin && !process.env.SPARK_CORS_ORIGIN) {
        process.env.SPARK_CORS_ORIGIN = config.cors.origin;
      }
    }

    if (config.lite) {
      if (config.lite.forceLite && !process.env.SPARK_LITE) {
        process.env.SPARK_LITE = '1';
      }
    }

    if (config.mode && !process.env.SPARK_MODE) {
      process.env.SPARK_MODE = config.mode;
    }

    console.log('[RemoteInit] Loaded spark_config.json');
    return config;
  } catch (e) {
    console.error('[RemoteInit] Error loading spark_config.json:', e.message);
    return null;
  }
}

/**
 * Initialize remote connectivity: auth, CORS, relay client.
 * @param {object} sparkServer - SparkServer instance
 * @param {object} mainWindow - Electron BrowserWindow (optional, for reference)
 * @returns {object} { auth, relayClient }
 */
function initRemote(sparkServer, mainWindow) {
  // 1. Load config file
  const configPath = path.join(__dirname, '..', 'spark_config.json');
  const config = loadConfig(configPath);

  // 2. Create auth instance
  const auth = new SparkAuth();

  if (auth.isEnabled()) {
    console.log('[RemoteInit] Auth enabled — token-based authentication active');
  } else {
    console.log('[RemoteInit] Auth disabled — local mode (no token set)');
  }

  // 3. Wire auth into the server
  applyAuth(sparkServer, auth);

  // 4. Apply configurable CORS
  applyCors(sparkServer);

  // 5. Create relay client
  const relayClient = new RelayClient(sparkServer, {
    relayUrl: process.env.SPARK_RELAY_URL,
    token: process.env.SPARK_AUTH_TOKEN
  });

  // 6. Connect to relay if URL is set
  if (process.env.SPARK_RELAY_URL) {
    console.log(`[RemoteInit] Connecting to relay: ${process.env.SPARK_RELAY_URL}`);
    relayClient.connect();
  } else {
    console.log('[RemoteInit] No relay URL configured — relay disabled');
  }

  // 7. Wrap broadcast to forward to relay (with F5 echo prevention)
  // The original broadcast is already wrapped by main.js for renderer forwarding.
  // We wrap it again to add relay forwarding.
  const originalBroadcast = sparkServer.broadcast.bind(sparkServer);

  sparkServer.broadcast = function (messageObj) {
    // Call the original (which includes renderer forwarding)
    originalBroadcast(messageObj);

    // Forward to relay via onRelayMessage callback
    // RelayClient._wireOutbound() already sets up onRelayMessage,
    // but we call it here explicitly to ensure it fires on every broadcast.
    if (sparkServer.onRelayMessage) {
      sparkServer.onRelayMessage(messageObj);
    }
  };

  return { auth, relayClient, config };
}

module.exports = { initRemote, loadConfig };