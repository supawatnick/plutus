# PLUTUS Ubuntu installation package

Target: fresh Ubuntu 24.04 installation; Node.js 24+ and PostgreSQL 16+ are prerequisites. The package contains compiled web/API, SQL migrations and systemd service templates. The installer downloads production npm dependencies from the npm registry.

**Existing production server warning:** do not run this installer on the current PLUTUS host. It refuses to overwrite /etc/plutus/plutus.env, existing service units or the chosen install directory. Production upgrades require a separately tested backup/upgrade procedure.

## Fresh install

1. Install/configure Node.js 24+, PostgreSQL 16+, npm, and a PostgreSQL role/database with only necessary privileges. Provision a TLS-enabled reverse proxy/Cloudflare Tunnel separately. Do not expose Postgres or Express directly to the internet.
2. Extract the archive on the new server and run `sudo bash packaging/install.sh` from its root directory. Optionally choose a new directory using `PLUTUS_INSTALL_DIR=/opt/plutus`. Installer copies compiled artifacts and installs npm production dependencies but **does not start the app**.
3. Create `/etc/plutus/plutus.env` from `/etc/plutus/plutus.env.example` and replace every placeholder with real values; set `chmod 600 /etc/plutus/plutus.env`. Ensure PostgreSQL role/database exist; do not use default/example passwords. Do not put secrets in Git.
4. Apply migrations using `cd /opt/plutus && set -a && source /etc/plutus/plutus.env && set +a && npm run db:migrate`. Only apply to a **new empty database** after taking backups; never point to a production database without a reviewed migration plan.
5. Bootstrap the first Admin account per `scripts/bootstrap-internal-admin.mjs` (review its usage before running). Rotate credentials after first login.
6. Start services: `sudo systemctl enable --now plutus-api plutus-web`. Check `curl -f http://127.0.0.1:4173/health` and `curl -f http://127.0.0.1:4173/api/v1/health`.
7. Configure your own HTTPS tunnel/reverse proxy and daily backups; perform a restore drill. LINE and notification timers are intentionally **not enabled** by this installer.

## Package contents and trust

The release archive is assembled from an explicit whitelist: compiled API + Web, `scripts`, `database`, npm lock/package files and `packaging`. It excludes `.env`, tokens, local backup data, `.private`, and Git metadata. Validate the accompanying SHA-256 checksum before extraction. Source code is on GitHub; the installation archive is a deployment artifact, not a Debian .deb package.

The installer uses root systemd units to match the approved internal deployment architecture. A least-privilege dedicated service account and off-host disaster recovery remain future hardening work.
