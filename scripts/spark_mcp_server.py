#!/usr/bin/env python3
"""
⚡ Spark AI - Model Context Protocol (MCP) Server
Allows any MCP-compliant AI Agent (Claude Desktop, Cursor, Antigravity, OpenClaw)
to communicate bidirectionally with Spark Desktop Companion automatically.

Usage with Claude / Cursor / Antigravity config:
{
  "mcpServers": {
    "spark-companion": {
      "command": "python",
      "args": ["C:/Users/FERNA/Documents/Spark_Desktop/scripts/spark_mcp_server.py"]
    }
  }
}
"""

import sys
import json
import urllib.request
import urllib.error

# Force UTF-8 on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SPARK_PORT = 7890

def send_spark_request(endpoint, data=None, method=None):
    url = f"http://localhost:{SPARK_PORT}{endpoint}"
    req_data = json.dumps(data).encode('utf-8') if data is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=req_data, headers=headers)
    if method:
        req.method = method
    elif data is None:
        req.method = "GET"
    else:
        req.method = "POST"
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return {"ok": False, "error": str(e)}

TOOLS_LIST = [
    {
        "name": "spark_notify",
        "description": "Displays a desktop notification speech bubble above Spark Companion with interactive action buttons (e.g. Approve, Reject) and plays audio alerts.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Title of the alert"},
                "message": {"type": "string", "description": "Detailed explanation or task summary for the user"},
                "agent": {"type": "string", "description": "Your agent name (e.g. claude, antigravity, hermes, openclaw)", "default": "spark"},
                "state": {"type": "string", "enum": ["waiting", "done", "working", "error", "calm"], "default": "waiting", "description": "Character emotional state"},
                "actions": {"type": "array", "items": {"type": "string"}, "description": "Action buttons for the user to click", "default": ["Approve", "Reject"]},
                "wait_for_user": {"type": "boolean", "description": "If true, blocks until user clicks one of the buttons and returns their selection", "default": False},
                "timeout": {"type": "integer", "description": "Timeout in seconds (0 for persistent until closed)", "default": 60}
            },
            "required": ["title", "message"]
        }
    },
    {
        "name": "spark_set_state",
        "description": "Updates the companion visual animation state and bottom status pill text (e.g. while generating code or resting).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "state": {"type": "string", "enum": ["working", "calm", "waiting", "done", "error"], "description": "Animation state to play"},
                "agent": {"type": "string", "description": "Name of the agent updating the state"},
                "message": {"type": "string", "description": "Short message displayed on the companion status pill"}
            },
            "required": ["state"]
        }
    },
    {
        "name": "spark_switch_character",
        "description": "Switches the active desktop companion character skin.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "character": {"type": "string", "enum": ["capy", "llama", "kitty", "piper", "dr_octopus", "astro", "spark"], "description": "Character identifier"}
            },
            "required": ["character"]
        }
    },
    {
        "name": "spark_get_status",
        "description": "Queries the current state, active character, and server connection of Spark Desktop.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "spark_receive_prompt",
        "description": "Fetches pending user instructions/prompts routed specifically to this agent or to all agents from the Spark Desktop Command Hub.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string", "description": "Name of the agent (e.g. claude, antigravity, openclaw, all)", "default": "all"},
                "auto_ack": {"type": "boolean", "description": "Whether to automatically acknowledge and remove retrieved prompts from queue", "default": True}
            }
        }
    },
    {
        "name": "spark_dispatch_prompt",
        "description": "Dispatches a user prompt to a specific agent queue via the Spark Command Hub.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "target_agent": {"type": "string", "description": "Target agent: claude, antigravity, openclaw, or all"},
                "prompt": {"type": "string", "description": "The command or instruction content"}
            },
            "required": ["target_agent", "prompt"]
        }
    },
    {
        "name": "spark_chat_create_session",
        "description": "Creates a new chat session in the Spark messaging center for bidirectional communication.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string", "description": "Agent name (e.g. claude, hermes, spark)", "default": "spark"},
                "title": {"type": "string", "description": "Session title", "default": "New Conversation"}
            }
        }
    },
    {
        "name": "spark_chat_reply",
        "description": "Sends a reply message from an agent to a chat session. The message appears in the Spark chat panel immediately.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The chat session ID to reply to"},
                "content": {"type": "string", "description": "The reply message content"},
                "agent": {"type": "string", "description": "Agent name sending the reply", "default": "spark"}
            },
            "required": ["session_id", "content"]
        }
    },
    {
        "name": "spark_chat_stream_chunk",
        "description": "Sends a streaming chunk to a chat session for progressive rendering. Use done=true on the final chunk with full_content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The chat session ID"},
                "stream_id": {"type": "string", "description": "Unique stream identifier for this response"},
                "chunk": {"type": "string", "description": "Text chunk to append", "default": ""},
                "done": {"type": "boolean", "description": "Whether this is the final chunk", "default": False},
                "full_content": {"type": "string", "description": "Complete response text (only on done=true)", "default": ""},
                "agent": {"type": "string", "description": "Agent name", "default": "spark"}
            },
            "required": ["session_id", "stream_id"]
        }
    },
    {
        "name": "spark_chat_set_typing",
        "description": "Toggles the typing indicator in the Spark chat panel to show the agent is working on a response.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The chat session ID"},
                "agent": {"type": "string", "description": "Agent name", "default": "spark"},
                "is_typing": {"type": "boolean", "description": "Whether the agent is currently typing", "default": True}
            },
            "required": ["session_id"]
        }
    },
    {
        "name": "spark_chat_get_messages",
        "description": "Retrieves message history for a chat session from the Spark messaging center.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "The chat session ID"},
                "limit": {"type": "integer", "description": "Max messages to return", "default": 50},
                "offset": {"type": "integer", "description": "Number of messages to skip", "default": 0}
            },
            "required": ["session_id"]
        }
    }
]

def handle_json_rpc(line):
    try:
        req = json.loads(line)
    except Exception:
        return

    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})

    if method == "initialize":
        response = {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "spark-desktop-companion",
                    "version": "2.0.0"
                }
            }
        }
        send_response(response)
        return

    if method == "notifications/initialized":
        return

    if method == "tools/list":
        response = {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": TOOLS_LIST
            }
        }
        send_response(response)
        return

    if method == "tools/call":
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        if tool_name == "spark_notify":
            wait = arguments.get("wait_for_user", False)
            endpoint = "/api/notify?wait=true" if wait else "/api/notify"
            payload = {
                "title": arguments.get("title", "Attention"),
                "message": arguments.get("message", ""),
                "agent": arguments.get("agent", "spark"),
                "state": arguments.get("state", "waiting"),
                "actions": arguments.get("actions", ["Approve", "Reject"]),
                "timeout": arguments.get("timeout", 60),
                "sound": True
            }
            res = send_spark_request(endpoint, payload)
            user_choice = res.get("action") if wait else "dispatched"
            send_tool_result(req_id, f"Notification sent to Spark Desktop. User selection: {user_choice}")
            return

        elif tool_name == "spark_set_state":
            payload = {
                "state": arguments.get("state", "working"),
                "agent": arguments.get("agent", "agent"),
                "message": arguments.get("message", "")
            }
            res = send_spark_request("/api/state", payload)
            send_tool_result(req_id, f"Spark state updated: {payload['state']} ({res.get('message', '')})")
            return

        elif tool_name == "spark_switch_character":
            char_name = arguments.get("character", "capy")
            res = send_spark_request("/api/skin", {"skin": char_name})
            send_tool_result(req_id, f"Switched character skin to: {char_name}")
            return

        elif tool_name == "spark_get_status":
            res = send_spark_request("/api/status", None, method="GET")
            send_tool_result(req_id, f"Spark Status: {json.dumps(res, indent=2)}")
            return

        elif tool_name == "spark_receive_prompt":
            agent = arguments.get("agent_name", "all")
            auto_ack = arguments.get("auto_ack", True)
            res = send_spark_request(f"/api/prompts?agent={agent}", None, method="GET")
            prompts = res.get("prompts", [])
            
            if auto_ack and prompts:
                for p in prompts:
                    send_spark_request("/api/prompts/ack", {"id": p["id"], "agent": agent})
                    
            send_tool_result(req_id, json.dumps({
                "agent": agent,
                "count": len(prompts),
                "prompts": prompts
            }, indent=2))
            return

        elif tool_name == "spark_dispatch_prompt":
            target = arguments.get("target_agent", "all")
            prompt = arguments.get("prompt", "")
            res = send_spark_request("/api/prompt", {"targetAgent": target, "prompt": prompt})
            send_tool_result(req_id, f"Prompt successfully queued for {target.upper()}: {prompt}")
            return

        elif tool_name == "spark_chat_create_session":
            agent = arguments.get("agent", "spark")
            title = arguments.get("title", "New Conversation")
            res = send_spark_request("/api/chat/session", {"agent": agent, "title": title})
            if res and res.get("ok"):
                send_tool_result(req_id, f"Chat session created: {json.dumps(res.get('session', {}))}")
            else:
                send_tool_result(req_id, f"Failed to create session: {json.dumps(res)}")
            return

        elif tool_name == "spark_chat_reply":
            session_id = arguments.get("session_id", "")
            content = arguments.get("content", "")
            agent = arguments.get("agent", "spark")
            res = send_spark_request("/api/chat/reply", {
                "session_id": session_id,
                "content": content,
                "agent": agent
            })
            if res and res.get("ok"):
                send_tool_result(req_id, f"Reply sent to session {session_id}")
            else:
                send_tool_result(req_id, f"Failed to send reply: {json.dumps(res)}")
            return

        elif tool_name == "spark_chat_stream_chunk":
            session_id = arguments.get("session_id", "")
            stream_id = arguments.get("stream_id", "")
            chunk = arguments.get("chunk", "")
            done = arguments.get("done", False)
            full_content = arguments.get("full_content", "")
            agent = arguments.get("agent", "spark")
            res = send_spark_request("/api/chat/stream", {
                "session_id": session_id,
                "stream_id": stream_id,
                "chunk": chunk,
                "done": done,
                "full_content": full_content,
                "agent": agent
            })
            send_tool_result(req_id, f"Stream chunk sent (done={done})")
            return

        elif tool_name == "spark_chat_set_typing":
            session_id = arguments.get("session_id", "")
            agent = arguments.get("agent", "spark")
            is_typing = arguments.get("is_typing", True)
            res = send_spark_request("/api/chat/typing", {
                "session_id": session_id,
                "agent": agent,
                "is_typing": is_typing
            })
            send_tool_result(req_id, f"Typing indicator set to {is_typing}")
            return

        elif tool_name == "spark_chat_get_messages":
            session_id = arguments.get("session_id", "")
            limit = arguments.get("limit", 50)
            offset = arguments.get("offset", 0)
            res = send_spark_request(f"/api/chat/messages?session={session_id}&limit={limit}&offset={offset}", None, method="GET")
            if res and res.get("ok"):
                messages = res.get("messages", [])
                send_tool_result(req_id, json.dumps({
                    "session_id": session_id,
                    "count": len(messages),
                    "messages": messages
                }, indent=2))
            else:
                send_tool_result(req_id, f"Failed to get messages: {json.dumps(res)}")
            return

        else:
            send_error(req_id, -32601, f"Unknown tool: {tool_name}")
            return

    send_error(req_id, -32601, f"Method not found: {method}")

def send_tool_result(req_id, text_content):
    response = {
        "jsonrpc": "2.0",
        "id": req_id,
        "result": {
            "content": [
                {
                    "type": "text",
                    "text": str(text_content)
                }
            ]
        }
    }
    send_response(response)

def send_error(req_id, code, message):
    response = {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {
            "code": code,
            "message": message
        }
    }
    send_response(response)

def send_response(resp_dict):
    out = json.dumps(resp_dict)
    sys.stdout.write(out + "\n")
    sys.stdout.flush()

def main():
    for line in sys.stdin:
        if line.strip():
            handle_json_rpc(line.strip())

if __name__ == "__main__":
    main()
