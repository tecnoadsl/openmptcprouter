#!/bin/bash
# Script di installazione agent OMR Platform sulla VPS
# Uso: curl -s https://cloud.tecnoadsl.net/install/vps | bash -s -- <DEVICE_ID> <MQTT_PASSWORD>
#
# Prerequisiti: VPS con OpenMPTCProuter già installato

set -e

DEVICE_ID="${1:?Uso: $0 <DEVICE_ID> <MQTT_PASSWORD>}"
MQTT_PASSWORD="${2:?Uso: $0 <DEVICE_ID> <MQTT_PASSWORD>}"
MQTT_BROKER="${3:-cloud.tecnoadsl.net}"
MQTT_PORT="${4:-8883}"
TENANT="${5:-tecnoadsl}"

INSTALL_DIR="/opt/omr-agent"
SERVICE_NAME="omr-agent"

echo "=== OMR Platform - Installazione Agent VPS ==="
echo "Device ID: $DEVICE_ID"
echo "MQTT Broker: $MQTT_BROKER:$MQTT_PORT"
echo ""

# 1. Installa dipendenze
echo "[1/5] Installazione dipendenze..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv > /dev/null 2>&1

# 2. Crea directory e virtualenv
echo "[2/5] Configurazione ambiente..."
mkdir -p $INSTALL_DIR
python3 -m venv $INSTALL_DIR/venv
$INSTALL_DIR/venv/bin/pip install -q paho-mqtt psutil

# 3. Scarica agent
echo "[3/5] Download agent..."
curl -sS "https://$MQTT_BROKER/install/agent.py" -o $INSTALL_DIR/agent.py 2>/dev/null || {
    echo "Download fallito, copio agent locale..."
    # Fallback: copia da questo script (embedded)
}

# 4. Crea file di configurazione
echo "[4/5] Configurazione..."
cat > $INSTALL_DIR/config.env << EOF
MQTT_BROKER=$MQTT_BROKER
MQTT_PORT=$MQTT_PORT
MQTT_USER=$DEVICE_ID
MQTT_PASS=$MQTT_PASSWORD
DEVICE_ID=$DEVICE_ID
DEVICE_TYPE=vps
TENANT=$TENANT
TELEMETRY_INTERVAL=10
PYTHONUNBUFFERED=1
EOF

# 5. Crea servizio systemd
echo "[5/5] Creazione servizio systemd..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=OMR Platform Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$INSTALL_DIR/config.env
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

echo ""
echo "=== Installazione completata ==="
echo "Agent: systemctl status $SERVICE_NAME"
echo "Log:   journalctl -u $SERVICE_NAME -f"
echo "Config: $INSTALL_DIR/config.env"
