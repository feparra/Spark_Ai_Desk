# ⚡ Spark AI Desktop Companion - Agent Integration Guide

When working on tasks on this PC, **Spark AI Desktop Companion** is active and listening on `http://localhost:7890`.
You can communicate with Spark via **MCP Server**, **Python CLI**, or **REST API**.

---

## 🔌 1. Model Context Protocol (MCP) Integration (Recommended)
Add this to your Claude Desktop, Cursor, or Antigravity MCP settings:

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

### Available MCP Tools:
- `spark_notify(title, message, agent, state, actions, wait_for_user)`: Shows interactive Clippy-style speech bubbles with audio alerts and approval buttons.
- `spark_set_state(state, agent, message)`: Sets visual state (`working`, `calm`, `waiting`, `done`, `error`).
- `spark_switch_character(character)`: Switches companion (`capy`, `llama`, `kitty`, `piper`, `dr_octopus`, `astro`, `spark`).
- `spark_get_status()`: Queries companion status and connected radar agents.

---

## 🐍 2. Python CLI Helper
```bash
# Notify when starting a task:
python "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state working --message "Claude is writing code..."

# Notify on completion:
python "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state done --title "Task Completed" --message "All tests passed successfully ✨" --actions "Awesome!"

# Ask user for permission/confirmation (blocks until button clicked):
python "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state waiting --title "Authorization Required" --message "Allow running db migrations?" --actions "Approve" "Reject" --wait

# Report an error:
python "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state error --title "Build Failed" --message "Syntax error in file"
```

---

## 🌐 3. REST API (`http://localhost:7890`)
- `POST /api/state` -> `{"state": "working", "agent": "claude", "message": "Refactoring..."}`
- `POST /api/notify?wait=true` -> `{"title": "Authorize", "message": "Deploy?", "actions": ["Approve", "Reject"]}`
- `POST /api/skin` -> `{"skin": "capy"}`
- `GET /api/status` -> Status JSON
