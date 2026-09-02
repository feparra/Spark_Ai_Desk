# 🧪 Guía de Pruebas Manuales — Spark Desktop v2.0.0

## Iniciar Spark

```bash
# Opción 1: Doble clic en start_spark.bat
# Opción 2: Desde terminal:
wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"
```

Espera ~10 segundos. Verifica que el servidor responde:
```bash
curl http://localhost:7890/api/status
# Debe responder: {"ok":true,"data":{"state":"calm",...}}
```

---

## Spec 1: Chat Session Management

### 1.1 Crear sesión
```bash
curl -X POST http://localhost:7890/api/chat/session \
  -H "Content-Type: application/json" \
  -d '{"agent":"hermes","title":"Mi primera conversación"}'
```
**Esperado:** `{"ok":true,"session":{"id":"sess_...","agent":"hermes",...}}`
**Guarda el `session.id`** para los siguientes tests.

### 1.2 Listar sesiones
```bash
curl http://localhost:7890/api/chat/sessions
```
**Esperado:** `{"ok":true,"sessions":[{...}]}` — debe mostrar la sesión creada.

### 1.3 Switch session (desde la UI)
1. Click en el avatar de Spark → se abre el panel de chat
2. Click en ☰ (botón de sessions en el header del chat)
3. Click en otra sesión → carga su historial

### 1.4 Eliminar sesión
```bash
curl -X POST http://localhost:7890/api/chat/delete-session \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>"}'
```
**Esperado:** `{"ok":true}`

---

## Spec 2: Chat Messaging

### 2.1 Enviar mensaje (usuario)
```bash
curl -X POST http://localhost:7890/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","role":"user","content":"Hola, ¿cómo estás?","agent":"hermes"}'
```
**Esperado:** `{"ok":true,"message":{...}}`
**Visual:** El mensaje aparece en el panel de chat como burbuja azul (derecha).

### 2.2 Responder (agente)
```bash
curl -X POST http://localhost:7890/api/chat/reply \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","content":"¡Hola! Estoy funcionando perfectamente.","agent":"hermes"}'
```
**Esperado:** `{"ok":true,"message":{...}}`
**Visual:** El mensaje aparece como burbuja translúcida (izquierda) con badge "hermes".

### 2.3 Streaming de respuesta (token por token)
```bash
# Chunk 1
curl -X POST http://localhost:7890/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","stream_id":"test1","chunk":"Generando","done":false}'

# Chunk 2
curl -X POST http://localhost:7890/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","stream_id":"test1","chunk":" respuesta...","done":false}'

# Chunk final
curl -X POST http://localhost:7890/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","stream_id":"test1","chunk":"","done":true,"full_content":"Generando respuesta..."}'
```
**Visual:** El texto aparece progresivamente en una sola burbuja, token por token.

### 2.4 Indicador de "escribiendo..."
```bash
# Activar
curl -X POST http://localhost:7890/api/chat/typing \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","is_typing":true,"agent":"hermes"}'

# Desactivar
curl -X POST http://localhost:7890/api/chat/typing \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID>","is_typing":false,"agent":"hermes"}'
```
**Visual:** Aparecen 3 puntos animados con texto "hermes is typing..." / desaparece.

### 2.5 Obtener historial
```bash
curl "http://localhost:7890/api/chat/messages?session=<SESSION_ID>&limit=50"
```
**Esperado:** `{"ok":true,"messages":[...]}` — todos los mensajes enviados.

### 2.6 Persistencia tras restart
1. Enviar varios mensajes
2. Cerrar Spark (`stop_spark.bat`)
3. Reiniciar Spark
4. Abrir el panel de chat → click en ☰ → la sesión debe seguir ahí con su historial

---

## Spec 3: Hermes Integration

### 3.1 Conexión con Hermes API Server
```bash
# Primero iniciar Hermes proxy en otra terminal:
hermes proxy

# Luego iniciar Spark con HERMES_API_URL:
set HERMES_API_URL=http://localhost:8000
wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"
```
**Test:** Abrir chat, seleccionar "Hermes" en el dropdown, escribir mensaje.
**Esperado:** La respuesta de Hermes aparece streaming en el chat.

### 3.2 Webhook receiver
```bash
# Task started
curl -X POST http://localhost:7890/api/hermes-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"task_started","data":{"agent":"hermes","message":"Building project..."}}'

# Task completed
curl -X POST http://localhost:7890/api/hermes-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"task_completed","data":{"agent":"hermes","title":"Build Complete","message":"All tests passed!"}}'

# Message response
curl -X POST http://localhost:7890/api/hermes-webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"message_response","data":{"session_id":"<SESSION_ID>","content":"Response from webhook","agent":"hermes"}}'
```
**Visual:** `task_started` → avatar cambia a "working". `task_completed` → speech bubble con sonido de éxito.

### 3.3 Degradación graceful (sin Hermes)
```bash
# Sin HERMES_API_URL set, enviar mensaje desde chat:
# El mensaje se guarda y se dispatcha via /api/prompt (MCP polling)
# No hay error — simplemente no hay respuesta streaming automática
```

---

## Spec 4: Remote Connectivity

### 4.1 Auth con token
```bash
# Iniciar Spark con token:
set SPARK_AUTH_TOKEN=my-secret-123
wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"

# Request SIN token → 401
curl http://localhost:7890/api/status
# Esperado: {"ok":false,"error":"Unauthorized"}

# Request CON token → 200
curl -H "Authorization: Bearer my-secret-123" http://localhost:7890/api/status
# Esperado: {"ok":true,...}

# Request con token en query param → 200
curl "http://localhost:7890/api/status?token=my-secret-123"
```

### 4.2 CORS configurable
```bash
set SPARK_CORS_ORIGIN=https://myapp.com
# Solo requests desde https://myapp.com serán aceptados via CORS
```

### 4.3 Relay server (VPS)
```bash
# En el VPS:
node "C:\Users\FERNA\Documents\Spark_Desktop\src\relay\sparkRelay.js" --port 7891 --token relay-secret

# Health check:
curl http://VPS_IP:7891/health
# Esperado: {"ok":true,"sparkClients":0,"agentClients":0,"uptime":...}

# En la PC (Spark):
set SPARK_RELAY_URL=ws://VPS_IP:7891
set SPARK_AUTH_TOKEN=relay-secret
wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"
```
**Esperado:** Spark se conecta al relay. Los mensajes del agente en el VPS llegan a Spark.

### 4.4 Reconnection con backoff
1. Conectar Spark al relay
2. Detener el relay (Ctrl+C en el VPS)
3. **Visual:** Spark muestra "Reconnecting..." en la status pill
4. Reiniciar el relay
5. **Esperado:** Spark se reconecta automáticamente (5s → 10s → 20s → 30s backoff)

---

## Spec 5: Lite Mode (8GB RAM)

### 5.1 Auto-detección
```bash
# Spark detecta automáticamente si la PC tiene ≤8GB RAM
# Verificar en los logs del servidor:
# "⚡ Lite mode detected (RAM: 7.8GB) — applying optimizations"
```

### 5.2 Forzar modo lite
```bash
set SPARK_LITE=1
wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"
```
**Visual:**
- Sin `backdrop-filter: blur()` — fondos sólidos
- Sin animaciones de pulseDot, shadowFloat, bubblePop
- Radar escanea cada 30s (en vez de 12s)
- Wander engine desactivado
- Caché de GPU desactivada

### 5.3 Fuentes locales
```bash
# Verificar que no hay requests a Google Fonts:
# Abrir DevTools (F12) → Network tab → filtrar "font"
# No debe haber requests a fonts.googleapis.com o fonts.gstatic.com
```

---

## Spec 6: MCP Chat Tools

### 6.1 Listar tools (debe haber 11)
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_mcp_server.py"
```
**Esperado:** 11 tools en la lista (6 originales + 5 nuevas: spark_chat_create_session, spark_chat_reply, spark_chat_stream_chunk, spark_chat_set_typing, spark_chat_get_messages).

### 6.2 Crear sesión via MCP
```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"spark_chat_create_session","arguments":{"agent":"hermes","title":"MCP Test"}}}' | python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_mcp_server.py"
```

### 6.3 Responder via MCP
```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"spark_chat_reply","arguments":{"session_id":"<SESSION_ID>","content":"Reply from MCP!","agent":"hermes"}}}' | python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_mcp_server.py"
```

### 6.4 Streaming via MCP
```bash
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"spark_chat_stream_chunk","arguments":{"session_id":"<SESSION_ID>","stream_id":"mcp1","chunk":"Hello from MCP stream","done":true,"full_content":"Hello from MCP stream"}}}' | python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_mcp_server.py"
```

---

## Spec 7: Python CLI Commands

### 7.1 Crear sesión
```bash
python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_notify.py" --chat-create --agent hermes --title "CLI Test"
```

### 7.2 Responder
```bash
python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_notify.py" --chat-reply "Hello from CLI!" --session <SESSION_ID> --agent hermes
```

### 7.3 Ver historial
```bash
python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\spark_notify.py" --chat-history --session <SESSION_ID>
```

---

## Spec 8: Backward Compatibility

### 8.1 Notificaciones existentes (Clippy)
```bash
# Estado
curl -X POST http://localhost:7890/api/state \
  -H "Content-Type: application/json" \
  -d '{"state":"working","agent":"claude","message":"Coding..."}'

# Notificación interactiva
curl -X POST "http://localhost:7890/api/notify?wait=true" \
  -H "Content-Type: application/json" \
  -d '{"agent":"claude","state":"waiting","title":"Authorize","message":"Run tests?","actions":["Approve","Reject"]}'

# Mensaje toast
curl -X POST http://localhost:7890/api/message \
  -H "Content-Type: application/json" \
  -d '{"agent":"hermes","title":"Info","message":"Build completed","timeout":8}'
```
**Visual:** Todos deben funcionar igual que antes — speech bubbles, sonidos, botones.

### 8.2 Prompt queue (MCP polling)
```bash
# Dispatch prompt
curl -X POST http://localhost:7890/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"targetAgent":"hermes","prompt":"What is 2+2?"}'

# Fetch prompts
curl "http://localhost:7890/api/prompts?agent=hermes"
```

---

## Spec 9: Platform Adapter (Skeleton)

### 9.1 Probar adapter standalone
```bash
python "C:\Users\FERNA\Documents\Spark_Desktop\scripts\hermes_spark_adapter.py" --spark-url http://localhost:7890 --agent-name hermes --poll-interval 5
```
**Esperado:** El adapter hace polling de prompts cada 5s. Si hay prompts, los imprime.

---

## Checklist Final

| # | Test | Método | Status |
|---|------|--------|--------|
| 1 | Crear sesión | curl /api/chat/session | ⬜ |
| 2 | Listar sesiones | curl /api/chat/sessions | ⬜ |
| 3 | Enviar mensaje | curl /api/chat/send | ⬜ |
| 4 | Responder | curl /api/chat/reply | ⬜ |
| 5 | Streaming | curl /api/chat/stream (3 chunks) | ⬜ |
| 6 | Typing indicator | curl /api/chat/typing | ⬜ |
| 7 | Historial | curl /api/chat/messages | ⬜ |
| 8 | Eliminar sesión | curl /api/chat/delete-session | ⬜ |
| 9 | Webhook Hermes | curl /api/hermes-webhook | ⬜ |
| 10 | Persistencia | restart + verificar historial | ⬜ |
| 11 | Lite mode | SPARK_LITE=1 → sin blur | ⬜ |
| 12 | Auth token | SPARK_AUTH_TOKEN → 401 sin token | ⬜ |
| 13 | MCP tools | echo JSON-RPC → 11 tools | ⬜ |
| 14 | CLI chat | python spark_notify.py --chat-create | ⬜ |
| 15 | Backward compat | /api/state, /api/notify, /api/message | ⬜ |
| 16 | Relay server | node sparkRelay.js --health | ⬜ |
| 17 | Platform adapter | python hermes_spark_adapter.py | ⬜ |
| 18 | Chat UI | Click avatar → panel abre | ⬜ |
| 19 | Session switch | Click ☰ → cambiar sesión | ⬜ |
| 20 | Markdown | Enviar mensaje con **bold** y `code` | ⬜ |