-- Outage management schema.
-- Adds outage tracking + audit records for resolve/status changes.

CREATE TABLE IF NOT EXISTS app_outages (
  id UUID PRIMARY KEY,
  location TEXT NOT NULL,
  fault_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  affected_customers INTEGER NOT NULL CHECK (affected_customers >= 0),
  status TEXT NOT NULL CHECK (status IN ('new', 'investigating', 'identified', 'monitoring', 'resolved')),
  created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_outages_status ON app_outages(status);
CREATE INDEX IF NOT EXISTS idx_app_outages_created_at ON app_outages(created_at);

CREATE TABLE IF NOT EXISTS app_outage_audits (
  id UUID PRIMARY KEY,
  outage_id UUID NOT NULL REFERENCES app_outages(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'status_updated', 'resolved')),
  actor_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_outage_audits_outage_id ON app_outage_audits(outage_id);
CREATE INDEX IF NOT EXISTS idx_app_outage_audits_created_at ON app_outage_audits(created_at);

-- Keep updated_at fresh on changes
CREATE OR REPLACE FUNCTION set_app_outages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_outages_updated_at ON app_outages;
CREATE TRIGGER trg_app_outages_updated_at
BEFORE UPDATE ON app_outages
FOR EACH ROW
EXECUTE FUNCTION set_app_outages_updated_at();
