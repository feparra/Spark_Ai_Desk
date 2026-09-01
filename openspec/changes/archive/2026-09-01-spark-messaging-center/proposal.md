# Proposal: spark-messaging-center

> Change proposal for transforming Spark Desktop from a unidirectional notifier into a bidirectional messaging center.
> SDD mode: openspec. RFC 2119 keywords used throughout.

---

## 1. Intent

Spark Desktop is currently a **unidirectional notification hub**: agents send messages via HTTP POST and the user sees ephemeral Clippy-style speech bubbles. There is no way for the user to reply, no persistent conversation history, no streaming responses, and no remote connectivity.

This change transforms Spark into a **bidirectional messaging center** — conceptually similar to Telegram — where:

- The user CAN type messages into a chat panel and receive real-time streaming responses from any connected AI agent (Hermes, Claude, Codex, etc.).
- Conversation history MUST persist across restarts via SQLite.
- Remote agents (running on VPS, Docker, or another PC) MUST be able to connect to Spark via a relay server or direct HTTP with token authentication.
- The application MUST remain usable on 8 GB RAM machines via an auto-detecting lite mode.

**Motivation:** The current architecture limits Spark to a passive display role. As AI agents become more interactive, the user needs a central place to converse with multiple agents, see history, and get streaming responses — all from a lightweight desktop companion that is always on top.

---

## 2. Scope

This change spans **four sequential phases**. All existing functionality (Clippy notifications, procedural audio, character skins, Agent Radar, Wander engine, MCP server, Python CLI) MUST remain working — new capabilities are additive.

### Phase 1: Chat UI + Persistence + Lite Mode

- Expandable chat panel in the renderer with scrollable message history and input box
- SQLite-based message store (`better-sqlite3`) for sessions and messages with WAL mode
- New HTTP endpoints on port 7890 for chat session CRUD, message send/reply, streaming chunks, and typing indicators
- WebSocket broadcast of chat events (`chat_message`, `chat_stream`, `chat_typing`) to all connected clients
- Auto-detecting lite mode for ≤ 8 GB RAM: disable `backdrop-filter` blur, disable non-essential animations, slow radar scan interval (30 s vs 12 s), local fonts (remove Google Fonts CDN dependency)
- Reactivation of avatar click handler to toggle the chat panel
- 5 new MCP tools in `spark_mcp_server.py` for chat operations
- Updated Python CLI helper (`spark_notify.py`) with chat commands

### Phase 2: Hermes Integration

- `HermesAdapter` module connecting Spark to the Hermes API Server's OpenAI-compatible `/v1/chat/completions` endpoint with SSE streaming
- Webhook receiver endpoint (`/api/hermes-webhook`) for async events from Hermes (task started, task completed, message response)
- Configuration via environment variables (`HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_MODEL`)
- Graceful degradation: if `HERMES_API_URL` is not set, chat falls back to MCP/polling mode

### Phase 3: Remote Connectivity

- Token-based authentication module (`src/auth.js`) — Bearer token or query-param token for HTTP and WebSocket
- Configurable CORS origin (replaces hardcoded `*`)
- Spark Relay Server (`src/relay/sparkRelay.js`) — lightweight WebSocket bridge for VPS deployment, routes `/spark` and `/agent` paths
- Relay Client (`src/relayClient.js`) — Spark connects outbound to a remote relay, no port forwarding needed, with exponential backoff reconnection
- Centralized configuration file (`spark_config.json`) for port, auth, Hermes, relay, lite mode, and CORS settings
- Documentation for three remote scenarios: VPS (ngrok or relay), Docker, LAN

### Phase 4: Platform Adapter (Skeleton)

- `hermes_spark_adapter.py` — Python skeleton implementing a Hermes platform adapter that polls Spark's `/api/prompts` endpoint and sends replies via `/api/chat/reply`
- Documentation for installing the adapter into Hermes plugins directory
- This phase produces a skeleton only; full integration depends on Hermes gateway adapter API stability

### Out of Scope

- File/attachment sharing in chat messages
- End-to-end encryption for relay traffic (TLS termination left to reverse proxy)
- Automated test suite (project has no test framework; verification is manual)
- Transpilation/bundler tooling (project convention: no build step)
- New character skins or audio features

---

## 3. Capabilities

The following capabilities are added by this change. Each capability is a unit of functionality that MAY be independently spec'd with Given/When/Then scenarios.

### 3.1 chat-session-management

The system MUST provide the ability to create, list, switch between, and delete chat sessions. Each session MUST have a unique ID, an associated agent name, a title, a creation timestamp, and a last-message timestamp. Sessions MUST persist across application restarts via SQLite. The system MUST return sessions ordered by last-message timestamp descending. Deleting a session MUST cascade-delete all its messages.

**New endpoints:**
- `POST /api/chat/session` — create session
- `GET /api/chat/sessions` — list sessions (limit 50)
- `POST /api/chat/delete-session` — delete session

**New MCP tool:** `spark_chat_create_session`

### 3.2 chat-messaging

The system MUST provide the ability to send and receive messages within a chat session. Messages MUST have a role (`user`, `agent`, or `system`), content, timestamp, and optional metadata. The system MUST support streaming responses: an agent MAY send partial chunks identified by a `stream_id`, and the system MUST broadcast each chunk via WebSocket so the UI renders text progressively. When a stream completes (`done: true`), the system MUST persist the full message to SQLite. The system MUST broadcast a typing indicator that agents can toggle on/off.

**New endpoints:**
- `POST /api/chat/send` — user sends a message
- `POST /api/chat/reply` — agent sends a reply
- `POST /api/chat/stream` — streaming chunk (partial or final)
- `POST /api/chat/typing` — typing indicator toggle
- `GET /api/chat/messages?session=X&limit=N&offset=O` — paginated message history

**New MCP tools:** `spark_chat_reply`, `spark_chat_stream_chunk`, `spark_chat_set_typing`, `spark_chat_get_messages`

**Renderer:** Chat panel (`src/renderer/chat/`) with message bubbles, markdown rendering, sessions list, typing indicator, and input area. WebSocket events `chat_message`, `chat_stream`, `chat_typing` MUST be handled by the renderer.

### 3.3 hermes-integration

The system MAY connect to a Hermes API Server to forward user chat messages and stream responses back. The `HermesAdapter` module MUST use the OpenAI-compatible `/v1/chat/completions` endpoint with `stream: true` and parse SSE chunks. The system MUST broadcast a `chat_typing` event when the agent starts processing and stop it when the stream completes or errors. If `HERMES_API_URL` is not set, the adapter MUST remain disabled and chat MUST fall back to MCP/polling mode.

The system MUST provide a webhook receiver at `POST /api/hermes-webhook` accepting events: `message_response`, `task_completed`, `task_started`. The receiver MUST broadcast appropriate chat messages or notifications to connected clients.

**New module:** `src/hermesAdapter.js`
**New endpoint:** `POST /api/hermes-webhook`

### 3.4 remote-connectivity

The system MAY enable token-based authentication for all HTTP and WebSocket connections. When `SPARK_AUTH_TOKEN` is set, every request MUST include a valid Bearer token or `?token=` query parameter; unauthorized requests MUST receive HTTP 401. When the token is not set, auth MUST be disabled (local mode, allow all).

The system MUST provide a relay server (`src/relay/sparkRelay.js`) that CAN be deployed on a VPS. The relay MUST accept WebSocket connections on `/spark` (Spark Desktop) and `/agent` (remote agents), validate tokens, and bridge messages bidirectionally. The relay MUST expose a `/health` HTTP endpoint.

The system MUST provide a relay client (`src/relayClient.js`) that connects Spark Desktop outbound to a remote relay. The client MUST implement exponential backoff reconnection (5 s → 30 s max). When connected, the client MUST forward all `sparkServer.broadcast()` messages to the relay and inject inbound relay messages into the local broadcast pipeline.

The system MUST support a centralized `spark_config.json` file for configuration. Environment variables MUST take precedence over config file values.

**New modules:** `src/auth.js`, `src/relay/sparkRelay.js`, `src/relayClient.js`
**New file:** `spark_config.example.json`

### 3.5 lite-mode

The system MUST auto-detect machines with ≤ 8 GB RAM and activate lite mode. Lite mode MAY also be force-enabled via `SPARK_LITE=1` environment variable or `?lite=1` URL parameter.

In lite mode, the system MUST:
- Disable all `backdrop-filter` blur effects (solid backgrounds instead)
- Disable non-essential CSS animations (bubble pop, pulse dots, shadow)
- Increase Agent Radar scan interval from 12 s to 30 s
- Disable Wander engine (always off in lite mode)
- Use local font files instead of Google Fonts CDN (`@font-face` with `.woff2`)

The system SHOULD download and bundle Outfit (400, 600, 700) and JetBrains Mono (400) as `.woff2` files in `src/renderer/fonts/`. If download fails, the system MUST fall back to system font stack (`-apple-system, 'Segoe UI', sans-serif` / `'Consolas', monospace`).

**New file:** `src/renderer/lite.js`
**Modified:** `src/renderer/styles.css` (lite-mode rules, local `@font-face`), `src/radar.js` (configurable interval), `src/main.js` (Electron flags for lite)

### 3.6 mcp-chat-tools

The MCP server (`scripts/spark_mcp_server.py`) MUST expose 5 new tools in addition to the existing 6, bringing the total to 11 tools:

| Tool | Purpose |
|------|---------|
| `spark_chat_create_session` | Create a new chat session |
| `spark_chat_reply` | Send a reply message to a session |
| `spark_chat_stream_chunk` | Send a streaming chunk (token-by-token) |
| `spark_chat_set_typing` | Toggle typing indicator |
| `spark_chat_get_messages` | Retrieve message history for a session |

All new tools MUST call the corresponding HTTP endpoint on `localhost:7890` and return JSON results. The existing 6 tools (notify, state, message, prompt, prompts-list, skin) MUST NOT be modified.

The Python CLI helper (`scripts/spark_notify.py`) MUST add `--chat-create`, `--chat-reply`, `--chat-history`, and `--session` arguments for terminal-based chat operations.

---

## 4. Approach

### Architecture Principles

1. **Additive only** — No existing endpoint, tool, or UI element is removed or breaking-changed. New chat endpoints are added alongside existing notification endpoints.
2. **No build step** — All new code runs directly in Electron (renderer JS) or Node.js (main process modules). No transpilation, no bundler.
3. **External runtime** — New dependency `better-sqlite3` MUST be installed in the external runtime directory (`C:/Users/FERNA/.spark_desktop_runtime/node_modules`), not in the project's gitignored `node_modules/`.
4. **Environment-driven** — All new features (Hermes adapter, relay, auth, lite mode) are opt-in via environment variables or `spark_config.json`. Default behavior is local unauthenticated mode — identical to current behavior plus chat UI.
5. **SQLite for persistence** — `better-sqlite3` with WAL mode, 2 MB cache, and pagination. Database file at `app.getPath('userData')/spark-messages.db`. Fallback to in-memory stub if `better-sqlite3` fails to load.

### Data Flow

```
User types in chat panel
  → chat.js POST /api/chat/send
  → server.js saves to messageStore
  → server.js broadcasts {type: 'chat_message'} via WebSocket
  → if HermesAdapter enabled: forwards to Hermes API /v1/chat/completions (SSE stream)
  → Hermes streams chunks back
  → HermesAdapter broadcasts {type: 'chat_stream'} chunks
  → chat.js renders progressive text
  → on done: messageStore.addMessage('agent', fullContent)
```

```
Remote agent (VPS)
  → connects to relay server ws://vps:7891/agent?token=X
  → relay bridges to Spark Desktop (connected at /spark)
  → relayClient injects message into local sparkServer.broadcast()
  → chat panel renders message
```

### Module Boundaries

| Module | Location | Responsibility |
|--------|----------|----------------|
| MessageStore | `src/store/messageStore.js` | SQLite CRUD for sessions and messages |
| ChatPanel | `src/renderer/chat/chat.js` | UI controller: sessions, messages, input, streaming |
| HermesAdapter | `src/hermesAdapter.js` | Bridge to Hermes API Server with SSE streaming |
| SparkAuth | `src/auth.js` | Token validation for HTTP and WebSocket |
| RelayServer | `src/relay/sparkRelay.js` | VPS-deployed WebSocket bridge |
| RelayClient | `src/relayClient.js` | Outbound relay connection from Spark |
| LiteMode | `src/renderer/lite.js` | RAM detection and optimization flags |
| SparkConfig | `spark_config.json` | Centralized configuration (loaded in main.js) |

### Version Bump

`package.json` version MUST bump from `1.0.0` to `2.0.0` to reflect the messaging center transformation. Description and keywords MUST be updated.

---

## 5. Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | `better-sqlite3` native compilation fails on Windows | Medium | npm ships pre-built binaries for Windows x64. If compilation fails, the system MUST gracefully degrade to an in-memory stub (chat works but history is lost on restart). A future fallback to `lowdb` (JSON sync, ~500 KB) MAY be implemented. |
| R2 | Electron RAM usage increases with chat panel open | Medium | Lite mode disables blur/animations. Messages are paginated (default 50 per load). SQLite cache capped at 2 MB. GIFs remain the primary visual, chat panel is collapsible. |
| R3 | Relay server introduces network latency | Low | Relay is entirely optional. Local mode has zero overhead. Relay reconnection uses exponential backoff to avoid hammering. |
| R4 | Hermes API Server not running or not configured | Low | `HermesAdapter` only activates when `HERMES_API_URL` is set. Without it, chat works via MCP tools or HTTP polling. Error messages are shown in-chat as system messages. |
| R5 | SSE stream parsing errors in Node.js | Low | Inline SSE parser with try/catch per chunk. Partial JSON lines are buffered. Parse errors are logged and skipped, not fatal. |
| R6 | Auth token stored in plaintext in `spark_config.json` | Medium | `spark_config.json` MUST be added to `.gitignore`. Documentation MUST recommend environment variables or `.env` files for production. Token is only needed for remote mode. |
| R7 | Existing agents break due to new auth requirement | Medium | Auth is opt-in. Default behavior (no `SPARK_AUTH_TOKEN`) allows all connections — identical to current behavior. Only enabled when user explicitly configures remote access. |
| R8 | Google Fonts CDN unavailable (offline scenario) | Low | Lite mode bundles `.woff2` files locally. Fallback to system font stack if files missing. Non-lite mode retains CDN import with local fallback. |
| R9 | `spark_mcp_server.py` grows from 6 to 11 tools — MCP client compatibility | Low | MCP JSON-RPC protocol supports arbitrary tool counts. Tools are additive. Existing tool names and schemas are unchanged. |
| R10 | Hermes platform adapter API may change | Medium | Phase 4 produces a skeleton only. The adapter uses Hermes' documented HTTP API (`/api/prompts`, `/api/chat/reply`) rather than internal Python APIs, reducing coupling. |

---

## 6. Rollback Plan

This change is implemented in four sequential phases. Each phase is independently revertible via git revert of the corresponding commits.

### Phase-level rollback

| Phase | Revert action | Impact |
|-------|---------------|--------|
| Phase 4 (Adapter) | `git revert` adapter skeleton commits | No runtime impact — adapter is a standalone Python file not loaded by Spark |
| Phase 3 (Remote) | `git revert` auth + relay commits | Spark returns to unauthenticated local-only mode. No data loss. |
| Phase 2 (Hermes) | `git revert` hermesAdapter + webhook commits | Chat still works via MCP/HTTP. No data loss. |
| Phase 1 (Chat UI) | `git revert` all Phase 1 commits | Spark returns to v1.0.0 notifier behavior. SQLite database file remains in userData but is unused. |

### Full rollback

To revert the entire change:

1. `git revert` all commits tagged with the `spark-messaging-center` scope (or reset to the pre-change commit hash).
2. Delete the SQLite database file at `app.getPath('userData')/spark-messages.db` (optional cleanup).
3. Remove `better-sqlite3` from the external runtime: `cd C:/Users/FERNA/.spark_desktop_runtime && npm uninstall better-sqlite3`.
4. Restore `package.json` version to `1.0.0`.

### Data preservation

- SQLite database (`spark-messages.db`) is stored in Electron's `userData` directory, NOT in the project repo. Reverting code does NOT delete the database. If the user re-applies the change later, chat history is preserved.
- `spark_config.json` (if created by the user) is in the project root and is gitignored. It will not be affected by git revert.

### Rollback verification

After rollback, the system MUST:
- Start without errors on `npm start`
- Serve all original 10 HTTP endpoints on port 7890
- Display Clippy-style notifications and speech bubbles
- Expose 6 MCP tools (not 11)
- Show no chat panel UI