BEGIN;
CREATE TABLE IF NOT EXISTS line_link_codes (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS line_codes_expiry ON line_link_codes(expires_at);
COMMIT;
