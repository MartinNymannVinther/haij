#!/usr/bin/env bash
#
# Nightly encrypted backup of the Haij database to EU object storage.
#
# Runs on the VPS, not in the container. Install as /root/backup-haij.sh
# (chmod 700) and schedule it from cron; see docs/deploy.md.
#
# The dump is encrypted before it ever leaves the machine, with a public
# key. The matching private key belongs in your password manager and
# nowhere else: a backup an attacker on the server can read is a copy of
# every customer, invoice and hour you have.
#
# Requires: docker, age, rclone (with an EU remote configured).

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RECIPIENT_FILE="${RECIPIENT_FILE:-/root/haij-backup.pub}"
REMOTE="${REMOTE:-eu-storage:haij-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-$(docker ps -qf name=db | head -1)}"

if [[ -z "$DB_CONTAINER" ]]; then
  echo "backup-haij: no database container found" >&2
  exit 1
fi
if [[ ! -r "$RECIPIENT_FILE" ]]; then
  echo "backup-haij: no age recipient at $RECIPIENT_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
TARGET="$BACKUP_DIR/haij-$STAMP.dump.age"

# Write to a temporary name first: a half-written file that looks like a
# backup is worse than no file at all, because you will trust it.
docker exec "$DB_CONTAINER" pg_dump -U postgres -Fc haij \
  | age -r "$(cat "$RECIPIENT_FILE")" \
  > "$TARGET.partial"
mv "$TARGET.partial" "$TARGET"

rclone copy "$TARGET" "$REMOTE/"

find "$BACKUP_DIR" -name 'haij-*.dump.age' -mtime "+$KEEP_DAYS" -delete

echo "backup-haij: $TARGET ($(stat -c %s "$TARGET") bytes) -> $REMOTE/"
