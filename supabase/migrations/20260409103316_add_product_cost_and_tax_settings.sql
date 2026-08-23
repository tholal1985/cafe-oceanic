/*
  # Add Product Cost and Tax Settings

  ## Changes

  1. Products Table
     - Add `cost` column (decimal 10,2, default 0) — the cost price of each product
     - Enables profit margin calculations: gross_profit = price - cost

  2. System Settings
     - Add `tax_rate` setting (default 0%) for configurable sales tax
     - Uses existing setting_key / setting_value (jsonb) schema

  ## Analytics Enabled
  - Cost of Goods Sold (COGS)
  - Gross Profit = Revenue - COGS
  - Profit Margin % per product and overall
  - Tax collected on completed sales
  - Net profit visibility on dashboard
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'cost'
  ) THEN
    ALTER TABLE products ADD COLUMN cost decimal(10,2) DEFAULT 0 NOT NULL;
  END IF;
END $$;

INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES ('tax_rate', '0'::jsonb, 'number', 'Sales tax rate as a percentage (e.g. 10 = 10%)')
ON CONFLICT (setting_key) DO NOTHING;
