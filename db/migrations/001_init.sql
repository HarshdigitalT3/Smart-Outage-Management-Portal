-- Foundation migration for authentication scaffolding.
-- In later subtasks, expand this to the full outage management schema.

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator', 'crew', 'customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stores refresh token identifiers (jti) so we can revoke them on logout/rotation.
CREATE TABLE IF NOT EXISTS app_refresh_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  jti UUID UNIQUE NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_user_id ON app_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_app_refresh_tokens_jti ON app_refresh_tokens(jti);
