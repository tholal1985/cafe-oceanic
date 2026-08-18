/*
  # REST API Keys System

  1. New Tables
    - `api_keys`
      - `id` (uuid, primary key)
      - `name` (text) - Friendly name for the API key
      - `key_hash` (text) - Hashed API key for security
      - `key_prefix` (text) - First 8 chars for identification
      - `permissions` (jsonb) - Granular permissions
      - `rate_limit` (integer) - Requests per hour
      - `is_active` (boolean) - Enable/disable key
      - `last_used_at` (timestamptz) - Track usage
      - `expires_at` (timestamptz) - Optional expiration
      - `created_by` (uuid) - Admin who created it
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `api_requests_log`
      - `id` (uuid, primary key)
      - `api_key_id` (uuid) - Foreign key to api_keys
      - `endpoint` (text) - API endpoint called
      - `method` (text) - HTTP method
      - `status_code` (integer) - Response status
      - `ip_address` (text) - Client IP
      - `user_agent` (text) - Client user agent
      - `response_time_ms` (integer) - Performance tracking
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Only authenticated admins can manage API keys
    - API request logs are read-only for admins
    
  3. Functions
    - Function to validate API key and check permissions
    - Function to log API requests
    - Function to check rate limits
*/

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text UNIQUE NOT NULL,
  key_prefix text NOT NULL,
  permissions jsonb DEFAULT '{"products": ["read"], "categories": ["read"], "orders": ["read"], "customers": ["read"]}'::jsonb,
  rate_limit integer DEFAULT 1000,
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create api_requests_log table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_api_key_id ON api_requests_log(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_log_created_at ON api_requests_log(created_at);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_requests_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_keys
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

-- RLS Policies for api_requests_log
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

-- Function to validate API key
CREATE OR REPLACE FUNCTION validate_api_key(p_key_hash text, p_endpoint text, p_permission text)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  rate_limit integer,
  request_count bigint
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_api_key api_keys%ROWTYPE;
  v_request_count bigint;
BEGIN
  -- Get API key
  SELECT * INTO v_api_key
  FROM api_keys
  WHERE key_hash = p_key_hash
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  -- If key not found or inactive
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 0::bigint;
    RETURN;
  END IF;
  
  -- Check rate limit (requests in last hour)
  SELECT COUNT(*) INTO v_request_count
  FROM api_requests_log
  WHERE api_key_id = v_api_key.id
    AND created_at > now() - interval '1 hour';
  
  -- If rate limit exceeded
  IF v_request_count >= v_api_key.rate_limit THEN
    RETURN QUERY SELECT false, v_api_key.id, v_api_key.rate_limit, v_request_count;
    RETURN;
  END IF;
  
  -- Update last_used_at
  UPDATE api_keys
  SET last_used_at = now()
  WHERE id = v_api_key.id;
  
  -- Return success
  RETURN QUERY SELECT true, v_api_key.id, v_api_key.rate_limit, v_request_count;
END;
$$;

-- Function to log API request
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
    api_key_id,
    endpoint,
    method,
    status_code,
    ip_address,
    user_agent,
    response_time_ms
  ) VALUES (
    p_api_key_id,
    p_endpoint,
    p_method,
    p_status_code,
    p_ip_address,
    p_user_agent,
    p_response_time_ms
  );
END;
$$;

-- Auto-update updated_at timestamp
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

CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();
