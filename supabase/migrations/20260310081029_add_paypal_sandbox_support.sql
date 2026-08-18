/*
  # Add PayPal Sandbox Support

  1. Changes
    - Add `sandbox_client_id` column to store sandbox credentials
    - Add `sandbox_client_secret` column to store sandbox credentials
    - Add `use_sandbox` column to toggle between sandbox and live mode
    
  2. Notes
    - Existing PayPal gateways will default to live mode (use_sandbox = false)
    - Sandbox credentials are optional and only needed when use_sandbox = true
*/

-- Add sandbox support columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'sandbox_client_id'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN sandbox_client_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'sandbox_client_secret'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN sandbox_client_secret text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'use_sandbox'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN use_sandbox boolean DEFAULT false;
  END IF;
END $$;