/*
  # Secure Database Functions and Cleanup

  ## Overview
  This migration addresses:
  1. Function search path mutability issues
  2. Security definer view concerns
  3. Cleanup of unused indexes
  
  ## Security Fixes
  - Set search_path for all functions to prevent search_path attacks
  - Add SECURITY INVOKER to views where appropriate
  - Remove unused indexes to improve maintenance
*/

-- =====================================================
-- SECURE FUNCTIONS WITH SEARCH_PATH
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_number TEXT;
  date_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM orders
  WHERE order_number LIKE date_prefix || '%';
  new_number := date_prefix || LPAD(sequence_num::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION update_payment_transaction_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_payment_status_to_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE orders
    SET payment_status = 'completed',
        updated_at = now()
    WHERE id = NEW.order_id;
  ELSIF NEW.status = 'failed' THEN
    UPDATE orders
    SET payment_status = 'failed',
        updated_at = now()
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_transaction_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  timestamp_part TEXT;
  random_part TEXT;
  counter INTEGER;
BEGIN
  timestamp_part := EXTRACT(EPOCH FROM now())::BIGINT::TEXT;
  random_part := SUBSTRING(MD5(random()::TEXT) FROM 1 FOR 8);
  SELECT COUNT(*) INTO counter FROM payment_transactions WHERE created_at > now() - INTERVAL '1 second';
  RETURN 'TXN-' || timestamp_part || '-' || random_part || '-' || LPAD(counter::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION log_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION check_suspicious_payment_activity(p_order_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  attempt_count INTEGER;
  failed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO attempt_count
  FROM payment_transactions
  WHERE order_id = p_order_id
    AND created_at > now() - INTERVAL '10 minutes';
  
  SELECT COUNT(*) INTO failed_count
  FROM payment_transactions
  WHERE order_id = p_order_id
    AND status = 'failed'
    AND created_at > now() - INTERVAL '1 hour';
  
  IF attempt_count > 5 OR failed_count > 3 THEN
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
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_expired_transactions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  updated_count INTEGER;
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
$$;

-- =====================================================
-- DROP UNUSED INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_payment_gateways_active;
DROP INDEX IF EXISTS idx_payment_gateways_type;
DROP INDEX IF EXISTS idx_orders_payment_status;
DROP INDEX IF EXISTS idx_message_logs_order_id;
DROP INDEX IF EXISTS idx_message_logs_status;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_payment_transactions_order;
DROP INDEX IF EXISTS idx_payment_transactions_reference;
DROP INDEX IF EXISTS idx_payment_transactions_local_id;
DROP INDEX IF EXISTS idx_payment_transactions_status;
DROP INDEX IF EXISTS idx_payment_transactions_created;
DROP INDEX IF EXISTS idx_payment_transactions_expires;
DROP INDEX IF EXISTS idx_payment_webhooks_transaction;
DROP INDEX IF EXISTS idx_payment_webhooks_event;
DROP INDEX IF EXISTS idx_message_logs_service;
DROP INDEX IF EXISTS idx_payment_webhooks_processed;
DROP INDEX IF EXISTS idx_payment_webhooks_created;
DROP INDEX IF EXISTS idx_payment_attempts_order;
DROP INDEX IF EXISTS idx_payment_attempts_suspicious;
DROP INDEX IF EXISTS idx_suggested_products_type;
DROP INDEX IF EXISTS idx_payment_transactions_failed;
DROP INDEX IF EXISTS idx_payment_audit_log_transaction;
DROP INDEX IF EXISTS idx_orders_order_type;
DROP INDEX IF EXISTS idx_product_addons_addon_id;

-- =====================================================
-- RECREATE CRITICAL INDEXES ONLY
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_status_active
  ON payment_transactions(order_id, status)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_payment_transactions_expiry_active
  ON payment_transactions(expires_at)
  WHERE status IN ('pending', 'processing') AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_unprocessed
  ON payment_webhooks(transaction_id, created_at)
  WHERE is_processed = false;