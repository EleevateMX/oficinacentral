#!/usr/bin/env bash
# Copia los respaldos del VPS a tu computadora.
# Uso: ./deploy/backup-download.sh usuario@ip-del-vps [carpeta-destino]
set -euo pipefail
HOST="${1:?Uso: $0 usuario@ip [destino]}"
DEST="${2:-./backups}"
mkdir -p "$DEST"
ssh "$HOST" 'cd ~/oficinacentral && docker compose cp app:/data/backups /tmp/office-backups && tar -C /tmp -czf /tmp/office-backups.tgz office-backups && rm -rf /tmp/office-backups'
scp "$HOST:/tmp/office-backups.tgz" "$DEST/office-backups-$(date +%F).tgz"
ssh "$HOST" 'rm -f /tmp/office-backups.tgz'
echo "Respaldos guardados en $DEST"
