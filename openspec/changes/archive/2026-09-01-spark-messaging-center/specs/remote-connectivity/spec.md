# Specification: remote-connectivity

> Delta spec for the `remote-connectivity` capability of the `spark-messaging-center` change.
> RFC 2119 keywords (MUST, SHOULD, MAY) are used throughout. Scenarios use Given/When/Then.

---

## ADDED Requirements

### Requirement: API Token Authentication

The system MUST support token-based authentication for all HTTP and WebSocket
connections. When `SPARK_AUTH_TOKEN` is set, every incoming request MUST
include a valid Bearer token in the `Authorization` header or a `?token=`
query parameter. Requests without a valid token MUST receive HTTP 401. When
`SPARK_AUTH_TOKEN` is not set, authentication MUST be disabled and all
connections MUST be allowed.

#### Scenario: Request with valid Bearer token

- **Given** the `SPARK_AUTH_TOKEN` environment variable is set to a known value
- **When** a client sends an HTTP request with header
  `Authorization: Bearer <valid_token>`
- **Then** the system MUST process the request normally
- **And** the system MUST NOT return HTTP 401

#### Scenario: Request with missing token

- **Given** the `SPARK_AUTH_TOKEN` environment variable is set
- **When** a client sends an HTTP request without an `Authorization` header or
  `?token=` query parameter
- **Then** the system MUST return HTTP 401
- **And** the system MUST NOT process the request

#### Scenario: Request with invalid token

- **Given** the `SPARK_AUTH_TOKEN` environment variable is set to a known value
- **When** a client sends an HTTP request with `Authorization: Bearer
  <wrong_token>`
- **Then** the system MUST return HTTP 401
- **And** the system MUST NOT process the request

#### Scenario: Auth disabled in local mode

- **Given** the `SPARK_AUTH_TOKEN` environment variable is not set
- **When** a client sends an HTTP request without any token
- **Then** the system MUST process the request normally
- **And** the system MUST NOT return HTTP 401

---

### Requirement: Configurable CORS Origin

The system MUST support a configurable CORS origin. When a CORS origin is
configured, the system MUST only allow requests from that origin. When no CORS
origin is explicitly configured, the system MAY default to permissive (`*`)
behavior for local development.

#### Scenario: CORS allows configured origin

- **Given** the CORS origin is configured to `https://example.com`
- **When** a browser sends a cross-origin request with `Origin:
  https://example.com`
- **Then** the system MUST include `Access-Control-Allow-Origin:
  https://example.com` in the response headers
- **And** the system MUST process the request

#### Scenario: CORS rejects unconfigured origin

- **Given** the CORS origin is configured to `https://example.com`
- **When** a browser sends a cross-origin request with `Origin:
  https://malicious.site`
- **Then** the system MUST NOT include that origin in
  `Access-Control-Allow-Origin`
- **And** the browser MUST be prevented from reading the response

---

### Requirement: Relay Server Mode

The system MUST provide a relay server that CAN be deployed on a VPS to bridge
Spark Desktop and remote agents. The relay MUST accept WebSocket connections on
the `/spark` path (for Spark Desktop) and the `/agent` path (for remote
agents). The relay MUST validate authentication tokens on both paths. The relay
MUST bridge messages bidirectionally between connected Spark and agent clients.
The relay MUST expose a `GET /health` HTTP endpoint returning HTTP 200 when
operational.

#### Scenario: Relay bridges agent message to Spark

- **Given** a relay server is running on a VPS with `SPARK_AUTH_TOKEN` set
- **And** a Spark Desktop instance is connected to the relay at `/spark` with a
  valid token
- **When** a remote agent connects at `/agent` with a valid token and sends a
  chat message
- **Then** the relay MUST forward the message to the connected Spark Desktop
  instance
- **And** Spark Desktop MUST process the message as if it arrived locally

#### Scenario: Relay health check

- **Given** a relay server is running
- **When** a client sends `GET /health` to the relay
- **Then** the relay MUST return HTTP 200 with a JSON body indicating
  operational status

#### Scenario: Relay rejects unauthenticated connection

- **Given** a relay server is running with `SPARK_AUTH_TOKEN` set
- **When** a client attempts a WebSocket connection to `/spark` or `/agent`
  without a valid token
- **Then** the relay MUST reject the connection with an authentication error
- **And** the relay MUST NOT bridge any messages from that client

---

### Requirement: Relay Client Mode with Reconnection Backoff

The system MUST provide a relay client that connects Spark Desktop outbound to
a remote relay server. When connected, the client MUST forward all local
broadcast messages to the relay and MUST inject inbound relay messages into the
local broadcast pipeline. The client MUST implement exponential backoff
reconnection starting at 5 seconds and capped at 30 seconds maximum.

#### Scenario: Successful relay client connection

- **Given** a relay server is reachable at a configured URL
- **When** Spark Desktop starts with the relay client enabled
- **Then** the client MUST establish a WebSocket connection to the relay at the
  `/spark` path
- **And** the client MUST forward local `sparkServer.broadcast()` messages to
  the relay
- **And** the client MUST inject inbound relay messages into the local broadcast
  pipeline

#### Scenario: Relay reconnection with exponential backoff

- **Given** the relay client was connected but the relay server becomes
  unreachable
- **When** the WebSocket connection drops
- **Then** the client MUST attempt reconnection after an initial delay of 5
  seconds
- **And** each subsequent failed reconnection attempt MUST increase the delay
  exponentially
- **And** the delay MUST NOT exceed 30 seconds between attempts
- **And** when the relay becomes reachable again, the client MUST reconnect and
  resume forwarding