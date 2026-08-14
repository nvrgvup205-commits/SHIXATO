-- One-time cleanup + retention helper for sync_logs (major egress saver).

-- Drop legacy token copies in app_settings (tokens live in aliexpress_tokens now).
DELETE FROM shixato.app_settings
WHERE key IN (
  'aliexpress_access_token',
  'aliexpress_refresh_token',
  'aliexpress_token_expires_at'
);

-- Strip bulky JSON from routine API audit rows (keeps row metadata only).
UPDATE shixato.sync_logs
SET
  request_payload = NULL,
  response_payload = NULL
WHERE action LIKE 'aliexpress_api:%'
  AND status = 'success';

-- Remove old logs (14-day retention).
DELETE FROM shixato.sync_logs
WHERE created_at < NOW() - INTERVAL '14 days';

CREATE OR REPLACE FUNCTION shixato.prune_sync_logs(retention_days integer DEFAULT 14)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = shixato, public
AS $$
DECLARE
  removed bigint;
BEGIN
  IF retention_days < 1 THEN
    retention_days := 1;
  ELSIF retention_days > 365 THEN
    retention_days := 365;
  END IF;

  UPDATE shixato.sync_logs
  SET
    request_payload = NULL,
    response_payload = NULL
  WHERE created_at < NOW() - make_interval(days => retention_days / 2)
    AND (request_payload IS NOT NULL OR response_payload IS NOT NULL);

  DELETE FROM shixato.sync_logs
  WHERE created_at < NOW() - make_interval(days => retention_days);

  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

COMMENT ON FUNCTION shixato.prune_sync_logs(integer)
  IS 'Deletes sync_logs older than retention_days and strips payloads on older rows';

GRANT EXECUTE ON FUNCTION shixato.prune_sync_logs(integer) TO service_role;
