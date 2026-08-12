-- SHIXATO favorites — review queue before Shopify upload

CREATE TABLE IF NOT EXISTS shixato.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aliexpress_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  listing JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  preset_grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT favorites_aliexpress_id_key UNIQUE (aliexpress_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_created_at
  ON shixato.favorites (created_at DESC);

COMMENT ON TABLE shixato.favorites IS 'Dashboard review queue — AliExpress listings saved before Shopify import';

DROP TRIGGER IF EXISTS trg_favorites_updated_at ON shixato.favorites;
CREATE TRIGGER trg_favorites_updated_at
  BEFORE UPDATE ON shixato.favorites
  FOR EACH ROW
  EXECUTE FUNCTION shixato.set_updated_at();

ALTER TABLE shixato.favorites ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE shixato.favorites TO anon, authenticated, service_role;
