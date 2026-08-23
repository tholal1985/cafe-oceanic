/*
  # Fix Admin Login RLS Policy
  
  1. Changes
    - Drop the existing restrictive SELECT policy on admin_users
    - Add a new policy that allows users to check their own admin status
    - This fixes the circular dependency during login
  
  2. Security
    - Users can only view their own record in admin_users
    - This allows the login flow to verify admin status
    - Still maintains security by using auth.uid()
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can view admin users" ON admin_users;

-- Create a new policy that allows users to check if they are an admin
CREATE POLICY "Users can check own admin status"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());
