/*
  # Update BML Connect Gateway Schema
  
  1. Changes
    - Remove AWS-specific fields (aws_region, aws_service)
    - Simplify configuration for BML Connect API v2.0
    - Update sign_method to support both sha1 and md5
    - Remove verify_endpoint as BML uses same endpoint for transactions
    
  2. Security
    - Maintains existing RLS policies
    - No changes to security model
*/

-- Remove AWS-specific columns that are not needed for BML Connect
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'aws_region'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN IF EXISTS aws_region;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'aws_service'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN IF EXISTS aws_service;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'verify_endpoint'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN IF EXISTS verify_endpoint;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'transaction_endpoint'
  ) THEN
    ALTER TABLE payment_gateways DROP COLUMN IF EXISTS transaction_endpoint;
  END IF;
END $$;

-- Update existing BML gateway configuration to match BML Connect specification
UPDATE payment_gateways
SET 
  api_url = 'https://api.uat.merchants.bankofmaldives.com.mv/public',
  sign_method = 'sha1',
  api_version = '2.0',
  app_version = 'bml-connect-kiosk-1.0'
WHERE gateway_type = 'bml' AND is_active = true;
