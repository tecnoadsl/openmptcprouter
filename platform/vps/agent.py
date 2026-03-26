"""Agent MQTT per VPS.

Invia telemetria periodica al broker MQTT e riceve comandi dal cloud.
In produzione questo gira sulla VPS reale insieme ai servizi OpenMPTCProuter e Zenarmor.
"""

import json
import os
import time
import random
import subprocess
import shutil

import paho.mqtt.client as mqtt
import psutil

MQTT_BROKER = os.environ.get("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.environ.get("MQTT_PORT", 1883))
DEVICE_ID = os.environ.get("DEVICE_ID", "vps-001")
DEVICE_TYPE = os.environ.get("DEVICE_TYPE", "vps")
TENANT = os.environ.get("TENANT", "tecnoadsl")
TELEMETRY_INTERVAL = int(os.environ.get("TELEMETRY_INTERVAL", 10))
ZENARMOR_API = os.environ.get("ZENARMOR_API", "http://localhost:9090")

TOPIC_BASE = f"omr/{TENANT}/{DEVICE_ID}"

# Rileva se siamo in Docker (dev) o bare metal (prod)
IS_PRODUCTION = shutil.which("zncli") is not None


# ============================================================
# Zenarmor Controller
# ============================================================

class ZenarmorController:
    """Interfaccia verso Zenarmor via CLI (zncli) e REST API.

    In dev (Docker) simula le risposte.
    In produzione chiama zncli e l'API locale.
    """

    def __init__(self):
        self.state = {
            "enabled": True,
            "mode": "inline",
            "policies": [],
            "web_categories_blocked": ["malware", "phishing", "botnet", "cryptomining", "spam"],
            "blocked_apps": [],
            "stats": {
                "threats_blocked_today": 0,
                "web_requests_today": 0,
                "apps_detected": 0,
                "active_connections": 0,
            },
        }

    def _run_cli(self, args):
        """Esegue zncli in produzione, simula in dev."""
        if IS_PRODUCTION:
            try:
                result = subprocess.run(
                    ["zncli"] + args,
                    capture_output=True, text=True, timeout=10,
                )
                return {"status": "ok", "output": result.stdout.strip(), "returncode": result.returncode}
            except Exception as e:
                return {"status": "error", "error": str(e)}
        else:
            return {"status": "ok", "output": f"[SIM] zncli {' '.join(args)}", "simulated": True}

    def _api_call(self, method, endpoint, data=None):
        """Chiama REST API Zenarmor locale in produzione."""
        if IS_PRODUCTION:
            import requests
            try:
                url = f"{ZENARMOR_API}/api/v1{endpoint}"
                if method == "GET":
                    r = requests.get(url, timeout=5)
                elif method == "POST":
                    r = requests.post(url, json=data, timeout=5)
                elif method == "PUT":
                    r = requests.put(url, json=data, timeout=5)
                elif method == "DELETE":
                    r = requests.delete(url, timeout=5)
                return {"status": "ok", "data": r.json() if r.text else {}, "http_status": r.status_code}
            except Exception as e:
                return {"status": "error", "error": str(e)}
        else:
            return {"status": "ok", "data": {}, "simulated": True}

    # --- Comandi principali ---

    def enable(self):
        """Abilita Zenarmor engine."""
        result = self._run_cli(["engine", "start"])
        self.state["enabled"] = True
        return {**result, "message": "Zenarmor abilitato"}

    def disable(self):
        """Disabilita Zenarmor engine."""
        result = self._run_cli(["engine", "stop"])
        self.state["enabled"] = False
        return {**result, "message": "Zenarmor disabilitato"}

    def set_mode(self, mode):
        """Cambia modalità: inline, tap, bridge."""
        result = self._run_cli(["mode", "set", mode])
        self.state["mode"] = mode
        return {**result, "message": f"Modalità impostata: {mode}"}

    def get_stats(self):
        """Recupera statistiche Zenarmor."""
        if IS_PRODUCTION:
            result = self._api_call("GET", "/reports/dashboard")
            if result["status"] == "ok" and "data" in result:
                self.state["stats"] = result["data"]
        else:
            # Simula stats
            self.state["stats"] = {
                "threats_blocked_today": random.randint(500, 1500),
                "web_requests_today": random.randint(80000, 200000),
                "apps_detected": random.randint(20, 50),
                "active_connections": random.randint(500, 2000),
            }
        return {"status": "ok", "stats": self.state["stats"]}

    # --- Policy ---

    def update_policy(self, policy_name, settings):
        """Aggiorna una policy."""
        if IS_PRODUCTION:
            result = self._api_call("PUT", f"/policies/{policy_name}", settings)
        else:
            result = {"status": "ok", "simulated": True}
        return {**result, "message": f"Policy '{policy_name}' aggiornata"}

    def toggle_policy(self, policy_name, enabled):
        """Abilita/disabilita una policy."""
        action = "enable" if enabled else "disable"
        result = self._run_cli(["policy", action, policy_name])
        return {**result, "message": f"Policy '{policy_name}' {'abilitata' if enabled else 'disabilitata'}"}

    def create_policy(self, policy):
        """Crea una nuova policy."""
        if IS_PRODUCTION:
            result = self._api_call("POST", "/policies", policy)
        else:
            result = {"status": "ok", "simulated": True}
        self.state["policies"].append(policy)
        return {**result, "message": f"Policy '{policy.get('name', 'nuova')}' creata"}

    # --- Web Filtering ---

    def block_web_category(self, category):
        """Blocca una categoria web."""
        result = self._run_cli(["web-filter", "block", "--category", category])
        if category not in self.state["web_categories_blocked"]:
            self.state["web_categories_blocked"].append(category)
        return {**result, "message": f"Categoria '{category}' bloccata"}

    def allow_web_category(self, category):
        """Sblocca una categoria web."""
        result = self._run_cli(["web-filter", "allow", "--category", category])
        self.state["web_categories_blocked"] = [c for c in self.state["web_categories_blocked"] if c != category]
        return {**result, "message": f"Categoria '{category}' sbloccata"}

    def set_web_categories(self, blocked_categories):
        """Imposta tutte le categorie bloccate in una volta."""
        results = []
        # Sblocca quelle da rimuovere
        for cat in self.state["web_categories_blocked"]:
            if cat not in blocked_categories:
                results.append(self.allow_web_category(cat))
        # Blocca quelle nuove
        for cat in blocked_categories:
            if cat not in self.state["web_categories_blocked"]:
                results.append(self.block_web_category(cat))
        self.state["web_categories_blocked"] = blocked_categories
        return {"status": "ok", "message": f"{len(blocked_categories)} categorie bloccate", "details": results}

    # --- App Control ---

    def block_app(self, app):
        """Blocca un'applicazione."""
        result = self._run_cli(["app-control", "block", app])
        if app not in self.state["blocked_apps"]:
            self.state["blocked_apps"].append(app)
        return {**result, "message": f"App '{app}' bloccata"}

    def allow_app(self, app):
        """Sblocca un'applicazione."""
        result = self._run_cli(["app-control", "allow", app])
        self.state["blocked_apps"] = [a for a in self.state["blocked_apps"] if a != app]
        return {**result, "message": f"App '{app}' sbloccata"}

    def set_blocked_apps(self, blocked_apps):
        """Imposta tutte le app bloccate in una volta."""
        results = []
        for app in self.state["blocked_apps"]:
            if app not in blocked_apps:
                results.append(self.allow_app(app))
        for app in blocked_apps:
            if app not in self.state["blocked_apps"]:
                results.append(self.block_app(app))
        self.state["blocked_apps"] = blocked_apps
        return {"status": "ok", "message": f"{len(blocked_apps)} app bloccate", "details": results}

    # --- Threat Intelligence ---

    def update_threat_feeds(self):
        """Forza aggiornamento feed threat intelligence."""
        result = self._run_cli(["threat-intel", "update"])
        return {**result, "message": "Feed threat intelligence aggiornati"}

    def get_threat_log(self, limit=50):
        """Recupera log minacce recenti."""
        if IS_PRODUCTION:
            result = self._api_call("GET", f"/reports/threats?limit={limit}")
            return result
        else:
            return {"status": "ok", "threats": [
                {"time": time.time() - i*60, "type": random.choice(["malware", "phishing", "botnet"]),
                 "src_ip": f"10.255.255.{random.randint(2,10)}", "dst": f"evil-{i}.example.com",
                 "action": "blocked"} for i in range(min(limit, 10))
            ], "simulated": True}

    # --- Comandi compositi (dalla dashboard) ---

    def handle_update(self, config):
        """Gestisce un aggiornamento completo dalla dashboard."""
        results = []

        # Enable/disable
        if "enabled" in config:
            if config["enabled"]:
                results.append(self.enable())
            else:
                results.append(self.disable())

        # Modalità
        if "mode" in config:
            results.append(self.set_mode(config["mode"]))

        # Categorie web
        if "web_categories_blocked" in config:
            results.append(self.set_web_categories(config["web_categories_blocked"]))

        # App bloccate
        if "blocked_apps" in config:
            results.append(self.set_blocked_apps(config["blocked_apps"]))

        # Policy
        if "policies" in config:
            for policy in config["policies"]:
                name = policy.get("name", "")
                results.append(self.update_policy(name, policy))

        return {"status": "ok", "message": "Configurazione Zenarmor aggiornata", "results": results}


# ============================================================
# VPS Service Controller (OpenMPTCProuter services)
# ============================================================

class VPSServiceController:
    """Controlla i servizi OpenMPTCProuter sulla VPS."""

    SERVICES = {
        "glorytun_tcp": "glorytun-tcp",
        "glorytun_udp": "glorytun-udp",
        "shadowsocks": "shadowsocks-libev-ss-server",
        "v2ray": "v2ray",
        "xray": "xray",
        "openvpn": "openvpn",
        "wireguard": "wg-quick@wg0",
        "mlvpn": "mlvpn",
        "dsvpn": "dsvpn",
    }

    def _systemctl(self, action, service):
        if IS_PRODUCTION:
            try:
                result = subprocess.run(
                    ["systemctl", action, service],
                    capture_output=True, text=True, timeout=15,
                )
                return {"status": "ok", "output": result.stdout.strip()}
            except Exception as e:
                return {"status": "error", "error": str(e)}
        return {"status": "ok", "simulated": True, "output": f"[SIM] systemctl {action} {service}"}

    def toggle_service(self, service_key, enabled):
        service_name = self.SERVICES.get(service_key, service_key)
        action = "start" if enabled else "stop"
        result = self._systemctl(action, service_name)
        return {**result, "message": f"{service_name} {'avviato' if enabled else 'fermato'}"}

    def restart_service(self, service_key):
        service_name = self.SERVICES.get(service_key, service_key)
        result = self._systemctl("restart", service_name)
        return {**result, "message": f"{service_name} riavviato"}

    def restart_all(self):
        results = []
        for key, name in self.SERVICES.items():
            results.append(self.restart_service(key))
        return {"status": "ok", "message": "Tutti i servizi riavviati", "results": results}

    def update_port(self, service_key, port):
        """Aggiorna la porta di un servizio (modifica config e riavvia)."""
        if IS_PRODUCTION:
            # In produzione: modifica file di configurazione UCI/JSON e riavvia
            service_name = self.SERVICES.get(service_key, service_key)
            # Esempio per shadowsocks
            if "shadowsocks" in service_key:
                try:
                    subprocess.run(["uci", "set", f"shadowsocks-libev.sss0.server_port={port}"], capture_output=True, timeout=5)
                    subprocess.run(["uci", "commit", "shadowsocks-libev"], capture_output=True, timeout=5)
                except Exception:
                    pass
            result = self._systemctl("restart", service_name)
            return {**result, "message": f"Porta {service_name} cambiata a {port}"}
        return {"status": "ok", "simulated": True, "message": f"[SIM] Porta {service_key} → {port}"}

    def update_config(self, config):
        """Aggiorna configurazione rete VPS."""
        if IS_PRODUCTION:
            results = []
            if "dns1" in config:
                try:
                    with open("/etc/resolv.conf", "w") as f:
                        f.write(f"nameserver {config['dns1']}\n")
                        if "dns2" in config:
                            f.write(f"nameserver {config['dns2']}\n")
                    results.append({"dns": "aggiornato"})
                except Exception as e:
                    results.append({"dns": f"errore: {e}"})
            return {"status": "ok", "results": results}
        return {"status": "ok", "simulated": True, "message": "[SIM] Config aggiornata"}


# ============================================================
# Telemetria
# ============================================================

zenarmor = ZenarmorController()
vps_services = VPSServiceController()


def collect_telemetry() -> dict:
    """Raccoglie metriche di sistema + stats Zenarmor."""
    cpu = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    boot_time = psutil.boot_time()

    # Aggiorna stats Zenarmor
    zen_stats = zenarmor.get_stats()

    return {
        "device_type": DEVICE_TYPE,
        "timestamp": time.time(),
        "cpu_usage": cpu,
        "memory_usage": mem.percent,
        "memory_total_mb": mem.total // (1024 * 1024),
        "disk_usage": disk.percent,
        "uptime": int(time.time() - boot_time),
        "net_rx_bytes": net.bytes_recv,
        "net_tx_bytes": net.bytes_sent,
        "wan_status": [
            {
                "name": "eth0",
                "ip": "10.0.0.1",
                "rx_bytes": net.bytes_recv,
                "tx_bytes": net.bytes_sent,
                "latency_ms": round(random.uniform(1, 15), 2),
                "is_up": True,
            }
        ],
        "tunnel_status": {
            "type": "glorytun",
            "connected": True,
            "clients": random.randint(1, 5),
        },
        "zenarmor": {
            "enabled": zenarmor.state["enabled"],
            "mode": zenarmor.state["mode"],
            "stats": zen_stats.get("stats", {}),
        },
    }


# ============================================================
# MQTT Handler
# ============================================================

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[{DEVICE_ID}] Connesso al broker MQTT (rc={reason_code})")
    print(f"[{DEVICE_ID}] Modalità: {'PRODUZIONE' if IS_PRODUCTION else 'SVILUPPO (simulato)'}")
    client.publish(f"{TOPIC_BASE}/status", json.dumps({"online": True, "device_type": DEVICE_TYPE}), retain=True)
    client.subscribe(f"{TOPIC_BASE}/command")


def on_message(client, userdata, msg):
    """Riceve e processa comandi dal cloud."""
    try:
        payload = json.loads(msg.payload.decode())
        cmd_type = payload.get("type", "unknown")
        cmd_payload = payload.get("payload", {})
        print(f"[{DEVICE_ID}] Comando ricevuto: {cmd_type}")

        result = {"status": "ok", "command": cmd_type}

        # --- Comandi sistema ---
        if cmd_type == "reboot":
            if IS_PRODUCTION:
                subprocess.Popen(["reboot"])
            result["message"] = "Riavvio in corso" if IS_PRODUCTION else "Riavvio simulato"

        elif cmd_type == "get_config":
            result["config"] = {"shadowsocks": "active", "glorytun": "active", "zenarmor": zenarmor.state}

        elif cmd_type == "update_firmware":
            if IS_PRODUCTION:
                subprocess.Popen(["apt", "update", "&&", "apt", "upgrade", "-y"])
            result["message"] = "Aggiornamento avviato"

        # --- Comandi servizi VPS ---
        elif cmd_type == "toggle_service":
            result = vps_services.toggle_service(cmd_payload.get("service", ""), cmd_payload.get("enabled", True))

        elif cmd_type == "restart_all_services":
            result = vps_services.restart_all()

        elif cmd_type == "update_port":
            result = vps_services.update_port(cmd_payload.get("service", ""), cmd_payload.get("port", 0))

        elif cmd_type == "update_config":
            result = vps_services.update_config(cmd_payload)

        elif cmd_type == "disconnect_client":
            client_name = cmd_payload.get("client", "")
            if IS_PRODUCTION:
                # Kill connessione del client specifico
                subprocess.run(["ss", "-K", f"src {client_name}"], capture_output=True, timeout=5)
            result["message"] = f"Client {client_name} disconnesso"

        # --- Comandi Zenarmor ---
        elif cmd_type == "update_zenarmor":
            result = zenarmor.handle_update(cmd_payload)

        elif cmd_type == "zenarmor_enable":
            result = zenarmor.enable()

        elif cmd_type == "zenarmor_disable":
            result = zenarmor.disable()

        elif cmd_type == "zenarmor_set_mode":
            result = zenarmor.set_mode(cmd_payload.get("mode", "inline"))

        elif cmd_type == "zenarmor_block_category":
            result = zenarmor.block_web_category(cmd_payload.get("category", ""))

        elif cmd_type == "zenarmor_allow_category":
            result = zenarmor.allow_web_category(cmd_payload.get("category", ""))

        elif cmd_type == "zenarmor_set_categories":
            result = zenarmor.set_web_categories(cmd_payload.get("categories", []))

        elif cmd_type == "zenarmor_block_app":
            result = zenarmor.block_app(cmd_payload.get("app", ""))

        elif cmd_type == "zenarmor_allow_app":
            result = zenarmor.allow_app(cmd_payload.get("app", ""))

        elif cmd_type == "zenarmor_set_apps":
            result = zenarmor.set_blocked_apps(cmd_payload.get("apps", []))

        elif cmd_type == "zenarmor_update_policy":
            result = zenarmor.update_policy(cmd_payload.get("name", ""), cmd_payload)

        elif cmd_type == "zenarmor_toggle_policy":
            result = zenarmor.toggle_policy(cmd_payload.get("name", ""), cmd_payload.get("enabled", True))

        elif cmd_type == "zenarmor_create_policy":
            result = zenarmor.create_policy(cmd_payload)

        elif cmd_type == "zenarmor_update_feeds":
            result = zenarmor.update_threat_feeds()

        elif cmd_type == "zenarmor_get_threats":
            result = zenarmor.get_threat_log(cmd_payload.get("limit", 50))

        elif cmd_type == "zenarmor_get_stats":
            result = zenarmor.get_stats()

        else:
            result["message"] = f"Comando {cmd_type} ricevuto"

        # Invia ACK
        client.publish(f"{TOPIC_BASE}/command/ack", json.dumps(result))
        print(f"[{DEVICE_ID}] Risposta: {result.get('message', result.get('status', ''))}")

    except Exception as e:
        print(f"[{DEVICE_ID}] Errore comando: {e}")
        client.publish(f"{TOPIC_BASE}/command/ack", json.dumps({"status": "error", "error": str(e)}))


def on_disconnect(client, userdata, flags, reason_code, properties):
    print(f"[{DEVICE_ID}] Disconnesso (rc={reason_code}), riconnessione...")


def main():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=DEVICE_ID)
    client.will_set(f"{TOPIC_BASE}/status", json.dumps({"online": False}), retain=True)

    client.on_connect = on_connect
    client.on_message = on_message
    client.on_disconnect = on_disconnect

    print(f"[{DEVICE_ID}] Connessione a {MQTT_BROKER}:{MQTT_PORT}...")
    print(f"[{DEVICE_ID}] Zenarmor: {'PRODUZIONE (zncli disponibile)' if IS_PRODUCTION else 'SIMULATO'}")

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            break
        except Exception as e:
            print(f"[{DEVICE_ID}] Broker non raggiungibile: {e}, riprovo in 5s...")
            time.sleep(5)

    # Loop telemetria
    while True:
        try:
            telemetry = collect_telemetry()
            client.publish(f"{TOPIC_BASE}/telemetry", json.dumps(telemetry))
            zen = telemetry.get("zenarmor", {}).get("stats", {})
            print(f"[{DEVICE_ID}] Telemetria (CPU: {telemetry['cpu_usage']}%, Zenarmor threats: {zen.get('threats_blocked_today', 0)})")
        except Exception as e:
            print(f"[{DEVICE_ID}] Errore telemetria: {e}")

        time.sleep(TELEMETRY_INTERVAL)


if __name__ == "__main__":
    main()
