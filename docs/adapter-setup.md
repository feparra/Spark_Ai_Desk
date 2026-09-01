# Platform Adapter Setup Guide

The `hermes_spark_adapter.py` script is a skeleton adapter that bridges Hermes agent prompts with the Spark Desktop messaging center. It polls Spark for queued prompts and sends replies back.

## Overview

```
┌─────────────────┐     GET /api/prompts      ┌─────────────────┐
│   Spark Desktop │ ◄──────────────────────── │  Hermes Adapter │
│   (port 7890)   │                            │  (Python script) │
│                 │ ──────── POST /api/chat/reply ────────────► │
└─────────────────┘                            └─────────────────┘
```

The adapter:
1. Polls `GET /api/prompts?agent=hermes` every N seconds
2. For each prompt, generates a response (skeleton placeholder)
3. Sends the reply via `POST /api/chat/reply`
4. Acknowledges the prompt via `POST /api/prompts/ack`
5. Updates Spark visual state via `POST /api/state`

---

## Installation

### Prerequisites

- Python 3.7+ (stdlib only — no pip dependencies)
- Spark Desktop running and accessible

### Quick Start

```bash
# Local (default)
python scripts/hermes_spark_adapter.py --agent-name hermes

# Remote via relay
python scripts/hermes_spark_adapter.py \
  --spark-url http://your-vps:7890 \
  --agent-name hermes \
  --auth-token YOUR_SECRET_TOKEN

# Custom poll interval (seconds)
python scripts/hermes_spark_adapter.py --poll-interval 10
```

---

## CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--spark-url` | `http://localhost:7890` | Spark Desktop server URL |
| `--agent-name` | `hermes` | Agent name for prompt polling |
| `--poll-interval` | `5` | Seconds between poll cycles |
| `--auth-token` | `None` | Auth token (if Spark auth is enabled) |

---

## Configuration

### With Auth Enabled

If Spark Desktop has `SPARK_AUTH_TOKEN` set, pass the token to the adapter:

```bash
python scripts/hermes_spark_adapter.py \
  --spark-url http://localhost:7890 \
  --auth-token your_48_char_hex_token
```

### With spark_config.json

If you're using `spark_config.json`, the adapter reads the token from the `--auth-token` CLI arg. You can wrap the launch in a script:

```bash
#!/bin/bash
TOKEN=$(python -c "import json; print(json.load(open('spark_config.json'))['auth']['token'])")
python scripts/hermes_spark_adapter.py --auth-token "$TOKEN"
```

---

## Integration with Hermes

This adapter is a **skeleton**. The `generate_response()` method currently returns a placeholder. To integrate with the Hermes gateway:

1. **Open `scripts/hermes_spark_adapter.py`**
2. **Find the `generate_response()` method:**
   ```python
   def generate_response(self, prompt_text, prompt_author="user"):
       # TODO: Integrate with Hermes gateway adapter API
       return f"[{self.agent_name}] Acknowledged: '{prompt_text[:80]}'"
   ```
3. **Replace with your Hermes API call:**
   ```python
   def generate_response(self, prompt_text, prompt_author="user"):
       # Call Hermes gateway to generate a response
       # Example using urllib:
       import urllib.request, json
       req_data = json.dumps({"prompt": prompt_text}).encode()
       req = urllib.request.Request(
           "http://hermes-gateway/v1/generate",
           data=req_data,
           headers={"Content-Type": "application/json"}
       )
       with urllib.request.urlopen(req, timeout=30) as resp:
           result = json.loads(resp.read())
           return result.get("response", "")
   ```

---

## Running as a Service

### systemd (Linux)

```ini
# /etc/systemd/system/spark-adapter.service
[Unit]
Description=Spark Hermes Adapter
After=network.target

[Service]
Type=simple
User=spark
WorkingDirectory=/path/to/Spark_Desktop
ExecStart=/usr/bin/python3 scripts/hermes_spark_adapter.py --spark-url http://localhost:7890 --agent-name hermes
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Windows Task Scheduler

1. Open Task Scheduler → Create Task
2. Trigger: At startup
3. Action: Start a program
   - Program: `python`
   - Arguments: `scripts/hermes_spark_adapter.py --spark-url http://localhost:7890`
4. Start in: `C:\Users\FERNA\Documents\Spark_Desktop`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused | Ensure Spark Desktop is running (`npm start`) |
| 401 Unauthorized | Pass `--auth-token` with the correct token |
| No prompts received | Verify `--agent-name` matches the target agent in prompts |
| Adapter crashes | Check Python version (3.7+ required) |