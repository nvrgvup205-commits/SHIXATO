-- Slim list columns for favorites — avoid pulling full listing JSONB on every list query.

ALTER TABLE shixato.favorites
  ADD COLUMN IF NOT EXISTS ai_score NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS list_image TEXT,
  ADD COLUMN IF NOT EXISTS hook_ar TEXT,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12, 2);

CREATE INDEX IF NOT EXISTS idx_favorites_ai_score_created
  ON shixato.favorites (ai_score DESC NULLS LAST, created_at DESC);

-- Backfill from existing listing JSONB (one-time; safe to re-run).
UPDATE shixato.favorites
SET
  ai_score = COALESCE(
    ai_score,
    NULLIF((listing ->> 'aiScore')::numeric, 0)
  ),
  list_image = COALESCE(
    list_image,
    NULLIF(listing ->> 'image', ''),
    NULLIF(listing #>> '{images,0}', '')
  ),
  hook_ar = COALESCE(hook_ar, NULLIF(listing ->> 'hookAr', '')),
  selling_price = COALESCE(
    selling_price,
    NULLIF((listing ->> 'sellingPrice')::numeric, 0)
  )
WHERE listing IS NOT NULL;
