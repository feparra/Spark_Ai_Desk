// src/relayClient.js — Outbound Relay Client for Spark Server
// Task 3.5: Connects to a remote relay server and bridges messages bidirectionally
//
// Fix F5 (echo loop prevention):
// - Messages received FROM the relay are tagged with _fromRelay: true
// - When forwarding outbound messages to the relay, we SKIP any message that
//   already has _fromRelay set — this prevents the message from bouncing back
//   through the relay and creating an infinite echo loop.

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.log('[RelayClient] ws package not found — relay disabled');
}

const url = require('url');

class RelayClient {
  /**
   * @param {object} sparkServer - SparkServer instance
   * @param {object} opts - { relayUrl, token }
   * @param {string} opts.relayUrl - Base URL of relay server (e.g. ws://vps:7891)
   * @param {string} opts.token - Auth token for relay connection
   */
  constructor(sparkServer, opts = {}) {
    this.sparkServer = sparkServer;
    this.relayUrl = opts.relayUrl || process.env.SPARK_RELAY_URL || null;
    this.token = opts.token || process.env.SPARK_AUTH_TOKEN || null;
    this.ws = null;
    this.connected = false;
    this.shouldReconnect = true;

    // Exponential backoff: 5s → 10s → 20s → 30s (max)
    this.initialBackoff = 5000;
    this.maxBackoff = 30000;
    this.currentBackoff = this.initialBackoff;
    this.reconnectTimer = null;

    // Wire up the relay message forwarding on the spark server
    this._wireOutbound();
  }

  /**
   * Wire outbound forwarding: wrap sparkServer.broadcast to also
   * send messages to the relay, EXCEPT messages tagged _fromRelay (F5).
   */
  _wireOutbound() {
    if (!this.sparkServer) return;

    // Set up the onRelayMessage callback — called by the broadcast wrapper
    this.sparkServer.onRelayMessage = (messageObj) => {
      // Fix F5: Don't re-forward messages that came from the relay
      if (messageObj && messageObj._fromRelay) return;
      if (!this.connected || !this.ws || this.ws.readyState !== (WebSocket ? WebSocket.OPEN : 1)) return;

      try {
        this.ws.send(JSON.stringify(messageObj));
      } catch (e) {
        console.error('[RelayClient] Error sending to relay:', e.message);
      }
    };
  }

  /**
   * Connect to the relay server.
   */
  connect() {
    if (!WebSocket) {
      console.log('[RelayClient] ws not available, cannot connect');
      return;
    }
    if (!this.relayUrl) {
      console.log('[RelayClient] No relay URL configured, skipping connection');
      return;
    }
    if (!this.token) {
      console.log('[RelayClient] No token configured, skipping connection');
      return;
    }

    this.shouldReconnect = true;
    this._doConnect();
  }

  _doConnect() {
    // Build the WebSocket URL: {relayUrl}/spark?token={token}
    const wsUrl = this.relayUrl.replace(/\/$/, '') + '/spark?token=' + encodeURIComponent(this.token);
    console.log(`[RelayClient] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('[RelayClient] Failed to create WebSocket:', e.message);
      this._scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log('[RelayClient] Connected to relay server');
      this.connected = true;
      this.currentBackoff = this.initialBackoff; // Reset backoff on success
    });

    this.ws.on('message', (data) => {
      // Inbound message from relay — inject into sparkServer.broadcast
      try {
        let parsed;
        if (typeof data === 'string') {
          parsed = JSON.parse(data);
        } else if (Buffer.isBuffer(data)) {
          parsed = JSON.parse(data.toString());
        } else {
          parsed = data;
        }

        // Tag with _fromRelay to prevent echo (F5)
        parsed._fromRelay = true;

        // Inject into local broadcast (this goes to local WS clients + renderer)
        this.sparkServer.broadcast(parsed);
      } catch (e) {
        console.error('[RelayClient] Error parsing relay message:', e.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[RelayClient] Disconnected from relay (code: ${code})`);
      this.connected = false;
      this.ws = null;
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[RelayClient] WebSocket error:', err.message);
      // 'close' event will handle reconnection
    });
  }

  /**
   * Schedule reconnection with exponential backoff.
   * 5s → 10s → 20s → 30s (capped)
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    const delay = this.currentBackoff;
    console.log(`[RelayClient] Reconnecting in ${delay / 1000}s...`);

    this.reconnectTimer = setTimeout(() => {
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
      this._doConnect();
    }, delay);
  }

  /**
   * Disconnect and stop reconnecting.
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    console.log('[RelayClient] Disconnected (manual)');
  }

  /**
   * Check if currently connected to relay.
   * @returns {boolean}
   */
  isConnected() {
    return this.connected;
  }
}

module.exports = RelayClient;