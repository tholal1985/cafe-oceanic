/*
  # Allow POS Order Type in RLS Policy

  1. Changes
    - Updates the "Kiosk can create orders" policy to allow 'pos' order type
    - This enables the POS system to create orders
  
  2. Security
    - Maintains existing validation for total_price
    - Still restricts order types to valid values only
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Kiosk can create orders" ON orders;

-- Recreate with 'pos' included
CREATE POLICY "Kiosk can create orders"
  ON orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    order_type IN ('dine-in', 'takeaway', 'pos')
    AND total_price > 0
  );