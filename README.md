# ⚡ Spark AI - Desktop Companion ("AI Clippy")

**Spark AI** es un asistente de escritorio persistente, flotante (*Always-On-Top*) y transparente que actúa como el avatar visual y centro de notificaciones interactivo para tus agentes de Inteligencia Artificial (**Antigravity**, **Claude**, **Hermes**, **OpenClaw**, **Codex**, etc.).

---

## ✨ Características Principales

- 🪟 **Ventana Transparente e Inmersiva**: Flota sobre cualquier editor (VS Code, Cursor, Antigravity IDE), navegador o terminal sin bordes y se puede arrastrar libremente por la pantalla.
- 💬 **Bocadillos de Diálogo Interactivos estilo Clippy**: Cuando un agente necesita autorización (ej. ejecutar comandos de terminal o modificar archivos clave), Spark "toca el cristal" (*Knock Knock!*) con un sonido retro y muestra botones de aprobación instantánea (`Aprobar`, `Rechazar`).
- 🎨 **Identidad Visual de Agentes**: Temas de color dinámicos según el agente que interactúa:
  - 🟠 **Claude**
  - 🟣 **Antigravity**
  - 🔴 **Hermes**
  - 🟢 **OpenClaw**
  - 🔵 **Spark**
- 🔊 **Motor de Sonido Procedural**: Efectos de sonido suaves y agradables (*Knock Knock*, *Chime Success*, *Pop*, *Error Alert*) sintetizados con Web Audio API (cero dependencias externas de audio).
- 🔌 **Hub de API Local (`http://localhost:7890`)**: Cualquier script de Python, CLI, extensión o agente puede interactuar con Spark mediante llamadas HTTP o WebSockets.
- 📌 **System Tray en Windows**: Menú contextual en la barra de tareas para ocultar/mostrar, restablecer posición o probar notificaciones.

---

## 🚀 Cómo Iniciar Spark

### Opción 1: Con el lanzador directo
Haz doble clic en:
`start_spark.bat`

### Opción 2: Desde la terminal
```bash
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
"C:\Users\ferna\.spark_desktop_runtime\node_modules\.bin\electron.cmd" "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\src\main.js"
```

---

## 🧪 Cómo Integrar con tus Agentes

### 🐍 Desde Python (`scripts/spark_notify.py`)
```bash
# Cambiar estado
python scripts/spark_notify.py --agent claude --state working --message "Generando tests unitarios..."

# Pedir confirmación interactiva (bloquea hasta que el usuario pulse un botón)
python scripts/spark_notify.py --agent antigravity --state waiting --title "Autorización" --message "¿Deseas desplegar a producción?" --actions "Aprobar" "Cancelar" --wait
```

### 🌐 Vía API HTTP (cURL, fetch, requests)
#### 1. Actualizar estado:
```bash
curl -X POST http://localhost:7890/api/state \
  -H "Content-Type: application/json" \
  -d '{"state": "working", "agent": "claude", "message": "Compilando proyecto..."}'
```

#### 2. Enviar notificación con confirmación:
```bash
curl -X POST "http://localhost:7890/api/notify?wait=true" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "hermes",
    "state": "waiting",
    "title": "Hermes requiere autorización",
    "message": "¿Ejecutar git push origin main?",
    "actions": ["Aprobar", "Rechazar"],
    "sound": true
  }'
```

---

## 📁 Estructura del Proyecto

```
Spark_Desktop/
├── assets/
│   └── gifs/               # Animaciones GIF (calm, working, connecting, done, error)
├── src/
│   ├── main.js             # Proceso principal de Electron (Always-On-Top, Tray, IPC)
│   ├── preload.js          # Puente seguro contextBridge
│   ├── server.js           # Servidor local Express + WebSocket (puerto 7890)
│   └── renderer/
│       ├── index.html      # Estructura del avatar y bocadillo
│       ├── styles.css      # Estilos Glassmorphism y animaciones CSS
│       ├── audio.js        # Sintetizador procedural de efectos de sonido
│       └── app.js          # Lógica de renderizado y eventos
├── scripts/
│   ├── spark_notify.py     # Helper y CLI de Python para agentes
│   └── test_spark.js       # Script interactivo de prueba
├── start_spark.bat         # Lanzador rápido para Windows
└── README.md
```
