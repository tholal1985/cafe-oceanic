/*
  # Add Auto-Generated Order Numbers

  1. Changes
    - Creates a function to auto-generate unique order numbers (ORD-YYYYMMDD-XXXX format)
    - Creates a trigger to automatically set order_number when inserting new orders
    - Makes order_number nullable with a default value set by trigger
    - Adds an index on order_number for faster lookups
  
  2. Security
    - Function is SECURITY DEFINER to allow sequence operations
    - Trigger runs automatically, no manual intervention needed
  
  3. Format
    - Order numbers follow the pattern: ORD-20260330-0001
    - XXXX is a daily sequence that resets each day
*/

-- Create a function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_date text;
  sequence_num integer;
  order_num text;
  max_num text;
BEGIN
  -- Get today's date in YYYYMMDD format
  today_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get the highest order number for today
  SELECT order_number INTO max_num
  FROM orders
  WHERE order_number LIKE 'ORD-' || today_date || '-%'
  ORDER BY order_number DESC
  LIMIT 1;
  
  -- Extract sequence number or start from 1
  IF max_num IS NULL THEN
    sequence_num := 1;
  ELSE
    sequence_num := (substring(max_num from '[0-9]+$'))::integer + 1;
  END IF;
  
  -- Format the order number: ORD-YYYYMMDD-XXXX
  order_num := 'ORD-' || today_date || '-' || lpad(sequence_num::text, 4, '0');
  
  RETURN order_num;
END;
$$;

-- Create trigger function to auto-assign order number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_order_number ON orders;

-- Create trigger that fires before insert
CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Make order_number nullable (it will be set by trigger)
ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL;

-- Create index for faster order number lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Update any existing orders that might have NULL order_number
DO $$
DECLARE
  order_record RECORD;
  new_order_num text;
BEGIN
  FOR order_record IN 
    SELECT id FROM orders WHERE order_number IS NULL
  LOOP
    new_order_num := generate_order_number();
    UPDATE orders SET order_number = new_order_num WHERE id = order_record.id;
  END LOOP;
END $$;