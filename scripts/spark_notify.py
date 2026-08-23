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

def get_spark_prompts(agent="all", ack=True, port=DEFAULT_PORT):
    """Fetches queued prompts for this agent from Spark Command Hub."""
    url = f"http://localhost:{port}/api/prompts?agent={agent}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            prompts = data.get("prompts", [])
            if ack and prompts:
                for p in prompts:
                    ack_req = urllib.request.Request(
                        f"http://localhost:{port}/api/prompts/ack",
                        data=json.dumps({"id": p["id"], "agent": agent}).encode("utf-8"),
                        headers={"Content-Type": "application/json"}
                    )
                    urllib.request.urlopen(ack_req, timeout=3)
            return prompts
    except Exception as e:
        print(f"⚠️ Error fetching prompts from Spark: {e}", file=sys.stderr)
        return []

def dispatch_spark_prompt(target="all", prompt="", port=DEFAULT_PORT):
    """Dispatches a prompt to a target agent queue via Spark."""
    url = f"http://localhost:{port}/api/prompt"
    payload = {"targetAgent": target, "prompt": prompt}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error dispatching prompt to Spark: {e}", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="⚡ Spark AI Desktop CLI Notifier & Command Hub")
    parser.add_argument("--state", type=str, default="calm", help="State: calm, working, waiting, done, error, connecting")
    parser.add_argument("--agent", type=str, default="spark", help="Agent name: claude, antigravity, hermes, openclaw, codex, etc.")
    parser.add_argument("--title", type=str, default="", help="Title for the interactive speech bubble")
    parser.add_argument("--message", type=str, default="", help="Message or description")
    parser.add_argument("--actions", nargs="+", default=None, help="List of action buttons (e.g. Approve Reject)")
    parser.add_argument("--wait", action="store_true", help="Wait for the user to click an action button")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout in seconds")
    parser.add_argument("--get-prompts", action="store_true", help="Fetch pending user prompts for --agent")
    parser.add_argument("--dispatch", type=str, default="", help="Dispatch a prompt to --agent")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Spark server port")

    args = parser.parse_args()

    if args.get_prompts:
        prompts = get_spark_prompts(agent=args.agent, ack=True, port=args.port)
        if prompts:
            print(f"📥 Found {len(prompts)} pending prompt(s) for [{args.agent}]:")
            for idx, p in enumerate(prompts, 1):
                print(f"  {idx}. [{p['targetAgent'].upper()}]: {p['prompt']}")
        else:
            print(f"📭 No pending prompts for [{args.agent}].")
        return

    if args.dispatch:
        res = dispatch_spark_prompt(target=args.agent, prompt=args.dispatch, port=args.port)
        if res and res.get("ok"):
            print(f"🚀 Prompt dispatched to [{args.agent}]: {args.dispatch}")
        return

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
