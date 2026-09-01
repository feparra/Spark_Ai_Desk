# Remote Setup Guide

Spark Desktop supports three remote connectivity scenarios for accessing the messaging center from outside your local machine.

## Overview

| Scenario | Use Case | Components |
|----------|----------|------------|
| VPS Relay | Remote access from anywhere | `sparkRelay.js` on VPS + `RelayClient` on desktop |
| Docker | Containerized deployment | Relay in Docker container |
| LAN Direct | Same network, no relay needed | Direct HTTP to Spark port |

---

## 1. VPS with Relay Server

The relay server acts as a bridge between your desktop Spark instance and remote agent adapters.

### Deploy the Relay Server

1. **Copy the relay files to your VPS:**
   ```bash
   scp -r src/relay/ user@vps:/opt/spark-relay/
   ```

2. **Install Node.js and ws on the VPS:**
   ```bash
   cd /opt/spark-relay
   npm install ws
   ```

3. **Create a config file:**
   ```bash
   cp relayConfig.example.json relayConfig.json
   # Edit relayConfig.json — set a strong token
   nano relayConfig.json
   ```

4. **Start the relay server:**
   ```bash
   node sparkRelay.js --config relayConfig.json
   # Or with CLI args:
   node sparkRelay.js --port 7891 --token YOUR_SECRET_TOKEN
   ```

5. **Verify health:**
   ```bash
   curl http://vps-ip:7891/health
   # {"ok":true,"sparkClients":0,"agentClients":0,"uptime":5,"port":7891}
   ```

### Configure Your Desktop Spark

Create `spark_config.json` in the project root:
```json
{
  "relay": {
    "enabled": true,
    "url": "ws://your-vps-ip:7891",
    "token": "YOUR_SECRET_TOKEN"
  },
  "auth": {
    "enabled": true,
    "token": "YOUR_SECRET_TOKEN"
  }
}
```

Or use environment variables:
```bash
export SPARK_RELAY_URL=ws://your-vps-ip:7891
export SPARK_AUTH_TOKEN=YOUR_SECRET_TOKEN
npm start
```

### Connect a Remote Agent Adapter

```bash
python scripts/hermes_spark_adapter.py \
  --spark-url http://vps-ip:7891 \
  --agent-name hermes \
  --auth-token YOUR_SECRET_TOKEN
```

> **Note:** The agent adapter connects directly to the relay server's `/agent` path via WebSocket in production. The `--spark-url` flag points to the relay's HTTP endpoint for polling. In the current skeleton, the adapter polls the Spark HTTP API directly.

### WebSocket Paths

| Path | Who Connects | Direction |
|------|-------------|-----------|
| `/spark` | Spark Desktop (via RelayClient) | Bidirectional |
| `/agent` | Remote agent adapters | Bidirectional |

### Echo Loop Prevention (F5)

Messages bridged through the relay are tagged with `_fromRelay: true`. The RelayClient checks this flag and does NOT re-forward messages that came from the relay back to the relay. This prevents infinite echo loops.

---

## 2. Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY src/relay/ ./relay/
RUN npm install ws
EXPOSE 7891
CMD ["node", "relay/sparkRelay.js", "--config", "relay/relayConfig.json"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  spark-relay:
    build: .
    ports:
      - "7891:7891"
    volumes:
      - ./relayConfig.json:/app/relay/relayConfig.json:ro
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

### Deploy

```bash
# Create relayConfig.json with your token
echo '{"port":7891,"token":"YOUR_SECRET_TOKEN","tls":false}' > relayConfig.json

docker compose up -d
docker compose logs -f
```

### Health Check

```bash
docker compose exec spark-relay curl http://localhost:7891/health
```

---

## 3. LAN Direct HTTP

For same-network access without a relay server, connect directly to the Spark Desktop HTTP/WebSocket port.

### Steps

1. **Find your desktop's LAN IP:**
   ```bash
   ipconfig  # Windows
   # e.g., 192.168.1.100
   ```

2. **Set auth token (recommended for LAN):**
   ```bash
   export SPARK_AUTH_TOKEN=YOUR_SECRET_TOKEN
   npm start
   ```

3. **Connect from another machine on the LAN:**
   ```bash
   python scripts/hermes_spark_adapter.py \
     --spark-url http://192.168.1.100:7890 \
     --agent-name hermes \
     --auth-token YOUR_SECRET_TOKEN
   ```

4. **WebSocket connection from browser/agent:**
   ```javascript
   const ws = new WebSocket('ws://192.168.1.100:7890?token=YOUR_SECRET_TOKEN');
   ```

---

## Authentication

### Token Setup

Generate a token:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Set it via environment variable or config file:

**Environment:**
```bash
export SPARK_AUTH_TOKEN=your_48_char_hex_token
```

**Config file (`spark_config.json`):**
```json
{
  "auth": {
    "enabled": true,
    "token": "your_48_char_hex_token"
  }
}
```

### How Auth Works

- **When token is unset:** Auth is disabled — all requests are allowed (local mode).
- **When token is set:**
  - HTTP requests must include `Authorization: Bearer <token>` header OR `?token=<token>` query param.
  - WebSocket connections must include `?token=<token>` in the connection URL.
  - Failed auth: HTTP returns `401 Unauthorized`, WebSocket closes with code `4001`.

---

## CORS Configuration

Control cross-origin access with the `SPARK_CORS_ORIGIN` environment variable:

```bash
# Allow all origins (default, backward compat)
export SPARK_CORS_ORIGIN=*

# Allow specific origin
export SPARK_CORS_ORIGIN=https://your-app.example.com

# Allow multiple origins (comma-separated in config)
```

In `spark_config.json`:
```json
{
  "cors": {
    "origin": "https://your-app.example.com"
  }
}
```

---

## TLS via Reverse Proxy

The relay server runs plain HTTP/WS. For TLS, use a reverse proxy:

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name relay.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:7891;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Caddy

```caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:7891
}
```

Then use `wss://relay.example.com` as the relay URL in your Spark config.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Relay connection refused | Check VPS firewall allows port 7891 |
| 401 Unauthorized | Verify token matches between relay and client |
| WebSocket echo loop | Ensure `_fromRelay` flag handling is intact (F5 fix) |
| CORS errors | Set `SPARK_CORS_ORIGIN` to match your client origin |
| Relay health check fails | Verify relay server is running: `curl http://vps:7891/health` |