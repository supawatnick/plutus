# PLUTUS Web Origin deployment (Cloudflare managed separately)

This guide prepares the application services only. The owner manages DNS, Cloudflare Tunnel and public TLS. Do not enable application services until a private production environment and an initial IT Admin account exist.

## Architecture

- `cloudflared` (managed by owner) -> `http://127.0.0.1:4173`
- `plutus-web.service` -> `scripts/serve-web.mjs` (static Vite build and /api proxy, loopback only)
- `plutus-api.service` -> `127.0.0.1:3001`
- PostgreSQL remains local and must never be publicly exposed.
- The existing `127.0.0.1:8080` listener is not owned by this deployment; do not change it.

## Prerequisites (not met/verified as of 2026-10-15)

1. Review dedicated non-root service account and read-only code permissions.
2. Provision `/etc/plutus/plutus.env` securely with database credentials and `PUBLIC_ORIGIN=https://plutus.followthesunth.com`, `COOKIE_SECURE=true`, `TRUST_PROXY=false`; restrict read access to service identity. Never commit production values.
3. Apply approved SQL migrations to production via `npm run db:migrate` only after backup and change review; test DB migrations are not production migrations.
4. Bootstrap Admin using a private one-time credential and rotate it.
5. Run `npm ci`, `npm run build`; configure service ownership and then stage the provided unit templates from `infra/systemd`. Do not install or start them blindly.
6. Validate locally: `curl http://127.0.0.1:4173/health` and `curl http://127.0.0.1:4173/api/v1/health`; test authenticated workflows through HTTPS when Cloudflare is set up.
7. Keep the notification scheduler disabled until LINE/Email credentials and provider smoke tests pass.

The automated `npm run test:e2e:live` checks the actual web origin proxy, Express API and isolated `plutus_test` PostgreSQL on loopback. It never uses the production database and is not public-domain UAT.
