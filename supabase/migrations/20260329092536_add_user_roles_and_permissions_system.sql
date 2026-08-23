/*
  # User Roles and Permissions System

  1. New Tables
    - `user_roles`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Role name: admin, kitchen_staff, cashier, waiter
      - `display_name` (text) - Friendly display name
      - `description` (text) - Role description
      - `permissions` (jsonb) - Role permissions configuration
      - `is_active` (boolean) - Whether role is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `user_role_assignments`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `role_id` (uuid, references user_roles)
      - `assigned_by` (uuid, references auth.users)
      - `assigned_at` (timestamptz)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - Unique constraint on (user_id, role_id)

  2. Updates to admin_users
    - Add `is_active` column to track active status
    - Add `last_login_at` column to track login activity

  3. Security
    - Enable RLS on all new tables
    - Admin users can manage roles and assignments
    - Users can view their own role assignments
    - Kitchen staff can only access kitchen display
    - Cashiers can access payment and order management
    - Waiters can access order management

  4. Seed Data
    - Create default roles: Admin, Kitchen Staff, Cashier, Waiter
*/

-- Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_role_assignments table
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_id uuid REFERENCES user_roles(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- Add columns to admin_users if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_users' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE admin_users ADD COLUMN last_login_at timestamptz;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_id ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role_id ON user_role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_active ON user_role_assignments(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles

-- Admins can do everything with roles
CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins can insert roles"
  ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins can update roles"
  ON user_roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

CREATE POLICY "Admins can delete roles"
  ON user_roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- RLS Policies for user_role_assignments

-- Users can view their own role assignments
CREATE POLICY "Users can view own role assignments"
  ON user_role_assignments FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Admins can insert role assignments
CREATE POLICY "Admins can assign roles"
  ON user_role_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Admins can update role assignments
CREATE POLICY "Admins can update role assignments"
  ON user_role_assignments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Admins can delete role assignments
CREATE POLICY "Admins can delete role assignments"
  ON user_role_assignments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.id = auth.uid()
      AND admin_users.is_active = true
    )
  );

-- Insert default roles
INSERT INTO user_roles (name, display_name, description, permissions) VALUES
  (
    'admin',
    'Administrator',
    'Full system access including user management, settings, and all features',
    '{
      "dashboard": true,
      "products": {"view": true, "create": true, "edit": true, "delete": true},
      "categories": {"view": true, "create": true, "edit": true, "delete": true},
      "orders": {"view": true, "create": true, "edit": true, "delete": true},
      "kitchen": {"view": true, "update_status": true},
      "payments": {"view": true, "process": true, "refund": true},
      "users": {"view": true, "create": true, "edit": true, "delete": true, "assign_roles": true},
      "settings": {"view": true, "edit": true},
      "reports": {"view": true, "export": true}
    }'::jsonb
  ),
  (
    'kitchen_staff',
    'Kitchen Staff',
    'Access to kitchen display and order preparation',
    '{
      "kitchen": {"view": true, "update_status": true},
      "orders": {"view": true}
    }'::jsonb
  ),
  (
    'cashier',
    'Cashier',
    'Process payments and manage customer orders',
    '{
      "orders": {"view": true, "create": true, "edit": true},
      "payments": {"view": true, "process": true},
      "products": {"view": true},
      "reports": {"view": true}
    }'::jsonb
  ),
  (
    'waiter',
    'Waiter/Server',
    'Take and manage customer orders',
    '{
      "orders": {"view": true, "create": true, "edit": true},
      "products": {"view": true},
      "kitchen": {"view": true}
    }'::jsonb
  )
ON CONFLICT (name) DO NOTHING;

-- Function to get user roles
CREATE OR REPLACE FUNCTION get_user_roles(user_uuid uuid)
RETURNS TABLE (
  role_id uuid,
  role_name text,
  display_name text,
  permissions jsonb
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ur.id,
    ur.name,
    ur.display_name,
    ur.permissions
  FROM user_roles ur
  INNER JOIN user_role_assignments ura ON ur.id = ura.role_id
  WHERE ura.user_id = user_uuid
    AND ura.is_active = true
    AND ur.is_active = true;
END;
$$;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(
  user_uuid uuid,
  permission_path text[]
)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_permissions jsonb;
  result boolean := false;
BEGIN
  -- Get all permissions for the user
  SELECT jsonb_agg(ur.permissions)
  INTO user_permissions
  FROM user_roles ur
  INNER JOIN user_role_assignments ura ON ur.id = ura.role_id
  WHERE ura.user_id = user_uuid
    AND ura.is_active = true
    AND ur.is_active = true;

  -- Check if user has the permission
  IF user_permissions IS NOT NULL THEN
    -- This is a simplified check - you can make it more sophisticated
    result := user_permissions::text LIKE '%' || array_to_string(permission_path, '.') || '%true%';
  END IF;

  RETURN result;
END;
$$;

-- Update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
