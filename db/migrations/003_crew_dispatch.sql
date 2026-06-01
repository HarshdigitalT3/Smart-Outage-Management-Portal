-- Crew dispatch + job cards schema.
-- Adds:
-- - app_crews: crew roster (backed by app_users where role='crew')
-- - app_jobs: job cards tied to outages and assigned to a crew member
--
-- Notes:
-- - "Available crew" is derived from crews without any active (non-resolved) job.
-- - Job status transitions: assigned -> en_route -> on_site -> resolved

CREATE TABLE IF NOT EXISTS app_crews (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_crews_user_id ON app_crews(user_id);

CREATE TABLE IF NOT EXISTS app_jobs (
  id UUID PRIMARY KEY,
  outage_id UUID NOT NULL REFERENCES app_outages(id) ON DELETE CASCADE,
  crew_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('assigned', 'en_route', 'on_site', 'resolved')),
  safety_notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_jobs_outage_id ON app_jobs(outage_id);
CREATE INDEX IF NOT EXISTS idx_app_jobs_crew_user_id ON app_jobs(crew_user_id);
CREATE INDEX IF NOT EXISTS idx_app_jobs_status ON app_jobs(status);
CREATE INDEX IF NOT EXISTS idx_app_jobs_created_at ON app_jobs(created_at);

-- Ensure one active job per outage (so operator "assignment" is a single crew at a time).
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_jobs_outage_active
ON app_jobs(outage_id)
WHERE status <> 'resolved';

-- Keep updated_at fresh on changes
CREATE OR REPLACE FUNCTION set_app_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_jobs_updated_at ON app_jobs;
CREATE TRIGGER trg_app_jobs_updated_at
BEFORE UPDATE ON app_jobs
FOR EACH ROW
EXECUTE FUNCTION set_app_jobs_updated_at();
