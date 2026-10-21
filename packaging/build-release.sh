#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f apps/api/dist/server.js && -f apps/web/dist/index.html ]] || { echo "Build first: npm run build" >&2; exit 1; }
version="$(git rev-parse --short HEAD)"
out="${1:-release}"
mkdir -p "$out"
archive="$out/plutus-ubuntu24-$version.tar.gz"
tar -czf "$archive" package.json package-lock.json apps/api/package.json apps/api/dist apps/web/package.json apps/web/dist scripts database packaging
sha256sum "$archive" > "$archive.sha256"
echo "Created $archive"
echo "Created $archive.sha256"
