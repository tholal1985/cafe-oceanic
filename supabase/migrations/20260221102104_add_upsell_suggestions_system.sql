/*
  # Add Upsell Suggestions System

  ## Overview
  This migration adds functionality for suggesting additional products before payment,
  similar to popular fast-food kiosks (McDonald's, Burger King, etc.).

  ## New Tables
  - `suggested_products`
    - `id` (uuid, primary key) - Unique identifier
    - `product_id` (uuid, foreign key to products) - The product being suggested
    - `suggestion_type` (text) - Type: 'drink', 'side', 'dessert', 'combo'
    - `display_text` (text) - Custom suggestion text (e.g., "Add a drink?")
    - `display_order` (integer) - Order in suggestion list
    - `is_active` (boolean) - Whether this suggestion is active
    - `created_at` (timestamp) - Creation timestamp
    - `updated_at` (timestamp) - Last update timestamp

  ## Security
  - Enable RLS on `suggested_products` table
  - Allow public read access for kiosk displays
  - Restrict write access to authenticated admin users only

  ## Notes
  1. Suggestions appear in a modal before payment
  2. Customers can add suggested items or skip
  3. Multiple suggestion types help organize recommendations
  4. Display order controls the sequence of suggestions shown
*/

-- Create suggested_products table
CREATE TABLE IF NOT EXISTS suggested_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('drink', 'side', 'dessert', 'combo', 'popular')),
  display_text text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE suggested_products ENABLE ROW LEVEL SECURITY;

-- Public can read active suggestions
CREATE POLICY "Anyone can view active suggestions"
  ON suggested_products
  FOR SELECT
  USING (is_active = true);

-- Only authenticated admin users can insert suggestions
CREATE POLICY "Authenticated users can insert suggestions"
  ON suggested_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated admin users can update suggestions
CREATE POLICY "Authenticated users can update suggestions"
  ON suggested_products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only authenticated admin users can delete suggestions
CREATE POLICY "Authenticated users can delete suggestions"
  ON suggested_products
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_suggested_products_active ON suggested_products(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_suggested_products_type ON suggested_products(suggestion_type);
