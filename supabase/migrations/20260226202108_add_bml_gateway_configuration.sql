/*
  # Add BML Payment Gateway Configuration

  1. Changes
    - Add transaction_endpoint column to payment_gateways table
    - Add verify_endpoint column to payment_gateways table
    - Add api_url column for the base gateway URL
    - Add webhook_endpoint for payment notifications
    - Update existing BML configuration if exists
  
  2. Purpose
    - Store separate endpoints for transaction creation and verification
    - Enable proper BML gateway integration
    - Support both sandbox and production environments
*/

-- Add new columns for BML gateway endpoints
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'api_url'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN api_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'transaction_endpoint'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN transaction_endpoint text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'verify_endpoint'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN verify_endpoint text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'webhook_endpoint'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN webhook_endpoint text;
  END IF;
END $$;

-- Update default BML configuration
UPDATE payment_gateways 
SET 
  api_url = 'https://gateway.bankofmaldives.com.mv',
  transaction_endpoint = '/api/v1/transactions',
  verify_endpoint = '/api/v1/transactions/verify',
  webhook_endpoint = '/api/v1/webhooks/payment'
WHERE gateway_type = 'BML' AND is_active = true;

-- Add helpful comments
COMMENT ON COLUMN payment_gateways.api_url IS 'Base URL for the payment gateway API';
COMMENT ON COLUMN payment_gateways.transaction_endpoint IS 'Endpoint path for creating/initiating transactions';
COMMENT ON COLUMN payment_gateways.verify_endpoint IS 'Endpoint path for verifying transaction status';
COMMENT ON COLUMN payment_gateways.webhook_endpoint IS 'Endpoint path for receiving payment webhooks';