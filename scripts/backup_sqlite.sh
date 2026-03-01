#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/home/ec2-user/data/college-twitter.db}"
BACKUP_DIR="/home/ec2-user/data/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/college-twitter-$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH" >&2
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

ls -1t "$BACKUP_DIR"/college-twitter-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f

echo "Backup created: $BACKUP_FILE"
