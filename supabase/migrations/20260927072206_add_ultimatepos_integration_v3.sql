/*
# UltimatePOS REST API Integration v3

## Purpose
Adds full database support for syncing products and customers from UltimatePOS,
and pushing completed kiosk/POS sales back to UltimatePOS via its REST API.

## New Tables

### ultimatepos_config
Stores the UltimatePOS connection credentials and settings.
- `id` (uuid, primary key)
- `api_url` (text) — base URL of the UltimatePOS instance (e.g. https://yourstore.pos.ultimatefosters.com)
- `client_id` (text) — OAuth2 client ID from UltimatePOS Connector
- `client_secret` (text) — OAuth2 client secret
- `username` (text) — UltimatePOS admin username
- `password` (text) — UltimatePOS admin password
- `is_active` (boolean, default true) — whether sync is enabled
- `auto_sync_products` (boolean, default false) — auto-sync products on schedule
- `auto_sync_customers` (boolean, default false) — auto-sync customers on schedule
- `auto_push_sales` (boolean, default true) — push sales automatically after completion
- `last_product_sync_at` (timestamptz) — last successful product sync timestamp
- `last_customer_sync_at` (timestamptz) — last successful customer sync timestamp
- `last_sale_push_at` (timestamptz) — last successful sale push timestamp
- `created_at` / `updated_at` (timestamptz)

### ultimatepos_sync_logs
Tracks each sync operation (product sync, customer sync, sale push).
- `id` (uuid, primary key)
- `sync_type` (text) — 'products' | 'customers' | 'sales'
- `status` (text) — 'success' | 'failed' | 'partial'
- `records_processed` (integer, default 0)
- `records_created` (integer, default 0)
- `records_updated` (integer, default 0)
- `records_skipped` (integer, default 0)
- `error_message` (text, nullable)
- `details` (jsonb) — detailed per-record results
- `created_at` (timestamptz)

### ultimatepos_sale_pushes
Tracks individual sale push attempts for retry and audit.
- `id` (uuid, primary key)
- `order_id` (uuid, references orders) — the local order
- `ultimatepos_sale_id` (text, nullable) — returned UltimatePOS sale ID on success
- `status` (text) — 'pending' | 'success' | 'failed' | 'retrying'
- `retry_count` (integer, default 0)
- `max_retries` (integer, default 3)
- `payload` (jsonb) — what was sent to UltimatePOS
- `response` (jsonb) — what UltimatePOS returned
- `error_message` (text, nullable)
- `pushed_at` (timestamptz, nullable) — when successfully pushed
- `next_retry_at` (timestamptz, nullable) — scheduled retry time
- `created_at` / `updated_at` (timestamptz)

## Modified Tables

### products
- Added `ultimatepos_id` (text, nullable) — links to UltimatePOS product ID for sync tracking

### customers
- Added `ultimatepos_id` (text, nullable) — links to UltimatePOS customer ID for sync tracking

### orders
- Added `ultimatepos_sale_id` (text, nullable) — returned UltimatePOS sale ID after successful push

## Security
- RLS enabled on all new tables
- `ultimatepos_config`: admin-only (authenticated users can read/update)
- `ultimatepos_sync_logs`: authenticated read-only
- `ultimatepos_sale_pushes`: authenticated CRUD
- Edge functions use service role key (bypasses RLS) for all UltimatePOS API communication
*/

-- ============================================================
-- 1. ultimatepos_config table
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_url text NOT NULL,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  username text NOT NULL,
  password text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  auto_sync_products boolean NOT NULL DEFAULT false,
  auto_sync_customers boolean NOT NULL DEFAULT false,
  auto_push_sales boolean NOT NULL DEFAULT true,
  last_product_sync_at timestamptz,
  last_customer_sync_at timestamptz,
  last_sale_push_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ultimatepos_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "auth_read_ultimatepos_config" ON ultimatepos_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "auth_insert_ultimatepos_config" ON ultimatepos_config
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "auth_update_ultimatepos_config" ON ultimatepos_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "auth_delete_ultimatepos_config" ON ultimatepos_config
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. ultimatepos_sync_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  records_processed integer NOT NULL DEFAULT 0,
  records_created integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_skipped integer NOT NULL DEFAULT 0,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ultimatepos_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_ultimatepos_sync_logs" ON ultimatepos_sync_logs;
CREATE POLICY "auth_read_ultimatepos_sync_logs" ON ultimatepos_sync_logs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ultimatepos_sync_logs" ON ultimatepos_sync_logs;
CREATE POLICY "auth_insert_ultimatepos_sync_logs" ON ultimatepos_sync_logs
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ultimatepos_sync_logs" ON ultimatepos_sync_logs;
CREATE POLICY "auth_delete_ultimatepos_sync_logs" ON ultimatepos_sync_logs
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. ultimatepos_sale_pushes table
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_sale_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  ultimatepos_sale_id text,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  payload jsonb DEFAULT '{}'::jsonb,
  response jsonb DEFAULT '{}'::jsonb,
  error_message text,
  pushed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ultimatepos_sale_pushes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "auth_read_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "auth_insert_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "auth_update_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "auth_delete_ultimatepos_sale_pushes" ON ultimatepos_sale_pushes
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 4. Add ultimatepos_id to products
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'ultimatepos_id'
  ) THEN
    ALTER TABLE products ADD COLUMN ultimatepos_id text;
  END IF;
END $$;

-- ============================================================
-- 5. Add ultimatepos_id to customers
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'ultimatepos_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN ultimatepos_id text;
  END IF;
END $$;

-- ============================================================
-- 6. Add ultimatepos_sale_id to orders
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'ultimatepos_sale_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN ultimatepos_sale_id text;
  END IF;
END $$;

-- ============================================================
-- 7. Indexes for sync lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_ultimatepos_id ON products(ultimatepos_id) WHERE ultimatepos_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_ultimatepos_id ON customers(ultimatepos_id) WHERE ultimatepos_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ultimatepos_sale_id ON orders(ultimatepos_sale_id) WHERE ultimatepos_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sale_pushes_status ON ultimatepos_sale_pushes(status);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sale_pushes_order_id ON ultimatepos_sale_pushes(order_id);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sync_logs_type_created ON ultimatepos_sync_logs(sync_type, created_at DESC);
