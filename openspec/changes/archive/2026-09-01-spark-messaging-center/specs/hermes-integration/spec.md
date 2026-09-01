# Specification: hermes-integration

> Delta spec for the `hermes-integration` capability of the `spark-messaging-center` change.
> RFC 2119 keywords (MUST, SHOULD, MAY) are used throughout. Scenarios use Given/When/Then.

---

## ADDED Requirements

### Requirement: Hermes API Chat Completion with SSE Streaming

The system MUST connect to a Hermes API Server using the OpenAI-compatible
`/v1/chat/completions` endpoint with `stream: true` and parse Server-Sent Event
(SSE) chunks. When a user sends a chat message and the Hermes adapter is
enabled, the system MUST forward the message to Hermes and stream the response
back progressively. The system MUST broadcast a `chat_typing` event when the
agent starts processing and MUST stop the typing indicator when the stream
completes or errors.

#### Scenario: Successful streaming chat completion

- **Given** the `HERMES_API_URL` environment variable is set to a reachable
  Hermes API Server and `HERMES_API_KEY` is configured
- **When** a user sends a message in a chat session
- **Then** the system forwards the message to `/v1/chat/completions` with
  `stream: true`
- **And** the system broadcasts a `chat_typing` event to all connected WebSocket
  clients
- **And** the system parses each SSE `data:` chunk and broadcasts a
  `chat_stream` event with the partial text
- **And** when the stream sends a final chunk with `finish_reason` set, the
  system broadcasts `chat_stream` with `done: true`
- **And** the system persists the full assembled message to the message store
  with role `agent`
- **And** the system stops the typing indicator

#### Scenario: SSE stream interrupted mid-response

- **Given** the system is actively streaming a response from Hermes
- **When** the HTTP connection drops before a `finish_reason` chunk is received
- **Then** the system MUST broadcast a `chat_stream` event with `done: true` and
  the partial text accumulated so far
- **And** the system MUST persist the partial message to the message store with
  role `agent`
- **And** the system MUST stop the typing indicator
- **And** the system SHOULD log the connection error without crashing

---

### Requirement: Webhook Event Receiver

The system MUST provide a webhook receiver endpoint at `POST /api/hermes-webhook`
that accepts JSON events from Hermes. The receiver MUST handle three event
types: `task_started`, `task_completed`, and `message_response`. For each event
type, the receiver MUST broadcast an appropriate chat message or notification to
all connected WebSocket clients.

#### Scenario: Message response webhook

- **Given** the webhook receiver endpoint is available
- **When** Hermes sends a POST request to `/api/hermes-webhook` with a JSON body
  containing `event: "message_response"`, a `session_id`, and a `content` field
- **Then** the system MUST persist the message to the message store with role
  `agent`
- **And** the system MUST broadcast a `chat_message` event to all connected
  WebSocket clients with the message content

#### Scenario: Task lifecycle webhook

- **Given** the webhook receiver endpoint is available
- **When** Hermes sends a POST request to `/api/hermes-webhook` with a JSON body
  containing `event: "task_started"` or `event: "task_completed"`
- **Then** the system MUST broadcast a notification event to all connected
  WebSocket clients
- **And** the system MUST return HTTP 200 with a JSON acknowledgement body

#### Scenario: Unknown webhook event type

- **Given** the webhook receiver endpoint is available
- **When** Hermes sends a POST request with an `event` field that is not one of
  `task_started`, `task_completed`, or `message_response`
- **Then** the system MUST return HTTP 200
- **And** the system SHOULD log the unknown event type
- **And** the system MUST NOT broadcast any chat message for unknown events

---

### Requirement: Graceful Degradation When Hermes Is Unavailable

The system MUST gracefully degrade when the Hermes API Server is not configured
or is unreachable. If `HERMES_API_URL` is not set, the Hermes adapter MUST
remain disabled and chat MUST fall back to MCP-based or HTTP-polling mode. If
the adapter is enabled but a connection error occurs, the system MUST display
an in-chat system message informing the user and MUST NOT crash.

#### Scenario: Hermes not configured — fallback to MCP mode

- **Given** the `HERMES_API_URL` environment variable is not set
- **When** a user sends a message in a chat session
- **Then** the system MUST NOT attempt any HTTP request to a Hermes API Server
- **And** the system MUST persist the user message to the message store
- **And** the system MUST broadcast the user message via WebSocket
- **And** the system MUST remain in MCP/polling mode where agents reply via
  MCP tools or HTTP endpoints

#### Scenario: Hermes configured but unreachable

- **Given** the `HERMES_API_URL` environment variable is set but the Hermes API
  Server is not running or refuses the connection
- **When** a user sends a message in a chat session
- **Then** the system MUST persist the user message to the message store
- **And** the system MUST insert a system message in the chat session indicating
  that the Hermes API is unavailable
- **And** the system MUST NOT crash or throw an unhandled exception
- **And** the system SHOULD retry subsequent messages normally