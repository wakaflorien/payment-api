#!/usr/bin/env bash
# Consistent, compressed logical backup of the Jali database.
#
#   scripts/db-backup.sh                      # uses DB_* from the environment or .env
#   BACKUP_DIR=/backups RETENTION_DAYS=30 scripts/db-backup.sh
#
# - --single-transaction: a consistent InnoDB snapshot without locking tables, so
#   payments keep flowing during the backup.
# - Writes <db>-<UTC timestamp>.sql.gz plus a .sha256 checksum, atomically (.partial, then mv).
# - The password goes through a temporary option file, never the command line or `ps`.
# - Deletes local backups older than RETENTION_DAYS. Offsite copies are handled by
#   the platform (see docs/DEPLOYMENT.md).
set -euo pipefail

if [[ -f .env && -z "${DB_HOST:-}" ]]; then
  set -a; source .env; set +a
fi
: "${DB_HOST:?DB_HOST is required}" "${DB_USERNAME:?DB_USERNAME is required}" "${DB_DATABASE:?DB_DATABASE is required}"
if [[ -n "${DB_PASSWORD_FILE:-}" ]]; then DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"; fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

options="$(mktemp)"
trap 'rm -f "$options"' EXIT
chmod 600 "$options"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$DB_HOST" "${DB_PORT:-3306}" "$DB_USERNAME" "${DB_PASSWORD:-}" >"$options"

file="$BACKUP_DIR/${DB_DATABASE}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
mysqldump --defaults-extra-file="$options" \
  --single-transaction --quick --routines --triggers --events \
  --hex-blob --no-tablespaces --set-gtid-purged=OFF \
  "$DB_DATABASE" | gzip -9 >"$file.partial"
mv "$file.partial" "$file"

if command -v sha256sum >/dev/null; then
  sha256sum "$file" >"$file.sha256"
else
  shasum -a 256 "$file" >"$file.sha256"
fi
chmod 600 "$file" "$file.sha256"

find "$BACKUP_DIR" -name "${DB_DATABASE}-*.sql.gz*" -type f -mtime "+$RETENTION_DAYS" -delete
echo "Backup written: $file ($(du -h "$file" | cut -f1))"
