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
- A loopback-only web origin and API reverse proxy passed real browser→web origin→Express→PostgreSQL E2E on desktop/mobile. Production API/Web systemd units are installed, enabled and active; see `docs/WEB_ORIGIN.md`.

## Current scope
- Phase 04 prioritizes Web/Mobile, LAN deployment, security, backup and UAT. LINE chatbot, LINE notifications and optional AI integration are deferred to Phase 05. They do not block Phase 04 acceptance. Email delivery is also optional for Phase 04.
- Run `npm run ops:preflight` for a non-mutating readiness check. On 2026-10-21 the root-run production service, private environment, API/Web listeners, Admin account, recent backup, and SHA-256 checksum all passed: 17/17. This checks on-host backup health only, not off-host replication.

## Phase 04 acceptance (local-backup scope approved by owner)
- **Accepted functional UAT:** Owner confirmed sign-in, user creation, asset creation, checkout/return and password change through the production web app.
- **Accepted deployment checks:** Active API/Web services on loopback ports 3001/4173, HTTPS public HTTP 200, and `npm run ops:preflight` 17/17 PASS on 2026-10-21.
- **Accepted local backup:** Scheduled backup, recent archive SHA-256 verification and prior isolated restore drill passed. A disk/server failure can destroy both production data and its local backups.
- **Deferred, not Phase 04 blockers:** Off-host NFS/AES-256 replication (per owner decision), LINE/Email/AI integration and additional alerting.
- **Ongoing operations:** Monitor daily backup outcome and freshness, rotate initial Admin credentials, and repeat the isolated restore drill periodically. Cloudflare remains owner-managed.

**Phase 04 status: ACCEPTED for the agreed internal-use, local-backup scope.** This is not a claim of off-host disaster recovery or external security certification.

## Safety and operational constraints
- Work only on Plutus `10.10.110.3`, using the `ntap_plutus` connector. Do not modify `ntap-office`.
- Never run `npm run test:api` on the production database. The test script deletes rows and must target only `plutus_test`.
- Phase 04 acceptance is limited to the owner-approved internal deployment and local-backup scope. Do not claim off-host disaster recovery has been verified.
- Do not commit credentials or use dummy production passwords.
