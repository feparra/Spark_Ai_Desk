# ⚡ Spark & Astro Integration Guide for Claude

When working on tasks in this workspace, you have access to **Spark AI Desktop Companion** running on `http://localhost:7890`.
You can control the companion's visual animations, speech bubbles, and interactive user approvals.

---

## 🚀 How Claude Can Control Spark

### 1. Python CLI (Recommended for Terminal / Agent Tools)
```bash
# Notify when starting a long task or writing code:
python "G:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state working --message "Claude está redactando la función..."

# Notify on completion:
python "G:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state done --title "¡Completado!" --message "Tests ejecutados con éxito ✨" --actions "Genial"

# Ask user for permission/confirmation (waits for user click):
python "G:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state waiting --title "Autorización" --message "¿Deseas ejecutar las migraciones en la base de datos?" --actions "Aprobar" "Cancelar" --wait

# Report an error:
python "G:\My Drive\04_Desarrollo_AI\Spark_Desktop\scripts\spark_notify.py" --agent claude --state error --title "Error" --message "Falló la conexión al endpoint"
```

---

### 2. Direct HTTP API (cURL / Fetch / REST)

- **Change State**: `POST http://localhost:7890/api/state`
  ```json
  { "state": "working", "agent": "claude", "message": "Procesando archivos..." }
  ```
- **Show Interactive Notification**: `POST http://localhost:7890/api/notify?wait=true`
  ```json
  {
    "agent": "claude",
    "state": "waiting",
    "title": "Aprobación Requerida",
    "message": "¿Autorizas modificar el archivo de configuración?",
    "actions": ["Aprobar", "Rechazar"],
    "sound": true
  }
  ```
- **Change Character Skin**: `POST http://localhost:7890/api/skin`
  ```json
  { "skin": "astro" }  // or "spark"
  ```
