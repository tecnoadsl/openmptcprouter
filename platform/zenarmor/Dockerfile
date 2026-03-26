FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl gnupg ca-certificates iproute2 procps net-tools \
    libnetfilter-queue1 libpcap0.8 iptables nftables \
    python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

# Installa Zenarmor
RUN curl -s https://updates.sunnyvalley.io/getzenarmor | bash || true

# Se Zenarmor non si installa in Docker (probabile), usiamo
# un setup manuale con le componenti che funzionano
RUN mkdir -p /var/log/zenarmor /etc/zenarmor

# Script di avvio
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 9090

CMD ["/entrypoint.sh"]
