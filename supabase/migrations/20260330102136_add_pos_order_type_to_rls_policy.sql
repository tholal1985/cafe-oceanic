/*
  # Add POS Order Type and Digital Payment Support

  1. Changes
    - Updates order_type check constraint to include 'pos' type
    - Updates payment_method check constraint to include 'digital' payment
    - Ensures POS system can create orders properly
  
  2. Security
    - Maintains existing constraints while adding new valid values
    - No changes to RLS policies
*/

-- Drop and recreate order_type check constraint to include 'pos'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check 
  CHECK (order_type IN ('dine-in', 'takeaway', 'pos'));

-- Drop and recreate payment_method check constraint to include 'digital'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
  CHECK (payment_method IN ('card', 'cash', 'digital'));