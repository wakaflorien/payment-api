#!/usr/bin/env bash
# Restores a backup made by db-backup.sh into DB_DATABASE.
#
#   scripts/db-restore.sh backups/jali-20261104T020000Z.sql.gz
#
# Safety:
# - Verifies the .sha256 checksum first, when there is one.
# - Asks you to type the database name, because this overwrites its tables.
#   (CONFIRM=<database name> skips the prompt, for scripted restore drills.)
# - Stop the API (or scale it to 0) first, so nothing writes during the restore.
set -euo pipefail

backup="${1:?Usage: scripts/db-restore.sh <backup.sql.gz>}"
[[ -f "$backup" ]] || { echo "No such file: $backup" >&2; exit 1; }

if [[ -f .env && -z "${DB_HOST:-}" ]]; then
  set -a; source .env; set +a
fi
: "${DB_HOST:?DB_HOST is required}" "${DB_USERNAME:?DB_USERNAME is required}" "${DB_DATABASE:?DB_DATABASE is required}"
if [[ -n "${DB_PASSWORD_FILE:-}" ]]; then DB_PASSWORD="$(cat "$DB_PASSWORD_FILE")"; fi

if [[ -f "$backup.sha256" ]]; then
  expected="$(cut -d' ' -f1 "$backup.sha256")"
  actual="$( (command -v sha256sum >/dev/null && sha256sum "$backup" || shasum -a 256 "$backup") | cut -d' ' -f1)"
  [[ "$expected" == "$actual" ]] || { echo "Checksum mismatch: refusing to restore $backup" >&2; exit 1; }
  echo "Checksum OK."
fi

confirm="${CONFIRM:-}"
if [[ -z "$confirm" ]]; then
  read -r -p "This overwrites tables in '$DB_DATABASE' on $DB_HOST. Type the database name to continue: " confirm
fi
[[ "$confirm" == "$DB_DATABASE" ]] || { echo "Aborted." >&2; exit 1; }

options="$(mktemp)"
trap 'rm -f "$options"' EXIT
chmod 600 "$options"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$DB_HOST" "${DB_PORT:-3306}" "$DB_USERNAME" "${DB_PASSWORD:-}" >"$options"

gunzip -c "$backup" | mysql --defaults-extra-file="$options" "$DB_DATABASE"
echo "Restored $backup into $DB_DATABASE."
