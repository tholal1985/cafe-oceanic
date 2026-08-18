/*
  # Add BML QR Payment Gateway Support

  1. Changes
    - Drop existing gateway_type check constraint
    - Add new constraint that includes 'bml' gateway type
    - Insert default BML QPOS gateway configuration for QR payments
  
  2. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

-- Drop the existing check constraint
ALTER TABLE payment_gateways 
DROP CONSTRAINT IF EXISTS payment_gateways_gateway_type_check;

-- Add new check constraint including BML
ALTER TABLE payment_gateways 
ADD CONSTRAINT payment_gateways_gateway_type_check 
CHECK (gateway_type = ANY (ARRAY['paypal'::text, 'skrill'::text, 'bml'::text]));

-- Insert default BML QPOS gateway for QR payments
INSERT INTO payment_gateways (
  name,
  gateway_type,
  is_active,
  is_default,
  display_order,
  supports_qr,
  qr_timeout,
  config
) VALUES (
  'BML QPOS',
  'bml',
  true,
  false,
  1,
  true,
  300,
  jsonb_build_object(
    'currency', 'MVR',
    'payment_method', 'qr'
  )
) ON CONFLICT DO NOTHING;