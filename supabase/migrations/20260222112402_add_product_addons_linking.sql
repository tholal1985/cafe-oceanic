/*
  # Add Product-Addons Linking System

  1. New Tables
    - `product_addons`
      - `id` (uuid, primary key)
      - `product_id` (uuid, foreign key to products)
      - `addon_id` (uuid, foreign key to addons)
      - `created_at` (timestamp)
      - Unique constraint on (product_id, addon_id) to prevent duplicates

  2. Security
    - Enable RLS on `product_addons` table
    - Add policy for public read access (customers need to see which add-ons are available)
    - Add policy for authenticated admin insert/delete access

  3. Changes
    - Create junction table to link products with their available add-ons
    - Only linked add-ons will be shown when customers order specific products
*/

-- Create product_addons junction table
CREATE TABLE IF NOT EXISTS product_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, addon_id)
);

-- Enable RLS
ALTER TABLE product_addons ENABLE ROW LEVEL SECURITY;

-- Public can view product-addon links (needed for menu display)
CREATE POLICY "Anyone can view product-addon links"
  ON product_addons
  FOR SELECT
  TO public
  USING (true);

-- Authenticated users can insert product-addon links
CREATE POLICY "Authenticated users can insert product-addon links"
  ON product_addons
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can delete product-addon links
CREATE POLICY "Authenticated users can delete product-addon links"
  ON product_addons
  FOR DELETE
  TO authenticated
  USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_product_addons_addon_id ON product_addons(addon_id);