/*
  # Allow First Admin Registration

  ## Changes
  - Adds a policy to allow the first admin user to register themselves
  - If no admin users exist in the system, any authenticated user can create an admin_users entry
  - This solves the chicken-and-egg problem of needing an admin to create an admin

  ## Security
  - Only allows self-registration (auth.uid() = id)
  - Only when no other admins exist
  - After first admin is created, the original policy takes over
*/

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Admins can insert admin users" ON admin_users;

-- Create new policy that allows first admin to self-register
CREATE POLICY "Admins can insert admin users"
  ON admin_users FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Either you're an existing admin
    EXISTS (
      SELECT 1 FROM admin_users WHERE id = auth.uid()
    )
    OR 
    -- Or this is the first admin (self-registration only)
    (
      auth.uid() = id 
      AND NOT EXISTS (SELECT 1 FROM admin_users)
    )
  );