/*
  # Fix Orders Payment Method Constraint

  1. Changes
    - Drop existing payment_method check constraint on orders table
    - Add updated constraint that includes all modern payment methods
    - Includes: cash, card, bank_transfer, credit, qr, wallet, digital
  
  2. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

-- Drop the existing check constraint
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Add new check constraint with all payment methods
ALTER TABLE orders 
ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank_transfer'::text, 'credit'::text, 'qr'::text, 'wallet'::text, 'digital'::text]));