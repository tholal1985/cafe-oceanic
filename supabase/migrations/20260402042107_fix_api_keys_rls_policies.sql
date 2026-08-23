/*
  # Fix API Keys RLS Policies

  1. Changes
    - Update RLS policies to check admin_users table instead of auth.users
    - Ensure proper permission checks for API key management

  2. Security
    - Only authenticated admin users can manage API keys
    - Maintains strict security controls
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can create API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can update API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can delete API keys" ON api_keys;

-- Recreate policies with correct admin_users reference
CREATE POLICY "Admins can view all API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

CREATE POLICY "Admins can create API keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

CREATE POLICY "Admins can update API keys"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete API keys"
  ON api_keys FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );

-- Update api_requests_log policy
DROP POLICY IF EXISTS "Admins can view API request logs" ON api_requests_log;

CREATE POLICY "Admins can view API request logs"
  ON api_requests_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
    )
  );
