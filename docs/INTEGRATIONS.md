# Integration guide — Phase 04

## LINE Chatbot (protected, read-only)
1. Create a LINE Messaging API channel under the company's LINE Official Account.
2. Configure `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` as private server environment secrets (not committed).
3. Set the Messaging API Webhook URL to `https://plutus.followthesunth.com/api/v1/integrations/line/webhook` and enable **Use webhook** in LINE Developers. The existing Cloudflare Tunnel already serves the route; no new port forward is necessary. Keep `/etc/plutus/plutus.env` mode `0600` and restart `plutus-api` only after credentials are set.
4. After signing in to Plutus, click **LINK LINE CHATBOT** on the Dashboard. This generates a single-use 16-character code, expiring after 15 minutes.
5. Send `ผูกบัญชี <code>` (or `link <code>`) to the bot. The webhook checks the LINE signature and only then links the verified LINE user ID to an active Plutus IT account.
6. Commands: `สถานะ AST-000001`, `ค้นหา Cisco`, `รายการยืม`. These query inventory and open loans without write permissions.
7. Optional `OPENAI_API_KEY` and `OPENAI_MODEL` enable natural-language command classification; only the user's question, not inventory rows, is sent to the AI provider. All resulting commands are restricted to SEARCH, STATUS, LOANS and HELP.
8. Users may unlink via authenticated `DELETE /api/v1/integrations/line/account`.
9. Audit records login/link/search actions. Never place production tokens in Git, browser bundles or test files.

As checked on 2026-10-21, production has neither `LINE_CHANNEL_SECRET` nor `LINE_CHANNEL_ACCESS_TOKEN`, and the unsigned webhook returns HTTP 503 by design. Do not enable the notification timer or claim live delivery until a signed webhook request, account-link exchange and test push/multicast are verified. The live token must not be pasted in chat or committed to Git. Optional `OPENAI_API_KEY` is not required for fixed LINE commands.

The owner must create/configure the LINE Official Account Messaging API channel, then place the **Channel secret** and **Channel access token** directly in the server-only environment file. After enabling the webhook in LINE Developers, verify it by sending a message from a real LINE account and by linking from the PLUTUS dashboard.

## Reminders
`node scripts/queue-reminders.mjs` queues up to two events (borrower EMAIL + IT LINE) for each eligible open loan with an expected return date, at 3 days before return and when overdue. Event keys prevent duplicate queueing.
The opt-in `npm run notifications:deliver` worker uses Resend (`RESEND_API_KEY`, `EMAIL_FROM`) for EMAIL and LINE Messaging API (`LINE_CHANNEL_ACCESS_TOKEN`) for verified active IT LINE accounts. It marks SENT only after a successful HTTP provider response, retries failed delivery with capped exponential backoff up to 6 attempts, cancels unsent events when loans are closed, and uses a PostgreSQL advisory lock to prevent concurrent workers. When credentials are not configured, events stay PENDING without falsely claiming delivery. A disabled systemd scheduling template is included under `infra/systemd/plutus-notifications.*`; do not enable without configuring a private `/etc/plutus/plutus.env` and verifying service-user permissions. This worker is **not scheduled or enabled in production**; verify provider accounts, real delivery and retry behavior before activation. Provider success acknowledges an API request, not proof that a recipient read the message. Loans without an expected date never enter the queue.

## PostgreSQL backups
Plutus runs `plutus-backup.timer` each day at **02:00 Asia/Bangkok**. The associated `scripts/backup-postgres.sh` creates a timestamped PostgreSQL custom-format backup with SHA-256 digest under `/var/backups/plutus` and retains 30 days. File and directory permissions are owner-only.
`scripts/check-restore.sh /absolute/path/to/file.dump` verifies the checksum, restores to a NEW temporary database, validates four core tables and then removes that isolated test database. It never restores over the main production database.
Tests passed with both a sample `plutus_test` backup and real restore verification. A local backup is **not protection against full host or disk failure**: add off-host encrypted backup before production approval.

## Verification
- `npm run build`
- `npm run db:migrate` with the private `DATABASE_URL` (migrations 001–003)
- `npm run test:api` against isolated `plutus_test`, never `plutus`
- `npm run test:e2e` with Desktop Chromium and Mobile emulation

## Production blockers
Cloudflare domain and tunnel credentials, initial IT Admin credential rotation, production TLS + reverse proxy, real LINE provider credentials, delivery adapters for notifications, off-host backups, and UAT. Do not claim integrations sent messages or that users can access production webapp until those steps are verified.
