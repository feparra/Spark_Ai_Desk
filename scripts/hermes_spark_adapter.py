#!/usr/bin/env python3
"""
hermes_spark_adapter.py — Hermes Platform Adapter Skeleton for Spark Desktop

Task 4.1: A skeleton adapter that bridges Hermes agent prompts with the Spark
Desktop messaging center. Polls Spark's GET /api/prompts endpoint for queued
prompts and sends replies via POST /api/chat/reply.

Uses ONLY Python stdlib (urllib, json, argparse, time) — no pip dependencies.

Usage:
    python hermes_spark_adapter.py --spark-url http://localhost:7890 --agent-name hermes
    python hermes_spark_adapter.py --spark-url http://localhost:7890 --agent-name hermes --poll-interval 5

This is a SKELETON. Full integration depends on Hermes gateway adapter API stability.
The actual Hermes response generation logic should be plugged into the
`generate_response()` method.
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
import urllib.parse


class SparkAdapter:
    """Hermes platform adapter that polls Spark for prompts and sends replies."""

    def __init__(self, spark_url, agent_name="hermes", poll_interval=5, auth_token=None):
        self.spark_url = spark_url.rstrip("/")
        self.agent_name = agent_name.lower()
        self.poll_interval = poll_interval
        self.auth_token = auth_token
        self.running = False
        self.acked_prompts = set()

    def _make_request(self, method, path, data=None):
        """Make an HTTP request to the Spark server using urllib."""
        url = f"{self.spark_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")

        req = urllib.request.Request(url, data=body, method=method, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = resp.read().decode("utf-8")
                return json.loads(resp_data) if resp_data else {}
        except urllib.error.HTTPError as e:
            print(f"[ERROR] HTTP {e.code}: {e.reason}", file=sys.stderr)
            return None
        except urllib.error.URLError as e:
            print(f"[ERROR] Connection failed: {e.reason}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"[ERROR] Unexpected: {e}", file=sys.stderr)
            return None

    def fetch_prompts(self):
        """Poll GET /api/prompts?agent=<name> for queued prompts."""
        result = self._make_request("GET", f"/api/prompts?agent={self.agent_name}")
        if result and result.get("ok"):
            return result.get("prompts", [])
        return []

    def acknowledge_prompt(self, prompt_id):
        """Acknowledge a prompt so it's removed from the queue."""
        self._make_request("POST", "/api/prompts/ack", {
            "id": prompt_id,
            "agent": self.agent_name
        })

    def send_reply(self, prompt_id, content, session_id=None):
        """Send a reply via POST /api/chat/reply."""
        payload = {
            "sessionId": session_id or f"adapter_{self.agent_name}_{int(time.time())}",
            "agent": self.agent_name,
            "content": content,
            "promptId": prompt_id,
        }
        result = self._make_request("POST", "/api/chat/reply", payload)
        return result

    def send_state(self, state="working", message=""):
        """Update Spark visual state via POST /api/state."""
        self._make_request("POST", "/api/state", {
            "state": state,
            "agent": self.agent_name,
            "message": message
        })

    def generate_response(self, prompt_text, prompt_author="user"):
        """
        Generate a response for the given prompt.

        SKELETON: This method should be replaced with actual Hermes gateway logic.
        For now, it returns a placeholder response.
        """
        # TODO: Integrate with Hermes gateway adapter API
        # Example: call Hermes API to generate a response, then return it
        return f"[{self.agent_name}] Acknowledged: '{prompt_text[:80]}'"

    def process_prompt(self, prompt):
        """Process a single prompt: generate response, send reply, acknowledge."""
        prompt_id = prompt.get("id", "")
        prompt_text = prompt.get("prompt", "")
        author = prompt.get("author", "user")

        print(f"[PROMPT] {prompt_id} from {author}: {prompt_text[:100]}")

        # Set working state
        self.send_state("working", f"Processing prompt {prompt_id}...")

        # Generate response
        response = self.generate_response(prompt_text, author)

        # Send reply to Spark
        result = self.send_reply(prompt_id, response)
        if result and result.get("ok"):
            print(f"[REPLY] Sent reply for prompt {prompt_id}")
            # Acknowledge the prompt
            self.acknowledge_prompt(prompt_id)
            self.acked_prompts.add(prompt_id)
        else:
            print(f"[WARN] Failed to send reply for prompt {prompt_id}", file=sys.stderr)

        # Return to calm state
        self.send_state("calm", "Idle")

    def run(self):
        """Main polling loop."""
        print(f"[SparkAdapter] Starting — agent: {self.agent_name}, "
              f"spark: {self.spark_url}, interval: {self.poll_interval}s")
        self.running = True

        while self.running:
            try:
                prompts = self.fetch_prompts()
                if prompts:
                    print(f"[SparkAdapter] Found {len(prompts)} prompt(s)")
                    for prompt in prompts:
                        prompt_id = prompt.get("id", "")
                        if prompt_id in self.acked_prompts:
                            continue
                        self.process_prompt(prompt)
            except KeyboardInterrupt:
                print("\n[SparkAdapter] Shutting down...")
                break
            except Exception as e:
                print(f"[SparkAdapter] Error in poll loop: {e}", file=sys.stderr)

            try:
                time.sleep(self.poll_interval)
            except KeyboardInterrupt:
                print("\n[SparkAdapter] Shutting down...")
                break

    def stop(self):
        """Stop the polling loop."""
        self.running = False


def main():
    parser = argparse.ArgumentParser(
        description="Hermes Spark Adapter — polls Spark Desktop for prompts and sends replies"
    )
    parser.add_argument(
        "--spark-url",
        default="http://localhost:7890",
        help="Spark Desktop server URL (default: http://localhost:7890)"
    )
    parser.add_argument(
        "--agent-name",
        default="hermes",
        help="Agent name to use when polling for prompts (default: hermes)"
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=5,
        help="Polling interval in seconds (default: 5)"
    )
    parser.add_argument(
        "--auth-token",
        default=None,
        help="Auth token for Spark server (if auth is enabled)"
    )

    args = parser.parse_args()

    adapter = SparkAdapter(
        spark_url=args.spark_url,
        agent_name=args.agent_name,
        poll_interval=args.poll_interval,
        auth_token=args.auth_token,
    )

    try:
        adapter.run()
    except KeyboardInterrupt:
        print("\n[SparkAdapter] Interrupted")
        sys.exit(0)


if __name__ == "__main__":
    main()