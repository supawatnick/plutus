# Phase 04 Acceptance — updated 2026-10-21

## Verified in isolated test environment
- Frontend/backend build and TypeScript checks succeeded.
- Mock Playwright suite: 23 passed, 1 intentionally skipped as of 2026-10-21. Production UAT confirmed by owner: sign-in, create account, create inventory, checkout/return, password changes.
- Live browser → Express → PostgreSQL (`plutus_test` only): desktop and mobile checkout/return flows passed. On 2026-10-21, added real browser Admin create/deactivate/reactivate account tests and Viewer restricted access tests on both desktop/mobile: 6/6 live tests passed.
- PostgreSQL API integration passed: auth/RBAC, CSRF Origin rejection, inventory search/pagination, duplicate serials, concurrent stock checkouts, partial returns, isolated loan state, last-admin protection, session revocation and audit.
- Responsive Admin UI has user creation, role/active changes and latest 100 audit events; backend exclusively grants Admin access.
- Inventory list now requests 25 records per page from the server, with server search/status filtering.
- On 2026-10-21, the daily backup service was repaired; a new production backup and checksum were generated and restored into a temporary database. The backup timer remains active. Off-host redundancy remains outstanding.
- Notification delivery worker and migration 005 tested on isolated PostgreSQL. Unconfigured channels remain PENDING and retry/backoff is asserted with no external send; real provider acknowledgement is still unverified.
- A loopback-only web origin and API reverse proxy now passes real browser→web origin→Express→PostgreSQL E2E on desktop/mobile. Production systemd units exist as uninstalled templates; see `docs/WEB_ORIGIN.md`.

## Current scope
- Phase 04 prioritizes Web/Mobile, LAN deployment, security, backup and UAT. LINE chatbot, LINE notifications and optional AI integration are deferred to Phase 05. They do not block Phase 04 acceptance. Email delivery is also optional for Phase 04.
- Run `npm run ops:preflight` for a non-mutating readiness check. On 2026-10-21 the root-run production service, private environment, API/Web listeners, Admin account, recent backup, and SHA-256 checksum all passed: 17/17. This checks on-host backup health only, not off-host replication.

## Still BLOCKING production acceptance
1. Production API/Web services have been deployed on root-run loopback ports 3001/4173; HTTPS public hostname returned HTTP 200 and unauthenticated API returned 401. Initial Admin was created. **Human authenticated UAT, backup restore and operational acceptance remain outstanding.**
2. LINE/Email delivery is deferred/optional and not a Phase 04 blocker. Delivery to real providers remains unverified and must not be represented as active.
3. An AES-256 off-host backup replication script is ready and refuses non-mounted targets, but no independent storage mount, passphrase, alert channel or off-host restore drill has been verified. Off-host redundancy remains blocking.
4. Owner completed core production UAT (asset, user, checkout/return, password); final security and operations sign-off remain outstanding.
5. Cloudflare Tunnel and public hostname `plutus.followthesunth.com` are managed separately by the owner. Do **not** change Cloudflare, DNS or tunnels as part of application development.

## Safety and operational constraints
- Work only on Plutus `10.10.110.3`, using the `ntap_plutus` connector. Do not modify `ntap-office`.
- Never run `npm run test:api` on the production database. The test script deletes rows and must target only `plutus_test`.
- Never mark Phase 04 COMPLETE until every applicable production blocker above has verified evidence.
- Do not commit credentials or use dummy production passwords.
