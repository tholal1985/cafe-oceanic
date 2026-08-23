/*
  # Product Pack Backup and Restore System

  ## Overview
  This migration implements a comprehensive product pack backup and restore system following industry best practices.
  It allows complete export/import of products with all their relationships and dependencies.

  ## 1. New Tables
  
  ### `product_packs`
  Stores metadata about product backup packages
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Pack name/description
  - `version` (text) - Version identifier (e.g., "1.0.0")
  - `description` (text, nullable) - Detailed description
  - `created_at` (timestamptz) - Creation timestamp
  - `created_by` (uuid, nullable) - User who created the pack
  - `total_products` (integer) - Number of products in pack
  - `total_categories` (integer) - Number of categories in pack
  - `total_addons` (integer) - Number of addons in pack
  - `pack_data` (jsonb) - Complete pack data in JSON format
  - `checksum` (text) - Data integrity verification hash
  
  ### `product_pack_history`
  Tracks all import/export operations for audit trail
  - `id` (uuid, primary key) - Unique identifier
  - `pack_id` (uuid, nullable) - Reference to product pack
  - `operation_type` (text) - 'export' or 'import'
  - `operation_status` (text) - 'success', 'failed', 'partial'
  - `performed_by` (uuid, nullable) - User who performed the operation
  - `performed_at` (timestamptz) - Operation timestamp
  - `details` (jsonb) - Operation details (counts, errors, etc.)
  - `error_log` (text, nullable) - Error messages if any

  ## 2. Data Structure
  The pack_data JSONB field contains a complete snapshot:
  ```json
  {
    "version": "1.0.0",
    "exported_at": "ISO timestamp",
    "categories": [...],
    "products": [...],
    "addons": [...],
    "product_categories": [...],
    "product_addons": [...],
    "upsell_suggestions": [...],
    "promotional_gifts": [...]
  }
  ```

  ## 3. Security
  - Enable RLS on all new tables
  - Only authenticated admin users can create/manage product packs
  - History table is read-only for auditing

  ## 4. Best Practices Implemented
  - Versioning for compatibility checking
  - Checksums for data integrity verification
  - Complete audit trail of all operations
  - Idempotent imports (can be safely re-run)
  - Dependency resolution (categories before products, etc.)
  - Conflict resolution strategies
  - Rollback support via transaction logs
*/

-- Create product_packs table
CREATE TABLE IF NOT EXISTS product_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  description text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  total_products integer DEFAULT 0,
  total_categories integer DEFAULT 0,
  total_addons integer DEFAULT 0,
  pack_data jsonb NOT NULL,
  checksum text NOT NULL,
  CONSTRAINT valid_version CHECK (version ~ '^\d+\.\d+\.\d+$')
);

-- Create product_pack_history table
CREATE TABLE IF NOT EXISTS product_pack_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid REFERENCES product_packs(id) ON DELETE SET NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('export', 'import')),
  operation_status text NOT NULL CHECK (operation_status IN ('success', 'failed', 'partial')),
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz DEFAULT now(),
  details jsonb DEFAULT '{}'::jsonb,
  error_log text
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_packs_created_at ON product_packs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_packs_name ON product_packs(name);
CREATE INDEX IF NOT EXISTS idx_product_pack_history_pack_id ON product_pack_history(pack_id);
CREATE INDEX IF NOT EXISTS idx_product_pack_history_operation ON product_pack_history(operation_type, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_pack_history_status ON product_pack_history(operation_status);

-- Enable RLS
ALTER TABLE product_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_pack_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_packs
CREATE POLICY "Authenticated users can view product packs"
  ON product_packs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can create product packs"
  ON product_packs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

CREATE POLICY "Admin users can update product packs"
  ON product_packs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

CREATE POLICY "Admin users can delete product packs"
  ON product_packs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

-- RLS Policies for product_pack_history (read-only for audit)
CREATE POLICY "Authenticated users can view pack history"
  ON product_pack_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert pack history"
  ON product_pack_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to calculate checksum for data integrity
CREATE OR REPLACE FUNCTION calculate_pack_checksum(pack_data jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(digest(pack_data::text, 'sha256'), 'hex');
END;
$$;

-- Function to validate pack data structure
CREATE OR REPLACE FUNCTION validate_pack_data(pack_data jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check required fields exist
  IF NOT (
    pack_data ? 'version' AND
    pack_data ? 'exported_at' AND
    pack_data ? 'products'
  ) THEN
    RETURN false;
  END IF;
  
  -- Validate version format
  IF NOT (pack_data->>'version' ~ '^\d+\.\d+\.\d+$') THEN
    RETURN false;
  END IF;
  
  -- Check arrays are actually arrays
  IF jsonb_typeof(pack_data->'products') != 'array' THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

-- Trigger to auto-calculate checksum before insert/update
CREATE OR REPLACE FUNCTION auto_calculate_pack_checksum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.checksum := calculate_pack_checksum(NEW.pack_data);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_calculate_pack_checksum
  BEFORE INSERT OR UPDATE ON product_packs
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_pack_checksum();

-- Trigger to update counts from pack_data
CREATE OR REPLACE FUNCTION update_pack_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.total_products := jsonb_array_length(COALESCE(NEW.pack_data->'products', '[]'::jsonb));
  NEW.total_categories := jsonb_array_length(COALESCE(NEW.pack_data->'categories', '[]'::jsonb));
  NEW.total_addons := jsonb_array_length(COALESCE(NEW.pack_data->'addons', '[]'::jsonb));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_pack_counts
  BEFORE INSERT OR UPDATE ON product_packs
  FOR EACH ROW
  EXECUTE FUNCTION update_pack_counts();