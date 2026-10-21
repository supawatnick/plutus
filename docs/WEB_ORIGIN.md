# PLUTUS Web Origin deployment (Cloudflare managed separately)

This guide prepares the application services only. The owner manages DNS, Cloudflare Tunnel and public TLS. Do not enable application services until a private production environment and an initial IT Admin account exist.

## Architecture

- `cloudflared` (managed by owner) -> `http://127.0.0.1:4173`
- `plutus-web.service` -> `scripts/serve-web.mjs` (static Vite build and /api proxy, loopback only)
- `plutus-api.service` -> `127.0.0.1:3001`
- PostgreSQL remains local and must never be publicly exposed.
- The existing `127.0.0.1:8080` listener is not owned by this deployment; do not change it.

## Prerequisites (not met/verified as of 2026-10-15)

1. Internal deployment uses root service identity as requested by the owner. The workspace root-only parent directory remains unchanged.
2. Provision `/etc/plutus/plutus.env` securely with database credentials and `PUBLIC_ORIGIN=https://plutus.followthesunth.com`, `COOKIE_SECURE=true`, `TRUST_PROXY=false`; restrict read access to service identity. Never commit production values.
3. Apply approved SQL migrations to production via `npm run db:migrate` only after backup and change review; test DB migrations are not production migrations.
4. Bootstrap Admin using a private one-time credential and rotate it.
5. Run `npm ci`, `npm run build`; configure service ownership and then stage the provided unit templates from `infra/systemd`. Do not install or start them blindly.
6. Validate locally: `curl http://127.0.0.1:4173/health` and `curl http://127.0.0.1:4173/api/v1/health`; test authenticated workflows through HTTPS when Cloudflare is set up.
7. Keep the notification scheduler disabled until LINE/Email credentials and provider smoke tests pass.

## Actual deployment status (2026-10-21)

Internal root-run API and web services are enabled and active. PostgreSQL `plutus` migrations 001–005 were applied; tables in the Plutus database are owned by root. Local loopback API/Web health returned 200 and the Cloudflare public hostname responded HTTP 200. The initial `itadmin` account was bootstrapped with a random password saved under `/root/.plutus/initial-admin-credentials` (0600); retrieve only through trusted root SSH and rotate after first login. Public unauthenticated API returned HTTP 401. Production Preflight on 2026-10-21 passed 14/14. **Authenticated human UAT is still outstanding.**

## Read-only deployment readiness gate

Run `npm run ops:preflight` as a pre-deployment check. It makes no system or database changes; it reports service identity, restricted environment file, secure public origin, cookie settings, compiled artifacts, backup timer and the local API/Web listeners. Exit code `2` means the system is **not ready**. On 2026-10-21 the gate reported 3/9 PASS: web/API artifacts and backup timer were ready; the production service account, environment and running services/ports were absent. Set up production secrets out of Git before enabling systemd units. Cloudflare remains owner-managed.

The automated `npm run test:e2e:live` checks the actual web origin proxy, Express API and isolated `plutus_test` PostgreSQL on loopback. It never uses the production database and is not public-domain UAT.
