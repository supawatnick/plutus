BEGIN;
-- Serial identifiers are unique regardless of case across active and soft-deleted rows.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_serial_casefold_unique ON inventory (lower(serial)) WHERE serial IS NOT NULL;
COMMIT;
