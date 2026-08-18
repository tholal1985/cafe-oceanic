/*
  # Fix admin_users SELECT RLS policy

  ## Problem
  The existing SELECT policy has a circular dependency:
  - To read from admin_users, it checks if the user exists in admin_users
  - This means a user can never read their own row on first query after login

  ## Fix
  Replace the policy with a simple one that allows authenticated users
  to read their own row using auth.uid() = id directly, with no subquery.
*/

DROP POLICY IF EXISTS "Admins can read all admin users" ON admin_users;

CREATE POLICY "Admin users can read own row"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
