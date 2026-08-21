#!/usr/bin/env python3
"""
⚡ Spark AI Python Helper & CLI
Permite a cualquier agente, script o terminal enviar notificaciones y cambiar el estado de Spark en el escritorio.

Uso rápido desde CLI:
  python spark_notify.py --state working --agent claude --message "Generando código..."
  python spark_notify.py --state waiting --agent antigravity --title "Autorización" --message "¿Ejecutar npm test?" --actions "Aprobar" "Rechazar" --wait
"""

import argparse
import sys
import json
import urllib.request
import urllib.error

# Forzar encoding UTF-8 en stdout de Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_PORT = 7890

def set_spark_state(state="calm", agent="spark", message="", port=DEFAULT_PORT):
    """Cambia el estado visual de Spark."""
    url = f"http://localhost:{port}/api/state"
    payload = {"state": state, "agent": agent, "message": message}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️ Error conectando con Spark Desktop en el puerto {port}: {e}", file=sys.stderr)
        return None

def notify_spark(agent="spark", state="waiting", title="Atención", message="", 
                 actions=None, timeout=60, wait_for_response=False, port=DEFAULT_PORT):
    """
    Muestra un bocadillo interactivo en Spark.
    Si wait_for_response es True, bloquea hasta que el usuario pulse un botón o expire el timeout.
    """
    if actions is None:
        actions = ["Aprobar", "Rechazar"]

    url = f"http://localhost:{port}/api/notify"
    if wait_for_response:
        url += "?wait=true"

    payload = {
        "agent": agent,
        "state": state,
        "title": title,
        "message": message,
        "actions": actions,
        "timeout": timeout,
        "sound": True
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        # Timeout un poco mayor al configurado para dar margen al long-polling
        req_timeout = timeout + 5 if wait_for_response else 5
        with urllib.request.urlopen(req, timeout=req_timeout) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            return res_json.get("action") if wait_for_response else res_json
    except Exception as e:
        print(f"⚠️ Error al enviar notificación a Spark: {e}", file=sys.stderr)
        return None

def main():
    parser = argparse.ArgumentParser(description="⚡ Spark AI Desktop CLI Notifier")
    parser.add_argument("--state", type=str, default="calm", help="Estado: calm, working, waiting, done, error, connecting")
    parser.add_argument("--agent", type=str, default="spark", help="Nombre del agente: claude, antigravity, hermes, openclaw, codex, etc.")
    parser.add_argument("--title", type=str, default="", help="Título para el bocadillo interactivo")
    parser.add_argument("--message", type=str, default="", help="Mensaje o descripción")
    parser.add_argument("--actions", nargs="+", default=None, help="Lista de acciones/botones (ej: Aprobar Rechazar)")
    parser.add_argument("--wait", action="store_true", help="Esperar a que el usuario pulse un botón")
    parser.add_argument("--timeout", type=int, default=60, help="Tiempo de espera en segundos")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Puerto del servidor de Spark")

    args = parser.parse_args()

    if args.title or args.actions or args.wait:
        # Modo notificación / interactivo
        action = notify_spark(
            agent=args.agent,
            state=args.state,
            title=args.title or f"Mensaje de {args.agent.capitalize()}",
            message=args.message,
            actions=args.actions or ["Aprobar", "Rechazar"],
            timeout=args.timeout,
            wait_for_response=args.wait,
            port=args.port
        )
        if args.wait:
            print(f"🎯 El usuario seleccionó: {action}")
            if action == "Aprobar" or action == "Sí" or action == "Yes":
                sys.exit(0)
            else:
                sys.exit(1)
    else:
        # Modo simple de actualización de estado
        res = set_spark_state(state=args.state, agent=args.agent, message=args.message, port=args.port)
        if res:
            print(f"✅ Estado de Spark actualizado: {args.state} ({args.agent})")

if __name__ == "__main__":
    main()
