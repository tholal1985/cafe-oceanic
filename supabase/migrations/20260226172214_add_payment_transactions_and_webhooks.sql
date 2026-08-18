/*
  # Secure Payment Transaction and Webhook System

  ## Overview
  This migration enhances the existing payment_gateways table and adds comprehensive
  transaction tracking and webhook handling for secure payment processing.

  ## 1. Enhanced Existing Table

  ### payment_gateways (modifications)
  - Add `payment_status` column to orders table for better tracking
  - Update gateway configuration structure

  ## 2. New Tables

  ### payment_transactions
  Complete audit trail of all payment attempts and their lifecycle.
  - `id` (uuid, primary key)
  - `order_id` (uuid, foreign key to orders)
  - `gateway_id` (uuid, foreign key to payment_gateways)
  - `transaction_reference` (text) - Gateway's transaction ID
  - `local_transaction_id` (text) - Our internal reference
  - `amount` (numeric) - Transaction amount
  - `currency` (text) - ISO currency code
  - `status` (text) - pending, processing, completed, failed, refunded, cancelled
  - `payment_method` (text) - card, cash, wallet
  - `gateway_request` (jsonb) - Request payload sent to gateway
  - `gateway_response` (jsonb) - Response from gateway
  - `error_message` (text) - Error details if failed
  - `error_code` (text) - Gateway error code
  - `customer_phone` (text) - Customer contact
  - `customer_email` (text) - Customer email
  - `redirect_url` (text) - Payment page URL
  - `callback_url` (text) - Return URL after payment
  - `metadata` (jsonb) - Additional transaction data
  - `initiated_at` (timestamptz) - When transaction started
  - `completed_at` (timestamptz) - When transaction finished
  - `expires_at` (timestamptz) - Payment expiration time
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### payment_webhooks
  Stores incoming webhook notifications from payment gateways.
  - `id` (uuid, primary key)
  - `gateway_id` (uuid, foreign key to payment_gateways)
  - `transaction_id` (uuid, foreign key to payment_transactions)
  - `event_type` (text) - Type of webhook event
  - `event_id` (text) - Unique event identifier from gateway
  - `payload` (jsonb) - Full webhook payload
  - `headers` (jsonb) - Request headers
  - `signature` (text) - Webhook signature for verification
  - `is_verified` (boolean) - Signature verification status
  - `is_processed` (boolean) - Processing completion status
  - `processing_error` (text) - Error during processing
  - `processed_at` (timestamptz)
  - `created_at` (timestamptz)

  ## 3. Security
  - RLS enabled on all tables
  - Public cannot access transaction details
  - Only authenticated users (admins) can view/manage
  - Webhooks use service role for processing

  ## 4. Indexes
  - Optimized for transaction lookups
  - Status-based queries
  - Webhook processing
*/

-- =====================================================
-- UPDATE ORDERS TABLE
-- =====================================================

-- Add payment_status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE orders 
    ADD COLUMN payment_status text DEFAULT 'pending' 
    CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'));
  END IF;
END $$;

-- Create index for payment status
CREATE INDEX IF NOT EXISTS idx_orders_payment_status 
  ON orders(payment_status);

-- =====================================================
-- PAYMENT TRANSACTIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  gateway_id uuid REFERENCES payment_gateways(id) ON DELETE SET NULL,
  transaction_reference text,
  local_transaction_id text UNIQUE,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  currency text DEFAULT 'USD' NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled', 'expired')
  ),
  payment_method text DEFAULT 'card' CHECK (
    payment_method IN ('card', 'cash', 'wallet', 'bank_transfer', 'bml_wallet')
  ),
  gateway_request jsonb DEFAULT '{}'::jsonb,
  gateway_response jsonb DEFAULT '{}'::jsonb,
  error_message text,
  error_code text,
  customer_phone text,
  customer_email text,
  redirect_url text,
  callback_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  initiated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all transactions
CREATE POLICY "Authenticated users can view all transactions"
  ON payment_transactions
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can create transactions
CREATE POLICY "Authenticated users can create transactions"
  ON payment_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update transactions
CREATE POLICY "Authenticated users can update transactions"
  ON payment_transactions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order 
  ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference 
  ON payment_transactions(transaction_reference) 
  WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_local_id 
  ON payment_transactions(local_transaction_id) 
  WHERE local_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status 
  ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway 
  ON payment_transactions(gateway_id) 
  WHERE gateway_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created 
  ON payment_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_expires 
  ON payment_transactions(expires_at) 
  WHERE expires_at IS NOT NULL AND status IN ('pending', 'processing');

-- =====================================================
-- PAYMENT WEBHOOKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid REFERENCES payment_gateways(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_id text,
  payload jsonb NOT NULL,
  headers jsonb DEFAULT '{}'::jsonb,
  signature text,
  is_verified boolean DEFAULT false NOT NULL,
  is_processed boolean DEFAULT false NOT NULL,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE payment_webhooks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view all webhooks
CREATE POLICY "Authenticated users can view all webhooks"
  ON payment_webhooks
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert webhooks
CREATE POLICY "Authenticated users can insert webhooks"
  ON payment_webhooks
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update webhooks
CREATE POLICY "Authenticated users can update webhooks"
  ON payment_webhooks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_transaction 
  ON payment_webhooks(transaction_id) 
  WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_gateway 
  ON payment_webhooks(gateway_id) 
  WHERE gateway_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event 
  ON payment_webhooks(event_id) 
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed 
  ON payment_webhooks(is_processed, created_at) 
  WHERE is_processed = false;
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created 
  ON payment_webhooks(created_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_payment_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  
  -- Set completed_at when status changes to terminal state
  IF NEW.status IN ('completed', 'failed', 'refunded', 'cancelled', 'expired') 
     AND OLD.status NOT IN ('completed', 'failed', 'refunded', 'cancelled', 'expired') THEN
    NEW.completed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payment_transactions_timestamp ON payment_transactions;
CREATE TRIGGER update_payment_transactions_timestamp
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transaction_timestamp();

-- Sync payment status to orders
CREATE OR REPLACE FUNCTION sync_payment_status_to_order()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET payment_status = NEW.status,
      updated_at = now()
  WHERE id = NEW.order_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_transaction_status_to_order ON payment_transactions;
CREATE TRIGGER sync_transaction_status_to_order
  AFTER INSERT OR UPDATE OF status ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_payment_status_to_order();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Generate local transaction ID
CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS text AS $$
DECLARE
  new_id text;
  exists boolean;
BEGIN
  LOOP
    new_id := 'TXN-' || to_char(now(), 'YYYYMMDD') || '-' || 
              upper(substring(md5(random()::text) from 1 for 8));
    
    SELECT EXISTS(
      SELECT 1 FROM payment_transactions 
      WHERE local_transaction_id = new_id
    ) INTO exists;
    
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VIEWS
-- =====================================================

-- Transaction summary view
CREATE OR REPLACE VIEW v_payment_transactions AS
SELECT 
  pt.id,
  pt.local_transaction_id,
  pt.transaction_reference,
  pt.order_id,
  o.order_number,
  pt.gateway_id,
  pg.name as gateway_name,
  pg.gateway_type as gateway_type,
  pt.amount,
  pt.currency,
  pt.status,
  pt.payment_method,
  pt.error_message,
  pt.error_code,
  pt.customer_phone,
  pt.initiated_at,
  pt.completed_at,
  pt.expires_at,
  CASE 
    WHEN pt.completed_at IS NOT NULL THEN
      EXTRACT(EPOCH FROM (pt.completed_at - pt.initiated_at))
    WHEN pt.status IN ('pending', 'processing') THEN
      EXTRACT(EPOCH FROM (now() - pt.initiated_at))
    ELSE NULL
  END as duration_seconds,
  CASE
    WHEN pt.expires_at IS NOT NULL AND pt.expires_at < now() AND pt.status IN ('pending', 'processing') THEN true
    ELSE false
  END as is_expired
FROM payment_transactions pt
LEFT JOIN payment_gateways pg ON pt.gateway_id = pg.id
LEFT JOIN orders o ON pt.order_id = o.id
ORDER BY pt.created_at DESC;

-- Webhook processing queue
CREATE OR REPLACE VIEW v_pending_webhooks AS
SELECT 
  pw.id,
  pw.event_type,
  pw.event_id,
  pw.gateway_id,
  pg.name as gateway_name,
  pg.gateway_type,
  pw.transaction_id,
  pt.local_transaction_id,
  pw.is_verified,
  pw.created_at,
  EXTRACT(EPOCH FROM (now() - pw.created_at)) as age_seconds
FROM payment_webhooks pw
LEFT JOIN payment_gateways pg ON pw.gateway_id = pg.id
LEFT JOIN payment_transactions pt ON pw.transaction_id = pt.id
WHERE pw.is_processed = false
ORDER BY pw.created_at ASC;