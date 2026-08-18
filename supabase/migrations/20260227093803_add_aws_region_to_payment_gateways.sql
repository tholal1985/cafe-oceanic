/*
  # Add AWS Region Configuration for Payment Gateways

  1. Changes
    - Add aws_region column to payment_gateways table for AWS SigV4 signing
    - Add aws_service column for service name in signature
    - Set default values for BML gateway

  2. Purpose
    - Support AWS Signature Version 4 authentication
    - Allow configuration of AWS region and service per gateway
*/

-- Add AWS configuration columns
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'aws_region'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN aws_region text DEFAULT 'us-east-1';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'payment_gateways' AND column_name = 'aws_service'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN aws_service text DEFAULT 'execute-api';
  END IF;
END $$;

-- Update BML gateway with correct AWS settings
UPDATE payment_gateways 
SET 
  aws_region = 'us-east-1',
  aws_service = 'execute-api'
WHERE gateway_type = 'bml';

-- Add helpful comments
COMMENT ON COLUMN payment_gateways.aws_region IS 'AWS region for SigV4 signing (e.g., us-east-1, ap-south-1)';
COMMENT ON COLUMN payment_gateways.aws_service IS 'AWS service name for SigV4 signing (e.g., execute-api)';
