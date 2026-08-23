/*
  # Allow Products Without Category Assignment
  
  1. Changes
    - Make category_id nullable in products table
    - Update RLS policy so customers only see products that are assigned to a category
    - Admins can see all products (with or without category)
  
  2. Product Visibility Rules
    - Customers: Only see products where category_id IS NOT NULL, is_available = true, and category is_active = true
    - Admins: Can see all products regardless of category assignment
  
  3. Workflow
    - Products can exist in the system without a category
    - Only products assigned to an active category are visible to customers
    - Admin can add/remove products from categories to control availability
*/

-- Make category_id nullable (allow products without category)
ALTER TABLE products 
  ALTER COLUMN category_id DROP NOT NULL;

-- Drop the existing customer view policy
DROP POLICY IF EXISTS "Anyone can view available products" ON products;

-- Create new policy: Customers only see products with a category
CREATE POLICY "Customers can view products in active categories"
  ON products FOR SELECT
  TO anon, authenticated
  USING (
    category_id IS NOT NULL 
    AND is_available = true 
    AND EXISTS (
      SELECT 1 FROM categories 
      WHERE categories.id = products.category_id 
      AND categories.is_active = true
    )
  );
