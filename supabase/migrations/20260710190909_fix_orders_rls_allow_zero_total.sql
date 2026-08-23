-- Allow zero-total orders (free items, 100% discounts, test orders)
DROP POLICY IF EXISTS "Kiosk can create orders" ON orders;

CREATE POLICY "Kiosk can create orders" ON orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (order_type = ANY (ARRAY['dine-in'::text, 'takeaway'::text, 'pos'::text]) AND total_price >= 0);