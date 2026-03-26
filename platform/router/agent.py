"""Agent MQTT per Router simulato.

Simula un router OpenMPTCProuter con multiple WAN.
In produzione questo gira sul router OpenWrt reale.
"""

import json
import os
import time
import random

import paho.mqtt.client as mqtt
import psutil

MQTT_BROKER = os.environ.get("MQTT_BROKER", "mqtt")
MQTT_PORT = int(os.environ.get("MQTT_PORT", 1883))
DEVICE_ID = os.environ.get("DEVICE_ID", "router-001")
DEVICE_TYPE = os.environ.get("DEVICE_TYPE", "router")
TENANT = os.environ.get("TENANT", "tecnoadsl")
TELEMETRY_INTERVAL = int(os.environ.get("TELEMETRY_INTERVAL", 10))

TOPIC_BASE = f"omr/{TENANT}/{DEVICE_ID}"

# Simula interfacce WAN multiple
SIMULATED_WANS = [
    {"name": "wan1", "type": "fiber", "ip": "85.42.10.1", "max_bw_mbps": 100},
    {"name": "wan2", "type": "4g", "ip": "10.0.0.1", "max_bw_mbps": 50},
    {"name": "wan3", "type": "adsl", "ip": "79.55.20.1", "max_bw_mbps": 20},
]


def collect_telemetry() -> dict:
    cpu = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()
    boot_time = psutil.boot_time()

    # Simula stato WAN con variazioni realistiche
    wan_status = []
    for wan in SIMULATED_WANS:
        is_up = random.random() > 0.05  # 5% chance di WAN down
        wan_status.append({
            "name": wan["name"],
            "type": wan["type"],
            "ip": wan["ip"] if is_up else None,
            "rx_bytes": random.randint(100000, 50000000),
            "tx_bytes": random.randint(50000, 20000000),
            "rx_rate_mbps": round(random.uniform(0.5, wan["max_bw_mbps"] * 0.8), 2) if is_up else 0,
            "tx_rate_mbps": round(random.uniform(0.1, wan["max_bw_mbps"] * 0.3), 2) if is_up else 0,
            "latency_ms": round(random.uniform(5, 80), 2) if is_up else 0,
            "is_up": is_up,
        })

    active_wans = [w for w in wan_status if w["is_up"]]
    aggregated_bw = sum(w["rx_rate_mbps"] for w in active_wans)

    return {
        "device_type": DEVICE_TYPE,
        "timestamp": time.time(),
        "cpu_usage": cpu,
        "memory_usage": mem.percent,
        "memory_total_mb": mem.total // (1024 * 1024),
        "uptime": int(time.time() - boot_time),
        "wan_status": wan_status,
        "mptcp_status": {
            "subflows": len(active_wans),
            "aggregated_bw_mbps": round(aggregated_bw, 2),
            "scheduler": "blest",
        },
        "tunnel_status": {
            "type": "glorytun",
            "connected": len(active_wans) > 0,
            "server_ip": "vps.tecnoadsl.net",
        },
    }


def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[{DEVICE_ID}] Connesso al broker MQTT (rc={reason_code})")
    client.publish(f"{TOPIC_BASE}/status", json.dumps({
        "online": True,
        "device_type": DEVICE_TYPE,
        "model": "Raspberry Pi 4",
        "firmware": "OMR-0.60.3",
        "wan_count": len(SIMULATED_WANS),
    }), retain=True)
    client.subscribe(f"{TOPIC_BASE}/command")


IS_PRODUCTION = os.path.exists("/etc/config/openmptcprouter")


def _uci(args):
    """Esegue comandi UCI in produzione, simula in dev."""
    if IS_PRODUCTION:
        try:
            r = subprocess.run(["uci"] + args, capture_output=True, text=True, timeout=5)
            return {"status": "ok", "output": r.stdout.strip()}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    return {"status": "ok", "simulated": True, "output": f"[SIM] uci {' '.join(args)}"}


def _service(action, name):
    if IS_PRODUCTION:
        try:
            r = subprocess.run(["/etc/init.d/" + name, action], capture_output=True, text=True, timeout=15)
            return {"status": "ok", "output": r.stdout.strip()}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    return {"status": "ok", "simulated": True}


def handle_wan_update(wan_config):
    """Aggiorna configurazione WAN via UCI."""
    name = wan_config.get("name", "wan1")
    results = []
    field_map = {
        "proto": f"network.{name}.proto",
        "ipaddr": f"network.{name}.ipaddr",
        "netmask": f"network.{name}.netmask",
        "gateway": f"network.{name}.gateway",
        "dns1": f"network.{name}.dns",
        "mtu": f"network.{name}.mtu",
        "metric": f"network.{name}.metric",
        "mptcp": f"network.{name}.multipath",
        "pppoe_user": f"network.{name}.username",
        "pppoe_pass": f"network.{name}.password",
        "apn": f"network.{name}.apn",
        "pincode": f"network.{name}.pincode",
    }
    for key, uci_path in field_map.items():
        if key in wan_config and wan_config[key]:
            results.append(_uci(["set", f"{uci_path}={wan_config[key]}"]))
    # SQM
    if "sqm_enabled" in wan_config:
        iface = wan_config.get("device", name)
        _uci(["set", f"sqm.{iface}.enabled={'1' if wan_config['sqm_enabled'] else '0'}"])
        if "sqm_download" in wan_config:
            _uci(["set", f"sqm.{iface}.download={wan_config['sqm_download']}"])
        if "sqm_upload" in wan_config:
            _uci(["set", f"sqm.{iface}.upload={wan_config['sqm_upload']}"])
    _uci(["commit", "network"])
    _uci(["commit", "sqm"])
    _service("restart", "network")
    return {"status": "ok", "message": f"WAN {name} aggiornata", "results": results}


def handle_mptcp_update(config):
    """Aggiorna configurazione MPTCP."""
    field_map = {
        "scheduler": "network.globals.mptcp_scheduler",
        "congestion": "network.globals.congestion",
        "path_manager": "network.globals.mptcp_path_manager",
        "checksum": "network.globals.mptcp_checksum",
        "max_subflows": "network.globals.mptcp_subflows",
        "syn_retries": "network.globals.mptcp_syn_retries",
    }
    for key, uci_path in field_map.items():
        if key in config:
            val = config[key]
            if isinstance(val, bool):
                val = "1" if val else "0"
            _uci(["set", f"{uci_path}={val}"])
    _uci(["commit", "network"])
    _service("restart", "mptcp")
    return {"status": "ok", "message": "MPTCP aggiornato"}


def handle_vpn_update(config):
    """Aggiorna configurazione VPN."""
    if "default_vpn" in config:
        _uci(["set", f"openmptcprouter.settings.defaultvpn={config['default_vpn']}"])
    if "glorytun_key" in config:
        _uci(["set", f"glorytun.vpn.key={config['glorytun_key']}"])
    _uci(["commit", "openmptcprouter"])
    _uci(["commit", "glorytun"])
    return {"status": "ok", "message": "VPN aggiornata"}


def handle_proxy_update(config):
    """Aggiorna configurazione proxy."""
    if "ss_encryption" in config:
        _uci(["set", f"shadowsocks-libev.sss0.method={config['ss_encryption']}"])
    if "ss_key" in config:
        _uci(["set", f"shadowsocks-libev.sss0.key={config['ss_key']}"])
    _uci(["commit", "shadowsocks-libev"])
    return {"status": "ok", "message": "Proxy aggiornato"}


def handle_system_update(config):
    """Aggiorna impostazioni di sistema."""
    sysctl_map = {
        "tcp_keepalive_time": "net.ipv4.tcp_keepalive_time",
        "tcp_fin_timeout": "net.ipv4.tcp_fin_timeout",
        "tcp_syn_retries": "net.ipv4.tcp_syn_retries",
        "ip_default_ttl": "net.ipv4.ip_default_ttl",
        "tcp_fastopen": "net.ipv4.tcp_fastopen",
    }
    for key, sysctl_path in sysctl_map.items():
        if key in config:
            if IS_PRODUCTION:
                subprocess.run(["sysctl", "-w", f"{sysctl_path}={config[key]}"], capture_output=True, timeout=5)
    if "scaling_governor" in config and IS_PRODUCTION:
        try:
            with open("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor", "w") as f:
                f.write(config["scaling_governor"])
        except Exception:
            pass
    return {"status": "ok", "message": "Sistema aggiornato"}


def handle_server_update(servers):
    """Aggiorna configurazione server VPS."""
    for i, srv in enumerate(servers if isinstance(servers, list) else [servers]):
        name = srv.get("name", f"server{i}")
        if "ip1" in srv:
            _uci(["set", f"openmptcprouter.{name}.ip={srv['ip1']}"])
        if "port" in srv:
            _uci(["set", f"openmptcprouter.{name}.port={srv['port']}"])
        if "key" in srv and srv["key"]:
            _uci(["set", f"openmptcprouter.{name}.key={srv['key']}"])
    _uci(["commit", "openmptcprouter"])
    return {"status": "ok", "message": "Server VPS aggiornati"}


def handle_bypass_update(config):
    """Aggiorna configurazione bypass e failover via UCI (omr-bypass)."""
    results = []

    # Failover
    mode = config.get("failover_mode", "fallback_wan")
    if mode == "kill_switch":
        _uci(["set", "openmptcprouter.settings.disabledefaultgw=1"])
    else:
        _uci(["set", "openmptcprouter.settings.disabledefaultgw=0"])

    if mode == "fallback_specific":
        wan = config.get("failover_wan", "wan1")
        _uci(["set", f"openmptcprouter.settings.fallback_wan={wan}"])

    # Tracker
    tracker = config.get("tracker", {})
    if "check_interval" in tracker:
        _uci(["set", f"omr-tracker.defaults.interval={tracker['check_interval']}"])
    if "check_timeout" in tracker:
        _uci(["set", f"omr-tracker.defaults.timeout={tracker['check_timeout']}"])
    if "check_hosts" in tracker:
        hosts = tracker["check_hosts"].replace(",", " ")
        _uci(["set", f"omr-tracker.defaults.hosts={hosts}"])
    if "max_failures" in tracker:
        _uci(["set", f"omr-tracker.defaults.failure={tracker['max_failures']}"])

    # Regole bypass per destinazione
    # Prima rimuovi le vecchie regole
    if IS_PRODUCTION:
        subprocess.run(["uci", "delete", "omr-bypass"], capture_output=True, timeout=5)

    for i, rule in enumerate(config.get("rules", [])):
        if not rule.get("enabled", False):
            continue
        section = f"rule{i}"
        _uci(["set", f"omr-bypass.{section}=bypass"])
        _uci(["set", f"omr-bypass.{section}.name={rule.get('name', '')}"])
        _uci(["set", f"omr-bypass.{section}.type={rule.get('type', 'domain')}"])
        _uci(["set", f"omr-bypass.{section}.dest={rule.get('value', '')}"])
        _uci(["set", f"omr-bypass.{section}.interface={rule.get('wan', 'wan1')}"])
        if rule.get("protocol"):
            _uci(["set", f"omr-bypass.{section}.proto={rule['protocol']}"])

    # Regole bypass per sorgente LAN
    for i, rule in enumerate(config.get("lan_rules", [])):
        if not rule.get("enabled", False):
            continue
        section = f"lan_rule{i}"
        _uci(["set", f"omr-bypass.{section}=bypass"])
        _uci(["set", f"omr-bypass.{section}.name={rule.get('name', '')}"])
        _uci(["set", f"omr-bypass.{section}.src={rule.get('value', '')}"])
        _uci(["set", f"omr-bypass.{section}.src_type={rule.get('type', 'ip')}"])
        _uci(["set", f"omr-bypass.{section}.interface={rule.get('wan', 'wan1')}"])

    _uci(["commit", "omr-bypass"])
    _uci(["commit", "omr-tracker"])
    _uci(["commit", "openmptcprouter"])
    _service("restart", "omr-bypass")
    _service("restart", "omr-tracker")

    return {"status": "ok", "message": "Bypass e failover aggiornati"}


def handle_ospf_update(config):
    """Aggiorna configurazione OSPF (bird2).

    Genera /etc/bird.conf e riavvia bird2.
    Bird2 su OpenWrt non usa UCI, ha il proprio file di configurazione.
    """
    if not config.get("enabled", False):
        _service("stop", "bird")
        return {"status": "ok", "message": "OSPF disabilitato"}

    router_id = config.get("router_id", "")
    areas = config.get("areas", [])
    redistribute = config.get("redistribute", {})
    import_filter = config.get("import_filter", "all")
    export_filter = config.get("export_filter", "all")
    ecmp = config.get("ecmp", True)
    merge_external = config.get("merge_external", True)

    # Genera bird.conf
    lines = [
        "# Generato automaticamente da OMR Platform",
        "log syslog all;",
        "",
    ]

    if router_id:
        lines.append(f'router id {router_id};')
    else:
        lines.append("# router id auto")
    lines.append("")

    # Protocollo device
    lines.append("protocol device {")
    lines.append("  scan time 10;")
    lines.append("}")
    lines.append("")

    # Protocollo direct (connected routes)
    lines.append("protocol direct {")
    lines.append("  ipv4;")
    lines.append("  interface \"br-lan\", \"eth*\", \"wwan*\";")
    lines.append("}")
    lines.append("")

    # Protocollo kernel
    lines.append("protocol kernel {")
    lines.append("  ipv4 {")
    lines.append("    import all;")
    lines.append(f"    export {export_filter};")
    lines.append("  };")
    lines.append("  learn;")
    if ecmp:
        lines.append("  merge paths on;")
    lines.append("}")
    lines.append("")

    # Protocollo OSPF
    lines.append("protocol ospf v2 omr_ospf {")
    if ecmp:
        lines.append("  ecmp yes;")
    if merge_external:
        lines.append("  merge external yes;")
    lines.append(f"  tick {config.get('tick', 1)};")
    lines.append("  ipv4 {")
    lines.append(f"    import {import_filter};")
    lines.append(f"    export {export_filter};")
    lines.append("  };")
    lines.append("")

    for area in areas:
        area_id = area.get("id", "0.0.0.0")
        area_type = area.get("type", "normal")
        lines.append(f"  area {area_id} {{")
        if area_type == "stub":
            lines.append("    stub;")
        elif area_type == "nssa":
            lines.append("    nssa;")

        for intf in area.get("interfaces", []):
            intf_name = intf.get("name", "")
            if not intf_name:
                continue
            lines.append(f'    interface "{intf_name}" {{')
            lines.append(f"      cost {intf.get('cost', 10)};")
            lines.append(f"      hello {intf.get('hello', 10)};")
            lines.append(f"      dead {intf.get('dead', 40)};")
            intf_type = intf.get("type", "broadcast")
            if intf_type == "pointopoint":
                lines.append("      type pointopoint;")
            elif intf_type == "nonbroadcast":
                lines.append("      type nonbroadcast;")
            if intf.get("passive", False):
                lines.append("      stub;")
            auth = intf.get("auth_type", "none")
            if auth == "simple":
                lines.append(f'      authentication simple;')
                lines.append(f'      password "{intf.get("auth_key", "")}";')
            elif auth == "md5":
                lines.append(f'      authentication cryptographic;')
                lines.append(f'      password "{intf.get("auth_key", "")}";')
            lines.append("    };")

        # Network statements
        for net in area.get("networks", []):
            if net:
                lines.append(f"    networks {{ {net}; }};") if False else None
        lines.append("  };")

    lines.append("}")

    bird_conf = "\n".join(lines)

    if IS_PRODUCTION:
        try:
            with open("/etc/bird.conf", "w") as f:
                f.write(bird_conf)
            _service("restart", "bird")
            return {"status": "ok", "message": "OSPF configurato e riavviato"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    else:
        print(f"[{DEVICE_ID}] [SIM] bird.conf generato ({len(lines)} righe)")
        return {"status": "ok", "message": "OSPF configurato (simulato)", "config_preview": bird_conf}


def ospf_show_neighbors():
    """Recupera tabella neighbor OSPF da birdc."""
    if IS_PRODUCTION:
        try:
            r = subprocess.run(["birdc", "show", "ospf", "neighbors"], capture_output=True, text=True, timeout=5)
            neighbors = []
            for line in r.stdout.strip().split("\n")[2:]:  # skip header
                parts = line.split()
                if len(parts) >= 5:
                    neighbors.append({
                        "router_id": parts[0],
                        "state": parts[2].split("/")[0],
                        "dead_timer": parts[3],
                        "interface": parts[4],
                        "ip": parts[1] if len(parts) > 1 else "",
                    })
            return {"status": "ok", "neighbors": neighbors}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    else:
        # Simula neighbor
        return {"status": "ok", "neighbors": [
            {"router_id": "10.0.0.2", "state": "Full", "interface": "br-lan", "ip": "192.168.100.2", "dead_timer": "32"},
            {"router_id": "10.0.0.3", "state": "ExStart", "interface": "br-lan", "ip": "192.168.100.3", "dead_timer": "38"},
        ], "simulated": True}


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
        cmd_type = payload.get("type", "unknown")
        cmd_payload = payload.get("payload", {})
        print(f"[{DEVICE_ID}] Comando ricevuto: {cmd_type}")

        result = {"status": "ok", "command": cmd_type}

        if cmd_type == "reboot":
            if IS_PRODUCTION:
                subprocess.Popen(["reboot"])
            result["message"] = "Riavvio in corso" if IS_PRODUCTION else "Riavvio simulato"

        elif cmd_type == "get_config":
            result["config"] = {
                "wan_count": len(SIMULATED_WANS),
                "mptcp_scheduler": "blest",
                "tunnel": "glorytun",
                "encryption": "shadowsocks",
            }

        elif cmd_type == "speedtest":
            if IS_PRODUCTION:
                try:
                    r = subprocess.run(["speedtest-cli", "--json"], capture_output=True, text=True, timeout=60)
                    data = json.loads(r.stdout)
                    result["download_mbps"] = round(data["download"] / 1e6, 2)
                    result["upload_mbps"] = round(data["upload"] / 1e6, 2)
                except Exception:
                    result["download_mbps"] = 0
                    result["upload_mbps"] = 0
            else:
                result["download_mbps"] = round(random.uniform(50, 150), 2)
                result["upload_mbps"] = round(random.uniform(10, 40), 2)

        elif cmd_type == "toggle_wan":
            name = cmd_payload.get("wan", "wan1")
            enabled = cmd_payload.get("enabled", True)
            if IS_PRODUCTION:
                _uci(["set", f"network.{name}.disabled={'0' if enabled else '1'}"])
                _uci(["commit", "network"])
                _service("restart", "network")
            result["message"] = f"WAN {name} {'abilitata' if enabled else 'disabilitata'}"

        elif cmd_type == "refresh_wan":
            if IS_PRODUCTION:
                _service("restart", "network")
            result["message"] = "Stato WAN aggiornato"

        elif cmd_type.startswith("update_wan"):
            result = handle_wan_update(cmd_payload)

        elif cmd_type == "update_mptcp":
            result = handle_mptcp_update(cmd_payload)

        elif cmd_type == "update_vpn":
            result = handle_vpn_update(cmd_payload)

        elif cmd_type == "update_proxy":
            result = handle_proxy_update(cmd_payload)

        elif cmd_type == "update_system":
            result = handle_system_update(cmd_payload)

        elif cmd_type == "update_server":
            result = handle_server_update(cmd_payload)

        elif cmd_type == "update_lan":
            if "ipaddr" in cmd_payload:
                _uci(["set", f"network.lan.ipaddr={cmd_payload['ipaddr']}"])
            if "netmask" in cmd_payload:
                _uci(["set", f"network.lan.netmask={cmd_payload['netmask']}"])
            _uci(["commit", "network"])
            result["message"] = "LAN aggiornata"

        elif cmd_type == "update_monitor":
            result["message"] = "Monitoraggio aggiornato"

        elif cmd_type == "update_quota":
            result["message"] = "Quote aggiornate"

        elif cmd_type == "backup_save":
            if IS_PRODUCTION:
                subprocess.run(["sysupgrade", "-b", "/tmp/backup.tar.gz"], capture_output=True, timeout=30)
            result["message"] = "Backup salvato"

        elif cmd_type == "backup_restore":
            result["message"] = "Ripristino backup avviato"

        elif cmd_type == "force_retrieve":
            if IS_PRODUCTION:
                _service("restart", "openmptcprouter")
            result["message"] = "Force retrieve eseguito"

        elif cmd_type == "update_vps":
            result["message"] = "Aggiornamento VPS remota avviato"

        # --- Bypass / Failover ---
        elif cmd_type == "update_bypass":
            result = handle_bypass_update(cmd_payload)

        # --- OSPF ---
        elif cmd_type == "update_ospf":
            result = handle_ospf_update(cmd_payload)

        elif cmd_type == "ospf_show_neighbors":
            result = ospf_show_neighbors()

        elif cmd_type == "ospf_restart":
            _service("restart", "bird")
            result["message"] = "Bird2 riavviato"

        else:
            result["message"] = f"Comando {cmd_type} ricevuto"

        client.publish(f"{TOPIC_BASE}/command/ack", json.dumps(result))
        print(f"[{DEVICE_ID}] Risposta: {result.get('message', '')}")

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

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            break
        except Exception as e:
            print(f"[{DEVICE_ID}] Broker non raggiungibile: {e}, riprovo in 5s...")
            time.sleep(5)

    while True:
        try:
            telemetry = collect_telemetry()
            client.publish(f"{TOPIC_BASE}/telemetry", json.dumps(telemetry))
            active = sum(1 for w in telemetry["wan_status"] if w["is_up"])
            print(f"[{DEVICE_ID}] Telemetria inviata (WAN: {active}/{len(SIMULATED_WANS)}, BW: {telemetry['mptcp_status']['aggregated_bw_mbps']} Mbps)")
        except Exception as e:
            print(f"[{DEVICE_ID}] Errore telemetria: {e}")

        time.sleep(TELEMETRY_INTERVAL)


if __name__ == "__main__":
    main()
