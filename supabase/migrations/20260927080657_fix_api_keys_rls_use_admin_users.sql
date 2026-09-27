/*
# Fix API Keys RLS policies to use admin_users table

## Problem
The RLS policies on api_keys and api_requests_log were checking `auth.users.raw_user_meta_data->>'role' = 'admin'`
but the authenticated role does not have permission to read `auth.users`, causing "permission denied for table users" errors.

## Fix
Replace all policy predicates to check the `admin_users` table instead (the project's standard admin check pattern):
  EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())

## Affected tables
- api_keys (SELECT, INSERT, UPDATE, DELETE policies)
- api_requests_log (SELECT policy)
*/

-- Drop and recreate all api_keys policies
DROP POLICY IF EXISTS "Admins can view all API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can create API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can update API keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can delete API keys" ON api_keys;

CREATE POLICY "Admins can view all API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can create API keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can update API keys"
  ON api_keys FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can delete API keys"
  ON api_keys FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- Drop and recreate api_requests_log SELECT policy
DROP POLICY IF EXISTS "Admins can view API request logs" ON api_requests_log;

CREATE POLICY "Admins can view API request logs"
  ON api_requests_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
