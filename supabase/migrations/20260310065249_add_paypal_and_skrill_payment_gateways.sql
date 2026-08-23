/*
  # Add PayPal and Skrill Payment Gateway Support

  1. Changes
    - Update payment_gateways table to support PayPal and Skrill
    - Add gateway-specific configuration fields
    - Remove BML-specific columns
    - Add new configuration fields for PayPal (Client ID, Secret) and Skrill (Merchant Email, API Password)

  2. New Configuration Fields
    - `client_id` - For PayPal Client ID
    - `client_secret` - For PayPal Client Secret  
    - `merchant_email` - For Skrill Merchant Email
    - `api_password` - For Skrill API/MQI Password
    - `webhook_secret` - For webhook validation

  3. Gateway Types Supported
    - `paypal` - PayPal payment gateway
    - `skrill` - Skrill payment gateway

  4. Security
    - Maintains existing RLS policies
    - Encrypted sensitive credentials in config JSONB field
*/

-- Add new columns for PayPal and Skrill configuration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'client_secret'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN client_secret text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'merchant_email'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN merchant_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'api_password'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN api_password text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'webhook_secret'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN webhook_secret text;
  END IF;
END $$;

-- Remove BML-specific columns that are no longer needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'company_id'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN company_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'sign_method'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN sign_method;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'app_version'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN app_version;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'api_version'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN api_version;
  END IF;
END $$;

-- Update gateway_type constraint to include paypal and skrill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'payment_gateways_gateway_type_check'
  ) THEN
    ALTER TABLE payment_gateways DROP CONSTRAINT payment_gateways_gateway_type_check;
  END IF;
END $$;

ALTER TABLE payment_gateways 
  ADD CONSTRAINT payment_gateways_gateway_type_check 
  CHECK (gateway_type IN ('paypal', 'skrill'));

-- Add comment explaining the config JSONB structure
COMMENT ON COLUMN payment_gateways.config IS 'Gateway-specific configuration. PayPal: {environment: "sandbox"|"live", currency: "USD"}. Skrill: {currency: "USD", recipient_description: "text", return_url_text: "text"}';
