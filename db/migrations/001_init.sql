-- Foundation migration for authentication scaffolding.
-- In later subtasks, expand this to the full outage management schema.

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator', 'crew', 'customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
