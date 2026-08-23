/*
  # Add SMS Messaging Support (Ooredoo)

  ## Overview
  Extends the messaging system to support SMS via Ooredoo API,
  providing a third communication channel for order notifications.

  ## Changes
  - Add 'sms' as a valid service_name option in messaging_config
  - Add 'sms' as a valid service option in message_logs
  - Insert default SMS configuration

  ## Notes
  1. SMS works without requiring customers to join/subscribe
  2. Direct delivery to any mobile number
  3. Ideal for customers without WhatsApp/Viber
  4. Works with Ooredoo SMS Gateway API
*/

-- Update messaging_config to support SMS
DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'messaging_config_service_name_check' 
    AND table_name = 'messaging_config'
  ) THEN
    ALTER TABLE messaging_config DROP CONSTRAINT messaging_config_service_name_check;
  END IF;
  
  -- Add new constraint with SMS support
  ALTER TABLE messaging_config ADD CONSTRAINT messaging_config_service_name_check 
    CHECK (service_name IN ('whatsapp', 'viber', 'sms'));
END $$;

-- Update message_logs to support SMS
DO $$ 
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'message_logs_service_check' 
    AND table_name = 'message_logs'
  ) THEN
    ALTER TABLE message_logs DROP CONSTRAINT message_logs_service_check;
  END IF;
  
  -- Add new constraint with SMS support
  ALTER TABLE message_logs ADD CONSTRAINT message_logs_service_check 
    CHECK (service IN ('whatsapp', 'viber', 'sms'));
END $$;

-- Insert default SMS configuration
INSERT INTO messaging_config (service_name, is_enabled)
VALUES ('sms', false)
ON CONFLICT (service_name) DO NOTHING;
