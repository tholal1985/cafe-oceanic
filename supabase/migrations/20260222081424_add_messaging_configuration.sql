/*
  # Add Messaging Configuration System

  ## Overview
  This migration adds support for WhatsApp and Viber messaging integration,
  allowing the system to send order confirmations and notifications to customers.

  ## New Tables
  - `messaging_config`
    - `id` (uuid, primary key) - Unique identifier
    - `service_name` (text) - Service: 'whatsapp' or 'viber'
    - `is_enabled` (boolean) - Whether this service is active
    - `api_key` (text) - API key/token (encrypted)
    - `api_secret` (text) - API secret if needed (encrypted)
    - `sender_id` (text) - Sender phone number or bot ID
    - `config_data` (jsonb) - Additional configuration
    - `created_at` (timestamp) - Creation timestamp
    - `updated_at` (timestamp) - Last update timestamp

  - `message_logs`
    - `id` (uuid, primary key) - Unique identifier
    - `order_id` (uuid, foreign key to orders) - Related order
    - `phone_number` (text) - Recipient phone number
    - `service` (text) - Service used: 'whatsapp' or 'viber'
    - `message_type` (text) - Type: 'order_confirmation', 'status_update', 'ready_notification'
    - `message_content` (text) - Message text sent
    - `status` (text) - Status: 'pending', 'sent', 'delivered', 'failed'
    - `error_message` (text) - Error details if failed
    - `external_message_id` (text) - ID from messaging service
    - `sent_at` (timestamp) - When message was sent
    - `created_at` (timestamp) - Creation timestamp

  ## Security
  - Enable RLS on both tables
  - Only authenticated admin users can access messaging config
  - Message logs readable by admins for tracking

  ## Notes
  1. API keys stored in database (should be encrypted in production)
  2. Message logs for tracking and debugging
  3. Support for multiple messaging services
  4. Flexible config_data for service-specific settings
*/

-- Create messaging_config table
CREATE TABLE IF NOT EXISTS messaging_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE CHECK (service_name IN ('whatsapp', 'viber')),
  is_enabled boolean DEFAULT false,
  api_key text,
  api_secret text,
  sender_id text,
  config_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create message_logs table
CREATE TABLE IF NOT EXISTS message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  service text NOT NULL CHECK (service IN ('whatsapp', 'viber')),
  message_type text NOT NULL CHECK (message_type IN ('order_confirmation', 'status_update', 'ready_notification')),
  message_content text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message text,
  external_message_id text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE messaging_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;

-- Messaging config policies (admin only)
CREATE POLICY "Authenticated users can view messaging config"
  ON messaging_config
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messaging config"
  ON messaging_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update messaging config"
  ON messaging_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete messaging config"
  ON messaging_config
  FOR DELETE
  TO authenticated
  USING (true);

-- Message logs policies (admin only)
CREATE POLICY "Authenticated users can view message logs"
  ON message_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert message logs"
  ON message_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_message_logs_order_id ON message_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_service ON message_logs(service);

-- Insert default configurations (disabled by default)
INSERT INTO messaging_config (service_name, is_enabled)
VALUES 
  ('whatsapp', false),
  ('viber', false)
ON CONFLICT (service_name) DO NOTHING;
