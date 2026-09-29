/*
# KioskPOS API Gateway Schema

## What this does
Creates the complete database schema for the KioskPOS API Gateway — a secure middleware
between kiosk applications and UltimatePOS. This is a NEW layer on top of the existing
restaurant kiosk system, providing dedicated kiosk authentication, order management,
product/category caching, payment tracking, synchronization jobs, API logging, and
system settings.

## New Tables (all prefixed with `kp_` to avoid conflicts with existing tables)

### kp_kiosks
- Registers each physical kiosk terminal that can call the API
- `id`, `name`, `kiosk_code`, `location_id`, `api_key_hash`, `status`, `last_seen_at`
- Status: active | inactive | blocked
- API keys are stored as SHA-256 hashes — never raw keys

### kp_orders
- Local order records created by kiosks, linked to UltimatePOS sales
- `id`, `order_number`, `kiosk_id`, `ultimatepos_sale_id`, `ultimatepos_invoice_number`,
  `location_id`, `customer_id`, `subtotal`, `discount`, `tax`, `total`, `currency`,
  `payment_method`, `payment_status`, `order_status`, `sync_status`, `idempotency_key`,
  `error_message`, `cancel_reason`, `cancelled_by`, `cancelled_at`
- order_status: pending | processing | completed | cancelled | failed
- sync_status: pending | processing | synced | failed
- Unique constraint on `idempotency_key` to prevent duplicate orders

### kp_order_items
- Line items for each kiosk order
- `id`, `order_id` (FK → kp_orders), `ultimatepos_product_id`, `sku`, `product_name`,
  `quantity`, `unit_price`, `discount`, `tax`, `line_total`

### kp_products_cache
- Cache of UltimatePOS products (UltimatePOS remains source of truth)
- `id`, `ultimatepos_product_id`, `sku`, `name`, `description`, `category_id`,
  `category_name`, `selling_price`, `image_url`, `stock_quantity`, `location_id`,
  `is_active`, `ultimatepos_updated_at`, `synced_at`

### kp_categories_cache
- Cache of UltimatePOS categories
- `id`, `ultimatepos_category_id`, `name`, `parent_id`, `is_active`, `synced_at`

### kp_payments
- Payment records for kiosk orders
- `id`, `order_id` (FK → kp_orders), `payment_reference`, `method`, `amount`,
  `currency`, `status`, `provider`, `provider_transaction_id`, `paid_at`
- method: cash | card | qr | online
- No card numbers or CVV are ever stored

### kp_sync_jobs
- Tracks product/category synchronization jobs (manual or scheduled)
- `id`, `job_type`, `status`, `started_at`, `completed_at`, `records_processed`,
  `records_failed`, `error_message`
- job_type: products | categories | all
- status: pending | running | completed | failed

### kp_api_logs
- Request log for every kiosk API call (for debugging and monitoring)
- `id`, `kiosk_id`, `request_id`, `method`, `endpoint`, `status_code`, `duration_ms`,
  `success`, `error_message`
- Never stores passwords, secrets, tokens, or card data

### kp_system_settings
- Singleton configuration table for the API gateway
- `id`, `ultimatepos_url`, `ultimatepos_location_id`, `mock_mode`, `sync_interval`,
  `rate_limit_per_minute`, `allowed_origins`, `currency`, `timezone`, `created_at`, `updated_at`
- Defaults: currency=MVR, timezone=Indian/Maldives, mock_mode=true, rate_limit=100

## Security
- RLS enabled on ALL new tables
- Admin-only access (using existing admin_users table pattern) for all tables
- The edge function uses the service role key which bypasses RLS
- Kiosk authentication is handled in the edge function, not via RLS
*/

-- ============================================================
-- 1. kp_kiosks
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_kiosks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kiosk_code text NOT NULL UNIQUE,
  location_id integer,
  api_key_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_kiosks_status ON kp_kiosks(status);
CREATE INDEX IF NOT EXISTS idx_kp_kiosks_api_key_hash ON kp_kiosks(api_key_hash);

ALTER TABLE kp_kiosks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_kiosks" ON kp_kiosks;
CREATE POLICY "Admins can view kp_kiosks" ON kp_kiosks FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_kiosks" ON kp_kiosks;
CREATE POLICY "Admins can insert kp_kiosks" ON kp_kiosks FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_kiosks" ON kp_kiosks;
CREATE POLICY "Admins can update kp_kiosks" ON kp_kiosks FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_kiosks" ON kp_kiosks;
CREATE POLICY "Admins can delete kp_kiosks" ON kp_kiosks FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 2. kp_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  kiosk_id uuid REFERENCES kp_kiosks(id) ON DELETE SET NULL,
  ultimatepos_sale_id text,
  ultimatepos_invoice_number text,
  location_id integer,
  customer_id text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MVR',
  payment_method text,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  order_status text NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'processing', 'synced', 'failed')),
  idempotency_key text NOT NULL UNIQUE,
  error_message text,
  cancel_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_orders_kiosk ON kp_orders(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kp_orders_status ON kp_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_kp_orders_sync_status ON kp_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_kp_orders_created ON kp_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kp_orders_idempotency ON kp_orders(idempotency_key);

ALTER TABLE kp_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_orders" ON kp_orders;
CREATE POLICY "Admins can view kp_orders" ON kp_orders FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_orders" ON kp_orders;
CREATE POLICY "Admins can insert kp_orders" ON kp_orders FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_orders" ON kp_orders;
CREATE POLICY "Admins can update kp_orders" ON kp_orders FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_orders" ON kp_orders;
CREATE POLICY "Admins can delete kp_orders" ON kp_orders FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 3. kp_order_items
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES kp_orders(id) ON DELETE CASCADE,
  ultimatepos_product_id text,
  sku text,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_order_items_order ON kp_order_items(order_id);

ALTER TABLE kp_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_order_items" ON kp_order_items;
CREATE POLICY "Admins can view kp_order_items" ON kp_order_items FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_order_items" ON kp_order_items;
CREATE POLICY "Admins can insert kp_order_items" ON kp_order_items FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_order_items" ON kp_order_items;
CREATE POLICY "Admins can update kp_order_items" ON kp_order_items FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_order_items" ON kp_order_items;
CREATE POLICY "Admins can delete kp_order_items" ON kp_order_items FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 4. kp_products_cache
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_products_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ultimatepos_product_id text NOT NULL,
  sku text,
  name text NOT NULL,
  description text,
  category_id text,
  category_name text,
  selling_price numeric(14,2) NOT NULL DEFAULT 0,
  image_url text,
  stock_quantity numeric(14,2) NOT NULL DEFAULT 0,
  location_id integer,
  is_active boolean NOT NULL DEFAULT true,
  ultimatepos_updated_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_products_cache_upos_id ON kp_products_cache(ultimatepos_product_id);
CREATE INDEX IF NOT EXISTS idx_kp_products_cache_sku ON kp_products_cache(sku);
CREATE INDEX IF NOT EXISTS idx_kp_products_cache_category ON kp_products_cache(category_id);
CREATE INDEX IF NOT EXISTS idx_kp_products_cache_active ON kp_products_cache(is_active) WHERE is_active = true;

ALTER TABLE kp_products_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_products_cache" ON kp_products_cache;
CREATE POLICY "Admins can view kp_products_cache" ON kp_products_cache FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_products_cache" ON kp_products_cache;
CREATE POLICY "Admins can insert kp_products_cache" ON kp_products_cache FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_products_cache" ON kp_products_cache;
CREATE POLICY "Admins can update kp_products_cache" ON kp_products_cache FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_products_cache" ON kp_products_cache;
CREATE POLICY "Admins can delete kp_products_cache" ON kp_products_cache FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 5. kp_categories_cache
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_categories_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ultimatepos_category_id text NOT NULL,
  name text NOT NULL,
  parent_id text,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_categories_cache_upos_id ON kp_categories_cache(ultimatepos_category_id);

ALTER TABLE kp_categories_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_categories_cache" ON kp_categories_cache;
CREATE POLICY "Admins can view kp_categories_cache" ON kp_categories_cache FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_categories_cache" ON kp_categories_cache;
CREATE POLICY "Admins can insert kp_categories_cache" ON kp_categories_cache FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_categories_cache" ON kp_categories_cache;
CREATE POLICY "Admins can update kp_categories_cache" ON kp_categories_cache FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_categories_cache" ON kp_categories_cache;
CREATE POLICY "Admins can delete kp_categories_cache" ON kp_categories_cache FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 6. kp_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES kp_orders(id) ON DELETE CASCADE,
  payment_reference text,
  method text NOT NULL CHECK (method IN ('cash', 'card', 'qr', 'online')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MVR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  provider text,
  provider_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_payments_order ON kp_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_kp_payments_status ON kp_payments(status);

ALTER TABLE kp_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_payments" ON kp_payments;
CREATE POLICY "Admins can view kp_payments" ON kp_payments FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_payments" ON kp_payments;
CREATE POLICY "Admins can insert kp_payments" ON kp_payments FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_payments" ON kp_payments;
CREATE POLICY "Admins can update kp_payments" ON kp_payments FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_payments" ON kp_payments;
CREATE POLICY "Admins can delete kp_payments" ON kp_payments FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 7. kp_sync_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('products', 'categories', 'all')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  records_processed integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_sync_jobs_status ON kp_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_kp_sync_jobs_created ON kp_sync_jobs(created_at DESC);

ALTER TABLE kp_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_sync_jobs" ON kp_sync_jobs;
CREATE POLICY "Admins can view kp_sync_jobs" ON kp_sync_jobs FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_sync_jobs" ON kp_sync_jobs;
CREATE POLICY "Admins can insert kp_sync_jobs" ON kp_sync_jobs FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_sync_jobs" ON kp_sync_jobs;
CREATE POLICY "Admins can update kp_sync_jobs" ON kp_sync_jobs FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_sync_jobs" ON kp_sync_jobs;
CREATE POLICY "Admins can delete kp_sync_jobs" ON kp_sync_jobs FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 8. kp_api_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id uuid REFERENCES kp_kiosks(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  method text NOT NULL,
  endpoint text NOT NULL,
  status_code integer,
  duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kp_api_logs_kiosk ON kp_api_logs(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kp_api_logs_created ON kp_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kp_api_logs_success ON kp_api_logs(success) WHERE success = false;

ALTER TABLE kp_api_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_api_logs" ON kp_api_logs;
CREATE POLICY "Admins can view kp_api_logs" ON kp_api_logs FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_api_logs" ON kp_api_logs;
CREATE POLICY "Admins can insert kp_api_logs" ON kp_api_logs FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_api_logs" ON kp_api_logs;
CREATE POLICY "Admins can update kp_api_logs" ON kp_api_logs FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_api_logs" ON kp_api_logs;
CREATE POLICY "Admins can delete kp_api_logs" ON kp_api_logs FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 9. kp_system_settings (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS kp_system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ultimatepos_url text,
  ultimatepos_location_id integer DEFAULT 1,
  mock_mode boolean NOT NULL DEFAULT true,
  sync_interval_minutes integer NOT NULL DEFAULT 60,
  rate_limit_per_minute integer NOT NULL DEFAULT 100,
  allowed_origins text,
  currency text NOT NULL DEFAULT 'MVR',
  timezone text NOT NULL DEFAULT 'Indian/Maldives',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kp_system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kp_system_settings" ON kp_system_settings;
CREATE POLICY "Admins can view kp_system_settings" ON kp_system_settings FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert kp_system_settings" ON kp_system_settings;
CREATE POLICY "Admins can insert kp_system_settings" ON kp_system_settings FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update kp_system_settings" ON kp_system_settings;
CREATE POLICY "Admins can update kp_system_settings" ON kp_system_settings FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete kp_system_settings" ON kp_system_settings;
CREATE POLICY "Admins can delete kp_system_settings" ON kp_system_settings FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- ============================================================
-- 10. Seed default system settings
-- ============================================================
INSERT INTO kp_system_settings (ultimatepos_url, ultimatepos_location_id, mock_mode, sync_interval_minutes, rate_limit_per_minute, allowed_origins, currency, timezone)
SELECT '', 1, true, 60, 100, '', 'MVR', 'Indian/Maldives'
WHERE NOT EXISTS (SELECT 1 FROM kp_system_settings);

-- ============================================================
-- 11. updated_at triggers for kp_ tables
-- ============================================================
CREATE OR REPLACE FUNCTION update_kp_updated_at()
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

DROP TRIGGER IF EXISTS trigger_kp_kiosks_updated ON kp_kiosks;
CREATE TRIGGER trigger_kp_kiosks_updated
  BEFORE UPDATE ON kp_kiosks
  FOR EACH ROW EXECUTE FUNCTION update_kp_updated_at();

DROP TRIGGER IF EXISTS trigger_kp_orders_updated ON kp_orders;
CREATE TRIGGER trigger_kp_orders_updated
  BEFORE UPDATE ON kp_orders
  FOR EACH ROW EXECUTE FUNCTION update_kp_updated_at();

DROP TRIGGER IF EXISTS trigger_kp_payments_updated ON kp_payments;
CREATE TRIGGER trigger_kp_payments_updated
  BEFORE UPDATE ON kp_payments
  FOR EACH ROW EXECUTE FUNCTION update_kp_updated_at();

DROP TRIGGER IF EXISTS trigger_kp_system_settings_updated ON kp_system_settings;
CREATE TRIGGER trigger_kp_system_settings_updated
  BEFORE UPDATE ON kp_system_settings
  FOR EACH ROW EXECUTE FUNCTION update_kp_updated_at();

-- ============================================================
-- 12. Helper function: generate request ID
-- ============================================================
CREATE OR REPLACE FUNCTION kp_generate_request_id()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || substr(encode(gen_random_bytes(6), 'hex'), 1, 8);
$$;

-- ============================================================
-- 13. Helper function: check rate limit per kiosk
-- ============================================================
CREATE OR REPLACE FUNCTION kp_check_rate_limit(p_kiosk_id uuid, p_limit integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM kp_api_logs
    WHERE kiosk_id = p_kiosk_id
      AND created_at > now() - interval '1 minute'
  ) < p_limit;
$$;
