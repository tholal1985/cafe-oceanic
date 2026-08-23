/*
  # Fix Security Issues - Indexes and RLS Optimization

  ## Overview
  This migration fixes critical security and performance issues:
  
  ## 1. Missing Indexes on Foreign Keys
  - Add indexes for order_items.product_id
  - Add indexes for payment_attempts.transaction_id
  - Add indexes for promotional_gifts.product_id
  - Add indexes for suggested_products.product_id
  
  ## 2. RLS Policy Optimization
  - Replace auth functions with SELECT subqueries to prevent re-evaluation
  - Improves query performance at scale
  
  ## 3. Fix Overly Permissive Policies
  - Replace policies with "true" conditions with actual security checks
*/

-- =====================================================
-- ADD MISSING INDEXES ON FOREIGN KEYS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
  ON order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_transaction_id 
  ON payment_attempts(transaction_id);

CREATE INDEX IF NOT EXISTS idx_promotional_gifts_product_id 
  ON promotional_gifts(product_id);

CREATE INDEX IF NOT EXISTS idx_suggested_products_product_id 
  ON suggested_products(product_id);

-- =====================================================
-- OPTIMIZE RLS POLICIES - CATEGORIES
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all categories" ON categories;
DROP POLICY IF EXISTS "Admins can insert categories" ON categories;
DROP POLICY IF EXISTS "Admins can update categories" ON categories;
DROP POLICY IF EXISTS "Admins can delete categories" ON categories;

CREATE POLICY "Admins can view all categories"
  ON categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can insert categories"
  ON categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update categories"
  ON categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete categories"
  ON categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - PRODUCTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all products" ON products;
DROP POLICY IF EXISTS "Admins can insert products" ON products;
DROP POLICY IF EXISTS "Admins can update products" ON products;
DROP POLICY IF EXISTS "Admins can delete products" ON products;

CREATE POLICY "Admins can view all products"
  ON products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can insert products"
  ON products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update products"
  ON products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete products"
  ON products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - ADDONS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all addons" ON addons;
DROP POLICY IF EXISTS "Admins can insert addons" ON addons;
DROP POLICY IF EXISTS "Admins can update addons" ON addons;
DROP POLICY IF EXISTS "Admins can delete addons" ON addons;

CREATE POLICY "Admins can view all addons"
  ON addons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can insert addons"
  ON addons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update addons"
  ON addons
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete addons"
  ON addons
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - PRODUCT_ADDONS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage product addons" ON product_addons;

CREATE POLICY "Admins can manage product addons"
  ON product_addons
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - ORDERS
-- =====================================================

DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;

CREATE POLICY "Admins can update orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete orders"
  ON orders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - ORDER_ITEMS
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage order items" ON order_items;

CREATE POLICY "Admins can manage order items"
  ON order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - ADVERTISEMENTS
-- =====================================================

DROP POLICY IF EXISTS "Admins can view all advertisements" ON advertisements;
DROP POLICY IF EXISTS "Admins can insert advertisements" ON advertisements;
DROP POLICY IF EXISTS "Admins can update advertisements" ON advertisements;
DROP POLICY IF EXISTS "Admins can delete advertisements" ON advertisements;

CREATE POLICY "Admins can view all advertisements"
  ON advertisements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can insert advertisements"
  ON advertisements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update advertisements"
  ON advertisements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can delete advertisements"
  ON advertisements
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- OPTIMIZE RLS POLICIES - ADMIN_USERS
-- =====================================================

DROP POLICY IF EXISTS "Users can check own admin status" ON admin_users;
DROP POLICY IF EXISTS "Admins can insert admin users" ON admin_users;

CREATE POLICY "Users can check own admin status"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "Admins can insert admin users"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = (SELECT auth.uid())
    )
  );