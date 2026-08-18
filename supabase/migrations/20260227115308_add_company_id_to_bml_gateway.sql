/*
  # Add company_id to BML Gateway Configuration

  1. Changes
    - Update the BML gateway config to include company_id field
    - Extract company_id from the JWT token in the API key

  2. Notes
    - The company_id is required by BML Connect API
    - This value is embedded in the JWT token but needs to be explicitly stored
*/

-- Update the BML gateway configuration to include company_id
UPDATE payment_gateways
SET config = jsonb_set(
  config,
  '{company_id}',
  '"617624d45e251c00089313​4a"'::jsonb
)
WHERE gateway_type = 'bml' AND config->>'company_id' IS NULL;
