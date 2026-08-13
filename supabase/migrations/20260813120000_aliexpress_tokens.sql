-- OAuth tokens for AliExpress Open Platform (singleton row per SHIXATO app)
CREATE TABLE IF NOT EXISTS shixato.aliexpress_tokens (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE shixato.aliexpress_tokens IS 'Latest AliExpress OAuth access/refresh tokens for SHIXATO';

DROP TRIGGER IF EXISTS trg_aliexpress_tokens_updated_at ON shixato.aliexpress_tokens;
CREATE TRIGGER trg_aliexpress_tokens_updated_at
  BEFORE UPDATE ON shixato.aliexpress_tokens
  FOR EACH ROW
  EXECUTE FUNCTION shixato.set_updated_at();

ALTER TABLE shixato.aliexpress_tokens ENABLE ROW LEVEL SECURITY;

GRANT ALL ON shixato.aliexpress_tokens TO anon, authenticated, service_role;
