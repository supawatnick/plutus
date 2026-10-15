#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DB_NAME="${PLUTUS_BACKUP_DB:-plutus}"
BACKUP_ROOT="${PLUTUS_BACKUP_DIR:-/var/backups/plutus}"
case "$DB_NAME" in plutus|plutus_test) ;; *) echo "DB_NAME must be plutus or plutus_test" >&2; exit 2;; esac
if [[ "$BACKUP_ROOT" != /* || "$BACKUP_ROOT" == "/" ]]; then echo "Backup path must be an absolute non-root directory" >&2; exit 2; fi
install -d -m 0700 "$BACKUP_ROOT"
time="$(date -u +'%Y%m%dT%H%M%SZ')"
partial="$BACKUP_ROOT/.${DB_NAME}-${time}-$$.partial"
target="$BACKUP_ROOT/${DB_NAME}-${time}-$$.dump"
trap 'rm -f -- "$partial"' EXIT
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_dump --format=custom --no-owner --dbname="$DB_NAME" > "$partial"
chmod 0600 "$partial"
test -s "$partial"
mv -- "$partial" "$target"
sha256sum "$target" > "$target.sha256"
chmod 0600 "$target.sha256"
find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${DB_NAME}-*.dump" -mtime +29 -print0 | while IFS= read -r -d '' old;do rm -- "$old" "$old.sha256";done
printf 'Backup saved: %s\n' "$target"
