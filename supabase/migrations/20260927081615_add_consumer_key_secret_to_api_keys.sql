/*
# Add Consumer Key and Consumer Secret to API Keys

## What this does
1. Adds `consumer_key` and `consumer_secret` columns to the `api_keys` table
   (WooCommerce-style authentication: both values are presented to the user as a pair)
2. Updates `validate_api_key` to authenticate by consumer_key + consumer_secret hash
3. Adds unique index on consumer_key for fast lookups

## Authentication model
- The user receives a Consumer Key (e.g. `ck_xxxx`) and Consumer Secret (e.g. `cs_xxxx`) pair
- Both are sent as headers: `X-Consumer-Key` and `X-Consumer-Secret`
- The edge function hashes the consumer_key, looks up the row, then verifies the consumer_secret hash matches
- The old single `key_hash` column is kept for backward compatibility but no longer used for new keys
*/

-- Add consumer_key and consumer_secret columns
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS consumer_key text,
  ADD COLUMN IF NOT EXISTS consumer_secret text;

-- Add unique index on consumer_key for lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_consumer_key ON api_keys(consumer_key) WHERE consumer_key IS NOT NULL;

-- Update validate_api_key to authenticate by consumer_key + consumer_secret
DROP FUNCTION IF EXISTS validate_api_key(text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION validate_api_key(p_consumer_key text, p_consumer_secret_hash text, p_endpoint text)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  rate_limit integer,
  request_count bigint,
  permissions jsonb
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_api_key api_keys%ROWTYPE;
  v_request_count bigint;
BEGIN
  -- Look up by consumer_key
  SELECT * INTO v_api_key
  FROM api_keys
  WHERE consumer_key = p_consumer_key
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 0::bigint, NULL::jsonb;
    RETURN;
  END IF;

  -- Verify consumer_secret hash matches
  IF v_api_key.consumer_secret IS NULL OR v_api_key.consumer_secret != p_consumer_secret_hash THEN
    RETURN QUERY SELECT false, v_api_key.id, v_api_key.rate_limit, 0::bigint, NULL::jsonb;
    RETURN;
  END IF;

  -- Check rate limit (requests in last hour)
  SELECT COUNT(*) INTO v_request_count
  FROM api_requests_log
  WHERE api_key_id = v_api_key.id
    AND created_at > now() - interval '1 hour';

  IF v_request_count >= v_api_key.rate_limit THEN
    RETURN QUERY SELECT false, v_api_key.id, v_api_key.rate_limit, v_request_count, v_api_key.permissions;
    RETURN;
  END IF;

  -- Update last_used_at
  UPDATE api_keys
  SET last_used_at = now()
  WHERE id = v_api_key.id;

  RETURN QUERY SELECT true, v_api_key.id, v_api_key.rate_limit, v_request_count, v_api_key.permissions;
END;
$$;
