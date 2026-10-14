# Architecture & API Contract — Phase 01

## Architecture
- Browser (React/Vite static build) → Caddy reverse proxy → Express REST API → PostgreSQL (Prisma).
- Cloudflare Tunnel routes the public HTTPS hostname to Caddy; local access must use TLS or a deliberately scoped nonproduction exception (session Secure cookies require HTTPS).
- LINE webhook is a dedicated authenticated/signature-verified API boundary; LINE command and optional AI paths are **read-only**.
- Application is a modular monolith; modules: auth, users, inventory, loans, import-export, notifications, audits, integrations, backups.
- Background jobs are single-leader scheduled jobs (avoid duplicate notifications); persist idempotency keys. Database operations use transactions.
- Host services must be reviewed before deployment; no modifications to ntap-office.

## Authentication / authorization
- Username/password with Argon2id; server-issued opaque session stored as hash; HttpOnly/Secure/SameSite cookies; CSRF protection for modifying requests and rate-limited login.
- Admin: all operations. Asset manager: inventory/loans/import/export. Viewer: read inventory, dashboard and reports. Only Admin manages users and reads audit.
- No public registration. First admin is provisioned through a separate guarded bootstrap command, never an open bootstrap endpoint.
- Restrict LINE lookup to pre-linked, verified, nonrevoked LINE accounts mapped to active IT users; never provide arbitrary person data to unauthorized requestors.

## Data and transaction invariants
1. Serial present → SERIALIZED, quantity exactly one; otherwise QUANTITY with positive total.
2. Inventory display IDs allocated atomically via sequence counters, never reused, including after soft delete.
3. SERIALIZED: one open loan max; check-out allowed only from AVAILABLE and not deleted.
4. QUANTITY: totalQuantity >= 0 and 0 <= availableQty <= totalQuantity. Available decreases by checkout quantity and increases only by actually returned quantity. Borrowed aggregate equals sum(open loan quantities minus returned quantities). Enforce with locked item row + transactional writes.
5. QUANTITY status is a *display status*: when outstanding borrowed quantity > 0, represent borrowing in counts rather than forbidding partial stock checkout merely because some stock is out. Demo Lab and Retired inventory must not be checked out. Confirm this presentation rule in UI review.
6. Returns always require new location. For serialized items, close loan and set Available / Demo Lab / Retired. For quantity items, close only selected loan once fully returned, else set PARTIAL.
7. Changing serialized asset status away from Borrowed during an open loan requires confirmation, new location, and an auto-created close/return event in the same transaction.
8. An asset with any open loan cannot be soft-deleted; audits are append-only via application permissions.
9. Customer Name, Customer Site and Project are required text at checkout. Expected return is nullable; overdue only if non-null and in past.
10. No email is considered SENT until a provider confirms delivery acceptance; until provider configured, keep it in PENDING/configuration-required and surface in dashboard.
11. Import preview is read-only; commit must revalidate duplicates and enforce constraints within transactions.

## REST API v1 (proposed)
| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| POST | /api/v1/auth/login | public, rate limited | Start session |
| POST | /api/v1/auth/logout | authenticated | Revoke session |
| GET | /api/v1/auth/me | authenticated | Current identity |
| GET/POST | /api/v1/users | Admin | List/create staff users |
| PATCH | /api/v1/users/:id | Admin | Update role, active state, reset flow |
| GET/POST | /api/v1/inventory | read/write role | Search and create inventory |
| GET/PATCH/DELETE | /api/v1/inventory/:id | read/write role | Detail/edit/soft-delete |
| POST | /api/v1/inventory/:id/restore | Admin/Manager | Restore item |
| POST | /api/v1/loans | Admin/Manager | Checkout |
| GET | /api/v1/loans | authenticated | List/filter loans |
| POST | /api/v1/loans/:id/returns | Admin/Manager | Check-in full/partial |
| GET | /api/v1/dashboard | authenticated | KPIs, due/overdue, activity |
| POST | /api/v1/imports/inventory/preview | Admin/Manager | Validate Excel/CSV |
| POST | /api/v1/imports/inventory/commit | Admin/Manager | Commit reviewed import |
| GET | /api/v1/exports/:report | authenticated | CSV or XLSX |
| GET | /api/v1/audit | Admin | Search audits |
| POST | /api/v1/integrations/line/webhook | LINE signature verified | Read-only LINE commands |
| GET | /api/v1/health | internal | Liveness |

All list endpoints accept server-side pagination and validated query filters. Response failures use a consistent {code, message, details?, requestId} envelope; redact secrets/PII in logs.

## Critical tests
- Two simultaneous checkouts against one remaining unit: exactly one succeeds.
- Multiple quantity loans can be returned separately; no over-return.
- Changing serialized status from Borrowed requires location and closes loan atomically.
- Soft delete with open loan is rejected, and restored item keeps display ID.
- Viewer cannot mutate data; LINE unlinked user cannot read private inventory details.
- Import skips duplicate serials both against DB and within uploaded file.
- Notification retry never double-sends event key.
- Backup archive restores to a clean test database.

## Open deployment configuration (not credentials)
PUBLIC_HOSTNAME, DATABASE_URL, SESSION_SECRET, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OPENAI_API_KEY (optional), EMAIL_PROVIDER (disabled initially), CLOUDFLARE_TUNNEL_TOKEN, BACKUP_DIR.

No live credentials should be committed to Git.
