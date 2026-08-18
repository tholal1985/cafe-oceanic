/*
  # Module Licensing & Product Pack Tiers

  Adds a module-by-module activation system so the software can be sold by module,
  plus a tier system for product packs (nano, starter, pro, super, etc.).

  1. New Tables
    - `software_modules`
      - `key` (text, primary key) - canonical module identifier (e.g., "product_packs")
      - `display_name` (text) - human readable label
      - `description` (text)
      - `category` (text) - grouping (core, sales, marketing, etc.)
      - `is_core` (boolean) - core modules always active
      - `price` (numeric) - suggested retail price
      - `created_at` (timestamptz)

    - `activation_keys`
      - `id` (uuid, primary key)
      - `key_code` (text, unique) - the license key string (formatted 4x5)
      - `product_name` (text) - product this key unlocks (e.g., "Kiosk Pro")
      - `modules` (text[]) - module keys this license unlocks
      - `pack_tier` (text) - optional tier embedded in license
      - `max_products` (integer) - product cap granted by this license
      - `customer_name` (text)
      - `customer_email` (text)
      - `max_activations` (integer) - how many installs can redeem this
      - `activation_count` (integer) - current usage
      - `expires_at` (timestamptz)
      - `is_revoked` (boolean)
      - `notes` (text)
      - `created_by` (uuid)
      - `created_at` (timestamptz)

    - `module_activations`
      - `id` (uuid, primary key)
      - `module_key` (text) - module activated
      - `activation_key_id` (uuid) - the license key used
      - `installation_id` (text) - identifies this install
      - `activated_by` (uuid)
      - `activated_at` (timestamptz)
      - `is_active` (boolean)

    - `product_pack_tiers`
      - `id` (uuid, primary key)
      - `name` (text, unique) - e.g., "nano", "starter"
      - `display_name` (text) - e.g., "Nano"
      - `max_products` (integer) - cap
      - `max_categories` (integer)
      - `max_addons` (integer)
      - `price` (numeric)
      - `description` (text)
      - `display_order` (integer)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  2. Changes
    - Add `tier` column to `product_packs` for tier-based catalog packs

  3. Security
    - RLS enabled on all new tables
    - Only authenticated admin_users can manage licenses and tiers
    - Active module check via RPC `is_module_active`
*/

-- Software modules registry
CREATE TABLE IF NOT EXISTS software_modules (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT 'general',
  is_core boolean DEFAULT false,
  price numeric(10,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE software_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view modules"
  ON software_modules FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can insert modules"
  ON software_modules FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can update modules"
  ON software_modules FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can delete modules"
  ON software_modules FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Seed standard modules
INSERT INTO software_modules (key, display_name, description, category, is_core, price) VALUES
  ('core', 'Core Platform', 'Base system, auth, dashboard', 'core', true, 0),
  ('kiosk', 'Self-Order Kiosk', 'Customer-facing kiosk ordering', 'sales', false, 199),
  ('pos', 'Point of Sale', 'Staff POS terminal', 'sales', false, 299),
  ('kitchen_display', 'Kitchen Display', 'KDS for kitchen staff', 'operations', false, 149),
  ('orders', 'Order Management', 'Manage orders and statuses', 'operations', true, 0),
  ('customers', 'Customer Management', 'Customer profiles and loyalty', 'marketing', false, 129),
  ('messaging', 'SMS / WhatsApp Messaging', 'Send order notifications', 'marketing', false, 99),
  ('payment_gateways', 'Payment Gateways', 'Online payment integrations', 'payments', false, 199),
  ('upsell', 'Upsell Suggestions', 'Upsell cross-sell engine', 'marketing', false, 79),
  ('gifts', 'Promotional Gifts', 'Auto-gift rules engine', 'marketing', false, 79),
  ('backup_restore', 'Backup & Restore', 'Scheduled backups', 'operations', false, 99),
  ('api_access', 'REST API Access', 'Programmatic API keys', 'integrations', false, 149),
  ('product_packs', 'Product Packs', 'Export/import product catalog packs', 'catalog', false, 199),
  ('pack_licensing', 'Pack License Generator', 'Create activation keys for packs', 'licensing', false, 0)
ON CONFLICT (key) DO NOTHING;

-- Activation keys (licenses issued to customers)
CREATE TABLE IF NOT EXISTS activation_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_code text UNIQUE NOT NULL,
  product_name text DEFAULT 'Kiosk Suite',
  modules text[] DEFAULT ARRAY[]::text[],
  pack_tier text DEFAULT '',
  max_products integer DEFAULT 0,
  customer_name text DEFAULT '',
  customer_email text DEFAULT '',
  max_activations integer DEFAULT 1,
  activation_count integer DEFAULT 0,
  expires_at timestamptz,
  is_revoked boolean DEFAULT false,
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activation_keys_key_code ON activation_keys(key_code);
CREATE INDEX IF NOT EXISTS idx_activation_keys_created_by ON activation_keys(created_by);

ALTER TABLE activation_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activation keys"
  ON activation_keys FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can create activation keys"
  ON activation_keys FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can update activation keys"
  ON activation_keys FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can delete activation keys"
  ON activation_keys FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Module activations (redeemed on an installation)
CREATE TABLE IF NOT EXISTS module_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  activation_key_id uuid REFERENCES activation_keys(id) ON DELETE SET NULL,
  installation_id text DEFAULT '',
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_module_activations_module_key ON module_activations(module_key);
CREATE INDEX IF NOT EXISTS idx_module_activations_is_active ON module_activations(is_active);

ALTER TABLE module_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active modules"
  ON module_activations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert module activations"
  ON module_activations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can update module activations"
  ON module_activations FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can delete module activations"
  ON module_activations FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Product pack tiers
CREATE TABLE IF NOT EXISTS product_pack_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  max_products integer DEFAULT 0,
  max_categories integer DEFAULT 0,
  max_addons integer DEFAULT 0,
  price numeric(10,2) DEFAULT 0,
  description text DEFAULT '',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_pack_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pack tiers"
  ON product_pack_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert pack tiers"
  ON product_pack_tiers FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can update pack tiers"
  ON product_pack_tiers FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can delete pack tiers"
  ON product_pack_tiers FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Seed common tiers
INSERT INTO product_pack_tiers (name, display_name, max_products, max_categories, max_addons, price, description, display_order) VALUES
  ('nano', 'Nano', 10, 3, 5, 29, 'Small cafe starter pack - up to 10 products', 1),
  ('starter', 'Starter', 50, 8, 20, 79, 'Small restaurant - up to 50 products', 2),
  ('pro', 'Pro', 150, 20, 60, 199, 'Full-service restaurant - up to 150 products', 3),
  ('super', 'Super', 500, 50, 200, 399, 'Multi-menu operation - up to 500 products', 4),
  ('enterprise', 'Enterprise', 99999, 999, 999, 999, 'Unlimited catalog', 5)
ON CONFLICT (name) DO NOTHING;

-- Add tier column to product_packs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'tier'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN tier text DEFAULT '';
  END IF;
END $$;

-- RPC helper to check if a module is active (for UI gating)
CREATE OR REPLACE FUNCTION is_module_active(p_module_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM software_modules WHERE key = p_module_key AND is_core = true
  ) OR EXISTS (
    SELECT 1 FROM module_activations ma
    JOIN activation_keys ak ON ak.id = ma.activation_key_id
    WHERE ma.module_key = p_module_key
      AND ma.is_active = true
      AND ak.is_revoked = false
      AND (ak.expires_at IS NULL OR ak.expires_at > now())
  );
$$;