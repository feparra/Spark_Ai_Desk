# Spark AI Desktop Companion

Electron-based always-on-top desktop companion that acts as a notification hub and messaging interface for AI agents (Hermes, Claude, Antigravity, Codex, etc.). Transparent floating window with Clippy-style speech bubbles, procedural audio, multi-character skins, and a local HTTP/WebSocket API on port 7890.

## Dev environment

**Prerequisites:** Node.js installed. Electron and npm deps live in a separate runtime dir, NOT in the project's `node_modules/`.

**Setup:**
```bash
# Install deps into the external runtime (first time only)
mkdir -p C:/Users/ferna/.spark_desktop_runtime
cd C:/Users/ferna/.spark_desktop_runtime
npm init -y
npm install electron@34 cors express ws
```

**Run:**
```bash
# From repo root:
npm start                          # launches electron via package.json "start" script
# Or directly with the external runtime:
NODE_PATH=C:/Users/ferna/.spark_desktop_runtime/node_modules \
  C:/Users/ferna/.spark_desktop_runtime/node_modules/.bin/electron src/main.js
# Or use the Windows launcher:
start_spark.bat                    # kills existing electron, starts background via .vbs
```

**Stop:** `stop_spark.bat` or `taskkill /F /IM electron.exe`

There is no test suite, no linter config, and no CI pipeline in this repo.

## Architecture

```
src/main.js        Electron main process — window creation, tray, IPC, GPU flags, wander/radar init
src/server.js       HTTP + WebSocket server on :7890 — all API endpoints, broadcast, prompt queues
src/preload.js      contextBridge — exposes sparkBridge to renderer (sendAction, onServerEvent, etc.)
src/renderer/       UI — index.html, app.js (state/notifications/quick-input), styles.css, audio.js
src/radar.js        Agent Radar — scans local ports/processes every 12s for active AI agents
src/wander.js        Multi-monitor wandering engine (disabled by default for 0% CPU)
scripts/            Python helpers — spark_notify.py (CLI), spark_mcp_server.py (MCP JSON-RPC stdio)
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

`scripts/spark_mcp_server.py` exposes 6 tools via JSON-RPC over stdio. Agents register it:
```json
{"mcpServers":{"spark-companion":{"command":"python","args":["g:/My Drive/04_Desarrollo_AI/Spark_Desktop/scripts/spark_mcp_server.py"]}}}
```

## Conventions

- **No build step.** Source runs directly in Electron — no transpilation, no bundler.
- **Commit style:** `type(scope): description` — e.g. `feat(radar): ...`, `chore(cleanup): ...`, `fix: ...`.
- **Renderer <-> Main:** All IPC via `ipcMain`/`ipcRenderer` through `preload.js` contextBridge. Renderer has no Node access (`contextIsolation: true`, `nodeIntegration: false`).
- **Server <-> Renderer:** `sparkServer.broadcast()` sends to all WebSocket clients AND `mainWindow.webContents.send('server-event', ...)`.
- **Python scripts** use only stdlib (`urllib`, `json`, `argparse`) — no pip dependencies.
- **Audio** is fully procedural via Web Audio API (`audio.js`) — no audio files.
- **New characters** need: 6 GIFs in `assets/<name>/` (calm, working, waiting, connecting, done, error), a 32px PNG + ICO in `assets/icons/`, and entries in `SKINS` (app.js) + `AGENT_COLORS` (app.js) + tray submenu (main.js).
- **States:** calm, working, waiting, done, error, connecting — each maps to a GIF per character.
- **Agent names:** lowercase identifiers (claude, antigravity, hermes, openclaw, codex, spark).

## Pitfalls

- **External node_modules.** `NODE_PATH` must point to `C:/Users/ferna/.spark_desktop_runtime/node_modules`. The repo's own `node_modules/` is gitignored and may be empty/stale. Both `main.js` and `server.js` push this path into `module.paths` at runtime.
- **Port 7890 conflicts.** If another Spark instance is running, `EADDRINUSE` fires silently. The app uses `app.requestSingleInstanceLock()` to prevent duplicates, but a stale electron.exe process can still hold the port — kill with `taskkill /F /IM electron.exe`.
- **Hardcoded paths.** Launcher scripts (`start_spark.bat`, `.vbs`) contain absolute paths to `g:\My Drive\04_Desarrollo_AI\Spark_Desktop` and `C:\Users\ferna\.spark_desktop_runtime`. These break if the repo moves.
- **Quick-Input Hub is disabled.** The avatar click handler and `Alt+Space` shortcut in `main.js` and `app.js` are commented out. Re-enable by uncommenting the marked blocks.
- **Google Fonts CDN.** `styles.css` imports Outfit + JetBrains Mono from Google Fonts. Fails offline. Plan exists to localize them (see `.hermes/plans/`).
- **`.atl/` directory** is gitignored — local AI tooling state, do not commit.
- **Wander engine** moves the window every 25ms via `setInterval`. Disabled by default (`this.enabled = false`). Enabling it on low-RAM machines causes DWM stutter.
- **GPU flags** in `main.js` are tuned for performance (`enable-gpu-rasterization`, `enable-zero-copy`, `disable-renderer-backgrounding`). Removing them degrades animation smoothness.
