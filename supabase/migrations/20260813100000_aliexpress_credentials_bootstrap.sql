-- One-time AliExpress credentials bootstrap for SHIXATO
-- Run in Supabase SQL Editor if Cloudflare Secrets are not picked up by the Worker.

INSERT INTO shixato.app_settings (key, value, updated_at) VALUES
  ('aliexpress_app_key', '542618', NOW()),
  ('aliexpress_app_secret', 'YOUR_APP_SECRET_HERE', NOW())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();
