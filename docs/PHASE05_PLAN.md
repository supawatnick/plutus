# Phase 05 — Web/Mobile Quality & Hardening

Started 2026-10-21 at the owner's request. Phase 04 LINE chatbot, OpenAI quota troubleshooting, and notification provider UAT are **paused**, not accepted as complete. Do not enable notification delivery or modify credentials while Phase 05 work proceeds.

## Scope and delivery gates

1. Search usability: multi-word inventory searches independent of word order; treat `%`, `_`, and `\\` literally; preserve authorization, status filtering, counting and pagination. Add isolated PostgreSQL regression tests.
2. Mobile-first UAT: desktop and phone viewport Playwright, core login → inventory → checkout → return and role restrictions, against isolated test DB only.
3. Reliability and security: validate API errors, CSRF, sessions, RBAC, stock invariants, and append-only audit; fix concrete defects backed by tests.
4. Operational readiness: run non-destructive production preflight, verify deployed health, backups and recovery procedure; no off-host backup work unless approved.
5. Release gate: build/typecheck, API integration, desktop/mobile E2E and clean Git commit. Document unresolved issues rather than declaring Phase 05 complete prematurely.

## First delivery

- Inventory API search upgraded for whitespace-separated terms (AND across terms, OR across safe fields) with escaping of SQL LIKE wildcards.
- Add API regression cases for word order and literal wildcard search.

## Verification update — 2026-10-21

- Production preflight: **17/17 PASS**, including recent same-host backup and checksum verification.
- Live Playwright desktop/mobile against **plutus_test**: **6/6 PASS** after repairing a stale account-password label selector (policy changed from minimum 16 to minimum 8 characters).
- Live flows verified: admin create/disable/enable IT account, viewer administration denial, asset creation/checkout/return.
- This is a test-suite compatibility repair; no production password policy was changed here.
- Phase 05 remains in progress: further security/reliability assessment and operational checks remain before signoff.

## Restrictions

- Plutus host 10.10.110.3 and `ntap_plutus` only; never touch ntap-office or trident.
- Never run test cleanup against production PostgreSQL; API integration uses `plutus_test` exclusively.
- Keep live LINE configuration untouched; secure secrets stay in `/etc/plutus/plutus.env`.
