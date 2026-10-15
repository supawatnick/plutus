# Plutus local deployment runbook (not yet deployed)

Requirements: Node.js 24, PostgreSQL 16+ database, HTTPS reverse proxy before exposing outside the machine.
Run from the repository root:
1. `npm ci`
2. Set `DATABASE_URL` in a private server environment, keep it out of Git.
3. `node scripts/migrate.mjs`
4. Set `BOOTSTRAP_ADMIN_USERNAME` and a random 16+ character `BOOTSTRAP_ADMIN_PASSWORD` securely.
5. `node scripts/bootstrap-admin.mjs` (run **once**); immediately unset bootstrap credentials.
6. For local **HTTP only**, set `COOKIE_SECURE=false`; production must use `COOKIE_SECURE=true` behind HTTPS.
7. `npm run build`, then start backend with `node apps/api/dist/server.js`.
8. Serve `apps/web/dist` through an HTTPS reverse proxy that forwards `/api` to 127.0.0.1:3001.
9. Check `/api/v1/health` and test signed-in Inventory and Checkout/Return flows with a separate test database.

Do **not** expose the API directly to the Internet or use a default password. No public sign-up endpoint.
`PUBLIC_ORIGIN` is the preferred external application URL; enable `TRUST_PROXY=true` only when behind a controlled reverse proxy.

### Current restrictions
- PostgreSQL 16 is installed on Plutus, and the SQL migrations 001–004 have been applied to the local database. Docker is not installed and the production API is not launched.
- Browser E2E exercises mocked API responses; separate Node API integration tests have passed against an isolated real PostgreSQL database named `plutus_test`.
- `database/001_initial.sql` through `004_case_insensitive_serial.sql` are the active migrations; `prisma/schema.prisma` is an earlier design draft, not the runtime ORM.
- A dedicated `plutus-backup.timer` is enabled on Plutus for daily backups at 02:00 Asia/Bangkok; local restore verification passed. Backup remains on the same host, so off-host backups are not yet configured.
- CSV and XLSX imports and exports are implemented; LINE webhook with signed read-only commands and 15-minute account linking is implemented but requires LINE credentials and end-to-end provider testing. Reminder queue exists but does not deliver messages.
- External Cloudflare domain, LINE credentials and SMTP configuration are not yet supplied.
- A quantity-stock design review is required before production: a partially borrowed quantity item can keep Available units while status shows Borrowed.
