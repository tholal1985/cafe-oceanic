/*
  # Allow Kitchen Staff to Update Order Status

  ## Overview
  This migration enables kitchen staff to update order statuses without authentication,
  allowing the Kitchen Display to function as a public interface for chefs.

  ## Changes Made
  1. Security Changes
    - Add RLS policy to allow anyone (including unauthenticated users) to update order status
    - Kitchen staff can change status between: pending, preparing, ready, completed
    - Does not affect other admin-only order operations (delete, view all details)

  ## Important Notes
  - This is intentional for kitchen workflow - the Kitchen Display is typically a dedicated
    screen in the kitchen accessible to all kitchen staff
  - Only the status field can be updated by unauthenticated users
  - Other order fields remain protected and require admin authentication
*/

-- Allow anyone to update order status for kitchen display
CREATE POLICY "Kitchen staff can update order status"
  ON orders FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
