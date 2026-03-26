#!/bin/bash
# Deploy OMR Platform su aicore.tecnoadsl.net
# Uso: ssh root@aicore.tecnoadsl.net 'bash -s' < deploy-aicore.sh
#
# Oppure copialo su aicore e esegui: bash deploy-aicore.sh

set -e

echo "=== OMR Platform - Deploy su aicore.tecnoadsl.net ==="
echo ""

# 1. Dipendenze
echo "[1/6] Installazione dipendenze..."
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-plugin git curl > /dev/null 2>&1

# Avvia Docker se non attivo
systemctl enable docker
systemctl start docker

# 2. Clone/update repo
echo "[2/6] Download progetto..."
INSTALL_DIR="/opt/omr-platform"

if [ -d "$INSTALL_DIR/.git" ]; then
    cd $INSTALL_DIR
    git fetch origin
    git checkout feature/management-platform
    git pull origin feature/management-platform
else
    git clone https://github.com/tecnoadsl/openmptcprouter.git $INSTALL_DIR
    cd $INSTALL_DIR
    git checkout feature/management-platform
fi

cd $INSTALL_DIR/platform

# 3. Ferma vecchi container se esistono
echo "[3/6] Pulizia vecchi container..."
docker compose down 2>/dev/null || true

# 4. Build e avvio controller
echo "[4/6] Build e avvio controller (API, Dashboard, MQTT, DB, Redis)..."
docker compose up -d --build

# 5. Avvio build server
echo "[5/6] Build e avvio build server (compilazione firmware)..."
docker compose --profile build up -d --build build-server

# 6. Verifica
echo "[6/6] Verifica servizi..."
sleep 10

echo ""
echo "=== Stato servizi ==="
docker compose --profile build ps
echo ""

# Test endpoints
echo "=== Test endpoints ==="
echo -n "API (8000): "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ 2>&1
echo ""
echo -n "Dashboard (3000): "
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>&1
echo ""
echo -n "Build Server (8085): "
curl -s -o /dev/null -w "%{http_code}" http://localhost:8085/ 2>&1
echo ""

echo ""
echo "=== Deploy completato ==="
echo ""
echo "Dashboard Cloud:    http://aicore.tecnoadsl.net:3000"
echo "Dashboard Router:   http://aicore.tecnoadsl.net:8090"
echo "Dashboard VPS:      http://aicore.tecnoadsl.net:8091"
echo "API:                http://aicore.tecnoadsl.net:8000"
echo "API Docs:           http://aicore.tecnoadsl.net:8000/docs"
echo "Build Server:       http://aicore.tecnoadsl.net:8085"
echo "MQTT:               aicore.tecnoadsl.net:1883"
echo ""
echo "Login: admin@tecnoadsl.net / admin"
echo ""
echo "Per aggiornare in futuro:"
echo "  cd $INSTALL_DIR/platform && git pull && docker compose up -d --build"
