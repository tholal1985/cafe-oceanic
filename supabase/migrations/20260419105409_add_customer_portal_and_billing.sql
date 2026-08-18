/*
  # Customer Portal, Approval and Billing System

  1. Customer Auth & Approval
    - Add `auth_user_id` to `customers` (links to auth.users)
    - Add `approval_status` (pending|approved|rejected), `approved_at`, `approved_by`
    - Add `credit_limit` and `current_balance` for account billing

  2. New Tables
    - `customer_bills`: Invoices/bills per customer (may link to an order)
      - Tracks `amount`, `amount_paid`, `balance_due`, `due_date`, `status` (pending|paid|partial|overdue|cancelled)
    - `customer_bill_payments`: Payment history against bills

  3. Orders
    - Add `customer_id` FK to `orders` to link orders placed by logged in customers

  4. Security
    - Enable RLS on new tables
    - Policies allow customers to read their own data (bills, payments, orders)
    - Authenticated admins/staff have full management access
*/

-- Customers: auth linkage + approval + account balance
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='auth_user_id') THEN
    ALTER TABLE customers ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='approval_status') THEN
    ALTER TABLE customers ADD COLUMN approval_status text NOT NULL DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='approved_at') THEN
    ALTER TABLE customers ADD COLUMN approved_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='approved_by') THEN
    ALTER TABLE customers ADD COLUMN approved_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='credit_limit') THEN
    ALTER TABLE customers ADD COLUMN credit_limit numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='current_balance') THEN
    ALTER TABLE customers ADD COLUMN current_balance numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_approval_status_check') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_approval_status_check
      CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id ON customers(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_approval_status ON customers(approval_status);

-- Orders: link to customer
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='customer_id') THEN
    ALTER TABLE orders ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

-- Customer Bills
CREATE TABLE IF NOT EXISTS customer_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text UNIQUE NOT NULL DEFAULT ('BILL-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8)),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance_due numeric GENERATED ALWAYS AS (amount - amount_paid) STORED,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT customer_bills_status_check CHECK (status IN ('pending','paid','partial','overdue','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_customer_bills_customer_id ON customer_bills(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_bills_status ON customer_bills(status);
CREATE INDEX IF NOT EXISTS idx_customer_bills_due_date ON customer_bills(due_date);

ALTER TABLE customer_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own bills" ON customer_bills;
CREATE POLICY "Customers can view own bills"
  ON customer_bills FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert bills" ON customer_bills;
CREATE POLICY "Admins can insert bills"
  ON customer_bills FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update bills" ON customer_bills;
CREATE POLICY "Admins can update bills"
  ON customer_bills FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete bills" ON customer_bills;
CREATE POLICY "Admins can delete bills"
  ON customer_bills FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Customer Bill Payments
CREATE TABLE IF NOT EXISTS customer_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES customer_bills(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash',
  reference text DEFAULT '',
  notes text DEFAULT '',
  recorded_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id ON customer_bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_customer_id ON customer_bill_payments(customer_id);

ALTER TABLE customer_bill_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own payments" ON customer_bill_payments;
CREATE POLICY "Customers can view own payments"
  ON customer_bill_payments FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can insert payments" ON customer_bill_payments;
CREATE POLICY "Admins can insert payments"
  ON customer_bill_payments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can update payments" ON customer_bill_payments;
CREATE POLICY "Admins can update payments"
  ON customer_bill_payments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "Admins can delete payments" ON customer_bill_payments;
CREATE POLICY "Admins can delete payments"
  ON customer_bill_payments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Allow customers to read their own profile
DROP POLICY IF EXISTS "Customers can view own profile" ON customers;
CREATE POLICY "Customers can view own profile"
  ON customers FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid() OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Allow customers to see their own orders
DROP POLICY IF EXISTS "Customers can view own orders" ON orders;
CREATE POLICY "Customers can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- Trigger: auto update bill status & customer balance
CREATE OR REPLACE FUNCTION update_bill_status_and_customer_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id uuid;
  v_amount numeric;
  v_paid numeric;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    v_customer_id := NEW.customer_id;
    v_amount := NEW.amount;
    v_paid := NEW.amount_paid;

    IF NEW.status <> 'cancelled' THEN
      IF v_paid >= v_amount AND v_amount > 0 THEN
        NEW.status := 'paid';
      ELSIF v_paid > 0 AND v_paid < v_amount THEN
        NEW.status := 'partial';
      ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE AND v_paid < v_amount THEN
        NEW.status := 'overdue';
      ELSE
        NEW.status := 'pending';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_bill_status ON customer_bills;
CREATE TRIGGER trg_bill_status
  BEFORE INSERT OR UPDATE ON customer_bills
  FOR EACH ROW EXECUTE FUNCTION update_bill_status_and_customer_balance();

-- Trigger: when payment is inserted, update the bill's amount_paid
CREATE OR REPLACE FUNCTION apply_bill_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customer_bills
  SET amount_paid = amount_paid + NEW.amount,
      updated_at = now()
  WHERE id = NEW.bill_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_apply_bill_payment ON customer_bill_payments;
CREATE TRIGGER trg_apply_bill_payment
  AFTER INSERT ON customer_bill_payments
  FOR EACH ROW EXECUTE FUNCTION apply_bill_payment();

-- Keep customers.current_balance in sync with outstanding bills
CREATE OR REPLACE FUNCTION recalc_customer_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  v_customer_id := COALESCE(NEW.customer_id, OLD.customer_id);
  UPDATE customers
  SET current_balance = COALESCE((
        SELECT SUM(balance_due)
        FROM customer_bills
        WHERE customer_id = v_customer_id AND status IN ('pending','partial','overdue')
      ), 0),
      updated_at = now()
  WHERE id = v_customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalc_balance ON customer_bills;
CREATE TRIGGER trg_recalc_balance
  AFTER INSERT OR UPDATE OR DELETE ON customer_bills
  FOR EACH ROW EXECUTE FUNCTION recalc_customer_balance();
