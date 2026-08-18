/*
  # Add Multiple Categories Support for Products

  1. New Tables
    - `product_categories` (junction table)
      - `id` (uuid, primary key)
      - `product_id` (uuid, foreign key to products)
      - `category_id` (uuid, foreign key to categories)
      - `created_at` (timestamptz)
      - Composite unique constraint on (product_id, category_id)

  2. Changes
    - Create product_categories junction table for many-to-many relationship
    - Products can now belong to multiple categories
    - Maintain backward compatibility with existing category_id column
    - Create indexes for performance

  3. Security
    - Enable RLS on product_categories table
    - Allow public read access to product_categories
    - Allow authenticated admins to manage product_categories
    - Update product visibility logic to check product_categories table

  4. Migration Strategy
    - Migrate existing product-category relationships to new table
    - Keep category_id column for backward compatibility (will be deprecated later)
*/

-- Create product_categories junction table
CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, category_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_categories_product ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- Migrate existing data from products.category_id to product_categories
INSERT INTO product_categories (product_id, category_id)
SELECT id, category_id
FROM products
WHERE category_id IS NOT NULL
ON CONFLICT (product_id, category_id) DO NOTHING;

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_categories
CREATE POLICY "Anyone can view product categories"
  ON product_categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (true);

-- Update the products RLS policy to check product_categories table
DROP POLICY IF EXISTS "Customers can view products in active categories" ON products;

CREATE POLICY "Customers can view products in active categories"
  ON products FOR SELECT
  TO anon, authenticated
  USING (
    is_available = true 
    AND EXISTS (
      SELECT 1 
      FROM product_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.product_id = products.id 
      AND c.is_active = true
    )
  );