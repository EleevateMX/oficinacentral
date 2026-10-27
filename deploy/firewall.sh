#!/usr/bin/env bash
# Abre solo los puertos necesarios (Ubuntu/Debian con ufw).
set -euo pipefail
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 49160:49200/udp
# LiveKit (servidor de medios)
ufw allow 7881/tcp
ufw allow 50000:50200/udp
ufw --force enable
ufw status
