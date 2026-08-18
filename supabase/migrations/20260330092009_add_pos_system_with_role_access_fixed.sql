/*
  # Add Point of Sale System with Role-Based Access

  1. New Tables
    - `pos_sessions`
      - `id` (uuid, primary key)
      - `session_number` (text, unique session identifier)
      - `staff_id` (uuid, references auth.users)
      - `opened_at` (timestamptz, when session started)
      - `closed_at` (timestamptz, when session ended)
      - `opening_cash` (numeric, starting cash amount)
      - `closing_cash` (numeric, ending cash amount)
      - `expected_cash` (numeric, calculated expected cash)
      - `cash_difference` (numeric, difference between expected and actual)
      - `total_sales` (numeric, total sales in session)
      - `total_transactions` (integer, number of transactions)
      - `notes` (text, session notes)
      - `status` (text, open/closed)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `pos_transactions`
      - `id` (uuid, primary key)
      - `transaction_number` (text, unique transaction ID)
      - `session_id` (uuid, references pos_sessions)
      - `order_id` (uuid, references orders, nullable)
      - `staff_id` (uuid, references auth.users)
      - `customer_name` (text, optional customer name)
      - `customer_phone` (text, optional customer phone)
      - `payment_method` (text, cash/card/digital)
      - `subtotal` (numeric)
      - `tax_amount` (numeric)
      - `discount_amount` (numeric)
      - `total_amount` (numeric)
      - `amount_tendered` (numeric, for cash payments)
      - `change_given` (numeric, for cash payments)
      - `transaction_type` (text, sale/refund/void)
      - `status` (text, completed/pending/cancelled)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Enhanced Permissions
    - Add POS-specific permissions to user_permissions table
    - Permissions: pos_access, pos_manage_sessions, pos_process_refunds, pos_view_reports

  3. Security
    - Enable RLS on all POS tables
    - Only authenticated users with POS permissions can access
    - Staff can only access their own sessions and transactions
    - Admins and managers can view all POS data

  4. Functions
    - Auto-generate session and transaction numbers
    - Calculate session totals and cash differences
*/

-- Create pos_sessions table
CREATE TABLE IF NOT EXISTS pos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number text UNIQUE NOT NULL,
  staff_id uuid REFERENCES auth.users(id) NOT NULL,
  opened_at timestamptz DEFAULT now() NOT NULL,
  closed_at timestamptz,
  opening_cash numeric(10,2) DEFAULT 0 NOT NULL,
  closing_cash numeric(10,2),
  expected_cash numeric(10,2),
  cash_difference numeric(10,2),
  total_sales numeric(10,2) DEFAULT 0 NOT NULL,
  total_transactions integer DEFAULT 0 NOT NULL,
  notes text,
  status text DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'closed')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create pos_transactions table
CREATE TABLE IF NOT EXISTS pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL,
  session_id uuid REFERENCES pos_sessions(id) NOT NULL,
  order_id uuid REFERENCES orders(id),
  staff_id uuid REFERENCES auth.users(id) NOT NULL,
  customer_name text,
  customer_phone text,
  payment_method text DEFAULT 'cash' NOT NULL CHECK (payment_method IN ('cash', 'card', 'digital', 'mixed')),
  subtotal numeric(10,2) NOT NULL,
  tax_amount numeric(10,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
  total_amount numeric(10,2) NOT NULL,
  amount_tendered numeric(10,2),
  change_given numeric(10,2),
  transaction_type text DEFAULT 'sale' NOT NULL CHECK (transaction_type IN ('sale', 'refund', 'void')),
  status text DEFAULT 'completed' NOT NULL CHECK (status IN ('completed', 'pending', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add POS permissions to user_permissions if not exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
    INSERT INTO user_permissions (permission_name, permission_description, permission_category)
    VALUES 
      ('pos_access', 'Access Point of Sale system', 'pos'),
      ('pos_manage_sessions', 'Open and close POS sessions', 'pos'),
      ('pos_process_refunds', 'Process refunds and voids', 'pos'),
      ('pos_view_reports', 'View POS sales reports', 'pos')
    ON CONFLICT (permission_name) DO NOTHING;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pos_sessions_staff_id ON pos_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON pos_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_opened_at ON pos_sessions(opened_at);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_session_id ON pos_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_staff_id ON pos_transactions(staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_order_id ON pos_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_created_at ON pos_transactions(created_at);

-- Function to generate session number
CREATE OR REPLACE FUNCTION generate_session_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  session_num text;
BEGIN
  session_num := 'SES-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('pos_session_seq')::text, 4, '0');
  RETURN session_num;
END;
$$;

-- Create sequence for session numbers
CREATE SEQUENCE IF NOT EXISTS pos_session_seq START 1;

-- Function to generate transaction number
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  trans_num text;
BEGIN
  trans_num := 'TXN-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('pos_transaction_seq')::text, 6, '0');
  RETURN trans_num;
END;
$$;

-- Create sequence for transaction numbers
CREATE SEQUENCE IF NOT EXISTS pos_transaction_seq START 1;

-- Trigger to auto-generate session number
CREATE OR REPLACE FUNCTION set_session_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_number IS NULL OR NEW.session_number = '' THEN
    NEW.session_number := generate_session_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_session_number ON pos_sessions;
CREATE TRIGGER trigger_set_session_number
  BEFORE INSERT ON pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_number();

-- Trigger to auto-generate transaction number
CREATE OR REPLACE FUNCTION set_transaction_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = '' THEN
    NEW.transaction_number := generate_transaction_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_transaction_number ON pos_transactions;
CREATE TRIGGER trigger_set_transaction_number
  BEFORE INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_number();

-- Trigger to update session totals when transaction is added
CREATE OR REPLACE FUNCTION update_session_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' AND NEW.transaction_type = 'sale' THEN
    UPDATE pos_sessions
    SET 
      total_sales = total_sales + NEW.total_amount,
      total_transactions = total_transactions + 1,
      expected_cash = COALESCE(expected_cash, opening_cash) + 
        CASE WHEN NEW.payment_method = 'cash' THEN NEW.total_amount ELSE 0 END,
      updated_at = now()
    WHERE id = NEW.session_id;
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'completed' AND NEW.transaction_type = 'refund' THEN
    UPDATE pos_sessions
    SET 
      total_sales = total_sales - NEW.total_amount,
      expected_cash = COALESCE(expected_cash, opening_cash) - 
        CASE WHEN NEW.payment_method = 'cash' THEN NEW.total_amount ELSE 0 END,
      updated_at = now()
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_session_totals ON pos_transactions;
CREATE TRIGGER trigger_update_session_totals
  AFTER INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_totals();

-- Trigger to calculate cash difference when session is closed
CREATE OR REPLACE FUNCTION calculate_cash_difference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'closed' AND OLD.status = 'open' THEN
    NEW.cash_difference = COALESCE(NEW.closing_cash, 0) - COALESCE(NEW.expected_cash, NEW.opening_cash);
    NEW.closed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_calculate_cash_difference ON pos_sessions;
CREATE TRIGGER trigger_calculate_cash_difference
  BEFORE UPDATE ON pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION calculate_cash_difference();

-- Enable RLS
ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pos_sessions

-- Staff can view their own sessions or all if admin/manager
CREATE POLICY "Staff can view POS sessions"
  ON pos_sessions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'manager')
    )
  );

-- Staff with POS access can create sessions
CREATE POLICY "Staff can create POS sessions"
  ON pos_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = staff_id AND
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.permissions ? 'pos_access'
    )
  );

-- Staff can update their own sessions or admins/managers can update any
CREATE POLICY "Staff can update POS sessions"
  ON pos_sessions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'manager')
    )
  );

-- RLS Policies for pos_transactions

-- Staff can view their own transactions or all if admin/manager
CREATE POLICY "Staff can view POS transactions"
  ON pos_transactions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = staff_id OR
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'manager')
    )
  );

-- Staff with POS access can create transactions
CREATE POLICY "Staff can create POS transactions"
  ON pos_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = staff_id AND
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.permissions ? 'pos_access'
    )
  );

-- Only staff with refund permission or admins/managers can update transactions
CREATE POLICY "Authorized staff can update POS transactions"
  ON pos_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND (
        ur.permissions ? 'pos_process_refunds' OR
        ur.name IN ('admin', 'manager')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND (
        ur.permissions ? 'pos_process_refunds' OR
        ur.name IN ('admin', 'manager')
      )
    )
  );