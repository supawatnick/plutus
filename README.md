# Plutus — IT Inventory & Loan Management

Internal company asset inventory and IT-operated checkout/check-in system.

## Quick start — install on a NEW Ubuntu 24.04 server

**Download the ready-made installation bundle** (includes compiled Web/API and installer):

- [plutus-ubuntu24-53ebdb5.tar.gz](releases/plutus-ubuntu24-53ebdb5.tar.gz)
- [SHA-256 checksum](releases/plutus-ubuntu24-53ebdb5.tar.gz.sha256)
- [Detailed installation guide](packaging/INSTALLATION.md)

Place both downloaded files together on the new Ubuntu 24.04 server, then run:

```bash
sha256sum -c plutus-ubuntu24-53ebdb5.tar.gz.sha256
mkdir plutus-install
tar -xzf plutus-ubuntu24-53ebdb5.tar.gz -C plutus-install
cd plutus-install
sudo bash packaging/install.sh
```

The installer downloads Node.js 24, PostgreSQL 16 and npm dependencies; sets up the database and migrations; generates a unique first Admin password in a root-only local file; and enables the Web, API and daily local backup services. After a successful install, check:

```bash
sudo systemctl status plutus-api plutus-web plutus-backup.timer
curl -f http://127.0.0.1:4173/health
curl -f http://127.0.0.1:4173/api/v1/health
sudo cat /root/.plutus/initial-admin-credentials
```

Sign in as `itadmin` using that generated password and change it after first login. The Web service listens on **127.0.0.1:4173 only**; configure an HTTPS reverse proxy or Cloudflare Tunnel separately for remote access. For HTTPS deployment, provide `PLUTUS_PUBLIC_ORIGIN=https://your-domain.example` when invoking the installer. **Do not use this fresh-install script to update an existing PLUTUS server**: it intentionally refuses overwriting existing services, configuration or database.

No real passwords, database contents, LINE/OpenAI API keys or Cloudflare credentials are included in the installation bundle or committed to this repository. Add optional secrets only to `/etc/plutus/plutus.env` on your own server with mode `0600`. An end-to-end install on a clean VM has not yet been verified; review the [installer limitations](packaging/INSTALLATION.md) before production use.

To rebuild an install package from source, run `npm ci && npm run build && bash packaging/build-release.sh`. The bundled release above corresponds to commit `53ebdb5`.

## Confirmed product rules
- Asset form: asset name, serial number (optional), status, location. IDs assigned automatically as AST-000001 etc.
- Serial present: individually tracked asset (quantity=1). No serial: quantity-based stock item with quantity input. Both kinds use the AST ID sequence.
- Statuses: Available, Borrowed, Demo Lab, Retired. Only Available inventory can be checked out.
- Each serialized unit has an independent loan; each quantity-based checkout has an independent loan with quantity and partial-return balance.
- Checkout records borrower name/email; customer name, customer site and project are required free text; expected return date optional.
- Return always requires new location; serialized returns may end in Available, Demo Lab or Retired. Transition away from Borrowed closes its open serialized loan after confirmation.
- Quantity-based returns apply to the selected loan only; returned counts and open balances must remain accurate.
- Only IT staff log in using local username/password. Roles: Admin, IT Asset Manager, IT Viewer.
- All actions have audit trails; no automatic audit deletion. Asset removal uses soft delete and restoration; cannot remove units with open loans.
- Search asset ID, name, serial, location and borrower; filter by status.
- Dashboard totals, upcoming returns, overdue and recent activity.
- Excel/CSV import/export; skip duplicate serials on import with preview.
- Return reminders: borrower email adapter (not active until provider configured); IT LINE notifications, due-minus-3-days and overdue.
- LINE chatbot: verified IT LINE IDs only, read-only inventory access, commands first; AI integration configurable later with API key.
- Daily local PostgreSQL backup retained 30 days; restoration must be tested.
- 1–5 concurrent users, deployed on Plutus 10.10.110.3; local LAN and Cloudflare Tunnel with a real domain; web responsive for PC/mobile.
- Visual style: white/black/grey/burgundy/celeste; monospaced typewriter aesthetic, 1px borders, square corners, no shadows, no nested frames.

## Proposed stack
React + TypeScript + Vite + Tailwind CSS + TanStack Query/Table + React Hook Form + Zod; Node.js 24 + Express + TypeScript + Prisma + PostgreSQL; Argon2id + server sessions + secure cookies; Docker Compose + Caddy + cloudflared; Vitest + Playwright.

## Current implementation (2026-10-15)
- Frontend: React 19 + Vite + TypeScript, responsive CSS (no Tailwind yet), accessible form workflows and mobile navigation.
- Backend: Express 5 + TypeScript + node-postgres (`pg`) with explicit transaction locks, Argon2id local login, server-side session cookies and three RBAC roles. `prisma/schema.prisma` is a prior design draft, not used by the runtime.
- PostgreSQL 16 installed on Plutus; initial migration applied to local database; isolated `plutus_test` database used for API integration testing.
- Shipped UI flows: login, dashboard with upcoming/overdue and Admin activity, inventory create/list/edit/location/status search, soft delete, checkout/return, CSV/XLSX exports, CSV/XLSX import preview and commit, and LINE linking code. Editing serialized identifiers and changing borrowed status through asset edit are not complete.
- Verified locally: TypeScript/production build, browser Playwright Desktop/Mobile tests with mocked API, and transactional API integration tests against real PostgreSQL.
- **Not deployed for users yet:** no configured production credentials/first admin/domain, production reverse proxy or LINE API credentials. XLSX import and automated local backups are implemented. Reminder queue and LINE webhook are implemented but require provider configuration, live delivery tests, and UAT. No public production deployment is configured.

## Implementation order
1. Architecture, schema, and API contracts with clear invariants.
2. Bootstrap frontend/backend/shared types, env validation, lint/typecheck/tests.
3. Auth + RBAC, CRUD for inventory, audit events and soft deletion.
4. Transactional checkout, partial returns, reconciliation; Dashboard and global search.
5. Excel/CSV preview/import/export, notifications and operational backups.
6. LINE webhook and protected query endpoints, optional AI adapter.
7. LAN validation, TLS/domain setup and cloudflare tunnel after credentials supplied.

## Delivery gates
No deployment, DNS modifications or service restarts without an environment review. Never modify ntap-office services. Validate stock integrity under concurrent checkouts and restore-from-backup before production launch.
