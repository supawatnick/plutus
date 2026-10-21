# Phase 04 Acceptance — updated 2026-10-21

## Verified in isolated test environment
- Frontend/backend build and TypeScript checks succeeded.
- Mock Playwright suite: 21 passed, 1 intentionally skipped (desktop-only mobile viewport assertion).
- Live browser → Express → PostgreSQL (`plutus_test` only): desktop and mobile checkout/return flows passed. On 2026-10-21, added real browser Admin create/deactivate/reactivate account tests and Viewer restricted access tests on both desktop/mobile: 6/6 live tests passed.
- PostgreSQL API integration passed: auth/RBAC, CSRF Origin rejection, inventory search/pagination, duplicate serials, concurrent stock checkouts, partial returns, isolated loan state, last-admin protection, session revocation and audit.
- Responsive Admin UI has user creation, role/active changes and latest 100 audit events; backend exclusively grants Admin access.
- Inventory list now requests 25 records per page from the server, with server search/status filtering.
- `plutus-backup.timer` was observed enabled and active. Prior isolated restore verification is documented in `docs/BACKUP.md`.
- Notification delivery worker and migration 005 tested on isolated PostgreSQL. Unconfigured channels remain PENDING and retry/backoff is asserted with no external send; real provider acknowledgement is still unverified.
- A loopback-only web origin and API reverse proxy now passes real browser→web origin→Express→PostgreSQL E2E on desktop/mobile. Production systemd units exist as uninstalled templates; see `docs/WEB_ORIGIN.md`.

## Still BLOCKING production acceptance
1. Production service is **not deployed**; credentials, initial administrator and LAN/HTTPS smoke tests remain unverified.
2. Real notification delivery (LINE/Email), provider acknowledgement and retry behavior are not verified; queued events are not sent messages.
3. Off-host encrypted backup, alerting and restore drills for the chosen operational environment are not verified.
4. Production UAT and final security review/sign-off remain outstanding.
5. Cloudflare Tunnel and public hostname `plutus.followthesunth.com` are managed separately by the owner. Do **not** change Cloudflare, DNS or tunnels as part of application development.

## Safety and operational constraints
- Work only on Plutus `10.10.110.3`, using the `ntap_plutus` connector. Do not modify `ntap-office`.
- Never run `npm run test:api` on the production database. The test script deletes rows and must target only `plutus_test`.
- Never mark Phase 04 COMPLETE until every applicable production blocker above has verified evidence.
- Do not commit credentials or use dummy production passwords.
