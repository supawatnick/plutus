#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $# -ne 1 ]]; then echo "Usage: $0 /absolute/path/to/plutus-YYYYMMDD...dump" >&2;exit 2;fi
FILE="$1"
if [[ ! -f "$FILE" || "$FILE" != /* ]]; then echo "Backup file must exist at an absolute path" >&2;exit 2;fi
(cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256")
temp_db="plutus_restorecheck_$$"
cleanup() { runuser -u postgres -- dropdb --if-exists "$temp_db" >/dev/null 2>&1 || true; }
trap cleanup EXIT
runuser -u postgres -- createdb "$temp_db"
cat "$FILE" | runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_restore --no-owner --no-acl --exit-on-error -d "$temp_db"
count="$(runuser -u postgres -- psql -X -At -d "$temp_db" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('app_users','inventory','loans','audit_events')")"
if [[ "$count" != 4 ]];then echo "Restore failed schema validation: expected 4 core tables, found $count" >&2;exit 1;fi
echo "Restore validation passed in temporary database $temp_db"
