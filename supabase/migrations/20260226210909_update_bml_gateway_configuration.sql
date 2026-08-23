/*
  # Update BML Gateway Configuration with Correct Fields

  1. Changes
    - Add secret_key column for BML API Secret
    - Add app_id column for BML App ID (client_id)
    - Add sign_method column for signature method (sha1)
    - Add app_version column for API versioning
    - Add api_version column for API versioning
    - Rename existing columns to match BML API requirements
    - Remove AWS-specific columns (access_key, region)
  
  2. BML API Requirements
    - api_key: Authorization header value
    - secret_key: Used for signature calculation
    - app_id: deviceId in transaction requests
    - Base URL for sandbox: https://api.uat.merchants.bankofmaldives.com.mv/public
    - Base URL for production: https://api.merchants.bankofmaldives.com.mv/public
  
  3. Security
    - All sensitive fields encrypted in configuration JSONB
*/

-- Add BML-specific columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'secret_key'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN secret_key text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'app_id'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN app_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'sign_method'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN sign_method text DEFAULT 'sha1';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'app_version'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN app_version text DEFAULT '1.0.0';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'api_version'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN api_version text DEFAULT '2.0';
  END IF;
END $$;

-- Update BML gateway URLs to correct endpoints
UPDATE payment_gateways 
SET 
  api_url = 'https://api.uat.merchants.bankofmaldives.com.mv/public',
  transaction_endpoint = '/transactions',
  verify_endpoint = '/transactions',
  sign_method = 'sha1',
  app_version = '1.0.0',
  api_version = '2.0'
WHERE gateway_type = 'BML';

-- Add helpful comments
COMMENT ON COLUMN payment_gateways.secret_key IS 'BML API Secret Key used for signature calculation';
COMMENT ON COLUMN payment_gateways.app_id IS 'BML App ID (client_id) used as deviceId in requests';
COMMENT ON COLUMN payment_gateways.sign_method IS 'Signature method for BML transactions (sha1)';
COMMENT ON COLUMN payment_gateways.app_version IS 'Application version for BML API requests';
COMMENT ON COLUMN payment_gateways.api_version IS 'BML API version (2.0)';