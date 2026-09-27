/*
# Remove UltimatePOS integration and REST API Keys system

This migration cleanly removes all database objects related to:
1. UltimatePOS integration (tables, functions, triggers, product columns)
2. REST API Keys system (tables, functions, triggers)
3. WooCommerce API keys table

## Tables dropped
- `ultimatepos_config` — connection settings for UltimatePOS
- `ultimatepos_order_log` — log of orders pushed to UltimatePOS
- `ultimatepos_sync_log` — log of product sync attempts
- `api_keys` — REST API key management
- `api_requests_log` — API request audit log
- `woocommerce_api_keys` — WooCommerce REST API credentials

## Columns dropped from `products`
- `ultimatepos_id` — foreign ID linking product to UltimatePOS
- `ultimatepos_variation_id` — variation ID in UltimatePOS

## Functions dropped
- `validate_api_key` — API key validation function
- `log_api_request` — API request logging function
- `update_api_keys_updated_at` — trigger function for api_keys

## Triggers dropped
- `api_keys_updated_at` — auto-update trigger on api_keys

## Security
- All RLS policies on dropped tables are removed automatically with the tables.
- No other tables are affected.
*/

-- Drop UltimatePOS tables
DROP TABLE IF EXISTS ultimatepos_sync_log CASCADE;
DROP TABLE IF EXISTS ultimatepos_order_log CASCADE;
DROP TABLE IF EXISTS ultimatepos_config CASCADE;

-- Drop API Keys tables
DROP TABLE IF EXISTS api_requests_log CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;

-- Drop WooCommerce API keys table
DROP TABLE IF EXISTS woocommerce_api_keys CASCADE;

-- Drop API Keys functions
DROP FUNCTION IF EXISTS validate_api_key(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS log_api_request(uuid, text, text, integer, text, text, integer) CASCADE;
DROP FUNCTION IF EXISTS update_api_keys_updated_at() CASCADE;

-- Drop UltimatePOS columns from products
ALTER TABLE products
  DROP COLUMN IF EXISTS ultimatepos_id,
  DROP COLUMN IF EXISTS ultimatepos_variation_id;
