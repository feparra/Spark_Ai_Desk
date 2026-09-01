# Spec: chat-messaging

> Delta spec for the spark-messaging-center change.
> Covers message sending, receiving, streaming responses, typing indicator, and message history retrieval.

---

## ADDED Requirements

### Requirement: Message Sending

The system MUST provide the ability to send a user message within a chat session. Messages MUST have a role (`user`, `agent`, or `system`), content, a timestamp, and optional metadata. The system MUST persist the message to SQLite and broadcast a `chat_message` WebSocket event to all connected clients.

**Scenario: Send a valid user message**

- **Given** a chat session with ID `s1` exists
- **When** a client sends `POST /api/chat/send` with `{"session": "s1", "role": "user", "content": "Hello"}`
- **Then** the system MUST persist the message to SQLite, broadcast `{"type": "chat_message", ...}` via WebSocket, and return `201 Created` with the stored message object including a generated `id` and `timestamp`.

**Scenario: Send a message with empty content**

- **Given** a chat session with ID `s1` exists
- **When** a client sends `POST /api/chat/send` with `{"session": "s1", "role": "user", "content": ""}`
- **Then** the system MUST return `400 Bad Request` with an error indicating content MUST not be empty, and MUST NOT persist or broadcast any message.

**Scenario: Send a message to a non-existent session**

- **Given** no session exists with ID `nonexistent`
- **When** a client sends `POST /api/chat/send` with `{"session": "nonexistent", "role": "user", "content": "Hello"}`
- **Then** the system MUST return `404 Not Found` with an error indicating the session was not found.

---

### Requirement: Message Receiving (Agent Reply)

The system MUST provide the ability for an agent to send a reply message to a chat session. The reply MUST be persisted to SQLite with role `agent` and broadcast via WebSocket as a `chat_message` event.

**Scenario: Agent sends a valid reply**

- **Given** a chat session with ID `s1` exists
- **When** a client sends `POST /api/chat/reply` with `{"session": "s1", "role": "agent", "content": "Hi there!", "agent": "hermes"}`
- **Then** the system MUST persist the message, update the session's `last_message_at` timestamp, broadcast `{"type": "chat_message", ...}` via WebSocket, and return `201 Created` with the stored message object.

**Scenario: Agent reply to a deleted session**

- **Given** session `s1` was previously deleted
- **When** a client sends `POST /api/chat/reply` with `{"session": "s1", "content": "Reply"}`
- **Then** the system MUST return `404 Not Found` and MUST NOT persist or broadcast the message.

---

### Requirement: Streaming Responses

The system MUST support streaming responses from agents. An agent MAY send partial chunks identified by a `stream_id`. The system MUST broadcast each chunk via WebSocket as a `chat_stream` event so the UI renders text progressively. When a stream completes (`done: true`), the system MUST persist the full assembled message to SQLite.

**Scenario: Stream partial chunks then complete**

- **Given** a chat session with ID `s1` exists
- **When** an agent sends `POST /api/chat/stream` with `{"session": "s1", "stream_id": "st1", "content": "Hello", "done": false}` followed by `{"session": "s1", "stream_id": "st1", "content": " world", "done": true}`
- **Then** the system MUST broadcast each chunk as `{"type": "chat_stream", ...}` via WebSocket, and on the final chunk MUST persist the full message (`"Hello world"`) with role `agent` to SQLite and broadcast a `chat_message` event.

**Scenario: Stream chunk for non-existent session**

- **Given** no session exists with ID `ghost`
- **When** an agent sends `POST /api/chat/stream` with `{"session": "ghost", "stream_id": "st1", "content": "text", "done": false}`
- **Then** the system MUST return `404 Not Found` and MUST NOT broadcast any chunk.

**Scenario: Stream interrupted without done flag**

- **Given** an agent has sent partial chunks with `stream_id` `st1` and `done: false`
- **When** no further chunks arrive for that `stream_id`
- **Then** the system MAY discard the incomplete stream after a timeout and SHOULD NOT persist a partial message to SQLite.

---

### Requirement: Typing Indicator

The system MUST provide a typing indicator that agents can toggle on or off. The system MUST broadcast a `chat_typing` WebSocket event when the indicator state changes.

**Scenario: Agent starts typing**

- **Given** a chat session with ID `s1` exists
- **When** a client sends `POST /api/chat/typing` with `{"session": "s1", "typing": true, "agent": "hermes"}`
- **Then** the system MUST broadcast `{"type": "chat_typing", "session": "s1", "typing": true, "agent": "hermes"}` via WebSocket.

**Scenario: Agent stops typing**

- **Given** the typing indicator is active for session `s1`
- **When** a client sends `POST /api/chat/typing` with `{"session": "s1", "typing": false}`
- **Then** the system MUST broadcast `{"type": "chat_typing", "session": "s1", "typing": false}` via WebSocket.

---

### Requirement: Message History Retrieval

The system MUST provide paginated message history retrieval for a given session. The system MUST support `limit` and `offset` query parameters for pagination. Messages MUST be returned in chronological order (oldest first).

**Scenario: Retrieve first page of messages**

- **Given** session `s1` has 75 messages
- **When** a client sends `GET /api/chat/messages?session=s1&limit=50&offset=0`
- **Then** the system MUST return `200 OK` with a JSON array of the 50 oldest messages in chronological order, each containing `id`, `session`, `role`, `content`, `timestamp`, and `metadata`.

**Scenario: Retrieve messages for a session with no history**

- **Given** session `s1` exists but has no messages
- **When** a client sends `GET /api/chat/messages?session=s1`
- **Then** the system MUST return `200 OK` with an empty JSON array `[]`.

**Scenario: Retrieve messages for a non-existent session**

- **Given** no session exists with ID `ghost`
- **When** a client sends `GET /api/chat/messages?session=ghost`
- **Then** the system MUST return `404 Not Found` with an error indicating the session was not found.