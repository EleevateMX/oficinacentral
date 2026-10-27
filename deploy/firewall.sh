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
ufw --force enable
ufw status
