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

## Encrypted off-host replication (prepared; destination not connected)

On 2026-10-21, no separate backup filesystem was mounted. `scripts/replicate-backup.sh` was added to encrypt the latest checksum-verified backup using GPG AES-256 and verify decryption before publishing. It **refuses** destinations that are not actual mountpoints, preventing an accidental second copy on the same disk. Use a dedicated remote NFS/SMB mount or removable mounted volume (physically separate from Plutus). Create a private passphrase file (mode `0600`) and store a recoverable copy of that passphrase outside this machine. Example when the mounted destination is ready:

```bash
OFFHOST_MOUNT=/mnt/plutus-offhost OFFHOST_PASSPHRASE_FILE=/etc/plutus/offhost-passphrase bash scripts/replicate-backup.sh
```

Check the encrypted file from another machine and perform an actual off-host recovery drill before claiming production backup redundancy. Never store the passphrase in Git. Automation is intentionally **not enabled** until the destination and encryption key are configured and verified.
