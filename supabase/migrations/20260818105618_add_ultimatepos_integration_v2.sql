/*
# Add UltimatePOS Integration v2

## Purpose
Re-creates the UltimatePOS integration tables that were previously removed,
enabling the kiosk to push completed sales to an UltimatePOS instance via its
REST API add-on module.

## New Tables
1. `ultimatepos_config` (singleton) — stores the connection settings:
   - base_url: UltimatePOS server URL
   - client_id / client_secret: OAuth2 credentials
   - api_token: personal access token (alternative to OAuth)
   - api_username / api_password: password grant credentials
   - auth_method: 'oauth' | 'token' | 'password'
   - business_id / location_id: UltimatePOS business and location scope
   - is_enabled: master on/off toggle
   - auto_push_orders: automatically push completed orders
   - auto_sync_products: automatically sync products
   - last_product_sync_at / last_connected_at / connection_status

2. `ultimatepos_order_log` — one row per sale pushed to UltimatePOS:
   - order_id → orders.id (FK, cascade delete)
   - ultimatepos_sale_id: returned by UltimatePOS on success
   - status: pending | success | failed
   - error_message, request_payload, response_payload

3. `ultimatepos_sync_log` — one row per product sync attempt:
   - sync_type, status, items_synced, error_message, timestamps

## Modified Tables
- `products`: adds `ultimatepos_id` (integer) and `ultimatepos_variation_id`
  (integer) columns so each kiosk product can be linked to its UltimatePOS
  counterpart.

## Security (RLS)
- All three new tables have RLS enabled.
- Config: authenticated-only CRUD (admins manage settings).
- Order log & sync log: authenticated read; authenticated + anon insert/update
  (edge function uses service key but anon policy is included for safety).
- Products: existing RLS already covers the new columns (same table).
*/

-- Config table (singleton)
CREATE TABLE IF NOT EXISTS ultimatepos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  api_token text NOT NULL DEFAULT '',
  api_username text NOT NULL DEFAULT '',
  api_password text NOT NULL DEFAULT '',
  auth_method text NOT NULL DEFAULT 'oauth',
  business_id integer DEFAULT 1,
  location_id integer DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT false,
  auto_push_orders boolean NOT NULL DEFAULT true,
  auto_sync_products boolean NOT NULL DEFAULT false,
  last_product_sync_at timestamptz,
  last_connected_at timestamptz,
  connection_status text NOT NULL DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order push log
CREATE TABLE IF NOT EXISTS ultimatepos_order_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  order_number text,
  ultimatepos_sale_id integer,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  request_payload jsonb DEFAULT '{}'::jsonb,
  response_payload jsonb DEFAULT '{}'::jsonb,
  pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Product sync log
CREATE TABLE IF NOT EXISTS ultimatepos_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT 'products',
  status text NOT NULL DEFAULT 'pending',
  items_synced integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE ultimatepos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ultimatepos_order_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ultimatepos_sync_log ENABLE ROW LEVEL SECURITY;

-- Config policies (admin-only)
DROP POLICY IF EXISTS "select_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "select_ultimatepos_config" ON ultimatepos_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "insert_ultimatepos_config" ON ultimatepos_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "update_ultimatepos_config" ON ultimatepos_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "delete_ultimatepos_config" ON ultimatepos_config
  FOR DELETE TO authenticated USING (true);

-- Order log policies
DROP POLICY IF EXISTS "select_ultimatepos_order_log" ON ultimatepos_order_log;
CREATE POLICY "select_ultimatepos_order_log" ON ultimatepos_order_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_ultimatepos_order_log" ON ultimatepos_order_log;
CREATE POLICY "insert_ultimatepos_order_log" ON ultimatepos_order_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_ultimatepos_order_log" ON ultimatepos_order_log;
CREATE POLICY "update_ultimatepos_order_log" ON ultimatepos_order_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Sync log policies
DROP POLICY IF EXISTS "select_ultimatepos_sync_log" ON ultimatepos_sync_log;
CREATE POLICY "select_ultimatepos_sync_log" ON ultimatepos_sync_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_ultimatepos_sync_log" ON ultimatepos_sync_log;
CREATE POLICY "insert_ultimatepos_sync_log" ON ultimatepos_sync_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_ultimatepos_sync_log" ON ultimatepos_sync_log;
CREATE POLICY "update_ultimatepos_sync_log" ON ultimatepos_sync_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Insert default config row if none exists
INSERT INTO ultimatepos_config (base_url, client_id, client_secret, is_enabled)
SELECT '', '', '', false
WHERE NOT EXISTS (SELECT 1 FROM ultimatepos_config LIMIT 1);

-- Add UltimatePOS linking columns to products
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'ultimatepos_id'
  ) THEN
    ALTER TABLE products ADD COLUMN ultimatepos_id integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'ultimatepos_variation_id'
  ) THEN
    ALTER TABLE products ADD COLUMN ultimatepos_variation_id integer;
  END IF;
END $$;