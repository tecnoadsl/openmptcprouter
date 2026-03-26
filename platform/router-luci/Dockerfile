FROM openwrt/rootfs:x86_64-23.05.5

# Installa LuCI
RUN mkdir -p /var/lock /var/run && \
    opkg update && \
    opkg install luci luci-base luci-mod-admin-full luci-theme-bootstrap || true

# Password root vuota
RUN sed -i 's|root:x:|root::|' /etc/passwd 2>/dev/null || true

# uhttpd su tutte le interfacce
RUN echo -e '\
config uhttpd main\n\
\tlist listen_http "0.0.0.0:80"\n\
\tlist listen_http "[::]:80"\n\
\toption home /www\n\
\toption rfc1918_filter 0\n\
\tlist interpreter ".cgi=/usr/libexec/cgi-io"\n\
\tlist interpreter ".lua=/usr/bin/lua"\n\
\toption cgi_prefix /cgi-bin\n\
\toption script_timeout 60\n\
\toption network_timeout 30\n\
\toption max_connections 100\n\
\toption max_requests 10\n\
\toption tcp_keepalive 0\n\
\toption http_keepalive 0\n\
' > /etc/config/uhttpd

# Disabilita firewall e netifd (Docker gestisce la rete)
RUN rm -f /etc/rc.d/S19firewall /etc/rc.d/S22firewall && \
    rm -f /etc/rc.d/S20network /etc/rc.d/S21network && \
    echo '' > /etc/config/network && \
    echo -e 'config defaults\n\toption input ACCEPT\n\toption output ACCEPT\n\toption forward ACCEPT\n' > /etc/config/firewall

# Script che ripristina la rete Docker dopo init e poi avvia uhttpd
RUN echo '#!/bin/sh' > /docker-init.sh && \
    echo '# Avvia procd/init in background' >> /docker-init.sh && \
    echo '/sbin/procd &' >> /docker-init.sh && \
    echo 'sleep 2' >> /docker-init.sh && \
    echo '/sbin/ubusd &' >> /docker-init.sh && \
    echo 'sleep 1' >> /docker-init.sh && \
    echo '# Ripristina rete Docker' >> /docker-init.sh && \
    echo 'ip link set eth0 up 2>/dev/null' >> /docker-init.sh && \
    echo 'DOCKER_IP=$(cat /etc/docker_ip 2>/dev/null)' >> /docker-init.sh && \
    echo 'DOCKER_GW=$(cat /etc/docker_gw 2>/dev/null)' >> /docker-init.sh && \
    echo 'if [ -n "$DOCKER_IP" ]; then' >> /docker-init.sh && \
    echo '  ip addr add $DOCKER_IP dev eth0 2>/dev/null' >> /docker-init.sh && \
    echo '  ip route add default via $DOCKER_GW 2>/dev/null' >> /docker-init.sh && \
    echo 'fi' >> /docker-init.sh && \
    echo '# Avvia servizi OpenWrt' >> /docker-init.sh && \
    echo '/sbin/rpcd -s /var/run/ubus/ubus.sock -t 30 &' >> /docker-init.sh && \
    echo '/usr/sbin/uhttpd -f -h /www -r OpenWrt -x /cgi-bin -i .lua=/usr/bin/lua -t 60 -T 30 -k 0 -K 0 -p 0.0.0.0:80' >> /docker-init.sh && \
    chmod +x /docker-init.sh

# Entrypoint che cattura IP Docker prima di avviare
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'ip addr show eth0 | grep "inet " | awk "{print \$2}" > /etc/docker_ip' >> /entrypoint.sh && \
    echo 'ip route | grep default | awk "{print \$3}" > /etc/docker_gw' >> /entrypoint.sh && \
    echo 'exec /docker-init.sh' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
