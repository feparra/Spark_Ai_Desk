# ⚡ Spark AI Desktop Companion - Multi-Agent Guide

All AI agents (Claude, Antigravity, Hermes, OpenClaw, Codex, Cursor) have access to **Spark AI Desktop Companion** running on `http://localhost:7890`.

## 📌 Standard Agent Behavior Rules
1. **Task Start**: When starting a complex or long-running task, set the companion state to `working`.
2. **Approval Required**: Before executing critical commands (deletions, installs, deployments), display a `waiting` speech bubble with `--wait` so the user can approve directly from their screen.
3. **Task Completion**: Upon finishing, trigger a `done` notification with celebration sound.
4. **Errors**: If a fatal error occurs, trigger an `error` state.

## 🔌 MCP Server Configuration
```json
{
  "mcpServers": {
    "spark-companion": {
      "command": "python",
      "args": ["g:/My Drive/04_Desarrollo_AI/Spark_Desktop/scripts/spark_mcp_server.py"]
    }
  }
}
```
