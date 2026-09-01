# Exploration: spark-messaging-center

## 1. Current State Assessment

### Architecture Summary
Spark Desktop is an Electron 34 always-on-top transparent floating window (380×460px) that serves as a notification hub for AI agents. It runs a local HTTP + WebSocket server on port 7890 with no build step, no test suite, no transpilation.

**Core files and their roles:**

| File | Lines | Role |
|------|-------|------|
| `src/server.js` | 336 | HTTP + WS server, all API endpoints, prompt queues, broadcast |
| `src/main.js` | 452 | Electron main: window, tray, IPC, GPU flags, wander/radar init |
| `src/preload.js` | 14 | contextBridge: `sparkBridge` with `sendAction`, `sendPrompt`, `onServerEvent` |
| `src/renderer/app.js` | 553 | UI logic: state updates, speech bubbles, quick-input hub (disabled), event handling |
| `src/renderer/index.html` | 72 | DOM: speech bubble, quick-input hub (disabled), avatar section |
| `src/renderer/styles.css` | 493 | Glassmorphism UI, Google Fonts CDN, animations |
| `src/renderer/audio.js` | 145 | Procedural Web Audio API sounds (no audio files) |
| `src/radar.js` | 134 | Agent detection: port scanning (Ollama, LM Studio, OpenClaw, Hermes API), process scanning |
| `src/wander.js` | 178 | Multi-monitor wandering (25ms setInterval, disabled by default) |
| `scripts/spark_mcp_server.py` | 275 | MCP JSON-RPC stdio server: 6 tools (notify, state, skin, status, receive_prompt, dispatch_prompt) |
| `scripts/spark_notify.py` | 201 | Python CLI: state, notify, message, get-prompts, dispatch |
| `package.json` | 21 | deps: cors, express, ws (unused express/cors), electron@34 |

### What Works (Do Not Break)
- **HTTP API on :7890**: `/api/status`, `/api/state`, `/api/notify?wait=true`, `/api/message`, `/api/prompt`, `/api/prompts`, `/api/prompts/ack`, `/api/skin`, `/api/dismiss`, `/api/wander`
- **WebSocket broadcast**: All WS clients receive state changes, notifications, messages, radar updates
- **IPC bridge**: `sparkBridge.onServerEvent()` delivers all server broadcasts to renderer
- **MCP server**: 6 tools working via JSON-RPC stdio for Claude/Cursor/Antigravity
- **Python CLI**: Works for terminal-based notifications and prompt queue ops
- **Agent Radar**: Scans every 12s for local AI agents (port + process scan)
- **7 character skins**: capy, llama, kitty, piper, dr_octopus, astro, spark — each with 5-6 GIFs
- **Procedural audio**: Web Audio API, zero audio files, 6 sound types
- **Tray menu**: Character switching, wander toggle, test notifications, position controls

### Current Communication Model (Unidirectional)
```
Agent → Spark: HTTP POST /api/notify, /api/message, /api/state (one-way notifications)
Agent → Spark: MCP tools (spark_notify, spark_set_state, etc.) via stdio
Spark → Agent: GET /api/prompts (agent polls for queued prompts) — no push
User → Agent: Quick-Input Hub (DISABLED) → POST /api/prompt → agent polls /api/prompts
```

The prompt queue system (`promptQueues` Map) is a fire-and-forget queue. Agents must poll `GET /api/prompts?agent=X` to discover user messages. There is no session concept, no message history, no streaming, no persistence — everything is ephemeral.

### Quick-Input Hub Status
- **DOM exists** in `index.html` (lines 32-53): agent pills (All, Claude, Antigravity, OpenClaw), text input, send button
- **JS logic exists** in `app.js` (lines 322-438): `openQuickInput()`, `submitQuickPrompt()`, agent pill selection, @mention parsing, keyboard shortcuts
- **DISABLED in 3 places**:
  1. `main.js` line 385-418: `ipcMain.on('user-prompt')` handler commented out
  2. `main.js` line 420-437: `Alt+Space` global shortcut commented out
  3. `app.js` line 469-480: `avatarSection.addEventListener('click')` commented out
- The `preload.js` still exposes `sparkBridge.sendPrompt()` — bridge is intact

### External Dependencies Status
- **node_modules**: NOT in repo — lives at `C:/Users/FERNA/.spark_desktop_runtime/node_modules`, pushed via `module.paths` at runtime
- **Google Fonts**: `@import url('https://fonts.googleapis.com/...')` in styles.css line 1 — fails offline
- **express + cors**: Listed in package.json but **NOT imported/used** in server.js (uses raw `http` module)
- **ws**: Used for WebSocket support, gracefully falls back if missing

### Assets Footprint
- Total assets: 6.6MB across 7 characters
- Classic spark GIFs: 3.3MB (5 GIFs in `assets/gifs/`)
- Per-character dirs: 344KB-680KB each (5 GIFs each)
- Icons: 32px PNG + ICO per character
- **Only 1 GIF loaded in memory at a time** (swapped via `sparkImg.src`), so asset RAM impact is minimal

---

## 2. Gaps Identified

### Gap 1: No Chat UI / No Bidirectional Messaging
**Current**: Speech bubbles are ephemeral notifications with auto-dismiss. Quick-Input Hub is disabled. No chat history, no message threads, no scrollable conversation view.
**Needed**: A chat panel (like Telegram) with scrollable message history, input box, agent selector, session list, and real-time message display.

### Gap 2: No Message Persistence
**Current**: All state is in-memory (`promptQueues` Map, `currentState` object). Messages are lost on restart.
**Needed**: SQLite (or JSON file fallback) for session and message persistence. Must survive Electron restarts.

### Gap 3: No Streaming Response Support
**Current**: Agent responses arrive as single HTTP POST to `/api/notify` or `/api/message`. No token-by-token streaming.
**Needed**: Server endpoints for streaming chunks (`/api/chat/stream`), WS broadcast of stream chunks, UI rendering of incremental text.

### Gap 4: No Session Management
**Current**: No concept of conversation sessions. Prompt queue is per-agent, not per-conversation.
**Needed**: Session creation, listing, switching, deletion. Each session tied to an agent. Messages belong to sessions.

### Gap 5: No Hermes Integration / Agent Backend
**Current**: Agents communicate via HTTP polling (GET /api/prompts) or MCP stdio. No direct connection to Hermes API Server or any LLM backend.
**Needed**: Adapter to forward user messages to Hermes API Server (OpenAI-compatible `/v1/chat/completions` with SSE streaming), receive responses, and stream them back to Spark UI.

### Gap 6: No Authentication
**Current**: `Access-Control-Allow-Origin: '*'` — any device on LAN can send notifications, read prompts, or control Spark.
**Needed**: Token-based auth for remote connections. Local mode can remain open. WS connections need auth on upgrade.

### Gap 7: No Remote Connectivity
**Current**: Server binds to `localhost:7890` (or all interfaces by default). No relay, no tunnel, no remote agent support.
**Needed**: Relay server for VPS deployment, relay client mode in Spark Desktop (outbound WS), ngrok/cloudflare tunnel documentation.

### Gap 8: No RAM Optimization / Lite Mode
**Current**: 
- Google Fonts loaded from CDN (network dependency, render-blocking)
- `backdrop-filter: blur(20px) saturate(180%)` on speech bubble, quick-input hub, status pill — GPU-intensive
- Agent Radar runs every 12s (port scans + `tasklist` exec)
- Wander engine uses 25ms setInterval (disabled, but code present)
- 3 CSS animations running (pulseDot, shadowFloat, bubblePop)
**Needed**: Auto-detect ≤8GB RAM → disable blur, disable non-essential animations, slow radar to 30s, local fonts, optional static PNG instead of GIF.

### Gap 9: No Configuration System
**Current**: Hardcoded values in code. Port from `process.env.SPARK_PORT || 7890`. No config file.
**Needed**: `spark_config.json` for port, auth token, Hermes API URL, relay URL, lite mode settings, CORS origin.

### Gap 10: MCP Server Lacks Chat Tools
**Current**: 6 MCP tools — none support chat sessions, replies, or streaming.
**Needed**: New MCP tools: `spark_chat_reply`, `spark_chat_stream_chunk`, `spark_chat_set_typing`, `spark_chat_create_session`, `spark_chat_get_messages`.

### Gap 11: Stale Paths
**Current**: MCP server docstring references `g:/My Drive/...`. Launcher scripts reference old Google Drive paths. AGENTS.md has been updated but scripts haven't.
**Needed**: Update all paths to `C:/Users/FERNA/Documents/Spark_Desktop/`.

---

## 3. Recommended Approaches

### For Gaps 1-4 (Chat UI + Persistence + Streaming + Sessions)

**Approach**: Incremental extension of existing architecture — no rewrite.

1. **Message Store** (`src/store/messageStore.js`): Use `better-sqlite3` (synchronous, fast, WAL mode). Schema: `sessions` table + `messages` table with session_id FK. 2MB cache limit via pragma. Fallback to JSON file if better-sqlite3 fails to install.

2. **Server Endpoints** (extend `src/server.js`): Add GET `/api/chat/sessions`, GET `/api/chat/messages`, POST `/api/chat/session`, POST `/api/chat/send`, POST `/api/chat/reply`, POST `/api/chat/stream`, POST `/api/chat/typing`, POST `/api/chat/delete-session`. All use the existing `this.broadcast()` pattern to push to WS clients and renderer.

3. **Chat UI** (`src/renderer/chat/`): New `chat.html`, `chat.css`, `chat.js`. Inject into `index.html`. Chat panel toggles via avatar click (re-enables the disabled click handler). Uses `window.sparkBridge.onServerEvent()` for real-time updates — **no new IPC channels needed** since preload already forwards all server events.

4. **Streaming**: Agent sends chunked POST to `/api/chat/stream` with `stream_id`, `chunk`, `done` fields. Server broadcasts `chat_stream` WS events. Chat UI accumulates chunks into a single message element. On `done=true`, server saves full message to SQLite.

**Key constraint**: Chat.js uses `fetch()` directly to `http://localhost:7890` — this works because renderer can make HTTP requests to localhost. No IPC needed for chat API calls.

### For Gap 5 (Hermes Integration)

**Approach**: Optional adapter module, env-var activated.

1. **`src/hermesAdapter.js`**: Node.js module that forwards chat messages to Hermes API Server (`/v1/chat/completions` with `stream: true`). Parses SSE response, broadcasts `chat_stream` events back to Spark. Uses Node `http`/`https` — no new deps.

2. **Hook in server.js**: Add `this.onChatMessage` callback in `/api/chat/send` handler. `main.js` wires this to `hermesAdapter.sendChatMessage()`.

3. **Webhook receiver**: Add `/api/hermes-webhook` endpoint for async Hermes events (task_started, task_completed, message_response).

4. **Graceful degradation**: If `HERMES_API_URL` not set, chat works with MCP/polling agents only. No crash, no error — just no auto-response.

5. **MCP path remains primary**: For agents that already use the MCP server (Claude, Cursor), the new chat MCP tools let them respond in chat sessions directly. The Hermes API adapter is for direct LLM chat without a running agent process.

### For Gaps 6-7 (Auth + Remote)

**Approach**: Token-based auth, optional relay server.

1. **`src/auth.js`**: Simple Bearer token validation. `SPARK_AUTH_TOKEN` env var. If unset → local mode (allow all). If set → validate on every HTTP request and WS upgrade.

2. **`src/relay/sparkRelay.js`**: Standalone Node script for VPS. WebSocket bridge with `/spark` and `/agent` paths. Token auth. Health check endpoint. No deps beyond `ws`.

3. **`src/relayClient.js`**: Spark Desktop connects outbound to relay (no port forwarding needed). Auto-reconnect with exponential backoff (5s→30s). Mirrors all `broadcast()` messages to relay and vice versa.

4. **Config**: `spark_config.json` at repo root (gitignored). Example template committed. Loads into env vars at startup.

### For Gap 8 (RAM Optimization)

**Approach**: Auto-detect + CSS class + env var override.

1. **Detection**: `navigator.deviceMemory` in renderer + `os.totalmem()` in main process. If ≤8GB → add `lite-mode` class to `<body>`.

2. **CSS optimizations** (via `body.lite-mode` selectors):
   - `backdrop-filter: none !important` — biggest single RAM/GPU win
   - `background: rgba(15, 23, 42, 0.98)` — solid instead of translucent
   - Disable `shadowFloat`, `pulseDot`, `bubblePop` animations
   - Keep GIF animation (only 1 loaded at a time, ~300-600KB)

3. **Radar interval**: 12s → 30s in lite mode (halved exec calls)

4. **Electron flags** (lite mode): `--disable-cache`, `--disable-gpu-shader-disk-cache`

5. **Local fonts**: Download Outfit + JetBrains Mono .woff2 files. Replace `@import` with `@font-face`. Fallback to system fonts (`Segoe UI`, `Consolas`) if download fails.

6. **Window size**: Consider 380×460 → 360×420 in lite mode (less pixel area to composite)

### For Gap 9 (Configuration)

**Approach**: Single JSON file, env var override.

`spark_config.json` (gitignored) with sections: `port`, `auth`, `hermes`, `relay`, `lite`, `cors`. `spark_config.example.json` committed as template. Loaded in `main.js` before server start — env vars take precedence over config file.

### For Gap 10 (MCP Chat Tools)

**Approach**: Add 5 new tools to `spark_mcp_server.py` TOOLS_LIST and handlers.

Tools: `spark_chat_create_session`, `spark_chat_reply`, `spark_chat_stream_chunk`, `spark_chat_set_typing`, `spark_chat_get_messages`. All use existing `send_spark_request()` helper. No new Python deps.

---

## 4. Technical Constraints

### Hard Constraints (Cannot Change)
| Constraint | Impact |
|-----------|--------|
| **No build step** | No TypeScript, no bundler, no transpilation. All JS runs directly in Electron. |
| **No test suite** | Verification is manual (curl + visual check). No automated regression testing. |
| **Electron 34** | Node.js version locked to what Electron 34 bundles (~Node 20). |
| **External node_modules** | Deps at `C:/Users/FERNA/.spark_desktop_runtime/node_modules`. `npm install` in repo root won't work normally. |
| **contextIsolation: true** | Renderer has NO Node access. All IPC via `preload.js` contextBridge. |
| **nodeIntegration: false** | No `require()` in renderer. Chat.js must use `fetch()` + `sparkBridge`. |
| **Transparent, frameless, always-on-top window** | UI must work within 380×460px transparent window. Chat panel needs to fit or expand this. |
| **Windows 11 target** | Paths use `C:/Users/FERNA/`. Bash is MSYS/git-bash. PowerShell builtins don't work in terminal. |
| **8GB RAM target** | Electron baseline ~150-200MB. Chat + SQLite + streaming must stay under ~300MB total. |

### Soft Constraints (Can Change With Effort)
| Constraint | Mitigation |
|-----------|-----------|
| **Python scripts use only stdlib** | Keep this — no pip deps for MCP/CLI scripts. |
| **No express/cors used** | Already imported in package.json but unused. Remove or keep as dead deps. |
| **Single WS server on :7890** | Could add separate WS port for relay, but simpler to multiplex on existing server. |
| **Window not resizable** | Chat panel needs to fit in 380px width or window needs `resizable: true`. Plan uses `max-width: 360px` — fits. |

### Dependencies Risk
| Dependency | Status | Risk |
|-----------|--------|------|
| `better-sqlite3` | NEW — needs native compilation | **MEDIUM**: Windows pre-built binaries usually work via npm, but external node_modules path may complicate. Fallback: JSON file store. |
| `ws` | Existing, working | LOW |
| `electron@34` | Existing, working | LOW |
| `express`, `cors` | Listed but unused | NONE (can remove) |

---

## 5. Risk Areas

### High Risk

1. **better-sqlite3 native compilation on Windows with external node_modules**
   - `better-sqlite3` requires node-gyp compilation or prebuilt binaries
   - The external runtime dir (`C:/Users/FERNA/.spark_desktop_runtime/`) means `npm install better-sqlite3` must run there, not in the repo
   - Electron's Node ABI version may not match system Node — needs `electron-rebuild` or prebuilt Electron binaries
   - **Mitigation**: Try `npm install better-sqlite3` in runtime dir first. If fails, use a pure-JS fallback: `lowdb` (JSON sync) or a custom JSON file store with the same API. The messageStore.js interface is simple enough to swap implementations.

2. **Window size constraints for chat panel**
   - Current window: 380×460px, transparent, frameless, always-on-top
   - Chat panel with message history + input needs vertical space (min 300px for messages)
   - Avatar + status pill + chat panel may not fit in 460px height
   - **Mitigation**: Make chat panel replace the speech bubble area (above avatar). When chat is open, hide the speech bubble and show chat. Window may need to become resizable or taller (e.g., 380×560). Alternatively, chat panel as an expandable overlay that extends above the current window bounds.

3. **Electron RAM usage with chat panel + GIF + blur**
   - Electron baseline ~150MB. Chat DOM + SQLite + streaming + GIF animation + backdrop-filter could push to 400MB+
   - On 8GB RAM PC with other apps running, this is significant
   - **Mitigation**: Lite mode is critical. Disable blur (biggest win), disable non-essential animations, slow radar. Consider pausing GIF animation when chat is open (set `sparkImg.src` to a static frame).

### Medium Risk

4. **Hermes API Server SSE parsing in Node.js**
   - The plan uses `for await (const chunk of reader)` which is an async iterator over the HTTP response stream
   - Node.js `http` module doesn't natively support async iteration on responses in all versions
   - **Mitigation**: Use `'data'` event listeners with manual SSE line buffering instead of async iterators. More verbose but works on all Node versions.

5. **Relay server message echo / infinite loop**
   - If Spark broadcasts a message, relay forwards it to agents. If an agent sends a message back via relay, Spark broadcasts it locally, which could re-forward to relay → infinite loop
   - **Mitigation**: Tag relay-originated messages with a `_fromRelay` flag. Don't re-broadcast messages that came from the relay.

6. **Chat.js using fetch() from renderer to localhost:7890**
   - `contextIsolation: true` means renderer can't use Node, but `fetch()` is a browser API and should work
   - However, CSP (Content Security Policy) could block fetch to localhost if set
   - **Mitigation**: No CSP is currently set in the Electron window, so fetch should work. If issues arise, route chat requests through IPC (add new channels to preload.js).

7. **MCP server path staleness**
   - `spark_mcp_server.py` line 12 references `g:/My Drive/...`
   - Users registering the MCP server with this path will get failures
   - **Mitigation**: Update docstring to current path. Already noted in AGENTS.md pitfalls.

### Low Risk

8. **Backward compatibility with existing agents**
   - All existing HTTP endpoints and MCP tools remain unchanged
   - New chat endpoints are additive (new paths, no modifications to existing handlers)
   - **Mitigation**: None needed — purely additive.

9. **Google Fonts → local fonts migration**
   - If woff2 download fails, system fonts (`Segoe UI`, `Consolas`) are adequate fallbacks
   - **Mitigation**: Use `@font-face` with fallback `font-family` stack.

10. **Quick-Input Hub → Chat Panel transition**
    - Quick-Input Hub code can remain as-is (disabled). Chat panel is a separate, new UI component.
    - Avatar click handler changes from `openQuickInput()` to `ChatPanel.toggle()`.
    - **Mitigation**: Keep Quick-Input Hub code for reference. Don't delete — just leave disabled.

---

## 6. Existing Plan Assessment

The existing plan at `.hermes/plans/2026-09-01_175046-spark-messaging-center.md` (3238 lines) is **comprehensive and well-structured**. It covers 4 phases with 20+ tasks. Key observations:

**Strengths:**
- Correctly identifies all 7 key problems
- Uses additive approach (no breaking changes to existing functionality)
- Provides complete code for each new file
- Includes fallback strategies (JSON store if SQLite fails)
- Addresses RAM optimization with lite mode
- Covers remote connectivity with relay server
- Includes MCP tool additions and CLI updates

**Issues to address in implementation:**
1. **Stale paths**: Plan references `G:/My Drive/04_Desarrollo_AI/Spark_Desktop/` throughout — must use `C:/Users/FERNA/Documents/Spark_Desktop/`
2. **better-sqlite3 install location**: Plan says `npm install better-sqlite3` in repo root, but deps live in `.spark_desktop_runtime/`. Must install there: `cd C:/Users/FERNA/.spark_desktop_runtime && npm install better-sqlite3`
3. **Window size**: Plan's chat panel `max-height: 420px` + avatar 140px + status pill 30px = 590px, exceeds current 460px window. Need to make window taller or use overlay.
4. **SSE parsing**: Plan uses async iterators which may not work reliably on Node 20's HTTP module. Should use event-based parsing.
5. **Relay echo loop**: Not addressed in plan. Need relay-origin message tagging.
6. **express/cors unused**: Plan doesn't mention removing these dead deps.
7. **Hermes adapter makeRequest()**: Uses `for await` on response body which is fragile. Should use `'data'`/`'end'` events.
8. **No openspec structure**: Plan exists but openspec change directory is empty. Need to create proper openspec artifacts.

**Plan phases summary:**
- Phase 1 (Tasks 1.1-1.10): Chat UI + SQLite + Lite mode + MCP/CLI updates — **well-scoped, implementable as-is with path fixes**
- Phase 2 (Tasks 2.1-2.5): Hermes API adapter + webhook receiver — **sound approach, needs SSE parsing fix**
- Phase 3 (Tasks 3.1-3.6): Auth + relay server + relay client + config — **solid, needs relay echo fix**
- Phase 4 (Tasks 4.1-4.3): Native Hermes platform adapter — **optional/advanced, can defer**

---

## 7. File Inventory for Implementation

### New Files (from plan, with corrected paths)
| File | Purpose | Phase |
|------|---------|-------|
| `src/store/messageStore.js` | SQLite persistence (sessions + messages) | 1 |
| `src/renderer/chat/chat.html` | Chat panel DOM | 1 |
| `src/renderer/chat/chat.css` | Chat panel styles | 1 |
| `src/renderer/chat/chat.js` | Chat panel logic (ChatPanel object) | 1 |
| `src/renderer/lite.js` | Lite mode detector | 1 |
| `src/auth.js` | Token authentication | 3 |
| `src/hermesAdapter.js` | Hermes API bridge with SSE streaming | 2 |
| `src/relay/sparkRelay.js` | VPS relay server (standalone) | 3 |
| `src/relayClient.js` | Relay client mode in Spark | 3 |
| `spark_config.example.json` | Config template | 3 |
| `scripts/hermes_spark_adapter.py` | Hermes platform adapter (optional) | 4 |
| `docs/hermes-setup.md` | Hermes integration guide | 2 |
| `docs/remote-setup.md` | Remote connection guide | 3 |
| `docs/adapter-setup.md` | Adapter setup guide | 4 |

### Modified Files
| File | Changes | Phase |
|------|---------|-------|
| `package.json` | Version 2.0.0, add better-sqlite3, new scripts | 1 |
| `src/server.js` | Chat endpoints, auth, webhook, configurable CORS | 1-3 |
| `src/main.js` | messageStore init, Hermes adapter, relay client, config loading, lite mode, window resize | 1-3 |
| `src/renderer/index.html` | Chat panel injection, lite.js script | 1 |
| `src/renderer/app.js` | Chat init, lite mode detect, avatar click reactivation | 1 |
| `src/renderer/styles.css` | Lite mode styles, local fonts | 1 |
| `src/radar.js` | Configurable scan interval | 1 |
| `scripts/spark_mcp_server.py` | 5 new chat tools + path fix | 1 |
| `scripts/spark_notify.py` | Chat CLI commands | 1 |

---

## 8. Key Architectural Decisions

1. **Chat.js uses `fetch()` not IPC** — Simpler, no preload changes needed. The existing `onServerEvent` IPC channel already delivers all WS broadcasts to the renderer, which chat.js listens to for real-time updates.

2. **SQLite over JSON** — Better for concurrent access, pagination, and scaling with message history. WAL mode minimizes disk I/O. 2MB cache cap keeps RAM low. JSON fallback if native module fails.

3. **Additive endpoints** — All new `/api/chat/*` endpoints are new paths. Existing `/api/notify`, `/api/message`, `/api/prompt` etc. remain untouched. Agents that only know the old API continue to work.

4. **Streaming via HTTP POST chunks** — Agents send chunks as separate POST requests to `/api/chat/stream`. Server broadcasts each chunk via WS. Simpler than SSE-from-agent or WS-from-agent. Works with existing HTTP-only agents.

5. **Relay as separate process** — `sparkRelay.js` runs on VPS as standalone Node script. Spark Desktop connects outbound as client. No inbound ports needed on Spark PC. Agents on VPS connect to relay's `/agent` path.

6. **Lite mode via CSS class** — `body.lite-mode` class toggles all optimizations. Auto-detected from `navigator.deviceMemory` and `os.totalmem()`. Overridable via `SPARK_LITE=1` env var or `?lite=1` URL param.

7. **Config file over env-only** — `spark_config.json` centralizes all settings. Env vars override config file. Example template committed, real config gitignored.