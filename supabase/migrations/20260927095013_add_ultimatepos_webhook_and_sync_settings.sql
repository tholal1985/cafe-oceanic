-- ============================================================
-- Add webhook settings, product sync field mapping, and order status mapping
-- to ultimatepos_config
-- ============================================================

-- Webhook settings: secret for verifying incoming webhooks, and toggle
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS webhook_secret text;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false;

-- Product sync field mapping: which fields to sync from UltimatePOS
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_name boolean NOT NULL DEFAULT true;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_price boolean NOT NULL DEFAULT true;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_category boolean NOT NULL DEFAULT false;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_quantity boolean NOT NULL DEFAULT false;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_weight boolean NOT NULL DEFAULT false;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_images boolean NOT NULL DEFAULT true;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_description boolean NOT NULL DEFAULT true;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_product_tax_class boolean NOT NULL DEFAULT false;

-- Order sync settings: status mapping and order type
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_status_pending text NOT NULL DEFAULT 'pending';
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_status_processing text NOT NULL DEFAULT 'confirmed';
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_status_completed text NOT NULL DEFAULT 'completed';
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_status_cancelled text NOT NULL DEFAULT 'cancelled';
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_location_id integer;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS sync_order_order_type text NOT NULL DEFAULT 'dine_in';

-- Track last webhook received
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz;
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS last_webhook_event text;

-- ============================================================
-- Add webhook_events table to log incoming webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS ultimatepos_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  status text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'ignored')),
  payload jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ultimatepos_webhook_events_type ON ultimatepos_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_webhook_events_created ON ultimatepos_webhook_events(created_at DESC);

ALTER TABLE ultimatepos_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook events" ON ultimatepos_webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON ultimatepos_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can insert webhook events" ON ultimatepos_webhook_events;
CREATE POLICY "Admins can insert webhook events"
  ON ultimatepos_webhook_events FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update webhook events" ON ultimatepos_webhook_events;
CREATE POLICY "Admins can update webhook events"
  ON ultimatepos_webhook_events FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete webhook events" ON ultimatepos_webhook_events;
CREATE POLICY "Admins can delete webhook events"
  ON ultimatepos_webhook_events FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
