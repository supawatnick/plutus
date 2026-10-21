#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${OFFHOST_MOUNT:?Set OFFHOST_MOUNT to a separately mounted backup destination}"
: "${OFFHOST_PASSPHRASE_FILE:?Set OFFHOST_PASSPHRASE_FILE to a root-only passphrase file}"
backup_dir="${BACKUP_DIR:-/var/backups/plutus}"
[[ "$OFFHOST_MOUNT" == /* && "$OFFHOST_MOUNT" != "/" ]] || { echo "Destination must be an absolute directory other than /" >&2; exit 2; }
[[ -d "$OFFHOST_MOUNT" ]] || { echo "Off-host destination unavailable" >&2; exit 2; }
mountpoint -q "$OFFHOST_MOUNT" || { echo "Destination is not a mounted filesystem; refusing local fallback" >&2; exit 2; }
[[ -f "$OFFHOST_PASSPHRASE_FILE" ]] || { echo "Passphrase file missing" >&2; exit 2; }
[[ $(stat -c %a "$OFFHOST_PASSPHRASE_FILE") == 600 ]] || { echo "Passphrase file must be mode 0600" >&2; exit 2; }
latest="$(find "$backup_dir" -maxdepth 1 -type f -name 'plutus-*.dump' -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)"
[[ -n "$latest" && -f "$latest.sha256" ]] || { echo "No validated backup found" >&2; exit 2; }
(cd "$backup_dir" && sha256sum -c "$(basename "$latest").sha256" >/dev/null)
dest="$OFFHOST_MOUNT/$(basename "$latest").gpg"
if [[ -e "$dest" ]];then echo "Already replicated $(basename "$dest")";exit 0;fi
tmp="$dest.partial"
trap 'rm -f -- "$tmp"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$OFFHOST_PASSPHRASE_FILE" --symmetric --cipher-algo AES256 --output "$tmp" "$latest"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "$OFFHOST_PASSPHRASE_FILE" --decrypt "$tmp" 2>/dev/null | sha256sum | awk '{print $1}' | grep -Fx "$(sha256sum "$latest" | awk '{print $1}')" >/dev/null
mv -- "$tmp" "$dest"
trap - EXIT
chmod 600 "$dest"
echo "Encrypted backup verified on separate mounted destination: $(basename "$dest")"
