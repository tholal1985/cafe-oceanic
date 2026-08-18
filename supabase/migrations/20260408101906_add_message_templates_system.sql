/*
  # Message Templates System

  1. New Tables
    - `message_templates`
      - `id` (uuid, primary key)
      - `name` (text) - Template name for admin reference
      - `template_type` (text) - Type: order_confirmation, order_ready, order_delay, custom
      - `channel` (text) - sms, whatsapp, viber
      - `subject` (text, nullable) - For channels that support it
      - `message_body` (text) - Template body with variables
      - `variables` (jsonb) - Available variables and their descriptions
      - `is_active` (boolean)
      - `is_default` (boolean) - One default per type+channel
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `created_by` (uuid, FK to auth.users)

  2. Template Variables
    Available variables that can be used in templates:
    - {customer_name} - Customer's name
    - {customer_phone} - Customer's phone number
    - {order_number} - Order number
    - {order_total} - Total order amount
    - {order_items} - List of items ordered
    - {order_status} - Current order status
    - {order_type} - dine-in, takeaway, delivery
    - {table_number} - Table number (if applicable)
    - {tracking_link} - Link to track order
    - {business_name} - Restaurant/business name
    - {business_phone} - Business contact number
    - {estimated_time} - Estimated preparation/delivery time
    - {current_time} - Current timestamp
    - {custom_message} - Custom message field

  3. Security
    - Enable RLS on message_templates
    - Admins can create, read, update templates
    - Kitchen staff can only read templates
*/

-- Create message templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('order_confirmation', 'order_ready', 'order_delay', 'payment_success', 'payment_failed', 'custom')),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'viber')),
  subject text,
  message_body text NOT NULL,
  variables jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Create unique partial index for default templates
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_templates_unique_default 
  ON message_templates(template_type, channel) 
  WHERE is_default = true;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_message_templates_type_channel ON message_templates(template_type, channel) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_message_templates_default ON message_templates(is_default) WHERE is_default = true;

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

-- Admin can manage templates
CREATE POLICY "Admins can manage message templates"
  ON message_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

-- Kitchen staff can read templates
CREATE POLICY "Kitchen staff can read message templates"
  ON message_templates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('kitchen_staff', 'admin', 'owner')
      AND ura.is_active = true
    )
  );

-- Function to ensure only one default template per type+channel
CREATE OR REPLACE FUNCTION ensure_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    -- Unset other defaults for this type+channel combination
    UPDATE message_templates
    SET is_default = false
    WHERE template_type = NEW.template_type
      AND channel = NEW.channel
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER ensure_single_default_template_trigger
  BEFORE INSERT OR UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_template();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_message_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_message_template_timestamp_trigger
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_message_template_timestamp();

-- Insert default templates
INSERT INTO message_templates (name, template_type, channel, message_body, variables, is_default, is_active) VALUES
(
  'Order Confirmation - SMS',
  'order_confirmation',
  'sms',
  'Hi {customer_name}! Your order #{order_number} has been confirmed. Total: {order_total}. Track your order: {tracking_link}. Thank you! - {business_name}',
  '[
    {"name": "customer_name", "description": "Customer''s name"},
    {"name": "order_number", "description": "Order number"},
    {"name": "order_total", "description": "Total order amount"},
    {"name": "tracking_link", "description": "Order tracking URL"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
),
(
  'Order Ready - SMS',
  'order_ready',
  'sms',
  'Hi {customer_name}! Your order #{order_number} is ready! {custom_message} - {business_name}',
  '[
    {"name": "customer_name", "description": "Customer''s name"},
    {"name": "order_number", "description": "Order number"},
    {"name": "custom_message", "description": "Custom message (e.g., pickup instructions)"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
),
(
  'Payment Success - SMS',
  'payment_success',
  'sms',
  'Payment received! Order #{order_number} - {order_total}. Thank you for your purchase! Track: {tracking_link} - {business_name}',
  '[
    {"name": "order_number", "description": "Order number"},
    {"name": "order_total", "description": "Total amount paid"},
    {"name": "tracking_link", "description": "Order tracking URL"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
),
(
  'Order Confirmation - WhatsApp',
  'order_confirmation',
  'whatsapp',
  '✅ *Order Confirmed*\n\nHi {customer_name}!\n\nYour order has been confirmed:\n🧾 Order #: {order_number}\n💰 Total: {order_total}\n📍 Type: {order_type}\n\nTrack your order here:\n{tracking_link}\n\nThank you for choosing {business_name}! 🙏',
  '[
    {"name": "customer_name", "description": "Customer''s name"},
    {"name": "order_number", "description": "Order number"},
    {"name": "order_total", "description": "Total order amount"},
    {"name": "order_type", "description": "Order type (dine-in/takeaway/delivery)"},
    {"name": "tracking_link", "description": "Order tracking URL"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
),
(
  'Order Ready - WhatsApp',
  'order_ready',
  'whatsapp',
  '🍽️ *Your Order is Ready!*\n\nHi {customer_name}!\n\nYour order #{order_number} is now ready.\n\n{custom_message}\n\nThank you! - {business_name}',
  '[
    {"name": "customer_name", "description": "Customer''s name"},
    {"name": "order_number", "description": "Order number"},
    {"name": "custom_message", "description": "Custom message"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
),
(
  'Order Confirmation - Viber',
  'order_confirmation',
  'viber',
  'Order Confirmed!\n\nHi {customer_name}, your order #{order_number} totaling {order_total} has been confirmed.\n\nTrack your order: {tracking_link}\n\nThank you! - {business_name}',
  '[
    {"name": "customer_name", "description": "Customer''s name"},
    {"name": "order_number", "description": "Order number"},
    {"name": "order_total", "description": "Total order amount"},
    {"name": "tracking_link", "description": "Order tracking URL"},
    {"name": "business_name", "description": "Your business name"}
  ]'::jsonb,
  true,
  true
);

COMMENT ON TABLE message_templates IS 'Customizable message templates for SMS, WhatsApp, and Viber notifications';
COMMENT ON COLUMN message_templates.variables IS 'JSON array of available variables with descriptions for this template';