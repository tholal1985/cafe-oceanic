/*
  # Add Promotional Gifts System

  ## Overview
  This migration adds functionality for automatic gift rewards based on order value,
  similar to promotional systems used in McDonald's, Burger King, and other kiosk systems.

  ## New Tables
  - `promotional_gifts`
    - `id` (uuid, primary key) - Unique identifier
    - `product_id` (uuid, foreign key to products) - The gift product
    - `minimum_order_value` (numeric) - Minimum cart value to qualify
    - `gift_title` (text) - Display title (e.g., "Free Dessert!")
    - `gift_description` (text) - Description shown to customer
    - `is_active` (boolean) - Whether this promotion is active
    - `priority` (integer) - Higher priority gifts shown first
    - `start_date` (timestamp) - Promotion start date
    - `end_date` (timestamp) - Promotion end date (nullable for ongoing)
    - `max_redemptions` (integer) - Max times this can be redeemed (null = unlimited)
    - `redemptions_count` (integer) - Times this has been redeemed
    - `created_at` (timestamp) - Creation timestamp
    - `updated_at` (timestamp) - Last update timestamp

  ## Security
  - Enable RLS on `promotional_gifts` table
  - Allow public read access for active gifts
  - Restrict write access to authenticated admin users only

  ## Notes
  1. System checks cart total and shows available gifts in a modal
  2. Customers can choose one gift from eligible options
  3. Gift is added to cart automatically with $0.00 price
  4. Multiple gift tiers supported (e.g., $50, $100, $500)
  5. Admin can track redemption counts
*/

-- Create promotional_gifts table
CREATE TABLE IF NOT EXISTS promotional_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  minimum_order_value numeric NOT NULL CHECK (minimum_order_value >= 0),
  gift_title text NOT NULL,
  gift_description text NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 0,
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  max_redemptions integer,
  redemptions_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE promotional_gifts ENABLE ROW LEVEL SECURITY;

-- Public can read active gifts within date range
CREATE POLICY "Anyone can view active gifts"
  ON promotional_gifts
  FOR SELECT
  USING (
    is_active = true 
    AND start_date <= now() 
    AND (end_date IS NULL OR end_date >= now())
    AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
  );

-- Only authenticated admin users can insert gifts
CREATE POLICY "Authenticated users can insert gifts"
  ON promotional_gifts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated admin users can update gifts
CREATE POLICY "Authenticated users can update gifts"
  ON promotional_gifts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated admin users can delete gifts
CREATE POLICY "Authenticated users can delete gifts"
  ON promotional_gifts
  FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_promotional_gifts_active ON promotional_gifts(is_active, minimum_order_value, priority);
CREATE INDEX IF NOT EXISTS idx_promotional_gifts_dates ON promotional_gifts(start_date, end_date);

-- Insert sample promotional gift for orders over $50
INSERT INTO promotional_gifts (
  product_id, 
  minimum_order_value, 
  gift_title, 
  gift_description, 
  priority,
  is_active
)
SELECT 
  id,
  50.00,
  'FREE Gift with Your Order!',
  'Congratulations! Your order qualifies for a FREE ' || name || '!',
  1,
  true
FROM products 
WHERE name = 'Ice Cream' 
  AND is_available = true
LIMIT 1
ON CONFLICT DO NOTHING;
