# Spec: chat-session-management

> Delta spec for the spark-messaging-center change.
> Covers session creation, listing, deletion, and switching.

---

## ADDED Requirements

### Requirement: Session Creation

The system MUST provide the ability to create a new chat session. Each session MUST have a unique identifier, an associated agent name, a human-readable title, a creation timestamp, and a last-message timestamp. Sessions MUST persist across application restarts via SQLite.

**Scenario: Create a new session with valid parameters**

- **Given** the Spark Desktop HTTP server is running on port 7890
- **When** a client sends `POST /api/chat/session` with a JSON body containing `agent` and `title`
- **Then** the system MUST create a session with a unique ID, store it in SQLite, and return `201 Created` with the full session object including `id`, `agent`, `title`, `created_at`, and `last_message_at`.

**Scenario: Create a session with missing required fields**

- **Given** the Spark Desktop HTTP server is running
- **When** a client sends `POST /api/chat/session` with a JSON body missing the `agent` field
- **Then** the system MUST return `400 Bad Request` with an error message indicating the missing field, and MUST NOT create a session.

**Scenario: Session persists across restart**

- **Given** a chat session exists in the SQLite database
- **When** the application is restarted and the server initializes
- **Then** the session MUST remain retrievable via `GET /api/chat/sessions` with all original fields intact.

---

### Requirement: Session Listing

The system MUST provide the ability to list all chat sessions. The list MUST be ordered by `last_message_at` timestamp descending (most recently active first). The list MUST be limited to at most 50 sessions per response.

**Scenario: List sessions ordered by last activity**

- **Given** three sessions exist with different `last_message_at` timestamps
- **When** a client sends `GET /api/chat/sessions`
- **Then** the system MUST return `200 OK` with a JSON array of sessions ordered by `last_message_at` descending, each containing `id`, `agent`, `title`, `created_at`, and `last_message_at`.

**Scenario: List sessions when none exist**

- **Given** no chat sessions exist in the database
- **When** a client sends `GET /api/chat/sessions`
- **Then** the system MUST return `200 OK` with an empty JSON array `[]`.

---

### Requirement: Session Deletion

The system MUST provide the ability to delete a chat session. Deleting a session MUST cascade-delete all messages belonging to that session. The system MUST NOT delete a session that does not exist without returning an error.

**Scenario: Delete an existing session with messages**

- **Given** a session exists with 5 associated messages
- **When** a client sends `POST /api/chat/delete-session` with the session ID
- **Then** the system MUST delete the session and all 5 messages, and return `200 OK` with a confirmation object.

**Scenario: Delete a non-existent session**

- **Given** no session exists with ID `abc123`
- **When** a client sends `POST /api/chat/delete-session` with `{"id": "abc123"}`
- **Then** the system MUST return `404 Not Found` with an error message, and MUST NOT modify any existing data.

---

### Requirement: Session Switching

The system MUST allow the UI to switch the active session displayed in the chat panel. When a session is switched, the system MUST load the message history for the newly active session and clear any in-progress streaming state from the previous session.

**Scenario: Switch to a session with existing history**

- **Given** the chat panel is displaying session A and session B has 10 messages
- **When** the user clicks session B in the sessions list
- **Then** the UI MUST request and render session B's message history and MUST mark session B as the active session.

**Scenario: Switch away from an active streaming session**

- **Given** the chat panel is displaying session A and an agent is streaming a response (stream in progress)
- **When** the user switches to session B
- **Then** the UI MUST stop rendering the in-progress stream for session A and MUST load session B's history. The system MAY continue receiving stream chunks for session A in the background.