# PLUTUS — CHAT HANDOFF / CONTINUE HERE

_Last checked: 2026-10-15 (Asia/Bangkok). This is a continuity note, not proof of production readiness._

## Mandatory instructions for the next ChatGPT session

You are the senior Full Stack Architect / Lead Software Engineer responsible for **completing** Plutus IT Asset Inventory & Loan Management. Respond to the user in **Thai**. The 45-question Grill Me requirements phase is **closed**: **do not re-ask requirements already confirmed**. Proceed with execution, testing and clear reporting rather than endless planning.

**Use the connected `ntap_plutus` tool directly for all Plutus host operations. Do not use `ntap_office` or other machine connectors. Do not disrupt services on ntap-office (10.10.110.72).** The project is on **Plutus 10.10.110.3 (Ubuntu)** at `/srv/mcp-workspaces/plutus`; connected workspace ID `2a481ead-a4fc-46ce-9a97-159a990d3c25`. GitHub repository: **https://github.com/supawatnick/plutus**, branch `main`. Direct SSH push from Plutus succeeded in previous turns using its configured deploy key; do not print or commit secrets. Verify workspace state and current Git HEAD before editing.

## Snapshot at handoff

- **Phase:** 04 — Integration & Production Preparation. Earlier Phase 01 (architecture), 02 (UI scaffold), and substantial Phase 03 (core implementation) are complete as *implementation milestones*, not final acceptance.
- **Last verified Git HEAD:** `d1bf8b1` — `feat: add verified PostgreSQL backup and restore runbook`; `main` tracking `origin/main`; **clean working tree** at handoff.
- Frontend / Backend build succeeded. Playwright Desktop + Mobile tests ran successfully; latest suite showed 18 scheduled tests (some intentionally skipped). E2E uses **mocked API responses**, not actual browser → live PostgreSQL.
- Separate **real PostgreSQL API integration test** passed for authentication, role checks, duplicate serial, concurrent stock checkout, partial returns, and audit trails, using isolated `plutus_test` DB.
- PostgreSQL **16** installed on Plutus; migration SQL files exist under `database/`. The main and test database schema existed in prior turns. **Do not reset/delete production databases or use test cleanup on anything except dedicated test DB.**
- `scripts/backup-postgres.sh` created a verified custom-format backup of `plutus_test` under ignored `.private/backups`. Successfully restored to separate `plutus_restore_check` database; 3 inventory rows and 3 loan rows were verified. See `docs/BACKUP.md`. **Daily production scheduling and off-host backup are not yet verified.**
- Prior latest work includes code for LINE commands/AI adapter, CSV/XLSX import preview, LINE account linking, notifications migrations, and UI: **inspect code and tests to confirm functionality**. Do not assume external credentials or actual LINE API integrations work yet.
- **Do not claim production deployment or fully working cloud access.** Real domain, Cloudflare Tunnel token and production account configuration are not proven configured. The initial Login/UI tests are mock-based.
- No final Production/UAT signoff or comprehensive security audit.

## Product contract — 45 decisions

1. Support **serialized (single unit, serial provided)** AND **quantity stock (no serial, quantity input)**. Use auto-generated sequential nonreused IDs such as `AST-000001`; each checkout uses unique `LOAN-` ID. Partial returns permitted on stock loans.
2. IT operators only have login accounts; employees/borrowers do **not** self-register or access app. Username/password local login with Argon2id, server-side session, Secure/HttpOnly cookie (HTTPS production), RBAC enforced in Backend.
3. Roles: **Admin**, **IT Asset Manager**, **IT Viewer**. Admin alone manages accounts and accesses audit logs; manager handles inventory/loans/import/export; viewer read-only inventory/reports/dashboard. Guard last active Admin.
4. Asset create form **only** Asset Name, Serial Number (optional), Status, Location, auto-generated Asset ID; conditional Quantity if serial omitted. No photo, brand, model, categories, warranty or extra fields in V1.
5. Statuses **exactly** `Available`, `Borrowed`, `Demo Lab`, `Retired`. Only Available units eligible for checkout; for partially borrowed quantity stock, remaining available units can still be checked out while status may display Borrowed. Demo Lab and Retired cannot be loaned until reset to Available.
6. Asset Location is free text. Borrower Name+Email are free text. Every checkout also REQUIRES Customer Name, Customer Site, Project Name; optional Expected Return Date and Purpose.
7. Check-in requires **New Location** and returned status choice Available/Demo Lab/Retired for serialized items; quantity loan partial/full return must affect selected loan only. If status is changed away from Borrowed on serialized device, require explicit confirmation/new location and atomically close active loan/audit.
8. Stock invariants: checkouts and returns transactional with locks; no negative available quantity. Total = Available + outstanding borrowed + any nonloan unavailable categories as applicable (take care not to conflate Demo Lab/Retired with Borrowed). Never auto-close unrelated stock loans.
9. Soft delete + restore; never reuse Asset ID; reject delete with open loans.
10. Audit create/update/delete/restore/borrow/return/status/login with actor/timestamp/before+after; **retain forever, no automatic deletion**, append-only via app, admin-only view.
11. Dashboard: Total/Available/Borrowed/Demo Lab/Retired, upcoming returns, overdue, recent activity. Keep UI light rather than chart-heavy.
12. Global search by Asset ID, Name, Serial, Location, Borrower; filter by Status. CSV/XLSX import with preview/validation; skip duplicate serials both within upload and DB (do not overwrite existing). CSV/XLSX export, no PDF v1.
13. Due reminders at **3 days before** and when overdue (where expected date exists). Borrower email and IT LINE notifications; mail provider pending — do not fake SENT state.
14. LINE chatbot: only linked/verified LINE identities belonging to active IT users; read-only inventory/status/borrower lookup. Command mode + natural-language AI, but **prepare OpenAI integration for later API key**; protect webhook signatures and API credentials.
15. Daily PostgreSQL backup, 30-day retention (same host initially, off-host recommended), tested restore.
16. Deployment target Plutus at 10.10.110.3; LAN + **real-domain** Cloudflare Tunnel/HTTPS and responsive web/mobile. Avoid exposing DB or API directly.
17. UI design: white `#FFFFFF`, black `#000000`, gray `#B5B5B5`, burgundy `#800020`, celeste `#B2FFFF`, IBM Plex Mono/Space Mono feel; **thin 1px borders, square corners, no shadows, avoid nested bordered cards**.

## Actual stack in working code (verify package files)

- React + TypeScript + Vite; responsive CSS (Tailwind mentioned in original proposal but not yet necessarily adopted), Lucide; Playwright for E2E.
- Node.js 24 under `/opt/mcp/node-v24/bin`, Express 5 + TypeScript + PostgreSQL 16 and `pg`, Argon2id, Zod. `prisma/schema.prisma` exists as an **early draft**, but runtime uses **SQL migrations with `pg`**, not Prisma ORM.
- Backend `apps/api/src/server.ts`, Frontend `apps/web/src/App.tsx` and `style.css`; tests `tests/api-integration.mjs` and `e2e/inventory.spec.ts`.
- Local run/test examples from repo root:
  ```sh
  PATH=/opt/mcp/node-v24/bin:$PATH npm run build
  PATH=/opt/mcp/node-v24/bin:$PATH npm run test:e2e
  PATH=/opt/mcp/node-v24/bin:$PATH DATABASE_URL='postgresql://root@localhost/plutus_test?host=/var/run/postgresql' npm run test:api
  ```
  **WARNING**: Integration tests clear all test tables — only use `plutus_test` database. Do not use production database for tests.
- CI workflow `.github/workflows/validate.yml` builds, runs isolated PostgreSQL integration and browser E2E.

## Read these files in order

1. `README.md` — product contract / current status.
2. `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/RUNBOOK.md`.
3. `docs/INTEGRATIONS.md`, `docs/BACKUP.md`.
4. `database/001_initial.sql` + subsequent `database/*.sql`; verify applied migrations before changes.
5. `apps/api/src/server.ts`, `apps/web/src/App.tsx`, tests and CI configuration.
6. `git status --short` and `git log -5 --oneline`.

## Next implementation priorities

1. **Review current source vs requested product contract**; finish/repair CSV/XLSX import preview+commit validation, LINE linking/read-only commands, AI-key-optional path, status-change/partial-return invariants, notifications.
2. Improve user workflows and E2E for **mobile first**; include real-browser+real-PostgreSQL smoke/UAT when safe (mock tests alone insufficient).
3. Add/test operationally safe **daily backup scheduling** and recovery checks, with 30-day retention (no silent backup success assumptions).
4. Prepare HTTPS reverse proxy, actual LAN address access, and Cloudflare real domain **only when credentials/domain and service isolation are verified**. Do not modify ntap-office.
5. Enforce security hygiene and close missing role/CSRF/password/session/audit issues before Production.
6. Commit tested milestones to `main` with meaningful messages, and summarize exact tests/risks without overclaiming completion.

## Recommended first response in the new chat

> ดำเนินงาน PLUTUS ต่อจาก `docs/CHAT_HANDOFF.md` ใน GitHub Repo โดยใช้ `ntap_plutus` โดยตรง ตรวจ Git HEAD/Workspace และเริ่ม Phase 04 ต่อได้เลย เน้น Mobile Web App, Integration Tests, E2E, Security และ Deploy readiness โดยไม่ถาม Grill Me ซ้ำ และไม่แตะ ntap-office

**Safety:** No API tokens, SSH private keys, passwords, live credential strings or sensitive borrower/customer records in this file. Verify everything that may have changed since handoff.
