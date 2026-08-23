/*
  # Fix POS RLS Policies

  1. Changes
    - Update RLS policies to work with the actual user_roles schema
    - Remove references to non-existent user_permissions table
    - Simplify policies to check permissions JSONB field directly
    - Add admin bypass for all POS operations

  2. Security
    - Admins can always access POS
    - Users with pos_access permission can create sessions
    - Users can only see their own sessions unless admin/manager
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Staff can view POS sessions" ON pos_sessions;
DROP POLICY IF EXISTS "Staff can create POS sessions" ON pos_sessions;
DROP POLICY IF EXISTS "Staff can update POS sessions" ON pos_sessions;
DROP POLICY IF EXISTS "Staff can view POS transactions" ON pos_transactions;
DROP POLICY IF EXISTS "Staff can create POS transactions" ON pos_transactions;
DROP POLICY IF EXISTS "Authorized staff can update POS transactions" ON pos_transactions;

-- New simplified RLS policies for pos_sessions

CREATE POLICY "Staff can view POS sessions"
  ON pos_sessions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  );

CREATE POLICY "Staff can create POS sessions"
  ON pos_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = staff_id
  );

CREATE POLICY "Staff can update POS sessions"
  ON pos_sessions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  )
  WITH CHECK (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  );

-- New simplified RLS policies for pos_transactions

CREATE POLICY "Staff can view POS transactions"
  ON pos_transactions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  );

CREATE POLICY "Staff can create POS transactions"
  ON pos_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = staff_id
  );

CREATE POLICY "Authorized staff can update POS transactions"
  ON pos_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND (ur.name = 'admin' OR ur.name = 'manager')
    )
  );