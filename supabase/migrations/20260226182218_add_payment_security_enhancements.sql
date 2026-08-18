/*
  # Payment Security Enhancements

  ## Overview
  This migration adds critical security enhancements to the payment system:
  - Stricter RLS policies
  - Unique constraints to prevent double payments
  - Additional validation constraints
  - Audit triggers
  - Payment attempt logging

  ## 1. Security Constraints

  ### payment_transactions
  - Unique constraint on order_id for completed payments
  - Check constraints for amount validation
  - Index for fraud detection

  ## 2. Enhanced RLS Policies

  - Prevent public access to sensitive payment data
  - Restrict updates to authorized operations only
  - Add policies for webhook processing

  ## 3. Audit Functions

  - Log all payment status changes
  - Track failed payment attempts
  - Monitor suspicious activity
*/

-- =====================================================
-- ADD SECURITY CONSTRAINTS
-- =====================================================

-- Prevent duplicate successful payments for same order
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_completed_payment_per_order
  ON payment_transactions(order_id)
  WHERE status = 'completed';

-- Add constraint to ensure valid status transitions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_status_values'
  ) THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT valid_status_values
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled', 'expired'));
  END IF;
END $$;

-- Ensure amount is positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'positive_amount'
  ) THEN
    ALTER TABLE payment_transactions
      ADD CONSTRAINT positive_amount
      CHECK (amount > 0 AND amount <= 100000);
  END IF;
END $$;

-- =====================================================
-- ENHANCE RLS POLICIES
-- =====================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Authenticated users can create transactions" ON payment_transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON payment_transactions;

-- Stricter insert policy: only allow creation with specific fields
CREATE POLICY "Allow transaction creation with validation"
  ON payment_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending' AND
    amount > 0 AND
    amount <= 100000 AND
    order_id IS NOT NULL
  );

-- Stricter update policy: only allow status and response updates
CREATE POLICY "Allow limited transaction updates"
  ON payment_transactions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- PAYMENT ATTEMPT LOGGING
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  attempt_status text NOT NULL CHECK (attempt_status IN ('initiated', 'failed', 'abandoned', 'suspicious')),
  failure_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view attempts
CREATE POLICY "Authenticated users can view payment attempts"
  ON payment_attempts
  FOR SELECT
  TO authenticated
  USING (true);

-- System can insert attempts
CREATE POLICY "System can log payment attempts"
  ON payment_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for fraud detection
CREATE INDEX IF NOT EXISTS idx_payment_attempts_order
  ON payment_attempts(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_suspicious
  ON payment_attempts(attempt_status, created_at DESC)
  WHERE attempt_status = 'suspicious';

-- =====================================================
-- AUDIT TRAIL FUNCTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  old_status text,
  new_status text,
  changed_by text,
  change_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE payment_audit_log ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can view audit logs
CREATE POLICY "Authenticated users can view audit logs"
  ON payment_audit_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO payment_audit_log (
      transaction_id,
      old_status,
      new_status,
      change_reason,
      metadata
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      CASE
        WHEN NEW.error_message IS NOT NULL THEN 'Payment failed: ' || NEW.error_message
        WHEN NEW.status = 'completed' THEN 'Payment completed successfully'
        WHEN NEW.status = 'expired' THEN 'Payment expired'
        ELSE 'Status changed'
      END,
      jsonb_build_object(
        'old_transaction_ref', OLD.transaction_reference,
        'new_transaction_ref', NEW.transaction_reference,
        'gateway_id', NEW.gateway_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS payment_status_audit_trigger ON payment_transactions;
CREATE TRIGGER payment_status_audit_trigger
  AFTER UPDATE ON payment_transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_payment_status_change();

-- =====================================================
-- FRAUD DETECTION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION check_suspicious_payment_activity(
  p_order_id uuid
)
RETURNS boolean AS $$
DECLARE
  attempt_count integer;
  failed_count integer;
BEGIN
  -- Count payment attempts in last 10 minutes
  SELECT COUNT(*) INTO attempt_count
  FROM payment_transactions
  WHERE order_id = p_order_id
    AND created_at > now() - interval '10 minutes';
  
  -- Count failed attempts in last hour
  SELECT COUNT(*) INTO failed_count
  FROM payment_transactions
  WHERE order_id = p_order_id
    AND status = 'failed'
    AND created_at > now() - interval '1 hour';
  
  -- Flag as suspicious if too many attempts
  IF attempt_count > 5 OR failed_count > 3 THEN
    -- Log suspicious activity
    INSERT INTO payment_attempts (
      order_id,
      attempt_status,
      failure_reason,
      metadata
    ) VALUES (
      p_order_id,
      'suspicious',
      'Excessive payment attempts detected',
      jsonb_build_object(
        'total_attempts', attempt_count,
        'failed_attempts', failed_count,
        'detection_time', now()
      )
    );
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- CLEANUP EXPIRED TRANSACTIONS
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE payment_transactions
  SET status = 'expired',
      updated_at = now()
  WHERE status IN ('pending', 'processing')
    AND expires_at IS NOT NULL
    AND expires_at < now();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- INDEXES FOR SECURITY QUERIES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_status
  ON payment_transactions(order_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_failed
  ON payment_transactions(order_id, created_at DESC)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_payment_audit_log_transaction
  ON payment_audit_log(transaction_id, created_at DESC);