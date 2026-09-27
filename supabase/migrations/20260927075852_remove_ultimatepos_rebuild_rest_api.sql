/*
# Remove UltimatePOS and rebuild REST API Keys system

## What this does
1. Drops all UltimatePOS tables (ultimatepos_config, ultimatepos_sync_logs, ultimatepos_sale_pushes)
2. Drops ultimatepos_id and ultimatepos_sale_id columns from products and orders
3. Recreates the api_keys and api_requests_log tables (previously dropped in migration 20260927065607)
4. Recreates the validate_api_key, log_api_request, and update_api_keys_updated_at functions
5. Enables RLS with admin-only policies

## Tables dropped
- ultimatepos_config
- ultimatepos_sync_logs
- ultimatepos_sale_pushes

## Columns dropped
- products.ultimatepos_id
- products.ultimatepos_variation_id
- orders.ultimatepos_sale_id

## Tables created
- api_keys — API key management with hashed keys, permissions, rate limits
- api_requests_log — audit log of all API requests

## Security
- RLS enabled on both new tables
- Only authenticated admins can manage API keys
- API request logs are read-only for admins
- validate_api_key is SECURITY DEFINER (runs as owner, bypasses RLS to check key hash)
*/

-- ============================================================
-- Drop UltimatePOS tables and columns
-- ============================================================
DROP TABLE IF EXISTS ultimatepos_sale_pushes CASCADE;
DROP TABLE IF EXISTS ultimatepos_sync_logs CASCADE;
DROP TABLE IF EXISTS ultimatepos_config CASCADE;

ALTER TABLE products
  DROP COLUMN IF EXISTS ultimatepos_id,
  DROP COLUMN IF EXISTS ultimatepos_variation_id;

ALTER TABLE orders
  DROP COLUMN IF EXISTS ultimatepos_sale_id;

-- ============================================================
-- Create REST API Keys system
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text UNIQUE NOT NULL,
  key_prefix text NOT NULL,
  permissions jsonb DEFAULT '{"products": ["read"], "categories": ["read"], "orders": ["read", "write"], "customers": ["read", "write"]}'::jsonb,
  rate_limit integer DEFAULT 1000,
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_requests_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  ip_address text,
  user_agent text,
  response_time_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_api_key_id ON api_requests_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_created_at ON api_requests_log(created_at);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_requests_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================
DROP POLICY IF EXISTS "Admins can view all API keys" ON api_keys;
CREATE POLICY "Admins can view all API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create API keys" ON api_keys;
CREATE POLICY "Admins can create API keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update API keys" ON api_keys;
CREATE POLICY "Admins can update API keys"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete API keys" ON api_keys;
CREATE POLICY "Admins can delete API keys"
  ON api_keys FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view API request logs" ON api_requests_log;
CREATE POLICY "Admins can view API request logs"
  ON api_requests_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- ============================================================
-- Functions
-- ============================================================
DROP FUNCTION IF EXISTS validate_api_key(text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash text, p_endpoint text, p_permission text)
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
  SELECT * INTO v_api_key
  FROM api_keys
  WHERE key_hash = p_key_hash
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 0::bigint, NULL::jsonb;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_request_count
  FROM api_requests_log
  WHERE api_key_id = v_api_key.id
    AND created_at > now() - interval '1 hour';

  IF v_request_count >= v_api_key.rate_limit THEN
    RETURN QUERY SELECT false, v_api_key.id, v_api_key.rate_limit, v_request_count, v_api_key.permissions;
    RETURN;
  END IF;

  UPDATE api_keys
  SET last_used_at = now()
  WHERE id = v_api_key.id;

  RETURN QUERY SELECT true, v_api_key.id, v_api_key.rate_limit, v_request_count, v_api_key.permissions;
END;
$$;

DROP FUNCTION IF EXISTS log_api_request(uuid, text, text, integer, text, text, integer) CASCADE;
CREATE OR REPLACE FUNCTION log_api_request(
  p_api_key_id uuid,
  p_endpoint text,
  p_method text,
  p_status_code integer,
  p_ip_address text,
  p_user_agent text,
  p_response_time_ms integer
)
RETURNS void
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO api_requests_log (
    api_key_id, endpoint, method, status_code,
    ip_address, user_agent, response_time_ms
  ) VALUES (
    p_api_key_id, p_endpoint, p_method, p_status_code,
    p_ip_address, p_user_agent, p_response_time_ms
  );
END;
$$;

DROP FUNCTION IF EXISTS update_api_keys_updated_at() CASCADE;
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS api_keys_updated_at ON api_keys;
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();
