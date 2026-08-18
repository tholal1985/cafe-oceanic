-- UltimatePOS integration configuration
CREATE TABLE ultimatepos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url text NOT NULL DEFAULT '',
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
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

-- UltimatePOS order push log
CREATE TABLE ultimatepos_order_log (
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

-- UltimatePOS product sync log
CREATE TABLE ultimatepos_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL DEFAULT 'products',
  status text NOT NULL DEFAULT 'pending',
  items_synced integer DEFAULT 0,
  error_message text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ultimatepos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ultimatepos_order_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ultimatepos_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ultimatepos_config" ON ultimatepos_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_ultimatepos_config" ON ultimatepos_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ultimatepos_config" ON ultimatepos_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_ultimatepos_config" ON ultimatepos_config FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_ultimatepos_order_log" ON ultimatepos_order_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_ultimatepos_order_log" ON ultimatepos_order_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ultimatepos_order_log" ON ultimatepos_order_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "select_ultimatepos_sync_log" ON ultimatepos_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_ultimatepos_sync_log" ON ultimatepos_sync_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_ultimatepos_sync_log" ON ultimatepos_sync_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Insert default config row (singleton)
INSERT INTO ultimatepos_config (base_url, client_id, client_secret, is_enabled)
VALUES ('', '', '', false);

-- anon insert for edge functions (push order is called server-side with service key but log insert needs anon too)
CREATE POLICY "anon_insert_ultimatepos_order_log" ON ultimatepos_order_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_ultimatepos_order_log" ON ultimatepos_order_log FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert_ultimatepos_sync_log" ON ultimatepos_sync_log FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_ultimatepos_sync_log" ON ultimatepos_sync_log FOR UPDATE TO anon USING (true) WITH CHECK (true);
