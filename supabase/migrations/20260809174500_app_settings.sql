-- App settings (dashboard PIN, etc.) in independent shixato schema

CREATE TABLE IF NOT EXISTS shixato.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shixato.app_settings IS 'Key/value settings for SHIXATO Worker (e.g. dashboard_pin)';

GRANT USAGE ON SCHEMA shixato TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA shixato TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA shixato TO anon, authenticated, service_role;

ALTER TABLE shixato.app_settings ENABLE ROW LEVEL SECURITY;
