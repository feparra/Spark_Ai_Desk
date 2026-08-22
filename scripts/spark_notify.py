#!/usr/bin/env python3
"""
⚡ Spark AI Python Helper & CLI
Allows any AI agent, script, or terminal to send notifications and change Spark's state on desktop.

Quick CLI usage:
  python spark_notify.py --state working --agent claude --message "Generating code..."
  python spark_notify.py --state waiting --agent antigravity --title "Authorization" --message "Run npm test?" --actions "Approve" "Reject" --wait
"""

import argparse
import sys
import json
import urllib.request
import urllib.error

# Force UTF-8 encoding on Windows stdout
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_PORT = 7890

def set_spark_state(state="calm", agent="spark", message="", port=DEFAULT_PORT):
    """Changes the visual state of Spark."""
    url = f"http://localhost:{port}/api/state"
    payload = {"state": state, "agent": agent, "message": message}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error connecting to Spark Desktop on port {port}: {e}", file=sys.stderr)
        return None

def notify_spark(agent="spark", state="waiting", title="Attention", message="", 
                 actions=None, timeout=60, wait_for_response=False, port=DEFAULT_PORT):
    """
    Displays an interactive speech bubble in Spark.
    If wait_for_response is True, blocks until user clicks an action button or timeout occurs.
    """
    if actions is None:
        actions = ["Approve", "Reject"]

    url = f"http://localhost:{port}/api/notify"
    if wait_for_response:
        url += "?wait=true"

    payload = {
        "agent": agent,
        "state": state,
        "title": title,
        "message": message,
        "actions": actions,
        "timeout": timeout,
        "sound": True
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        req_timeout = timeout + 5 if wait_for_response else 5
        with urllib.request.urlopen(req, timeout=req_timeout) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            return res_json.get("action") if wait_for_response else res_json
    except Exception as e:
        print(f"⚠️ Error sending notification to Spark: {e}", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="⚡ Spark AI Desktop CLI Notifier")
    parser.add_argument("--state", type=str, default="calm", help="State: calm, working, waiting, done, error, connecting")
    parser.add_argument("--agent", type=str, default="spark", help="Agent name: claude, antigravity, hermes, openclaw, codex, etc.")
    parser.add_argument("--title", type=str, default="", help="Title for the interactive speech bubble")
    parser.add_argument("--message", type=str, default="", help="Message or description")
    parser.add_argument("--actions", nargs="+", default=None, help="List of action buttons (e.g. Approve Reject)")
    parser.add_argument("--wait", action="store_true", help="Wait for the user to click an action button")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout in seconds")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Spark server port")

    args = parser.parse_args()

    if args.title or args.actions or args.wait:
        action = notify_spark(
            agent=args.agent,
            state=args.state,
            title=args.title or f"Message from {args.agent.capitalize()}",
            message=args.message,
            actions=args.actions or ["Approve", "Reject"],
            timeout=args.timeout,
            wait_for_response=args.wait,
            port=args.port
        )
        if args.wait:
            print(f"🎯 User selected: {action}")
            if action in ["Approve", "Yes", "Confirm", "Aprobar", "Sí"]:
                sys.exit(0)
            else:
                sys.exit(1)
    else:
        res = set_spark_state(state=args.state, agent=args.agent, message=args.message, port=args.port)
        if res:
            print(f"✅ Spark state updated: {args.state} ({args.agent})")

if __name__ == "__main__":
    main()
