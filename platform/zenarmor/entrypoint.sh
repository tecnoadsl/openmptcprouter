#!/bin/bash
echo "[Zenarmor] Avvio..."

# Verifica se Zenarmor è installato
if command -v zncli &> /dev/null; then
    echo "[Zenarmor] Zenarmor installato, avvio servizio..."
    # Avvia il daemon Zenarmor
    zenarmord start || true
    # Mantieni il container attivo
    tail -f /var/log/zenarmor/*.log 2>/dev/null || sleep infinity
else
    echo "[Zenarmor] NOTA: Zenarmor richiede installazione manuale in produzione."
    echo "[Zenarmor] In Docker dev mode, il container è pronto per test."
    echo "[Zenarmor] Per installare: curl -s https://updates.sunnyvalley.io/getzenarmor | bash"
    echo "[Zenarmor] Container in standby..."
    sleep infinity
fi
