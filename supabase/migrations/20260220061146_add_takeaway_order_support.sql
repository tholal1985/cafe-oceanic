/*
  # Add Takeaway Order Support

  ## Changes
  1. New Columns
    - `order_type` (text) - Stores 'dine-in' or 'takeaway'
    - `phone_number` (text, nullable) - Customer phone number for takeaway orders
  
  2. Updates
    - Add order_type column with default value 'dine-in' for existing orders
    - Add phone_number column for takeaway orders
    - Create index on order_type for faster filtering
  
  ## Security
    - No RLS changes needed (inherits existing policies)
    - Phone numbers are nullable (only required for takeaway)
*/

-- Add order_type column with default value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN order_type text DEFAULT 'dine-in' NOT NULL;
  END IF;
END $$;

-- Add phone_number column for takeaway orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE orders ADD COLUMN phone_number text;
  END IF;
END $$;

-- Add index for faster filtering by order type
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);

-- Add check constraint to ensure valid order types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'orders' AND constraint_name = 'orders_order_type_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_order_type_check 
      CHECK (order_type IN ('dine-in', 'takeaway'));
  END IF;
END $$;