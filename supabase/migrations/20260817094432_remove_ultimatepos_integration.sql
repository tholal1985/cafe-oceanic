-- Drop UltimatePOS tables
DROP TABLE IF EXISTS ultimatepos_order_log;
DROP TABLE IF EXISTS ultimatepos_sync_log;
DROP TABLE IF EXISTS ultimatepos_config;

-- Remove UltimatePOS columns from products
ALTER TABLE products DROP COLUMN IF EXISTS ultimatepos_id;
ALTER TABLE products DROP COLUMN IF EXISTS ultimatepos_variation_id;

-- Remove UltimatePOS column from customers
ALTER TABLE customers DROP COLUMN IF EXISTS ultimatepos_contact_id;
