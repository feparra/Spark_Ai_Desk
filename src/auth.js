// src/auth.js — Token-based authentication for Spark Server
// Task 3.1: SparkAuth class

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const crypto = require('crypto');
const url = require('url');

class SparkAuth {
  /**
   * Creates a SparkAuth instance.
   * Reads SPARK_AUTH_TOKEN from the environment.
   * When unset: enabled=false, validateRequest() always returns true (local mode).
   */
  constructor() {
    this.token = process.env.SPARK_AUTH_TOKEN || null;
    this.enabled = !!this.token;
  }

  /**
   * Generate a random 48-char hex token via crypto.randomBytes.
   * @returns {string} 48-character hex string
   */
  generateToken() {
    return crypto.randomBytes(24).toString('hex'); // 24 bytes = 48 hex chars
  }

  /**
   * Validate an incoming HTTP or WebSocket request.
   * Checks Authorization header first, then ?token= or ?auth= query param.
   * When auth is disabled (no token set), always returns true.
   * @param {object} req - HTTP request or WebSocket upgrade request
   * @returns {boolean} true if authorized (or auth disabled)
   */
  validateRequest(req) {
    if (!this.enabled) return true;

    // Check Authorization header: "Bearer <token>" or bare token
    const authHeader = req.headers && req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(/\s+/);
      const candidate = parts.length > 1 ? parts[1] : parts[0];
      if (candidate && this._constantTimeEqual(candidate, this.token)) {
        return true;
      }
    }

    // Check query params: ?token= or ?auth=
    const parsedUrl = url.parse(req.url || '', true);
    const queryToken = parsedUrl.query.token || parsedUrl.query.auth;
    if (queryToken && this._constantTimeEqual(String(queryToken), this.token)) {
      return true;
    }

    return false;
  }

  /**
   * Get the current auth token (or null if disabled).
   * @returns {string|null}
   */
  getToken() {
    return this.token;
  }

  /**
   * Whether auth is enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Set or update the token at runtime (e.g. from config file).
   * @param {string} token
   */
  setToken(token) {
    this.token = token || null;
    this.enabled = !!this.token;
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  _constantTimeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}

module.exports = SparkAuth;