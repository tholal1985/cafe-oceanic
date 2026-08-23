/*
  # Add System Settings and Currency Configuration

  1. New Tables
    - `system_settings`
      - `id` (uuid, primary key)
      - `setting_key` (text, unique) - Setting identifier
      - `setting_value` (jsonb) - Setting value (flexible structure)
      - `setting_type` (text) - Type of setting (currency, general, etc.)
      - `description` (text) - Human-readable description
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `system_settings` table
    - Add policy for admins to manage system settings
    - Add policy for authenticated users to read settings

  3. Default Data
    - Insert default currency setting (MVR)
    - Insert default tax rate setting
    - Insert default service charge setting

  4. Changes
    - Centralized system configuration
    - Support for multiple currencies with proper formatting
    - ISO 4217 currency codes
*/

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  setting_type text NOT NULL DEFAULT 'general',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policies for system_settings
CREATE POLICY "Authenticated users can read system settings"
  ON system_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage system settings"
  ON system_settings
  FOR ALL
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

-- Allow anonymous users to read currency settings (needed for kiosk)
CREATE POLICY "Anonymous users can read currency settings"
  ON system_settings
  FOR SELECT
  TO anon
  USING (setting_key = 'currency');

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
VALUES
  (
    'currency',
    '{
      "code": "MVR",
      "symbol": "MVR",
      "name": "Maldivian Rufiyaa",
      "decimal_places": 2,
      "symbol_position": "before",
      "thousand_separator": ",",
      "decimal_separator": "."
    }'::jsonb,
    'currency',
    'Default currency for the restaurant'
  ),
  (
    'tax_rate',
    '{
      "enabled": false,
      "rate": 0,
      "name": "GST",
      "included_in_price": false
    }'::jsonb,
    'financial',
    'Tax rate configuration'
  ),
  (
    'service_charge',
    '{
      "enabled": false,
      "rate": 0,
      "name": "Service Charge"
    }'::jsonb,
    'financial',
    'Service charge configuration'
  )
ON CONFLICT (setting_key) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS system_settings_updated_at ON system_settings;
CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_type ON system_settings(setting_type);
