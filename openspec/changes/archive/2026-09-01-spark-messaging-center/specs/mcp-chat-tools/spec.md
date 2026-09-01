# Specification: mcp-chat-tools

> Delta spec for the `mcp-chat-tools` capability of the `spark-messaging-center` change.
> RFC 2119 keywords (MUST, SHOULD, MAY) are used throughout. Scenarios use Given/When/Then.

---

## ADDED Requirements

### Requirement: spark_chat_create_session Tool

The MCP server MUST expose a `spark_chat_create_session` tool that creates a
new chat session. The tool MUST accept an `agent` parameter (the agent name)
and an optional `title` parameter. The tool MUST call the corresponding HTTP
endpoint on the local Spark server and return a JSON result containing the
newly created session ID.

#### Scenario: Create session successfully

- **Given** the Spark MCP server is running and the local Spark HTTP server is
  reachable on port 7890
- **When** an MCP client calls `spark_chat_create_session` with `agent` set to
  `"hermes"` and `title` set to `"Project Discussion"`
- **Then** the tool MUST send a POST request to `/api/chat/session` on
  localhost:7890
- **And** the tool MUST return a JSON result containing a `session_id` field
  with a non-empty value
- **And** the tool MUST return a `success: true` field

#### Scenario: Missing required agent parameter

- **Given** the Spark MCP server is running
- **When** an MCP client calls `spark_chat_create_session` without the `agent`
  parameter
- **Then** the tool MUST return an error result indicating the `agent` parameter
  is required
- **And** the tool MUST NOT send any HTTP request to the Spark server

---

### Requirement: spark_chat_reply Tool

The MCP server MUST expose a `spark_chat_reply` tool that sends a complete
reply message to a chat session. The tool MUST accept `session_id` and
`content` parameters and an optional `role` parameter (defaulting to `agent`).
The tool MUST call the corresponding HTTP endpoint and return a JSON result
confirming the message was stored and broadcast.

#### Scenario: Reply message successfully

- **Given** a chat session exists with ID `sess-123`
- **When** an MCP client calls `spark_chat_reply` with `session_id` set to
  `"sess-123"` and `content` set to `"Hello! How can I help?"`
- **Then** the tool MUST send a POST request to `/api/chat/reply` on
  localhost:7890
- **And** the tool MUST return a JSON result with `success: true`
- **And** the message MUST be persisted to the message store with the specified
  content

#### Scenario: Reply to non-existent session

- **Given** no chat session exists with ID `sess-999`
- **When** an MCP client calls `spark_chat_reply` with `session_id` set to
  `"sess-999"` and `content` set to `"Hello"`
- **Then** the tool MUST return an error result indicating the session was not
  found
- **And** the tool MUST NOT create a new message

#### Scenario: Missing content parameter

- **Given** a chat session exists
- **When** an MCP client calls `spark_chat_reply` with `session_id` but without
  the `content` parameter
- **Then** the tool MUST return an error result indicating the `content`
  parameter is required

---

### Requirement: spark_chat_stream_chunk Tool

The MCP server MUST expose a `spark_chat_stream_chunk` tool that sends a
streaming chunk to a chat session for progressive text rendering. The tool MUST
accept `session_id`, `stream_id`, `content`, and `done` parameters. When
`done` is `true`, the tool MUST signal the Spark server to finalize the stream,
persist the full assembled message, and stop the typing indicator.

#### Scenario: Send intermediate streaming chunk

- **Given** a chat session exists and a stream with ID `stream-1` is in progress
- **When** an MCP client calls `spark_chat_stream_chunk` with `session_id`,
  `stream_id` set to `"stream-1"`, `content` set to `"Hello "`, and `done` set
  to `false`
- **Then** the tool MUST send a POST request to `/api/chat/stream` on
  localhost:7890
- **And** the Spark server MUST broadcast a `chat_stream` event with the partial
  content
- **And** the tool MUST return a JSON result with `success: true`

#### Scenario: Final chunk with done=true finalizes the stream

- **Given** a chat session exists and a stream with ID `stream-1` has received
  one or more intermediate chunks
- **When** an MCP client calls `spark_chat_stream_chunk` with `done` set to
  `true` and `content` set to the final partial text
- **Then** the tool MUST send a POST request to `/api/chat/stream` with
  `done: true`
- **And** the Spark server MUST persist the full assembled message to the
  message store with role `agent`
- **And** the Spark server MUST broadcast a final `chat_stream` event with
  `done: true`
- **And** the Spark server MUST stop the typing indicator for that session
- **And** the tool MUST return a JSON result with `success: true` and the
  persisted message ID

#### Scenario: Stream chunk to invalid session

- **Given** no chat session exists with ID `sess-404`
- **When** an MCP client calls `spark_chat_stream_chunk` with `session_id` set
  to `"sess-404"`
- **Then** the tool MUST return an error result indicating the session was not
  found
- **And** the Spark server MUST NOT broadcast any stream event

---

### Requirement: spark_chat_set_typing Tool

The MCP server MUST expose a `spark_chat_set_typing` tool that toggles the
typing indicator for a chat session. The tool MUST accept `session_id` and
`typing` (boolean) parameters. The tool MUST call the corresponding HTTP
endpoint and return a JSON result confirming the typing state was broadcast.

#### Scenario: Enable typing indicator

- **Given** a chat session exists with ID `sess-123`
- **When** an MCP client calls `spark_chat_set_typing` with `session_id` set to
  `"sess-123"` and `typing` set to `true`
- **Then** the tool MUST send a POST request to `/api/chat/typing` on
  localhost:7890
- **And** the Spark server MUST broadcast a `chat_typing` event with
  `typing: true` to all connected WebSocket clients
- **And** the tool MUST return a JSON result with `success: true`

#### Scenario: Missing typing parameter

- **Given** a chat session exists
- **When** an MCP client calls `spark_chat_set_typing` with `session_id` but
  without the `typing` parameter
- **Then** the tool MUST return an error result indicating the `typing`
  parameter is required

---

### Requirement: spark_chat_get_messages Tool

The MCP server MUST expose a `spark_chat_get_messages` tool that retrieves
message history for a chat session. The tool MUST accept a `session_id`
parameter and optional `limit` and `offset` parameters for pagination. The tool
MUST call the corresponding HTTP endpoint and return a JSON array of messages.

#### Scenario: Retrieve messages successfully

- **Given** a chat session exists with ID `sess-123` and contains 10 messages
- **When** an MCP client calls `spark_chat_get_messages` with `session_id` set
  to `"sess-123"` and `limit` set to `5`
- **Then** the tool MUST send a GET request to `/api/chat/messages` on
  localhost:7890 with query parameters `session=sess-123` and `limit=5`
- **And** the tool MUST return a JSON array containing up to 5 message objects
- **And** each message object MUST contain `role`, `content`, and `timestamp`
  fields

#### Scenario: Retrieve messages for non-existent session

- **Given** no chat session exists with ID `sess-404`
- **When** an MCP client calls `spark_chat_get_messages` with `session_id` set
  to `"sess-404"`
- **Then** the tool MUST return an error result indicating the session was not
  found

#### Scenario: Missing session_id parameter

- **Given** the Spark MCP server is running
- **When** an MCP client calls `spark_chat_get_messages` without the
  `session_id` parameter
- **Then** the tool MUST return an error result indicating the `session_id`
  parameter is required
- **And** the tool MUST NOT send any HTTP request to the Spark server