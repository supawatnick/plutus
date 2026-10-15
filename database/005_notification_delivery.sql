BEGIN;
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE notification_events ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
CREATE INDEX IF NOT EXISTS notification_delivery_due ON notification_events(next_attempt_at) WHERE status IN ('PENDING','FAILED');
COMMIT;
