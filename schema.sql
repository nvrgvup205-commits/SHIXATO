-- SHIXATO — AliExpress → Shopify automation schema
-- Run in Supabase SQL Editor (or via supabase db push / migration).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE product_status AS ENUM (
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
  CREATE TYPE sync_status AS ENUM ('success', 'failed', 'partial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aliexpress_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  status product_status NOT NULL DEFAULT 'pending',
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

CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_shopify_product_id
  ON public.products (shopify_product_id)
  WHERE shopify_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_title_fts ON public.products
  USING gin (to_tsvector('simple', coalesce(title, '')));

COMMENT ON TABLE public.products IS 'Normalized AliExpress products staged for Shopify sync';
COMMENT ON COLUMN public.products.aliexpress_id IS 'Numeric AliExpress item id';
COMMENT ON COLUMN public.products.images IS 'JSON array of image URLs';
COMMENT ON COLUMN public.products.status IS 'Pipeline status: pending → approved/filtered_out → synced/failed';

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  aliexpress_id TEXT,
  shopify_product_id TEXT,
  action TEXT NOT NULL,
  status sync_status NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON public.sync_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_product_id ON public.sync_logs (product_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON public.sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_aliexpress_id
  ON public.sync_logs (aliexpress_id)
  WHERE aliexpress_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_logs_action ON public.sync_logs (action);

COMMENT ON TABLE public.sync_logs IS 'Audit trail for Shopify / AI filter API outcomes';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Worker uses service_role (bypasses RLS). Keep anon/authenticated locked down.
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated → deny by default via Data API.
-- service_role continues to have full access for the Cloudflare Worker.
