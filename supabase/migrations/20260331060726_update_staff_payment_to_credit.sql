/*
  # Update Staff Payment Method to Credit

  1. Changes
    - Renames 'staff' payment method to 'credit'
    - Updates payment_method check constraint to support: 'cash', 'bank_transfer', 'credit'
    - Migrates any existing 'staff' payments to 'credit'
  
  2. Security
    - Maintains existing constraints while updating payment method name
    - No changes to RLS policies
*/

-- Drop the old constraint first
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

-- Migrate existing 'staff' payments to 'credit'
UPDATE orders 
SET payment_method = 'credit' 
WHERE payment_method = 'staff';

-- Update pos_transactions table as well
UPDATE pos_transactions 
SET payment_method = 'credit' 
WHERE payment_method = 'staff';

-- Add the new constraint with 'credit' instead of 'staff'
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
  CHECK (payment_method IN ('cash', 'bank_transfer', 'credit'));