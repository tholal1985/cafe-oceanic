/*
  # Update POS Payment Methods

  1. Changes
    - Drops old payment_method constraint
    - Migrates existing 'card' and 'digital' orders to 'bank_transfer'
    - Adds new payment_method check constraint to support: 'cash', 'bank_transfer', 'staff'
    - Ensures POS system uses only the new payment methods
  
  2. Data Migration
    - Converts existing 'card' payments to 'bank_transfer'
    - Converts existing 'digital' payments to 'bank_transfer'
    - Preserves 'cash' payments as-is
  
  3. Security
    - Maintains existing constraints while updating valid payment values
    - No changes to RLS policies
*/

-- Drop the old constraint first
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Migrate existing payment methods to the new ones
UPDATE orders 
SET payment_method = 'bank_transfer' 
WHERE payment_method IN ('card', 'digital');

-- Update pos_transactions table as well
UPDATE pos_transactions 
SET payment_method = 'bank_transfer' 
WHERE payment_method IN ('card', 'digital');

-- Add the new constraint with the new payment options
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
  CHECK (payment_method IN ('cash', 'bank_transfer', 'staff'));