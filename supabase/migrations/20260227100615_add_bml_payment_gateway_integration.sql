/*
  # Add BML Payment Gateway Integration for Cafe Oceanic

  1. Changes
    - Insert BML payment gateway configuration
    - Add webhook URL configuration for cafeoceanic.com
    - Configure BML-specific settings (API credentials storage)

  2. Gateway Details
    - Gateway Type: BML (Bank of Maldives)
    - Payment Method: Digital Wallet
    - Webhook URL: https://cafeoceanic.com/api/webhooks/bml
    - Supports: MVR currency transactions

  3. Security
    - API credentials stored encrypted in configuration
    - Webhook secret for signature verification
    - AWS SigV4 authentication support
*/

-- Add unique constraint on gateway_type if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'payment_gateways_gateway_type_key'
  ) THEN
    ALTER TABLE payment_gateways ADD CONSTRAINT payment_gateways_gateway_type_key UNIQUE (gateway_type);
  END IF;
END $$;

-- Insert BML payment gateway configuration
INSERT INTO payment_gateways (
  name,
  gateway_type,
  api_url,
  transaction_endpoint,
  verify_endpoint,
  webhook_endpoint,
  is_active,
  is_default,
  config,
  secret_key,
  app_id,
  sign_method,
  app_version,
  api_version,
  aws_region,
  aws_service
) VALUES (
  'BML Payment Gateway',
  'bml',
  'https://api.bml.com.mv',
  '/payment/v1/transaction',
  '/payment/v1/verify',
  'https://cafeoceanic.com/api/webhooks/bml',
  true,
  false,
  jsonb_build_object(
    'merchant_id', '',
    'access_key', '',
    'environment', 'production',
    'supported_currencies', jsonb_build_array('MVR', 'USD'),
    'payment_methods', jsonb_build_array('wallet', 'card'),
    'timeout_seconds', 300,
    'webhook_secret', '',
    'webhook_url', 'https://cafeoceanic.com/api/webhooks/bml'
  ),
  '',
  '',
  'sha1',
  '1.0.0',
  '2.0',
  'ap-south-1',
  'execute-api'
)
ON CONFLICT (gateway_type) DO UPDATE SET
  name = EXCLUDED.name,
  api_url = EXCLUDED.api_url,
  transaction_endpoint = EXCLUDED.transaction_endpoint,
  verify_endpoint = EXCLUDED.verify_endpoint,
  webhook_endpoint = EXCLUDED.webhook_endpoint,
  aws_region = EXCLUDED.aws_region,
  aws_service = EXCLUDED.aws_service,
  sign_method = EXCLUDED.sign_method,
  app_version = EXCLUDED.app_version,
  api_version = EXCLUDED.api_version,
  config = payment_gateways.config || EXCLUDED.config,
  updated_at = now();

-- Add index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_payment_gateways_webhook_endpoint 
ON payment_gateways(webhook_endpoint) 
WHERE webhook_endpoint IS NOT NULL;

-- Add index for gateway type lookups
CREATE INDEX IF NOT EXISTS idx_payment_gateways_type_active 
ON payment_gateways(gateway_type, is_active);

-- Add comments for documentation
COMMENT ON COLUMN payment_gateways.webhook_endpoint IS 'URL endpoint for receiving payment webhook notifications from the gateway';
COMMENT ON COLUMN payment_gateways.secret_key IS 'Encrypted API secret key used for signature calculation and authentication';
COMMENT ON COLUMN payment_gateways.app_id IS 'Application/Client ID used as deviceId in API requests';
