#!/usr/bin/env bash
set -Eeuo pipefail

# Fresh-install only: never replace an existing PLUTUS installation automatically.
if [[ "${EUID}" -ne 0 ]]; then echo "Run as root (sudo bash install.sh)" >&2; exit 1; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${PLUTUS_INSTALL_DIR:-/opt/plutus}"
ENV_DIR="/etc/plutus"
if [[ -e "$TARGET" || -e "$ENV_DIR/plutus.env" || -e /etc/systemd/system/plutus-api.service || -e /etc/systemd/system/plutus-web.service ]]; then
  echo "Existing PLUTUS installation detected; refusing to overwrite. Use a separate upgrade procedure." >&2
  exit 1
fi
for bin in node npm psql systemctl install cp; do
  command -v "$bin" >/dev/null || { echo "Missing prerequisite: $bin" >&2; exit 1; }
done
major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( major < 24 )); then echo "Node.js 24+ required" >&2; exit 1; fi
if [[ ! -f "$ROOT/apps/api/dist/server.js" || ! -f "$ROOT/apps/web/dist/index.html" || ! -f "$ROOT/package-lock.json" ]]; then
  echo "Incomplete release bundle (compiled API/Web or lockfile missing)" >&2; exit 1
fi
echo "Installing PLUTUS into $TARGET (services will NOT start automatically)."
install -d -m 0755 "$TARGET" "$ENV_DIR"
cp -a "$ROOT/apps" "$ROOT/database" "$ROOT/scripts" "$ROOT/package.json" "$ROOT/package-lock.json" "$TARGET/"
cd "$TARGET"
npm ci --omit=dev --ignore-scripts=false --no-audit --no-fund
# Do not use git/build-time credentials. Configure the actual DB before migration and startup.
nodebin="$(command -v node)"
cat > "$ENV_DIR/plutus.env.example" <<'ENV'
# Copy to plutus.env, then chmod 600. Never commit production secrets.
DATABASE_URL=postgresql://plutus_app:REPLACE_ME@127.0.0.1:5432/plutus
NODE_ENV=production
PORT=3001
PUBLIC_ORIGIN=https://plutus.example.com
COOKIE_SECURE=true
TRUST_PROXY=false
# LINE_CHANNEL_SECRET=
# LINE_CHANNEL_ACCESS_TOKEN=
# OPENAI_API_KEY=
ENV
chmod 0600 "$ENV_DIR/plutus.env.example"
for svc in api web; do
  install -m 0644 "$ROOT/packaging/plutus-$svc.service.template" "/etc/systemd/system/plutus-$svc.service"
  sed -i "s|@TARGET@|$TARGET|g; s|@NODE@|$nodebin|g" "/etc/systemd/system/plutus-$svc.service"
done
systemctl daemon-reload
echo "Installed. NEXT: create /etc/plutus/plutus.env (chmod 600), provision PostgreSQL, run migrations and bootstrap admin; then systemctl enable --now plutus-api plutus-web. See INSTALLATION.md."
