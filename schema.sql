-- SHIXATO bootstrap for Supabase SQL Editor (independent schema: shixato)
-- Source of truth for CLI: supabase/migrations/20260809170521_create_shixato_schema.sql
-- After run: Dashboard → Settings → API → Exposed schemas → add "shixato"

-- Independent Postgres schema for SHIXATO automation (not public)
-- Tables live in: shixato.products / shixato.sync_logs

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS shixato;

COMMENT ON SCHEMA shixato IS 'SHIXATO AliExpress → Shopify automation domain (isolated from public)';

-- ---------------------------------------------------------------------------
-- Enums (scoped to shixato)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE shixato.product_status AS ENUM (
    'pending',
    'filtered_out',
    'approved',
    'synced',
    'failed',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE shixato.sync_status AS ENUM ('success', 'failed', 'partial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shixato.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aliexpress_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  status shixato.product_status NOT NULL DEFAULT 'pending',
  description_html TEXT,
  shopify_product_id TEXT,
  shopify_handle TEXT,
  currency TEXT DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_aliexpress_id_key UNIQUE (aliexpress_id),
  CONSTRAINT products_original_price_nonneg CHECK (original_price >= 0),
  CONSTRAINT products_selling_price_nonneg CHECK (selling_price >= 0),
  CONSTRAINT products_images_is_array CHECK (jsonb_typeof(images) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_products_status ON shixato.products (status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON shixato.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_shopify_product_id
  ON shixato.products (shopify_product_id)
  WHERE shopify_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_title_fts ON shixato.products
  USING gin (to_tsvector('simple', coalesce(title, '')));

COMMENT ON TABLE shixato.products IS 'Normalized AliExpress products staged for Shopify sync';

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shixato.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES shixato.products (id) ON DELETE SET NULL,
  aliexpress_id TEXT,
  shopify_product_id TEXT,
  action TEXT NOT NULL,
  status shixato.sync_status NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON shixato.sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_product_id ON shixato.sync_logs (product_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON shixato.sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_aliexpress_id
  ON shixato.sync_logs (aliexpress_id)
  WHERE aliexpress_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_action ON shixato.sync_logs (action);

COMMENT ON TABLE shixato.sync_logs IS 'Audit trail for Shopify / AI filter API outcomes';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shixato.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON shixato.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON shixato.products
  FOR EACH ROW
  EXECUTE FUNCTION shixato.set_updated_at();

-- ---------------------------------------------------------------------------
-- API grants (required for PostgREST / supabase-js custom schema)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA shixato TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA shixato TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA shixato TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA shixato TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shixato
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shixato
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA shixato
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS — Worker uses service_role (bypasses RLS). Lock down Data API roles.
-- ---------------------------------------------------------------------------
ALTER TABLE shixato.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shixato.sync_logs ENABLE ROW LEVEL SECURITY;


-- app_settings (dashboard PIN, etc.)
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

-- AliExpress OAuth tokens (singleton row)
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

-- favorites (review queue before Shopify upload)
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
