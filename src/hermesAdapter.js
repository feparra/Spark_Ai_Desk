// HermesAdapter — Bridge between Spark chat and a Hermes API Server's OpenAI-compatible endpoint
// Runs in the Electron main process. Uses 'data'/'end' event listeners for SSE parsing (NOT async iterators).

if (!module.paths.includes('C:/Users/ferna/.spark_desktop_runtime/node_modules')) {
  module.paths.push('C:/Users/ferna/.spark_desktop_runtime/node_modules');
}

const http = require('http');
const https = require('https');
const { URL } = require('url');

class HermesAdapter {
  constructor(sparkServer, options = {}) {
    this.sparkServer = sparkServer;
    this.apiUrl = options.apiUrl || process.env.HERMES_API_URL || '';
    this.apiKey = options.apiKey || process.env.HERMES_API_KEY || '';
    this.model = options.model || process.env.HERMES_MODEL || 'default';
    this.enabled = false;
  }

  enable() {
    if (this.apiUrl) {
      this.enabled = true;
      console.log(`🔴 HermesAdapter enabled — API: ${this.apiUrl}, Model: ${this.model}`);
    } else {
      console.warn('HermesAdapter: Cannot enable — HERMES_API_URL not set');
    }
  }

  disable() {
    this.enabled = false;
  }

  /**
   * Send a chat message to Hermes and stream the response back via Spark broadcasts.
   * Uses 'data'/'end' event listeners on the HTTP response for SSE parsing.
   */
  async sendChatMessage(sessionId, userMessage, agent = 'hermes') {
    if (!this.enabled || !this.apiUrl) return;

    const messageStore = safeRequireMessageStore();

    // Broadcast typing start
    this.sparkServer.broadcast({
      type: 'chat_typing',
      data: { session_id: sessionId, agent, is_typing: true }
    });

    // Build request to Hermes OpenAI-compatible endpoint
    const apiUrl = this.apiUrl.replace(/\/$/, '');
    const endpoint = `${apiUrl}/v1/chat/completions`;
    const parsedUrl = new URL(endpoint);
    const isHttps = parsedUrl.protocol === 'https:';
    const transport = isHttps ? https : http;

    const requestBody = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant integrated into the Spark Desktop Companion. Be concise and friendly.' },
        { role: 'user', content: userMessage }
      ],
      stream: true
    });

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    // Add auth header if API key is set
    if (this.apiKey) {
      requestOptions.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let fullContent = '';
    let streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    let sseBuffer = ''; // Buffer for partial SSE lines across TCP chunks

    const self = this;

    return new Promise((resolve) => {
      const req = transport.request(requestOptions, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', (chunk) => { errBody += chunk; });
          res.on('end', () => {
            const errMsg = `Hermes API returned status ${res.statusCode}: ${errBody.slice(0, 200)}`;
            console.error('HermesAdapter:', errMsg);
            self._broadcastError(sessionId, agent, errMsg);
            self._broadcastTypingEnd(sessionId, agent);
            resolve();
          });
          return;
        }

        // SSE parsing using 'data' event (NOT async iterators)
        res.on('data', (chunk) => {
          sseBuffer += chunk.toString('utf8');

          // Split on newlines, keep any partial line in the buffer
          const lines = sseBuffer.split('\n');
          // Last element might be a partial line — keep it for next chunk
          sseBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // SSE lines start with "data: "
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();

            // Check for [DONE] sentinel
            if (dataStr === '[DONE]') {
              continue;
            }

            // Parse JSON (try/catch per line — partial JSON is non-fatal)
            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
              if (delta && delta.content) {
                fullContent += delta.content;

                // Broadcast stream chunk
                self.sparkServer.broadcast({
                  type: 'chat_stream',
                  data: {
                    session_id: sessionId,
                    stream_id: streamId,
                    chunk: delta.content,
                    done: false,
                    agent: agent
                  }
                });
              }
            } catch (e) {
              // Partial JSON or non-JSON line — skip silently
            }
          }
        });

        res.on('end', () => {
          // Process any remaining data in buffer
          if (sseBuffer.trim()) {
            const trimmed = sseBuffer.trim();
            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              if (dataStr !== '[DONE]') {
                try {
                  const parsed = JSON.parse(dataStr);
                  const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
                  if (delta && delta.content) {
                    fullContent += delta.content;
                  }
                } catch (e) {}
              }
            }
          }

          // Broadcast done with full content
          self.sparkServer.broadcast({
            type: 'chat_stream',
            data: {
              session_id: sessionId,
              stream_id: streamId,
              chunk: '',
              done: true,
              full_content: fullContent,
              agent: agent
            }
          });

          // Persist the full agent message
          if (messageStore && fullContent) {
            try {
              messageStore.addMessage(sessionId, 'agent', fullContent, agent);
            } catch (e) {
              console.error('HermesAdapter: Failed to persist message:', e);
            }
          }

          // Broadcast typing end
          self._broadcastTypingEnd(sessionId, agent);
          resolve();
        });

        res.on('error', (err) => {
          console.error('HermesAdapter: Response stream error:', err);
          self._broadcastError(sessionId, agent, err.message);
          self._broadcastTypingEnd(sessionId, agent);
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error('HermesAdapter: Request error:', err);
        self._broadcastError(sessionId, agent, `Connection failed: ${err.message}`);
        self._broadcastTypingEnd(sessionId, agent);
        resolve();
      });

      req.write(requestBody);
      req.end();
    });
  }

  _broadcastTypingEnd(sessionId, agent) {
    this.sparkServer.broadcast({
      type: 'chat_typing',
      data: { session_id: sessionId, agent, is_typing: false }
    });
  }

  _broadcastError(sessionId, agent, errorMessage) {
    this.sparkServer.broadcast({
      type: 'chat_message',
      data: {
        session_id: sessionId,
        role: 'system',
        content: `⚠️ Hermes error: ${errorMessage}`,
        agent: 'system',
        timestamp: Date.now()
      }
    });
  }
}

function safeRequireMessageStore() {
  try {
    return require('./store/messageStore');
  } catch (e) {
    return null;
  }
}

module.exports = HermesAdapter;