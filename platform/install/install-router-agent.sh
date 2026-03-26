#!/bin/sh
# Script di installazione agent OMR Platform sul Router OpenWrt
# Uso: curl -s https://cloud.tecnoadsl.net/install/router | sh -s -- <DEVICE_ID> <MQTT_PASSWORD>
#
# Prerequisiti: Router con OpenMPTCProuter già installato

DEVICE_ID="${1:?Uso: $0 <DEVICE_ID> <MQTT_PASSWORD>}"
MQTT_PASSWORD="${2:?Uso: $0 <DEVICE_ID> <MQTT_PASSWORD>}"
MQTT_BROKER="${3:-cloud.tecnoadsl.net}"
MQTT_PORT="${4:-8883}"
TENANT="${5:-tecnoadsl}"

INSTALL_DIR="/opt/omr-agent"

echo "=== OMR Platform - Installazione Agent Router ==="
echo "Device ID: $DEVICE_ID"
echo ""

# 1. Installa dipendenze (OpenWrt usa opkg)
echo "[1/4] Installazione dipendenze..."
opkg update > /dev/null 2>&1
opkg install python3 python3-pip > /dev/null 2>&1
pip3 install paho-mqtt psutil > /dev/null 2>&1

# 2. Crea directory
echo "[2/4] Configurazione..."
mkdir -p $INSTALL_DIR

# 3. Download agent
echo "[3/4] Download agent..."
curl -sS "https://$MQTT_BROKER/install/router-agent.py" -o $INSTALL_DIR/agent.py 2>/dev/null

# 4. Crea config e init script
cat > $INSTALL_DIR/config << EOF
MQTT_BROKER=$MQTT_BROKER
MQTT_PORT=$MQTT_PORT
MQTT_USER=$DEVICE_ID
MQTT_PASS=$MQTT_PASSWORD
DEVICE_ID=$DEVICE_ID
DEVICE_TYPE=router
TENANT=$TENANT
TELEMETRY_INTERVAL=10
EOF

cat > /etc/init.d/omr-agent << 'INITEOF'
#!/bin/sh /etc/rc.common
START=99
STOP=10
USE_PROCD=1

start_service() {
    . /opt/omr-agent/config
    procd_open_instance
    procd_set_param command python3 /opt/omr-agent/agent.py
    procd_set_param env \
        MQTT_BROKER="$MQTT_BROKER" \
        MQTT_PORT="$MQTT_PORT" \
        MQTT_USER="$MQTT_USER" \
        MQTT_PASS="$MQTT_PASS" \
        DEVICE_ID="$DEVICE_ID" \
        DEVICE_TYPE="$DEVICE_TYPE" \
        TENANT="$TENANT" \
        TELEMETRY_INTERVAL="$TELEMETRY_INTERVAL"
    procd_set_param respawn
    procd_set_param stdout 1
    procd_set_param stderr 1
    procd_close_instance
}
INITEOF

chmod +x /etc/init.d/omr-agent
/etc/init.d/omr-agent enable
/etc/init.d/omr-agent start

echo ""
echo "=== Installazione completata ==="
echo "Agent: /etc/init.d/omr-agent status"
echo "Log:   logread | grep omr-agent"
echo "Config: $INSTALL_DIR/config"
