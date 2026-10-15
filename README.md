# Plutus — IT Inventory & Loan Management

Internal company asset inventory and IT-operated checkout/check-in system.

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
