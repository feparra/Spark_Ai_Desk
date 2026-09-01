# Tasks: spark-messaging-center

> Implementation task breakdown for the spark-messaging-center change.
> 4 phases, 30 tasks. Each task is bite-sized (2-5 min for a coding agent).
> Checkboxes use `- [ ]` / `[x]` format for sdd-apply tracking.
>
> **Fix notes** (from exploration.md — 8 issues to address during implementation):
> - **F1**: Stale `G:/My Drive/` paths → use `C:/Users/FERNA/Documents/Spark_Desktop/`
> - **F2**: `better-sqlite3` must be installed in `C:/Users/FERNA/.spark_desktop_runtime/`, NOT repo root
> - **F3**: Window size — chat panel (420px) + avatar (140px) + status pill (30px) = 590px > 460px; make window taller or use overlay
> - **F4**: SSE parsing — use `'data'`/`'end'` event listeners, NOT async iterators (`for await`)
> - **F5**: Relay echo loop — tag relay-originated messages with `_fromRelay` flag; don't re-forward
> - **F6**: Remove dead `express` + `cors` deps from `package.json`
> - **F7**: HermesAdapter `makeRequest()` — use `'data'`/`'end'` events, not `for await` on response body
> - **F8**: MCP server docstring path — update stale `g:/My Drive/` reference

---

## Phase 1: Chat UI + Persistence + Lite Mode (Foundation)

### 1.1 Install better-sqlite3 dependency

- [ ] **Install better-sqlite3 in external runtime directory**
  - **Files:** none (runtime install)
  - **What:** Run `cd C:/Users/FERNA/.spark_desktop_runtime && npm install better-sqlite3`. Verify `require('better-sqlite3')` works with `NODE_PATH` set. Do NOT install in repo root.
  - **Note:** Fix F2 — install location is the external runtime dir, not the project `node_modules/`.
  - **Depends on:** nothing

### 1.2 Create MessageStore module

- [ ] **Create `src/store/messageStore.js` — SQLite persistence layer**
  - **Files (create):** `src/store/messageStore.js`
  - **What:** Implement `initDb()`, `closeDb()`, `createSession()`, `getSession()`, `getSessions()`, `deleteSession()`, `addMessage()`, `getMessages()`, `getMessageCount()`, `updateMessage()` per design §2.1. Use WAL mode, `synchronous=NORMAL`, 2MB cache. ID format: `sess_{timestamp}_{random6}`, `msg_{timestamp}_{random6}`. Push `C:/Users/FERNA/.spark_desktop_runtime/node_modules` into `module.paths` at top. Graceful fallback to in-memory stubs if `require('better-sqlite3')` fails.
  - **Depends on:** 1.1

### 1.3 Add chat HTTP endpoints to server

- [ ] **Add 8 chat API endpoints to `src/server.js`**
  - **Files (modify):** `src/server.js`
  - **What:** Add `POST /api/chat/session`, `GET /api/chat/sessions`, `POST /api/chat/delete-session`, `POST /api/chat/send`, `POST /api/chat/reply`, `POST /api/chat/stream`, `POST /api/chat/typing`, `GET /api/chat/messages`. Wrap `require('./store/messageStore')` in try/catch. Each endpoint calls messageStore + broadcasts via `this.broadcast()`. Add `this.onChatMessage` hook in `/api/chat/send` handler (called after broadcast, if set). All endpoints are additive — existing 10 endpoints unchanged.
  - **Depends on:** 1.2

### 1.4 Create chat panel HTML

- [ ] **Create `src/renderer/chat/chat.html` — chat panel DOM structure**
  - **Files (create):** `src/renderer/chat/chat.html`
  - **What:** Static HTML for `#chatPanel` (starts hidden), `.chat-header` (agent badge, title, action buttons), `#chatSessionsList`, `#chatMessages` (scrollable), `#chatTypingIndicator`, `.chat-input-area` (agent selector `<select>`, text `<input>`, send button). This HTML is injected into `index.html`.
  - **Depends on:** nothing

### 1.5 Create chat panel CSS

- [ ] **Create `src/renderer/chat/chat.css` — glassmorphism chat styling**
  - **Files (create):** `src/renderer/chat/chat.css`
  - **What:** Glassmorphism matching existing Spark visual language: `backdrop-filter: blur(20px) saturate(180%)`, `.lite-mode` solid background override. Message bubbles: `.user` (blue gradient, right), `.agent` (translucent, left), `.system` (centered pill). Typing dots animation, fade-in message animation, scrollbar styling. Max-width 360px, max-height 420px.
  - **Note:** Fix F3 — coordinate with window resize task (1.10) to ensure panel fits.
  - **Depends on:** 1.4

### 1.6 Create chat panel controller

- [ ] **Create `src/renderer/chat/chat.js` — ChatPanel controller**
  - **Files (create):** `src/renderer/chat/chat.js`
  - **What:** Implement `window.ChatPanel` object with methods: `init()`, `toggle()`, `newSession()`, `loadSessions()`, `switchSession()`, `deleteSession()`, `sendMessage()`, `handleIncomingMessage()`, `handleStreamChunk()`, `handleTyping()`, `displayMessage()`, `formatContent()`. State: `currentSession`, `sessions`, `messages`, `isTyping`, `streamingMessage`, `isOpen`. Uses `fetch()` to `http://localhost:7890` for API calls and `window.sparkBridge.onServerEvent()` for real-time WS events. `sendMessage()` also fires `POST /api/prompt` for backward compat with MCP-polling agents. Streaming render: first chunk creates empty agent element, subsequent chunks append + re-render.
  - **Depends on:** 1.3, 1.4, 1.5

### 1.7 Inject chat panel into index.html

- [ ] **Modify `src/renderer/index.html` — inject chat panel, CSS, and JS**
  - **Files (modify):** `src/renderer/index.html`
  - **What:** Add `<link rel="stylesheet" href="chat/chat.css">` in `<head>`. Inject chat panel HTML (from chat.html) before the avatar section. Add `<script src="lite.js"></script>` and `<script src="chat/chat.js"></script>` before closing `</body>`.
  - **Depends on:** 1.4, 1.5, 1.6

### 1.8 Reactivate avatar click + init chat in app.js

- [ ] **Modify `src/renderer/app.js` — wire chat panel and lite mode**
  - **Files (modify):** `src/renderer/app.js`
  - **What:** Uncomment and change avatar click handler from `openQuickInput()` to `ChatPanel.toggle()`. Call `LiteMode.detect()` on init. Call `ChatPanel.init()` on startup. Leave Quick-Input Hub code in place (disabled, for reference).
  - **Depends on:** 1.6, 1.7, 1.11

### 1.9 Create LiteMode detector

- [ ] **Create `src/renderer/lite.js` — lite mode auto-detection**
  - **Files (create):** `src/renderer/lite.js`
  - **What:** Implement `LiteMode.detect()` — checks `navigator.deviceMemory` (GB) and `?lite=1` URL param. If either indicates low-RAM, add `lite-mode` class to `document.body`. Implement `LiteMode.getSettings()` returning `{ radarInterval, wanderEnabled, backdropBlur, gifAnimation, fontLoading }`.
  - **Depends on:** nothing

### 1.10 Add lite-mode CSS rules and local fonts

- [ ] **Modify `src/renderer/styles.css` — lite-mode rules + local fonts**
  - **Files (modify):** `src/renderer/styles.css`
  - **Files (create):** `src/renderer/fonts/outfit-400.woff2`, `src/renderer/fonts/outfit-600.woff2`, `src/renderer/fonts/outfit-700.woff2`, `src/renderer/fonts/jetbrains-mono-400.woff2`
  - **What:** Add `body.lite-mode` rules: `backdrop-filter: none`, solid `rgba(15,23,42,0.98)` background, `animation: none` for `pulseDot`/`shadowFloat`/`bubblePop`. Replace Google Fonts `@import` with local `@font-face` declarations using `.woff2` files. Add CSS variables `--font-main` / `--font-mono` with system font fallback (`-apple-system, 'Segoe UI', sans-serif` / `'Consolas', monospace`). Download woff2 files; if download fails, fallback works via font stack.
  - **Depends on:** 1.9

### 1.11 Wire lite mode + messageStore init in main.js

- [ ] **Modify `src/main.js` — lite mode detection + messageStore init**
  - **Files (modify):** `src/main.js`
  - **What:** In `app.whenReady()`: (1) `require('./store/messageStore').initDb()`. (2) Lite-mode detection: `os.totalmem() <= 8GB` or `SPARK_LITE=1` → append `--disable-cache`, `--disable-gpu-shader-disk-cache` Electron flags + pass `?lite=1` in renderer URL. (3) Pass `{scanIntervalMs: isLite ? 30000 : 12000}` to `AgentRadar` constructor. (4) Disable wander engine in lite mode. (5) In cleanup: `require('./store/messageStore').closeDb()`.
  - **Note:** Fix F3 — increase window height when chat panel is open (e.g., 380×560 or make `resizable: true`).
  - **Depends on:** 1.2, 1.9

### 1.12 Update package.json

- [ ] **Modify `package.json` — version bump + metadata**
  - **Files (modify):** `package.json`
  - **What:** Bump version `1.0.0` → `2.0.0`. Update description to "bidirectional messaging center". Add keywords: `chat`, `messaging`, `ai-agent`. Add `better-sqlite3` to dependencies (reference, actual install in external runtime). Add `"lite": "SPARK_LITE=1 electron src/main.js"` and `"chat": "electron src/main.js"` scripts.
  - **Note:** Fix F6 — remove dead `express` and `cors` from dependencies (not imported in server.js).
  - **Depends on:** nothing

### 1.13 Add 5 chat MCP tools

- [ ] **Modify `scripts/spark_mcp_server.py` — add 5 chat tools**
  - **Files (modify):** `scripts/spark_mcp_server.py`
  - **What:** Add `spark_chat_create_session`, `spark_chat_reply`, `spark_chat_stream_chunk`, `spark_chat_set_typing`, `spark_chat_get_messages` to `TOOLS_LIST` and implement handlers. Each calls the corresponding HTTP endpoint on `localhost:7890` via existing `send_spark_request()` helper. Total tools: 11. Existing 6 tools unchanged.
  - **Note:** Fix F8 — update stale `g:/My Drive/` docstring path to `C:/Users/FERNA/Documents/Spark_Desktop/`.
  - **Depends on:** 1.3

### 1.14 Add chat CLI commands to spark_notify.py

- [ ] **Modify `scripts/spark_notify.py` — add chat CLI arguments**
  - **Files (modify):** `scripts/spark_notify.py`
  - **What:** Add `--chat-create` (create session), `--chat-reply` (send reply with `--session` and `--content`), `--chat-history` (get messages for `--session`), and `--session` (session ID argument). Use existing `urllib` HTTP helper. No new Python deps.
  - **Depends on:** 1.3

### 1.15 Make radar scan interval configurable

- [ ] **Verify `src/radar.js` accepts configurable scan interval**
  - **Files (modify):** `src/radar.js` (verify/minor edit)
  - **What:** Confirm constructor accepts `options.scanIntervalMs`. If not already present, add it. `main.js` now passes `{scanIntervalMs: isLite ? 30000 : 12000}`. Default to 12000 if not specified.
  - **Depends on:** 1.11

---

## Phase 2: Hermes Integration

### 2.1 Create HermesAdapter module

- [ ] **Create `src/hermesAdapter.js` — Hermes API bridge with SSE streaming**
  - **Files (create):** `src/hermesAdapter.js`
  - **What:** Implement `HermesAdapter` class. Constructor takes `(sparkServer, {apiUrl, apiKey, model})`. `this.enabled = false` unless `HERMES_API_URL` is set. `sendChatMessage(sessionId, userMessage, agent)` broadcasts `chat_typing:true`, POSTs to `{apiUrl}/v1/chat/completions` with `stream:true`, parses SSE chunks inline, broadcasts `chat_stream` per delta, on `[DONE]` persists via `messageStore.addMessage()` + broadcasts `chat_stream done:true`, broadcasts `chat_typing:false`. On error: broadcasts `chat_message` with role `system`.
  - **Note:** Fix F4 + F7 — use `'data'`/`'end'` event listeners on the HTTP response, NOT `for await` async iterators. Buffer partial SSE lines across TCP chunk boundaries. Try/catch per `JSON.parse`.
  - **Depends on:** 1.3

### 2.2 Wire HermesAdapter in main.js

- [ ] **Modify `src/main.js` — initialize HermesAdapter + wire onChatMessage**
  - **Files (modify):** `src/main.js`
  - **What:** In `app.whenReady()`: create `HermesAdapter` instance. If `process.env.HERMES_API_URL` is set, call `hermesAdapter.enable()`. Set `sparkServer.onChatMessage = (sessionId, content, agent) => { if (hermesAdapter.enabled) hermesAdapter.sendChatMessage(sessionId, content, agent); }`.
  - **Depends on:** 2.1

### 2.3 Add Hermes webhook endpoint

- [ ] **Add `POST /api/hermes-webhook` to `src/server.js`**
  - **Files (modify):** `src/server.js`
  - **What:** Add webhook receiver endpoint. Handle `message_response` (messageStore.addMessage + broadcast `chat_message`), `task_completed` (broadcast notification for Clippy bubble), `task_started` (updateState to `working`). Return `{ok, received: event}`.
  - **Depends on:** 1.3

### 2.4 Create Hermes integration documentation

- [ ] **Create `docs/hermes-setup.md` — Hermes integration guide**
  - **Files (create):** `docs/hermes-setup.md`
  - **What:** Document how to configure `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_MODEL` env vars. Explain SSE streaming flow. Document webhook endpoint usage (`POST /api/hermes-webhook` with event types). Include example `spark_config.json` Hermes section.
  - **Depends on:** 2.1, 2.3

---

## Phase 3: Remote Connectivity

### 3.1 Create SparkAuth module

- [ ] **Create `src/auth.js` — token-based authentication**
  - **Files (create):** `src/auth.js`
  - **What:** Implement `SparkAuth` class: `constructor()` reads `SPARK_AUTH_TOKEN` from env. `generateToken()` → 48-char hex via `crypto.randomBytes`. `validateRequest(req)` → checks `Authorization: Bearer` header, then `?token=` or `?auth=` query param. `getToken()`, `isEnabled()`. When token unset: `enabled=false`, `validateRequest()` always returns `true` (local mode).
  - **Depends on:** nothing

### 3.2 Integrate auth into server.js

- [ ] **Modify `src/server.js` — auth validation + configurable CORS**
  - **Files (modify):** `src/server.js`
  - **What:** Import `SparkAuth`. In `handleHttp()`: early return 401 if `auth.isEnabled() && !auth.validateRequest(req)` before any route handler. In `setupWebSockets()`: `ws.close(4001, 'Unauthorized')` on failed validation at connection time. Replace hardcoded `Access-Control-Allow-Origin: *` with `SPARK_CORS_ORIGIN` env var (default `*` for backward compat).
  - **Depends on:** 3.1

### 3.3 Create relay server

- [ ] **Create `src/relay/sparkRelay.js` — VPS relay server**
  - **Files (create):** `src/relay/sparkRelay.js`
  - **What:** Standalone Node.js script. CLI: `node sparkRelay.js --port 7891 --token X`. WebSocket server with `/spark` (sparkClients set) and `/agent` (agentClients set) paths. Token validation on connection. Bidirectional message bridging: spark→agent forwards, agent→spark forwards. `GET /health` returns `{ok, sparkClients, agentClients, uptime}`. Uses `ws` package.
  - **Note:** Fix F5 — relay echo loop prevention: tag messages with `_fromRelay` flag so the RelayClient doesn't re-forward them back.
  - **Depends on:** nothing

### 3.4 Create relay config example

- [ ] **Create `src/relay/relayConfig.example.json` — relay config template**
  - **Files (create):** `src/relay/relayConfig.example.json`
  - **What:** JSON template with `port`, `token`, and optional `tls` fields for relay server deployment.
  - **Depends on:** 3.3

### 3.5 Create RelayClient module

- [ ] **Create `src/relayClient.js` — outbound relay client**
  - **Files (create):** `src/relayClient.js`
  - **What:** Implement `RelayClient` class: `constructor(sparkServer, {relayUrl, token})`, `connect()`, `disconnect()`, `isConnected()`. Connects outbound to `{relayUrl}/spark?token={token}`. Exponential backoff reconnection: 5s→10s→20s→30s max, reset to 5s on success. Inbound messages from relay are JSON-parsed and injected into `sparkServer.broadcast()`. Outbound: `sparkServer.onRelayMessage` callback forwards broadcast messages to relay.
  - **Note:** Fix F5 — don't re-forward messages that arrived from the relay (check `_fromRelay` flag). Prevents infinite echo loop.
  - **Depends on:** 3.3

### 3.6 Wire RelayClient in main.js

- [ ] **Modify `src/main.js` — initialize RelayClient + wrap broadcast**
  - **Files (modify):** `src/main.js`
  - **What:** In `app.whenReady()`: create `RelayClient` instance. If `process.env.SPARK_RELAY_URL` is set, call `relayClient.connect()`. Wrap `sparkServer.broadcast()` to also call `sparkServer.onRelayMessage(msg)` if relay is connected (layered on top of existing wrapper that sends to `mainWindow.webContents`).
  - **Depends on:** 3.5

### 3.7 Create spark_config.example.json

- [ ] **Create `spark_config.example.json` — centralized config template**
  - **Files (create):** `spark_config.example.json`
  - **What:** JSON template with sections: `mode`, `port`, `auth` (enabled, token), `hermes` (apiUrl, apiKey, model), `relay` (enabled, url, token), `lite` (autoDetect, forceLite, ramThresholdGB), `cors` (origin). Matches design §10.2 structure.
  - **Depends on:** nothing

### 3.8 Load spark_config.json in main.js

- [ ] **Modify `src/main.js` — load config file → env vars**
  - **Files (modify):** `src/main.js`
  - **What:** At top of `app.whenReady()`, load `spark_config.json` (if exists) and set env vars from it. Env vars take precedence — only set if not already set. This runs before server start and before HermesAdapter/RelayClient init.
  - **Depends on:** 3.7

### 3.9 Update .gitignore

- [ ] **Modify `.gitignore` — add spark_config.json**
  - **Files (modify):** `.gitignore`
  - **What:** Add `spark_config.json` to .gitignore (contains auth token, must not be committed). `spark_config.example.json` remains tracked.
  - **Depends on:** nothing

### 3.10 Create remote setup documentation

- [ ] **Create `docs/remote-setup.md` — remote connection guide**
  - **Files (create):** `docs/remote-setup.md`
  - **What:** Document three remote scenarios: (1) VPS with relay server (deploy sparkRelay.js, configure SPARK_RELAY_URL), (2) Docker (compose example with relay), (3) LAN direct HTTP. Include auth setup (SPARK_AUTH_TOKEN), CORS config, and TLS via reverse proxy (nginx/Caddy) notes.
  - **Depends on:** 3.3, 3.5, 3.7

---

## Phase 4: Platform Adapter (Skeleton)

### 4.1 Create Hermes platform adapter skeleton

- [ ] **Create `scripts/hermes_spark_adapter.py` — Hermes platform adapter skeleton**
  - **Files (create):** `scripts/hermes_spark_adapter.py`
  - **What:** Python skeleton implementing a Hermes platform adapter that polls Spark's `GET /api/prompts` endpoint and sends replies via `POST /api/chat/reply`. Uses only stdlib (`urllib`, `json`, `argparse`, `time`). Includes `--spark-url`, `--agent-name`, `--poll-interval` CLI args. Skeleton only — full integration depends on Hermes gateway adapter API stability.
  - **Depends on:** 1.3

### 4.2 Create adapter setup documentation

- [ ] **Create `docs/adapter-setup.md` — platform adapter installation guide**
  - **Files (create):** `docs/adapter-setup.md`
  - **What:** Document how to install `hermes_spark_adapter.py` into Hermes plugins directory. Explain the polling loop, configuration options, and that this is a skeleton for future full integration.
  - **Depends on:** 4.1

---

## Verification

### V.1 End-to-end manual verification

- [ ] **Verify all phases work end-to-end**
  - **Files:** none (manual testing)
  - **What:** (1) `npm start` launches without errors. (2) Avatar click opens chat panel. (3) Create session → send message → see it in panel. (4) `curl POST /api/chat/reply` → message appears in panel. (5) `curl POST /api/chat/stream` with chunks → progressive render. (6) Restart app → session history persists. (7) Set `SPARK_LITE=1` → lite mode activates (no blur, solid bg). (8) Set `HERMES_API_URL` → streaming response from Hermes. (9) Set `SPARK_AUTH_TOKEN` → unauthenticated requests get 401. (10) MCP server: `python scripts/spark_mcp_server.py` lists 11 tools. (11) `python scripts/spark_notify.py --chat-create` works. (12) Relay: `node src/relay/sparkRelay.js --port 7891 --token test` starts, `/health` returns 200. (13) All existing 10 endpoints still work unchanged.
  - **Depends on:** all tasks complete