/*
  # Fix admin_users read policy

  ## Problem
  The current SELECT policy on admin_users only allows users to read their own row:
    `id = auth.uid()`
  This means admins cannot list other users in the User Management screen.

  ## Changes
  - Drop the restrictive self-only SELECT policy
  - Add a new SELECT policy that allows active admin users to read ALL rows in admin_users
  - Non-admins can still read only their own row (for auth checks)
*/

DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;

CREATE POLICY "Admins can read all admin users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM admin_users a
      WHERE a.id = auth.uid() AND a.is_active = true
    )
  );
