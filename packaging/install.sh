#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Unattended fresh-host installer. Never upgrade an existing PLUTUS instance.
[[ "$EUID" -eq 0 ]] || { echo "Run with sudo/root" >&2; exit 1; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${PLUTUS_INSTALL_DIR:-/opt/plutus}"
DOMAIN="${PLUTUS_PUBLIC_ORIGIN:-}"
[[ "$TARGET" =~ ^/[a-zA-Z0-9_./-]+$ && "$TARGET" != "/" && "$TARGET" != *..* ]] || { echo "Use a safe absolute PLUTUS_INSTALL_DIR" >&2; exit 1; }
[[ -z "$DOMAIN" || "$DOMAIN" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || { echo "PLUTUS_PUBLIC_ORIGIN must be HTTPS" >&2; exit 1; }
[[ -f "$ROOT/apps/api/dist/server.js" && -f "$ROOT/apps/web/dist/index.html" && -f "$ROOT/package-lock.json" ]] || { echo "Release archive incomplete" >&2; exit 1; }
[[ -f /etc/os-release ]] || exit 1
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo "Installer supports Ubuntu 24.04 only" >&2; exit 1; }
for path in "$TARGET" /etc/plutus/plutus.env /etc/systemd/system/plutus-api.service /etc/systemd/system/plutus-web.service /root/.plutus/initial-admin-credentials; do
  [[ ! -e "$path" ]] || { echo "Existing installation found at $path: refusing overwrite" >&2; exit 1; }
done
if systemctl is-active --quiet plutus-api 2>/dev/null || systemctl is-active --quiet plutus-web 2>/dev/null; then
  echo "Existing PLUTUS service detected: refusing install" >&2; exit 1
fi
export DEBIAN_FRONTEND=noninteractive
echo "[1/8] Installing Ubuntu prerequisites and PostgreSQL 16"
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl tar xz-utils postgresql-16 postgresql-client-16
systemctl enable --now postgresql
echo "[2/8] Installing or checking Node.js 24+"
if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
  # Official Node.js release, integrity checked against official SHA256SUMS.
  NODE_VERSION="${PLUTUS_NODE_VERSION:-v24.13.0}"
  [[ "$NODE_VERSION" =~ ^v24\.[0-9]+\.[0-9]+$ ]] || { echo "Only Node.js v24.x.y versions supported" >&2; exit 1; }
  case "$(dpkg --print-architecture)" in amd64) ARCH=x64;; arm64) ARCH=arm64;; *) echo "Unsupported architecture" >&2; exit 1;; esac
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  base="https://nodejs.org/dist/$NODE_VERSION"
  curl --fail --silent --show-error --location "$base/SHASUMS256.txt" -o "$tmp/SHA256SUMS"
  file="node-$NODE_VERSION-linux-$ARCH.tar.xz"
  curl --fail --silent --show-error --location "$base/$file" -o "$tmp/$file"
  (cd "$tmp"; grep "  $file$" SHA256SUMS | sha256sum -c --status)
  mkdir -p /opt/plutus-node
  tar -xJf "$tmp/$file" -C /opt/plutus-node --strip-components=1
  ln -sfn /opt/plutus-node/bin/node /usr/local/bin/node
  ln -sfn /opt/plutus-node/bin/npm /usr/local/bin/npm
  rm -rf "$tmp"; trap - EXIT
fi
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
"$NODE_BIN" -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
echo "[3/8] Preparing local database (refusing existing PLUTUS database)"
if runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname='plutus'" | grep -qx 1; then
  echo "PostgreSQL database plutus already exists: refusing overwrite" >&2; exit 1
fi
# Root peer-authenticated local Unix socket matches internal deployment design.
if ! runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname='root'" | grep -qx 1; then
  runuser -u postgres -- createuser --superuser root
fi
runuser -u postgres -- createdb -O root plutus
echo "[4/8] Installing application dependencies"
install -d -m 0755 "$TARGET" /etc/plutus
cp -a "$ROOT/apps" "$ROOT/database" "$ROOT/scripts" "$ROOT/package.json" "$ROOT/package-lock.json" "$TARGET/"
(cd "$TARGET"; "$NPM_BIN" ci --omit=dev --no-audit --no-fund)
echo "[5/8] Creating private configuration and initializing schema"
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="http://localhost:4173"
  COOKIE_SECURE=false
else
  COOKIE_SECURE=true
fi
cat > /etc/plutus/plutus.env <<EOF
DATABASE_URL=postgresql://root@localhost/plutus?host=/var/run/postgresql
NODE_ENV=production
PORT=3001
PUBLIC_ORIGIN=$DOMAIN
COOKIE_SECURE=$COOKIE_SECURE
TRUST_PROXY=false
EOF
chmod 600 /etc/plutus/plutus.env
(cd "$TARGET"; DATABASE_URL='postgresql://root@localhost/plutus?host=/var/run/postgresql' "$NODE_BIN" scripts/migrate.mjs)
echo "[6/8] Creating initial Admin credentials (local root-only file)"
(cd "$TARGET"; DATABASE_URL='postgresql://root@localhost/plutus?host=/var/run/postgresql' "$NODE_BIN" scripts/bootstrap-internal-admin.mjs)
echo "[7/8] Enabling systemd web/API and daily PostgreSQL backups"
for svc in api web; do
  sed -e "s|@TARGET@|$TARGET|g" -e "s|@NODE@|$NODE_BIN|g" "$ROOT/packaging/plutus-$svc.service.template" > "/etc/systemd/system/plutus-$svc.service"
  chmod 644 "/etc/systemd/system/plutus-$svc.service"
done
sed -e "s|@TARGET@|$TARGET|g" "$ROOT/packaging/plutus-backup.service.template" > /etc/systemd/system/plutus-backup.service
install -m 0644 "$ROOT/packaging/plutus-backup.timer" /etc/systemd/system/plutus-backup.timer
systemctl daemon-reload
systemctl enable --now plutus-api plutus-web plutus-backup.timer
systemctl start plutus-backup.service
echo "[8/8] Checking local health"
for i in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4173/health >/dev/null && curl --fail --silent http://127.0.0.1:4173/api/v1/health >/dev/null; then
    echo "PLUTUS installed successfully. Local endpoint: http://127.0.0.1:4173"
    echo "Admin credentials: /root/.plutus/initial-admin-credentials (do not share)"
    echo "Backups: /var/backups/plutus; daily timer enabled"
    [[ "$COOKIE_SECURE" == true ]] || echo "NOTICE: Configure HTTPS and PUBLIC_ORIGIN before external use; local-only HTTP mode."
    exit 0
  fi
  sleep 1
done
echo "Installation completed but health check failed. Review journalctl -u plutus-api -u plutus-web." >&2
exit 1
