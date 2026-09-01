# Spark AI Desktop Companion

Electron-based always-on-top desktop companion that acts as a notification hub and messaging interface for AI agents (Hermes, Claude, Antigravity, Codex, etc.). Transparent floating window with Clippy-style speech bubbles, procedural audio, multi-character skins, and a local HTTP/WebSocket API on port 7890.

## Dev environment

**Prerequisites:** Node.js installed. Electron and npm deps live in a separate runtime dir, NOT in the project's `node_modules/`.

**Setup (first time only):**
```bash
mkdir -p C:/Users/FERNA/.spark_desktop_runtime
cd C:/Users/FERNA/.spark_desktop_runtime
npm init -y
npm install electron@34 cors express ws
```

**Run:**
```bash
npm start    # from repo root — launches electron via package.json "start" script
# Or directly:
NODE_PATH=C:/Users/FERNA/.spark_desktop_runtime/node_modules \
  C:/Users/FERNA/.spark_desktop_runtime/node_modules/.bin/electron src/main.js
```

**Stop:** `stop_spark.bat` or `taskkill /F /IM electron.exe`

No test suite, no linter, no CI.

## Architecture

```
src/main.js        Electron main — window, tray, IPC, GPU flags, wander/radar init
src/server.js       HTTP + WebSocket server on :7890 — all API endpoints, broadcast, prompt queues
src/preload.js      contextBridge — exposes sparkBridge to renderer
src/renderer/       UI — index.html, app.js, styles.css, audio.js
src/radar.js        Agent Radar — scans local ports/processes every 12s
src/wander.js        Multi-monitor wandering engine (disabled by default)
scripts/            Python — spark_notify.py (CLI), spark_mcp_server.py (MCP JSON-RPC stdio)
assets/             Character GIFs (capy, llama, kitty, piper, dr_octopus, astro, spark) + icons
```

## API endpoints (port 7890)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/api/status` | Current companion state |
| POST   | `/api/state` | Set visual state (calm/working/waiting/done/error) |
| POST   | `/api/notify?wait=true` | Interactive speech bubble with buttons (blocks if wait=true) |
| POST   | `/api/message` | Info toast, no buttons, auto-dismiss 8s |
| POST   | `/api/prompt` | Queue a prompt for a target agent |
| GET    | `/api/prompts?agent=X` | Fetch queued prompts for an agent |
| POST   | `/api/prompts/ack` | Acknowledge/remove a prompt |
| POST   | `/api/skin` | Switch character skin |
| POST   | `/api/dismiss` | Dismiss current bubble |
| POST   | `/api/wander` | Toggle wander mode |

## MCP integration

`scripts/spark_mcp_server.py` exposes 6 tools via JSON-RPC over stdio. Register with:
```json
{"mcpServers":{"spark-companion":{"command":"python","args":["C:/Users/FERNA/Documents/Spark_Desktop/scripts/spark_mcp_server.py"]}}}
```

## Conventions

- **No build step** — source runs directly in Electron, no transpilation or bundler.
- **Commit style:** `type(scope): description` (e.g. `feat(radar): ...`, `fix: ...`, `chore(cleanup): ...`).
- **Renderer ↔ Main:** IPC via `preload.js` contextBridge. Renderer has no Node access (`contextIsolation: true`, `nodeIntegration: false`).
- **Server ↔ Renderer:** `sparkServer.broadcast()` sends to all WS clients AND `mainWindow.webContents.send('server-event', ...)`.
- **Python scripts** use only stdlib (`urllib`, `json`, `argparse`) — no pip dependencies.
- **Audio** is procedural via Web Audio API (`audio.js`) — no audio files.
- **New characters** need: 6 GIFs in `assets/<name>/`, a 32px PNG + ICO in `assets/icons/`, entries in `SKINS` + `AGENT_COLORS` (app.js) + tray submenu (main.js).
- **States:** calm, working, waiting, done, error, connecting — each maps to a GIF per character.
- **Agent names:** lowercase (claude, antigravity, hermes, openclaw, codex, spark).

## Pitfalls

- **External node_modules.** `NODE_PATH` must point to `C:/Users/FERNA/.spark_desktop_runtime/node_modules`. Both `main.js` and `server.js` push this path into `module.paths` at runtime. The repo's own `node_modules/` is gitignored.
- **Port 7890 conflicts.** `app.requestSingleInstanceLock()` prevents duplicates, but a stale `electron.exe` can hold the port — kill with `taskkill /F /IM electron.exe`.
- **Launcher scripts have stale paths.** `start_spark.bat` and `start_spark_background.vbs` still point to `g:\My Drive\04_Desarrollo_AI\Spark_Desktop`. Update them to `C:\Users\FERNA\Documents\Spark_Desktop` before using.
- **MCP server example path is stale.** `spark_mcp_server.py` docstring references `g:/My Drive/...` — update to the current repo path when registering with agents.
- **Quick-Input Hub is disabled.** Avatar click handler and `Alt+Space` shortcut in `main.js`/`app.js` are commented out. Re-enable by uncommenting marked blocks.
- **Google Fonts CDN.** `styles.css` imports Outfit + JetBrains Mono from Google Fonts — fails offline.
- **Wander engine** moves the window every 25ms via `setInterval`. Disabled by default. Causes DWM stutter on low-RAM machines if enabled.
- **GPU flags** in `main.js` (`enable-gpu-rasterization`, `enable-zero-copy`, `disable-renderer-backgrounding`) are performance-critical — removing them degrades animation smoothness.
- **`.atl/`** is gitignored — local AI tooling state, do not commit.