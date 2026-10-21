# PostgreSQL backup procedure

The backup script `scripts/backup-postgres.sh` creates custom-format pg_dump archives in a restricted directory, validates their archive index, and deletes matching archives older than `BACKUP_RETENTION_DAYS` (default: 30). It needs `BACKUP_DIR` and `DATABASE_URL` set in the calling process.

Example (run through a secret-managed environment, not a committed password):

```bash
BACKUP_DIR=/var/backups/plutus DATABASE_URL="$DATABASE_URL" bash scripts/backup-postgres.sh
```

Run daily from a dedicated scheduler with access to PostgreSQL credentials. Confirm backups and test restoration periodically. Same-host backups do **not** protect against disk/server loss; replicate off-host before production acceptance.

## Local restore verification

On 2026-10-15, the script successfully backed up isolated `plutus_test` and restored the archive to a separate `plutus_restore_check` PostgreSQL database. The resulting test database contained 3 assets and 3 loans (both queries succeeded).

Production backup scheduling is configured with `plutus-backup.timer`. On 2026-10-21 the previously failing backup service was fixed; a fresh production backup with checksum was generated and restored successfully into a temporary database. Off-host backup is still outstanding. `npm run ops:preflight` now fails if a backup is older than 36 hours, its checksum sidecar is missing, or SHA-256 verification fails. These checks detect on-host failures but cannot survive loss of this machine.
