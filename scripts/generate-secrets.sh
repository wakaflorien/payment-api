#!/usr/bin/env bash
# Creates random secrets for docker compose in ./secrets (git-ignored, mode 600).
# Existing files are kept, so re-running never rotates a secret by accident.
#
#   scripts/generate-secrets.sh
set -euo pipefail

dir="secrets"
mkdir -p "$dir"
chmod 700 "$dir"

for name in db_root_password db_app_password db_migrator_password jwt_secret \
  mtn_callback_token mtn_callback_secret airtel_callback_token airtel_callback_secret; do
  file="$dir/$name.txt"
  if [[ -s "$file" ]]; then
    echo "kept     $file"
  else
    openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48 >"$file"
    chmod 600 "$file"
    echo "created  $file"
  fi
done
