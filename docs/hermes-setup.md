# Hermes Integration Setup

Spark Desktop can connect to a Hermes API Server's OpenAI-compatible endpoint for bidirectional chat with AI models. This enables streaming responses directly in the Spark chat panel.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HERMES_API_URL` | Yes | (empty) | Base URL of the Hermes API server, e.g. `http://localhost:8000` |
| `HERMES_API_KEY` | No | (empty) | Bearer token for API authentication |
| `HERMES_MODEL` | No | `default` | Model name to pass to `/v1/chat/completions` |

### spark_config.json

Add a `hermes` section to `spark_config.json`:

```json
{
  "hermes": {
    "apiUrl": "http://localhost:8000",
    "apiKey": "your-api-key-here",
    "model": "default"
  }
}
```

Environment variables take precedence over config file values.

## How It Works

### SSE Streaming Flow

1. User sends a message in the Spark chat panel → `POST /api/chat/send`
2. `server.js` persists the message and calls `this.onChatMessage(sessionId, content, agent)`
3. `main.js` wires `onChatMessage` to `hermesAdapter.sendChatMessage()`
4. HermesAdapter broadcasts `chat_typing: true` to all Spark clients
5. HermesAdapter POSTs to `{HERMES_API_URL}/v1/chat/completions` with `stream: true`
6. SSE chunks arrive — each delta is broadcast as `chat_stream` events
7. The chat panel progressively renders the streaming response
8. On `[DONE]` or stream end, the full response is persisted and `chat_stream done: true` is broadcast
9. `chat_typing: false` is broadcast

### SSE Parsing

The HermesAdapter uses Node.js `'data'` and `'end'` event listeners on the HTTP response (NOT async iterators). This ensures compatibility across all Node.js versions. Partial SSE lines are buffered across TCP chunk boundaries and processed when a newline delimiter is received.

## Webhook Endpoint

Spark Desktop also exposes a webhook endpoint for asynchronous Hermes events:

### `POST /api/hermes-webhook`

**Request body:**
```json
{
  "event": "message_response | task_completed | task_started",
  "data": { ... }
}
```

**Event types:**

| Event | Data Fields | Behavior |
|-------|-------------|----------|
| `message_response` | `session_id`, `content`, `agent` | Persists message to DB + broadcasts `chat_message` |
| `task_completed` | `title`, `message`, `agent` | Broadcasts notification (Clippy speech bubble) |
| `task_started` | `agent`, `message` | Updates companion state to `working` |

**Response:**
```json
{ "ok": true, "received": "message_response" }
```

**Example (curl):**
```bash
curl -X POST http://localhost:7890/api/hermes-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"task_completed","data":{"title":"Done!","message":"All tests passed","agent":"hermes"}}'
```

## Activation

Hermes integration is **opt-in**. It only activates when `HERMES_API_URL` is set as an environment variable or in `spark_config.json`.

```bash
# Launch Spark with Hermes integration
HERMES_API_URL=http://localhost:8000 HERMES_API_KEY=your-key npm start
```

If `HERMES_API_URL` is not set, the chat panel still works — agents can reply via `POST /api/chat/reply` or MCP tools.