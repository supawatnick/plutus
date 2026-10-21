#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${DATABASE_URL:?DATABASE_URL is required}"
retention="${BACKUP_RETENTION_DAYS:-30}"
[[ "$retention" =~ ^[0-9]+$ ]] || { echo 'BACKUP_RETENTION_DAYS must be numeric' >&2; exit 2; }
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
path="$BACKUP_DIR/plutus-$stamp.dump"
tmp="$path.partial"
trap 'rm -f "$tmp"' EXIT
pg_dump --format=custom --no-owner --no-privileges --file="$tmp" "$DATABASE_URL"
pg_restore --list "$tmp" >/dev/null
mv -- "$tmp" "$path"
trap - EXIT
chmod 600 "$path"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$path")" > "$(basename "$path").sha256")
chmod 600 "$path.sha256"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'plutus-*.dump' -mtime +"$retention" -delete
printf 'Verified backup archive: %s\n' "$path"
