/*
# Add UltimatePOS Integration Tables (v4)

## What this does
This migration creates the full UltimatePOS two-way integration infrastructure:
1. `ultimatepos_config` — singleton config table for connection settings
2. `ultimatepos_sync_logs` — tracks every sync operation (products, customers, sales)
3. `ultimatepos_sale_pushes` — tracks each order pushed to UltimatePOS with retry support
4. Adds `ultimatepos_id` column to `products` and `customers` tables
5. Adds `ultimatepos_sale_id` column to `orders` table
6. Adds indexes for fast lookups
7. Enables RLS on all new tables with admin-only policies (using admin_users table pattern)
8. Creates a trigger function to auto-queue completed orders for sale push

## New Tables

### ultimatepos_config
- `api_url` (text) — UltimatePOS installation base URL
- `client_id` / `client_secret` (text) — OAuth2 credentials
- `username` / `password` (text) — password grant credentials
- `personal_access_token` (text) — PAT for Bearer auth (bypasses Cloudflare)
- `auth_mode` (text: 'oauth' | 'pat') — which auth method to use
- `business_id` / `location_id` (integer) — UltimatePOS scope
- `is_active` (boolean, default true) — master toggle
- `auto_sync_products` / `auto_sync_customers` (boolean, default false)
- `auto_push_sales` (boolean, default true)
- `last_product_sync_at` / `last_customer_sync_at` / `last_sale_push_at` (timestamptz)
- `last_connected_at` / `connection_status` (text)

### ultimatepos_sync_logs
- `sync_type` (text: 'products' | 'customers' | 'sales')
- `status` (text: 'success' | 'failed' | 'partial')
- `records_processed` / `records_created` / `records_updated` / `records_skipped` (integer)
- `error_message` (text), `details` (jsonb)
- `started_at` / `completed_at` / `created_at` (timestamptz)

### ultimatepos_sale_pushes
- `order_id` (uuid FK → orders, cascade delete)
- `ultimatepos_sale_id` (text) — returned by UltimatePOS after success
- `status` (text: 'pending' | 'success' | 'failed' | 'retrying')
- `retry_count` / `max_retries` (integer, default 0 / 3)
- `payload` / `response` (jsonb)
- `error_message` (text)
- `pushed_at` / `next_retry_at` / `created_at` / `updated_at` (timestamptz)

## Modified Tables
- `products`: adds `ultimatepos_id` (text, nullable)
- `customers`: adds `ultimatepos_id` (text, nullable)
- `orders`: adds `ultimatepos_sale_id` (text, nullable)

## Security
- RLS enabled on all 3 new tables
- Admin-only policies using `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())`
- The edge function uses the service role key which bypasses RLS

## Trigger
- `queue_sale_push_on_order_complete()` — fires AFTER UPDATE on orders when status changes to 'completed', inserts a pending row into ultimatepos_sale_pushes if auto_push_sales is enabled
*/

-- ============================================================
-- 1. ultimatepos_config (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_url text,
  client_id text,
  client_secret text,
  username text,
  password text,
  personal_access_token text,
  auth_mode text NOT NULL DEFAULT 'pat' CHECK (auth_mode IN ('oauth', 'pat')),
  business_id integer NOT NULL DEFAULT 1,
  location_id integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  auto_sync_products boolean NOT NULL DEFAULT false,
  auto_sync_customers boolean NOT NULL DEFAULT false,
  auto_push_sales boolean NOT NULL DEFAULT true,
  last_product_sync_at timestamptz,
  last_customer_sync_at timestamptz,
  last_sale_push_at timestamptz,
  last_connected_at timestamptz,
  connection_status text DEFAULT 'disconnected',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ultimatepos_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "Admins can view ultimatepos_config"
  ON ultimatepos_config FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "Admins can insert ultimatepos_config"
  ON ultimatepos_config FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "Admins can update ultimatepos_config"
  ON ultimatepos_config FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete ultimatepos_config" ON ultimatepos_config;
CREATE POLICY "Admins can delete ultimatepos_config"
  ON ultimatepos_config FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 2. ultimatepos_sync_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL CHECK (sync_type IN ('products', 'customers', 'sales')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('success', 'failed', 'partial', 'pending')),
  records_processed integer NOT NULL DEFAULT 0,
  records_created integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_skipped integer NOT NULL DEFAULT 0,
  error_message text,
  details jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ultimatepos_sync_logs_type ON ultimatepos_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sync_logs_created ON ultimatepos_sync_logs(created_at DESC);

ALTER TABLE ultimatepos_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view sync logs" ON ultimatepos_sync_logs;
CREATE POLICY "Admins can view sync logs"
  ON ultimatepos_sync_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert sync logs" ON ultimatepos_sync_logs;
CREATE POLICY "Admins can insert sync logs"
  ON ultimatepos_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update sync logs" ON ultimatepos_sync_logs;
CREATE POLICY "Admins can update sync logs"
  ON ultimatepos_sync_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete sync logs" ON ultimatepos_sync_logs;
CREATE POLICY "Admins can delete sync logs"
  ON ultimatepos_sync_logs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 3. ultimatepos_sale_pushes
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_sale_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  ultimatepos_sale_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  payload jsonb,
  response jsonb,
  error_message text,
  pushed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ultimatepos_sale_pushes_status ON ultimatepos_sale_pushes(status);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sale_pushes_order ON ultimatepos_sale_pushes(order_id);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sale_pushes_next_retry ON ultimatepos_sale_pushes(next_retry_at) WHERE next_retry_at IS NOT NULL;

ALTER TABLE ultimatepos_sale_pushes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view sale pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "Admins can view sale pushes"
  ON ultimatepos_sale_pushes FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert sale pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "Admins can insert sale pushes"
  ON ultimatepos_sale_pushes FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update sale pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "Admins can update sale pushes"
  ON ultimatepos_sale_pushes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete sale pushes" ON ultimatepos_sale_pushes;
CREATE POLICY "Admins can delete sale pushes"
  ON ultimatepos_sale_pushes FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 4. Add ultimatepos_id to products and customers, ultimatepos_sale_id to orders
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'ultimatepos_id') THEN
    ALTER TABLE products ADD COLUMN ultimatepos_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'ultimatepos_id') THEN
    ALTER TABLE customers ADD COLUMN ultimatepos_id text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'ultimatepos_sale_id') THEN
    ALTER TABLE orders ADD COLUMN ultimatepos_sale_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_ultimatepos_id ON products(ultimatepos_id) WHERE ultimatepos_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_ultimatepos_id ON customers(ultimatepos_id) WHERE ultimatepos_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_ultimatepos_sale_id ON orders(ultimatepos_sale_id) WHERE ultimatepos_sale_id IS NOT NULL;

-- ============================================================
-- 5. Trigger: auto-queue sale push when order completes
-- ============================================================
CREATE OR REPLACE FUNCTION queue_sale_push_on_order_complete()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_config ultimatepos_config%ROWTYPE;
  v_existing_count integer;
BEGIN
  -- Only fire when status changes TO 'completed'
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
     OR (TG_OP = 'INSERT' AND NEW.status = 'completed') THEN

    -- Check if auto_push_sales is enabled
    SELECT * INTO v_config FROM ultimatepos_config WHERE is_active = true LIMIT 1;
    IF NOT FOUND OR NOT v_config.auto_push_sales THEN
      RETURN NEW;
    END IF;

    -- Don't create duplicate push entries
    SELECT COUNT(*) INTO v_existing_count
    FROM ultimatepos_sale_pushes
    WHERE order_id = NEW.id AND status IN ('pending', 'success', 'retrying');

    IF v_existing_count = 0 THEN
      INSERT INTO ultimatepos_sale_pushes (order_id, status, payload)
      VALUES (NEW.id, 'pending', jsonb_build_object('order_id', NEW.id, 'queued_by', 'trigger'))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_sale_push ON orders;
CREATE TRIGGER trigger_queue_sale_push
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION queue_sale_push_on_order_complete();

-- ============================================================
-- 6. updated_at trigger for ultimatepos_config and sale_pushes
-- ============================================================
CREATE OR REPLACE FUNCTION update_ultimatepos_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ultimatepos_config_updated ON ultimatepos_config;
CREATE TRIGGER trigger_ultimatepos_config_updated
  BEFORE UPDATE ON ultimatepos_config
  FOR EACH ROW EXECUTE FUNCTION update_ultimatepos_updated_at();

DROP TRIGGER IF EXISTS trigger_ultimatepos_sale_pushes_updated ON ultimatepos_sale_pushes;
CREATE TRIGGER trigger_ultimatepos_sale_pushes_updated
  BEFORE UPDATE ON ultimatepos_sale_pushes
  FOR EACH ROW EXECUTE FUNCTION update_ultimatepos_updated_at();
