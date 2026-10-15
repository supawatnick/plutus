BEGIN;
CREATE TABLE IF NOT EXISTS notification_events (
 id uuid PRIMARY KEY,
 loan_id uuid REFERENCES loans(id),
 channel text NOT NULL CHECK(channel IN ('EMAIL','LINE')),
 event_type text NOT NULL CHECK(event_type IN ('UPCOMING_RETURN','OVERDUE')),
 event_key text NOT NULL UNIQUE,
 recipient text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED','CANCELLED')),
 scheduled_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_pending ON notification_events(status,scheduled_at);
CREATE TABLE IF NOT EXISTS line_accounts (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 line_user_id text UNIQUE NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
COMMIT;
