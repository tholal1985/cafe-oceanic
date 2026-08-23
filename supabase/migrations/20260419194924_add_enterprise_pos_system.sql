/*
  # Enterprise POS System Integration

  1. New Tables
     - discount_rules: code-based discount definitions (percent/fixed/bulk).
     - invoices, invoice_items, invoice_payments: full invoicing lifecycle.
     - quotations, quotation_items: sales quotes convertible to invoices.
     - sales_returns, sales_return_items: RMA workflow tied to invoices.
     - loyalty_accounts, loyalty_ledger: points tracking per customer.
     - inventory_locations, inventory_levels, inventory_movements: stock.
  2. Security
     - RLS enabled on every table with admin_users-scoped policies.
  3. Functions & Triggers
     - Auto-number invoices/quotations/returns via sequences.
     - recompute_invoice_balance() trigger on invoice_payments.
  4. Notes
     - Monetary columns numeric(12,2); drafts may be deleted, posted docs cannot.
*/

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS quotation_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 1000;

CREATE TABLE IF NOT EXISTS discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'percent' CHECK (type IN ('percent','fixed','bulk')),
  value numeric(12,2) NOT NULL DEFAULT 0,
  min_qty integer DEFAULT 1,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel discount_rules" ON discount_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins discount_rules" ON discount_rules FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd discount_rules" ON discount_rules FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del discount_rules" ON discount_rules FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL DEFAULT ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  quotation_id uuid,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','partial','paid','overdue','void')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'MVR',
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  balance_due numeric(12,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel invoices" ON invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins invoices" ON invoices FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd invoices" ON invoices FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del invoices" ON invoices FOR DELETE TO authenticated
  USING (status = 'draft' AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  qty numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel invoice_items" ON invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins invoice_items" ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd invoice_items" ON invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del invoice_items" ON invoice_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'cash'
    CHECK (method IN ('cash','card','wallet','bml_qr','credit','bank_transfer','other')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  reference text DEFAULT '',
  paid_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel invoice_payments" ON invoice_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins invoice_payments" ON invoice_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd invoice_payments" ON invoice_payments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del invoice_payments" ON invoice_payments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL DEFAULT ('QUO-' || lpad(nextval('quotation_number_seq')::text, 6, '0')),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
  valid_until date,
  subtotal numeric(12,2) DEFAULT 0,
  discount_total numeric(12,2) DEFAULT 0,
  tax_total numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel quotations" ON quotations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins quotations" ON quotations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd quotations" ON quotations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del quotations" ON quotations FOR DELETE TO authenticated
  USING (status = 'draft' AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  qty numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel qitems" ON quotation_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins qitems" ON quotation_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd qitems" ON quotation_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del qitems" ON quotation_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL DEFAULT ('RET-' || lpad(nextval('return_number_seq')::text, 6, '0')),
  original_invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','refunded','rejected')),
  refund_amount numeric(12,2) DEFAULT 0,
  created_by uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel sreturns" ON sales_returns FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins sreturns" ON sales_returns FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd sreturns" ON sales_returns FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del sreturns" ON sales_returns FOR DELETE TO authenticated
  USING (status = 'pending' AND EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id uuid NOT NULL REFERENCES invoice_items(id) ON DELETE RESTRICT,
  qty numeric(12,2) NOT NULL DEFAULT 1,
  restock boolean DEFAULT true,
  amount numeric(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel sritems" ON sales_return_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins sritems" ON sales_return_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd sritems" ON sales_return_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del sritems" ON sales_return_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  points_balance integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze',
  lifetime_spend numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel loyalty" ON loyalty_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins loyalty" ON loyalty_accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd loyalty" ON loyalty_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del loyalty" ON loyalty_accounts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text DEFAULT '',
  ref_type text DEFAULT '',
  ref_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel ledger" ON loyalty_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins ledger" ON loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS inventory_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  address text DEFAULT '',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel iloc" ON inventory_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins iloc" ON inventory_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd iloc" ON inventory_locations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del iloc" ON inventory_locations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS inventory_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  on_hand numeric(12,2) NOT NULL DEFAULT 0,
  reserved numeric(12,2) NOT NULL DEFAULT 0,
  reorder_point numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_id, location_id)
);
ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel ilvl" ON inventory_levels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins ilvl" ON inventory_levels FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm upd ilvl" ON inventory_levels FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm del ilvl" ON inventory_levels FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  delta numeric(12,2) NOT NULL,
  reason text DEFAULT '',
  ref_type text DEFAULT '',
  ref_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm sel imov" ON inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));
CREATE POLICY "adm ins imov" ON inventory_movements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION recompute_invoice_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid; paid numeric(12,2); tot numeric(12,2);
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO paid FROM invoice_payments WHERE invoice_id = inv_id;
  SELECT total INTO tot FROM invoices WHERE id = inv_id;
  UPDATE invoices
     SET balance_due = GREATEST(COALESCE(tot,0) - COALESCE(paid,0), 0),
         status = CASE
           WHEN paid <= 0 THEN status
           WHEN paid >= COALESCE(tot,0) THEN 'paid'
           ELSE 'partial'
         END,
         updated_at = now()
   WHERE id = inv_id;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_invoice_payment_recompute ON invoice_payments;
CREATE TRIGGER trg_invoice_payment_recompute
AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
FOR EACH ROW EXECUTE FUNCTION recompute_invoice_balance();

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_levels_product ON inventory_levels(product_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id);