/*
  # Comprehensive Customer Management System

  1. New Tables
    - `customers`
      - Core customer information with contact details
      - Loyalty program tier tracking
      - Purchase history aggregations
      - Marketing preferences
    
    - `customer_loyalty_tiers`
      - Configurable loyalty tier levels (Bronze, Silver, Gold, Platinum)
      - Points required for each tier
      - Benefits and discounts per tier
    
    - `customer_loyalty_transactions`
      - Points earned and redeemed history
      - Links to orders and POS transactions
      - Expiration tracking
    
    - `customer_addresses`
      - Multiple address support per customer
      - Delivery and billing addresses
    
    - `customer_preferences`
      - Dietary restrictions
      - Favorite products
      - Special instructions
    
    - `customer_visits`
      - Visit tracking for analytics
      - Average spend per visit
      - Visit frequency analysis

  2. Security
    - Enable RLS on all customer tables
    - Staff can view and manage customers
    - Customers can view their own data (for future customer app)
    - Proper indexes for performance
*/

-- Customer Loyalty Tiers
CREATE TABLE IF NOT EXISTS customer_loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name text NOT NULL UNIQUE,
  tier_level integer NOT NULL UNIQUE CHECK (tier_level >= 0),
  points_required integer NOT NULL DEFAULT 0 CHECK (points_required >= 0),
  discount_percentage numeric(5,2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  benefits jsonb DEFAULT '{}'::jsonb,
  color_code text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Main Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number text UNIQUE NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text UNIQUE,
  phone text UNIQUE NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  
  -- Loyalty Program
  loyalty_tier_id uuid REFERENCES customer_loyalty_tiers(id),
  loyalty_points integer DEFAULT 0 CHECK (loyalty_points >= 0),
  lifetime_points integer DEFAULT 0 CHECK (lifetime_points >= 0),
  
  -- Purchase Analytics
  total_visits integer DEFAULT 0,
  total_spent numeric(12,2) DEFAULT 0 CHECK (total_spent >= 0),
  average_order_value numeric(12,2) DEFAULT 0,
  last_visit_date timestamptz,
  first_visit_date timestamptz,
  
  -- Marketing
  marketing_opt_in boolean DEFAULT false,
  sms_opt_in boolean DEFAULT false,
  email_opt_in boolean DEFAULT false,
  
  -- Status
  is_active boolean DEFAULT true,
  is_vip boolean DEFAULT false,
  notes text,
  tags text[],
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('billing', 'delivery', 'both')),
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state_province text,
  postal_code text,
  country text DEFAULT 'Maldives',
  is_default boolean DEFAULT false,
  delivery_instructions text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customer Loyalty Transactions
CREATE TABLE IF NOT EXISTS customer_loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted', 'bonus')),
  points integer NOT NULL,
  balance_after integer NOT NULL,
  
  -- Related Records
  order_id uuid REFERENCES orders(id),
  pos_transaction_id uuid REFERENCES pos_transactions(id),
  
  -- Details
  description text NOT NULL,
  reference_number text,
  expires_at timestamptz,
  
  -- Audit
  processed_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Customer Preferences
CREATE TABLE IF NOT EXISTS customer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Dietary Restrictions
  dietary_restrictions text[],
  allergies text[],
  
  -- Favorites
  favorite_products uuid[],
  favorite_categories uuid[],
  
  -- Preferences
  spice_level text CHECK (spice_level IN ('none', 'mild', 'medium', 'hot', 'extra_hot')),
  special_instructions text,
  preferred_payment_method text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Customer Visits Tracking
CREATE TABLE IF NOT EXISTS customer_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visit_date timestamptz NOT NULL DEFAULT now(),
  
  -- Visit Details
  order_id uuid REFERENCES orders(id),
  pos_transaction_id uuid REFERENCES pos_transactions(id),
  
  -- Metrics
  order_total numeric(12,2) DEFAULT 0,
  items_purchased integer DEFAULT 0,
  visit_duration_minutes integer,
  
  -- Context
  visit_type text CHECK (visit_type IN ('dine-in', 'takeaway', 'delivery')),
  served_by uuid REFERENCES auth.users(id),
  
  created_at timestamptz DEFAULT now()
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_loyalty_tier ON customers(loyalty_tier_id);
CREATE INDEX IF NOT EXISTS idx_customers_last_visit ON customers(last_visit_date);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON customer_loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order ON customer_loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_visits_customer ON customer_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_visits_date ON customer_visits(visit_date);

-- Enable RLS
ALTER TABLE customer_loyalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customer_loyalty_tiers
CREATE POLICY "Anyone can view active loyalty tiers"
  ON customer_loyalty_tiers FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage loyalty tiers"
  ON customer_loyalty_tiers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND ur.name = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND ur.name = 'admin'
    )
  );

-- RLS Policies for customers
CREATE POLICY "Staff can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can create customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Staff can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only admins can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND ur.name = 'admin'
    )
  );

-- RLS Policies for customer_addresses
CREATE POLICY "Staff can manage customer addresses"
  ON customer_addresses FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for customer_loyalty_transactions
CREATE POLICY "Staff can view loyalty transactions"
  ON customer_loyalty_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can create loyalty transactions"
  ON customer_loyalty_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Only admins can modify loyalty transactions"
  ON customer_loyalty_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ura.is_active = true
      AND ur.name = 'admin'
    )
  );

-- RLS Policies for customer_preferences
CREATE POLICY "Staff can manage customer preferences"
  ON customer_preferences FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for customer_visits
CREATE POLICY "Staff can view customer visits"
  ON customer_visits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can create customer visits"
  ON customer_visits FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert Default Loyalty Tiers
INSERT INTO customer_loyalty_tiers (tier_name, tier_level, points_required, discount_percentage, color_code, benefits) VALUES
  ('Bronze', 0, 0, 0, '#CD7F32', '{"welcome_bonus": 50, "birthday_bonus": 100}'::jsonb),
  ('Silver', 1, 500, 5, '#C0C0C0', '{"welcome_bonus": 100, "birthday_bonus": 200, "free_delivery": true}'::jsonb),
  ('Gold', 2, 2000, 10, '#FFD700', '{"welcome_bonus": 200, "birthday_bonus": 500, "free_delivery": true, "priority_support": true}'::jsonb),
  ('Platinum', 3, 5000, 15, '#E5E4E2', '{"welcome_bonus": 500, "birthday_bonus": 1000, "free_delivery": true, "priority_support": true, "exclusive_offers": true}'::jsonb)
ON CONFLICT (tier_name) DO NOTHING;

-- Function to generate customer number
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS text AS $$
DECLARE
  new_number text;
  counter integer;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM customers;
  new_number := 'CUST' || LPAD(counter::text, 6, '0');
  
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM customers WHERE customer_number = new_number) LOOP
    counter := counter + 1;
    new_number := 'CUST' || LPAD(counter::text, 6, '0');
  END LOOP;
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update customer tier based on points
CREATE OR REPLACE FUNCTION update_customer_tier()
RETURNS TRIGGER AS $$
DECLARE
  appropriate_tier_id uuid;
BEGIN
  -- Find the highest tier the customer qualifies for
  SELECT id INTO appropriate_tier_id
  FROM customer_loyalty_tiers
  WHERE points_required <= NEW.loyalty_points
    AND is_active = true
  ORDER BY tier_level DESC
  LIMIT 1;
  
  -- Update tier if different
  IF appropriate_tier_id IS NOT NULL AND (NEW.loyalty_tier_id IS NULL OR NEW.loyalty_tier_id != appropriate_tier_id) THEN
    NEW.loyalty_tier_id := appropriate_tier_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-assign tier
CREATE TRIGGER trigger_update_customer_tier
  BEFORE INSERT OR UPDATE OF loyalty_points ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_tier();

-- Function to update customer analytics
CREATE OR REPLACE FUNCTION update_customer_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'pos_transactions' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers
    SET
      total_visits = total_visits + 1,
      total_spent = total_spent + NEW.total_amount,
      average_order_value = (total_spent + NEW.total_amount) / (total_visits + 1),
      last_visit_date = NEW.created_at,
      first_visit_date = COALESCE(first_visit_date, NEW.created_at),
      updated_at = now()
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update analytics on transaction
CREATE TRIGGER trigger_update_customer_analytics_on_transaction
  AFTER INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_analytics();

-- Add customer_id to pos_transactions if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_transactions' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE pos_transactions ADD COLUMN customer_id uuid REFERENCES customers(id);
    CREATE INDEX idx_pos_transactions_customer ON pos_transactions(customer_id);
  END IF;
END $$;