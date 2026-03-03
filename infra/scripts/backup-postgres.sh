#!/usr/bin/env bash
# backup-postgres.sh — Nightly backup of shadow Postgres to Google Drive.
# Intended to be run by launchd (com.nexus.backup-postgres.plist).
#
# Retains 7 daily + 4 weekly backups.

set -euo pipefail

CONTAINER="nexus-shadow-postgres"
DB_USER="${SHADOW_PG_USER:-nexus_user}"
DB_NAME="${SHADOW_PG_DB:-NEXUSPRODv3}"
BACKUP_DIR="$HOME/Library/CloudStorage/GoogleDrive-paul.gagnon@keystone-restoration.com/My Drive/nexus-backups"
DATE=$(date +%Y%m%d-%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

DUMP_FILE="$BACKUP_DIR/daily/nexus-shadow-${DATE}.dump.gz"

echo "[$(date)] Starting shadow Postgres backup..."

# Dump and compress
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc | gzip > "$DUMP_FILE"

echo "[$(date)] Backup created: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# On Sundays, copy to weekly
if [ "$DAY_OF_WEEK" -eq 7 ]; then
  cp "$DUMP_FILE" "$BACKUP_DIR/weekly/nexus-shadow-weekly-${DATE}.dump.gz"
  echo "[$(date)] Weekly backup saved."
fi

# Rotate: keep 7 daily
ls -1t "$BACKUP_DIR/daily/"*.dump.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true

# Rotate: keep 4 weekly
ls -1t "$BACKUP_DIR/weekly/"*.dump.gz 2>/dev/null | tail -n +5 | xargs rm -f 2>/dev/null || true

echo "[$(date)] Backup complete. Daily: $(ls "$BACKUP_DIR/daily/" | wc -l | tr -d ' '), Weekly: $(ls "$BACKUP_DIR/weekly/" | wc -l | tr -d ' ')"
