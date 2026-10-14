BEGIN;
CREATE TABLE IF NOT EXISTS app_users (
 id uuid PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('ADMIN','ASSET_MANAGER','VIEWER')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sequences (name text PRIMARY KEY, next_value bigint NOT NULL CHECK(next_value>0));
INSERT INTO sequences(name,next_value) VALUES ('asset',1),('loan',1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS inventory (
 id uuid PRIMARY KEY, display_id text UNIQUE NOT NULL, name text NOT NULL, serial text UNIQUE,
 kind text NOT NULL CHECK(kind IN ('SERIALIZED','QUANTITY')),
 status text NOT NULL CHECK(status IN ('Available','Borrowed','Demo Lab','Retired')),
 location text NOT NULL, total_qty int NOT NULL CHECK(total_qty>0),
 available_qty int NOT NULL CHECK(available_qty>=0 AND available_qty<=total_qty),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT serialized_single CHECK(kind <> 'SERIALIZED' OR (total_qty=1 AND serial IS NOT NULL)),
 CONSTRAINT quantity_no_serial CHECK(kind <> 'QUANTITY' OR serial IS NULL)
);
CREATE TABLE IF NOT EXISTS loans (
 id uuid PRIMARY KEY, loan_number text UNIQUE NOT NULL, inventory_id uuid NOT NULL REFERENCES inventory(id),
 borrower_name text NOT NULL, borrower_email text NOT NULL, customer_name text NOT NULL,
 customer_site text NOT NULL, project_name text NOT NULL, purpose text,
 quantity int NOT NULL CHECK(quantity>0), returned_qty int NOT NULL DEFAULT 0 CHECK(returned_qty>=0 AND returned_qty<=quantity),
 borrowed_at timestamptz NOT NULL DEFAULT now(), expected_return_at timestamptz, closed_at timestamptz,
 created_by uuid NOT NULL REFERENCES app_users(id)
);
-- Serialized and quantity items share this table. A row lock on inventory and
-- an application-side serialized open-loan check control concurrent checkout.
CREATE INDEX IF NOT EXISTS loan_open_due ON loans(expected_return_at) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS returns (
 id uuid PRIMARY KEY, loan_id uuid NOT NULL REFERENCES loans(id), qty int NOT NULL CHECK(qty>0),
 new_location text NOT NULL, resulting_status text NOT NULL,
 received_by uuid NOT NULL REFERENCES app_users(id), returned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY, user_id uuid REFERENCES app_users(id), action text NOT NULL,
 entity_type text NOT NULL, entity_id text, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created ON audit_events(created_at DESC);
COMMIT;
