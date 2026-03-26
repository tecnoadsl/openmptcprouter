FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iproute2 procps net-tools gcc python3-dev openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Crea struttura directory che l'admin si aspetta
RUN mkdir -p /etc/shorewall /etc/shorewall6 /etc/openmptcprouter-vps-admin \
    /etc/openvpn /etc/shadowsocks-libev /etc/glorytun-tcp /etc/glorytun-udp \
    /etc/iperf3 /etc/v2ray /etc/xray /etc/dsvpn /etc/mlvpn \
    /var/log/openvpn

# File di configurazione simulati
RUN echo 'NET_IFACE=eth0' > /etc/shorewall/params.net && \
    echo 'NET_IFACE=eth0' > /etc/shorewall6/params.net

# Config iniziale vps-admin
COPY omr-admin-config.json /etc/openmptcprouter-vps-admin/omr-admin-config.json

# Genera certificati SSL self-signed
RUN openssl req -x509 -newkey rsa:2048 -keyout /etc/openmptcprouter-vps-admin/key.pem \
    -out /etc/openmptcprouter-vps-admin/cert.pem -days 3650 -nodes \
    -subj "/CN=omr-vps-admin"

RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] pyjwt passlib[bcrypt] python-multipart \
    psutil netifaces netaddr requests pydantic cryptography

COPY omr-admin.py .

EXPOSE 65500

CMD ["python", "-u", "omr-admin.py", "--host", "0.0.0.0", "--port", "65500", "--workers", "1"]
