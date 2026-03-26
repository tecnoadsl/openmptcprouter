"""OMR Build Server - API per compilare firmware personalizzati.

Compila firmware OpenMPTCProuter con customizzazioni Tecnoadsl:
- Agent MQTT preinstallato
- bird2 (OSPF)
- Config device preconfigurata
"""

import asyncio
import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from datetime import datetime

from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

BUILD_DIR = Path("/home/builder/openmptcprouter")
OUTPUT_DIR = Path("/home/builder/builds")
AGENT_TEMPLATE = Path("/home/builder/agent-template")

OUTPUT_DIR.mkdir(exist_ok=True)

# Target supportati
TARGETS = {
    "x86_64": {"name": "x86/64 (PC, Mini PC, VM)", "config": "config-x86_64", "image_suffix": "combined-ext4.img.gz"},
    "rpi4": {"name": "Raspberry Pi 4", "config": "config-rpi4", "image_suffix": "ext4-factory.img.gz"},
    "rpi5": {"name": "Raspberry Pi 5", "config": "config-rpi5", "image_suffix": "ext4-factory.img.gz"},
    "r5s": {"name": "NanoPi R5S", "config": "config-r5s", "image_suffix": "ext4-sysupgrade.img.gz"},
    "r4s": {"name": "NanoPi R4S", "config": "config-r4s", "image_suffix": "ext4-sysupgrade.img.gz"},
    "r2s": {"name": "NanoPi R2S", "config": "config-r2s", "image_suffix": "ext4-sysupgrade.img.gz"},
    "bpi-r4": {"name": "Banana Pi BPI-R4", "config": "config-bpi-r4", "image_suffix": "ext4-sysupgrade.img.gz"},
    "wrt3200acm": {"name": "Linksys WRT3200ACM", "config": "config-wrt3200acm", "image_suffix": "ext4-sysupgrade.bin"},
    "rutx50": {"name": "Teltonika RUTX50", "config": "config-rutx50", "image_suffix": "ext4-sysupgrade.bin"},
}

# Stato build
builds = {}


def generate_agent_config(device_id, mqtt_password, mqtt_broker, tenant):
    """Genera i file di configurazione dell'agent per il firmware."""
    config = {
        "MQTT_BROKER": mqtt_broker,
        "MQTT_PORT": "8883",
        "MQTT_USER": device_id,
        "MQTT_PASS": mqtt_password,
        "DEVICE_ID": device_id,
        "DEVICE_TYPE": "router",
        "TENANT": tenant,
        "TELEMETRY_INTERVAL": "10",
    }
    return config


def create_agent_package(device_id, mqtt_password, mqtt_broker="aicore.tecnoadsl.net", tenant="tecnoadsl"):
    """Crea un pacchetto OpenWrt con l'agent preconfigurato."""
    pkg_dir = OUTPUT_DIR / f"agent-{device_id}"
    pkg_dir.mkdir(exist_ok=True)

    # Struttura pacchetto ipk
    data_dir = pkg_dir / "data"
    ctrl_dir = pkg_dir / "control"

    # /opt/omr-agent/
    agent_dir = data_dir / "opt" / "omr-agent"
    agent_dir.mkdir(parents=True, exist_ok=True)

    # Config
    config = generate_agent_config(device_id, mqtt_password, mqtt_broker, tenant)
    with open(agent_dir / "config", "w") as f:
        for k, v in config.items():
            f.write(f"{k}={v}\n")

    # Agent script (copia dall'agent template)
    agent_src = Path("/home/builder/openmptcprouter/platform/router/agent.py")
    if agent_src.exists():
        import shutil
        shutil.copy2(agent_src, agent_dir / "agent.py")

    # Init script
    initd_dir = data_dir / "etc" / "init.d"
    initd_dir.mkdir(parents=True, exist_ok=True)
    with open(initd_dir / "omr-agent", "w") as f:
        f.write('#!/bin/sh /etc/rc.common\n')
        f.write('START=99\n')
        f.write('STOP=10\n')
        f.write('USE_PROCD=1\n\n')
        f.write('start_service() {\n')
        f.write('    . /opt/omr-agent/config\n')
        f.write('    procd_open_instance\n')
        f.write('    procd_set_param command python3 /opt/omr-agent/agent.py\n')
        f.write('    procd_set_param env \\\n')
        for k in config:
            f.write(f'        {k}="${k}" \\\n')
        f.write('    \n')
        f.write('    procd_set_param respawn\n')
        f.write('    procd_set_param stdout 1\n')
        f.write('    procd_set_param stderr 1\n')
        f.write('    procd_close_instance\n')
        f.write('}\n')
    os.chmod(initd_dir / "omr-agent", 0o755)

    # Autostart symlink
    rcd_dir = data_dir / "etc" / "rc.d"
    rcd_dir.mkdir(parents=True, exist_ok=True)
    os.symlink("../init.d/omr-agent", rcd_dir / "S99omr-agent")

    return pkg_dir


def run_build(build_id, target, device_id=None, mqtt_password=None,
              mqtt_broker="aicore.tecnoadsl.net", tenant="tecnoadsl",
              include_ospf=True, include_agent=True):
    """Esegue la build del firmware in background."""

    builds[build_id]["status"] = "building"
    builds[build_id]["started_at"] = datetime.now().isoformat()

    try:
        os.chdir(str(BUILD_DIR))

        # Aggiorna il repo
        builds[build_id]["step"] = "Aggiornamento repository..."
        subprocess.run(["git", "fetch", "origin"], capture_output=True, timeout=60)

        # Checkout branch corretto
        branch = "feature/ospf-bird2" if include_ospf else "develop"
        subprocess.run(["git", "checkout", branch], capture_output=True, timeout=30)
        subprocess.run(["git", "pull"], capture_output=True, timeout=60)

        # Avvia build
        builds[build_id]["step"] = f"Compilazione firmware {target}..."
        env = os.environ.copy()
        env["OMR_TARGET"] = target

        # La build OpenWrt è lunga
        process = subprocess.Popen(
            ["bash", "build.sh"],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        # Log output
        log_file = OUTPUT_DIR / f"{build_id}.log"
        with open(log_file, "w") as log:
            for line in process.stdout:
                log.write(line)
                log.flush()
                # Aggiorna step con ultime righe significative
                if ">>>" in line or "Building" in line or "Installing" in line:
                    builds[build_id]["step"] = line.strip()[:100]

        process.wait()

        if process.returncode != 0:
            builds[build_id]["status"] = "failed"
            builds[build_id]["error"] = f"Build fallita (exit code {process.returncode})"
            return

        # Trova immagine prodotta
        target_info = TARGETS.get(target, {})
        image_pattern = target_info.get("image_suffix", "*.img.gz")
        builds[build_id]["step"] = "Cercando immagine firmware..."

        # Copia immagine nella output dir
        import glob
        images = glob.glob(f"{BUILD_DIR}/*/bin/targets/**/*{image_pattern}", recursive=True)

        if not images:
            builds[build_id]["status"] = "failed"
            builds[build_id]["error"] = "Immagine firmware non trovata"
            return

        src_image = images[0]
        firmware_name = f"omr-{target}-{device_id or 'generic'}-{build_id[:8]}.img.gz"
        dest_image = OUTPUT_DIR / firmware_name
        import shutil
        shutil.copy2(src_image, dest_image)

        # Se richiesto, includi agent preconfigurato
        if include_agent and device_id and mqtt_password:
            builds[build_id]["step"] = "Preparazione agent preconfigurato..."
            agent_pkg = create_agent_package(device_id, mqtt_password, mqtt_broker, tenant)
            builds[build_id]["agent_package"] = str(agent_pkg)

        builds[build_id]["status"] = "completed"
        builds[build_id]["firmware"] = firmware_name
        builds[build_id]["firmware_path"] = str(dest_image)
        builds[build_id]["firmware_size"] = os.path.getsize(dest_image)
        builds[build_id]["completed_at"] = datetime.now().isoformat()
        builds[build_id]["step"] = "Completato"

    except Exception as e:
        builds[build_id]["status"] = "failed"
        builds[build_id]["error"] = str(e)


class BuildHandler(BaseHTTPRequestHandler):
    """HTTP API per il build server."""

    def _json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self._json_response({})

    def do_GET(self):
        if self.path == "/":
            self._json_response({"name": "OMR Build Server", "version": "0.1.0"})

        elif self.path == "/targets":
            self._json_response({"targets": {k: v["name"] for k, v in TARGETS.items()}})

        elif self.path == "/builds":
            self._json_response({"builds": builds})

        elif self.path.startswith("/builds/"):
            build_id = self.path.split("/")[2]
            if build_id in builds:
                self._json_response(builds[build_id])
            else:
                self._json_response({"error": "Build non trovata"}, 404)

        elif self.path.startswith("/download/"):
            # Serve firmware file
            firmware_name = self.path.split("/download/")[1]
            filepath = OUTPUT_DIR / firmware_name
            if filepath.exists():
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f"attachment; filename={firmware_name}")
                self.send_header("Content-Length", str(filepath.stat().st_size))
                self.end_headers()
                with open(filepath, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self._json_response({"error": "File non trovato"}, 404)

        # Serve script di installazione agent
        elif self.path == "/install/router":
            script = Path("/home/builder/openmptcprouter/platform/install/install-router-agent.sh")
            if script.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(script.read_bytes())
            else:
                self._json_response({"error": "Script non trovato"}, 404)

        elif self.path == "/install/vps":
            script = Path("/home/builder/openmptcprouter/platform/install/install-vps-agent.sh")
            if script.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(script.read_bytes())
            else:
                self._json_response({"error": "Script non trovato"}, 404)

        elif self.path == "/install/router-agent.py":
            agent = Path("/home/builder/openmptcprouter/platform/router/agent.py")
            if agent.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(agent.read_bytes())
            else:
                self._json_response({"error": "Agent non trovato"}, 404)

        elif self.path == "/install/vps-agent.py":
            agent = Path("/home/builder/openmptcprouter/platform/vps/agent.py")
            if agent.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(agent.read_bytes())
            else:
                self._json_response({"error": "Agent non trovato"}, 404)

        else:
            self._json_response({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path == "/build":
            content_length = int(self.headers["Content-Length"])
            body = json.loads(self.rfile.read(content_length))

            target = body.get("target", "x86_64")
            if target not in TARGETS:
                self._json_response({"error": f"Target non supportato: {target}"}, 400)
                return

            build_id = str(uuid.uuid4())[:12]
            builds[build_id] = {
                "id": build_id,
                "target": target,
                "target_name": TARGETS[target]["name"],
                "device_id": body.get("device_id"),
                "include_ospf": body.get("include_ospf", True),
                "include_agent": body.get("include_agent", True),
                "status": "queued",
                "step": "In coda...",
                "created_at": datetime.now().isoformat(),
            }

            # Avvia build in background
            thread = threading.Thread(
                target=run_build,
                args=(build_id, target),
                kwargs={
                    "device_id": body.get("device_id"),
                    "mqtt_password": body.get("mqtt_password"),
                    "mqtt_broker": body.get("mqtt_broker", "aicore.tecnoadsl.net"),
                    "tenant": body.get("tenant", "tecnoadsl"),
                    "include_ospf": body.get("include_ospf", True),
                    "include_agent": body.get("include_agent", True),
                },
                daemon=True,
            )
            thread.start()

            self._json_response({"build_id": build_id, "status": "queued"}, 201)

        else:
            self._json_response({"error": "Not found"}, 404)

    def log_message(self, format, *args):
        print(f"[Build Server] {args[0]}")


if __name__ == "__main__":
    port = int(os.environ.get("BUILD_PORT", 8085))
    server = HTTPServer(("0.0.0.0", port), BuildHandler)
    print(f"Build Server avviato su porta {port}")
    print(f"Target disponibili: {', '.join(TARGETS.keys())}")
    server.serve_forever()
