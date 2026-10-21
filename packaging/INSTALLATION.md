# PLUTUS Ubuntu 24.04 one-command installation

**Fresh Ubuntu 24.04 only.** This installer downloads/installs PostgreSQL 16, Node.js 24 (official binary SHA-256 verified), npm production dependencies, prepares the local PostgreSQL database, applies schema migrations, creates the first `itadmin` account, installs and starts the API/Web systemd units, and enables daily verified local PostgreSQL backup at 02:00 Asia/Bangkok (30-day retention). It performs HTTP health checks before reporting success.

## Installation

Download and verify the release archive and its `.sha256` file, then run:

```bash
sha256sum -c plutus-ubuntu24-<commit>.tar.gz.sha256
mkdir plutus-install && tar -xzf plutus-ubuntu24-<commit>.tar.gz -C plutus-install
cd plutus-install
sudo bash packaging/install.sh
```

Optional production HTTPS origin: `sudo PLUTUS_PUBLIC_ORIGIN=https://plutus.example.com bash packaging/install.sh`. This sets secure cookies. **The installer does not provision DNS, certificates or Cloudflare Tunnel**; these require domain/account authorization. Without this setting, installation uses localhost HTTP mode, which is unsuitable for remote/public login until configured.

The generated initial username/password are placed in `/root/.plutus/initial-admin-credentials` with root-only file permissions. Review and change the password after first login; never paste credentials into chat or commit them. Private runtime settings are stored in `/etc/plutus/plutus.env` (0600). LINE, OpenAI and Email integrations are deliberately not activated; they need separate credentials and provider verification.

The installer **refuses an existing** `/opt/plutus`, `/etc/plutus/plutus.env`, PLUTUS systemd unit, initial admin credentials file, or an existing `plutus` PostgreSQL database. It is NOT an upgrade script. Do not run this installer on the current production host. The package contains no database data or secrets. PostgreSQL uses a local peer-authenticated `root` database role, consistent with this project's current internal/root-run deployment; this is not a least-privilege hardened deployment.

Network prerequisites: outbound HTTPS to Ubuntu apt mirrors, nodejs.org and npm registry. Reverse proxy/Cloudflare Tunnel, firewall policy, DNS and off-host backups are out of scope and require environment-specific setup. The installer has not yet been executed end-to-end on a clean VM; perform a disposable-VM validation before treating it as generally production-ready.

## Checks and operations

```bash
sudo systemctl status plutus-api plutus-web plutus-backup.timer
curl -f http://127.0.0.1:4173/health
curl -f http://127.0.0.1:4173/api/v1/health
sudo systemctl start plutus-backup.service
ls -l /var/backups/plutus/
```

Source and package builder are in the Git repository. Use `bash packaging/build-release.sh` after build to produce the `.tar.gz` and SHA-256 checksum.
