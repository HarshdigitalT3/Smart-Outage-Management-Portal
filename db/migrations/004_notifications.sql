-- Notification log schema.
-- Stores email/SMS send attempts, statuses, errors, and retry scheduling.

CREATE TABLE IF NOT EXISTS app_notification_logs (
  id UUID PRIMARY KEY,
  outage_id UUID NOT NULL REFERENCES app_outages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('outage_created', 'outage_resolved')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL,
  subject TEXT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  last_error TEXT NULL,
  next_attempt_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_app_notification_logs_outage_id ON app_notification_logs(outage_id);
CREATE INDEX IF NOT EXISTS idx_app_notification_logs_status_next_attempt ON app_notification_logs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_app_notification_logs_created_at ON app_notification_logs(created_at);

-- Keep updated_at fresh on changes
CREATE OR REPLACE FUNCTION set_app_notification_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_app_notification_logs_updated_at ON app_notification_logs;
CREATE TRIGGER trg_app_notification_logs_updated_at
BEFORE UPDATE ON app_notification_logs
FOR EACH ROW
EXECUTE FUNCTION set_app_notification_logs_updated_at();
