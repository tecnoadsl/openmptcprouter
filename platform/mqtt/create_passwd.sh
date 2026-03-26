#!/bin/sh
# Genera il file password per Mosquitto
# Eseguire dentro il container: docker exec omr-mqtt sh /mosquitto/config/create_passwd.sh

mosquitto_passwd -b -c /mosquitto/config/passwd cloud_api CloudApiSecret123
mosquitto_passwd -b /mosquitto/config/passwd dashboard DashboardSecret123
mosquitto_passwd -b /mosquitto/config/passwd vps-dev-001 DeviceSecret123
mosquitto_passwd -b /mosquitto/config/passwd router-dev-001 DeviceSecret123

echo "Password file creato."
