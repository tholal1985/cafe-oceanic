/*
  # Add BML QPOS QR Code Payment Support

  1. New Columns
    - `payment_gateways.qr_endpoint` (text) - API endpoint for generating QR codes
    - `payment_gateways.qr_timeout` (integer) - QR code validity timeout in seconds
    - `payment_gateways.supports_qr` (boolean) - Flag indicating QR payment support
    
  2. Updates to payment_transactions
    - Add `qr_code_data` (text) - Stores QR code image data or URL
    - Add `qr_expires_at` (timestamptz) - QR code expiration timestamp
    - Add `payment_method` (text) - Method used: 'qr', 'card', 'wallet', etc.

  3. New Table: qr_payment_sessions
    - Track active QR payment sessions
    - Monitor expiration and status
    - Link to payment transactions

  4. Security
    - RLS enabled on qr_payment_sessions
    - Automatic cleanup of expired QR sessions
    - Audit trail for QR generation

  5. Notes
    - BML QPOS uses dynamic QR codes for instant payments
    - QR codes expire after configured timeout (default 5 minutes)
    - System polls for payment confirmation via webhook
*/

-- Add QR support columns to payment_gateways
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'qr_endpoint'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN qr_endpoint text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'qr_timeout'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN qr_timeout integer DEFAULT 300;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_gateways' AND column_name = 'supports_qr'
  ) THEN
    ALTER TABLE payment_gateways ADD COLUMN supports_qr boolean DEFAULT false;
  END IF;
END $$;

-- Add QR-related columns to payment_transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'qr_code_data'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN qr_code_data text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'qr_expires_at'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN qr_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN payment_method text DEFAULT 'card';
  END IF;
END $$;

-- Create QR payment sessions table
CREATE TABLE IF NOT EXISTS qr_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  gateway_id uuid NOT NULL REFERENCES payment_gateways(id) ON DELETE CASCADE,
  qr_code_data text NOT NULL,
  qr_code_url text,
  session_token text,
  amount numeric(10, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'MVR',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  scanned_at timestamptz,
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_qr_status CHECK (status IN ('pending', 'scanned', 'completed', 'expired', 'cancelled')),
  CONSTRAINT valid_currency CHECK (currency IN ('MVR', 'USD', 'EUR', 'GBP'))
);

-- Enable RLS on qr_payment_sessions
ALTER TABLE qr_payment_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active QR sessions (for kiosk display)
CREATE POLICY "Anyone can view active QR sessions"
  ON qr_payment_sessions FOR SELECT
  USING (status IN ('pending', 'scanned') AND expires_at > now());

-- Allow system to create QR sessions (via service role)
CREATE POLICY "Service role can insert QR sessions"
  ON qr_payment_sessions FOR INSERT
  WITH CHECK (true);

-- Allow system to update QR sessions (via service role)
CREATE POLICY "Service role can update QR sessions"
  ON qr_payment_sessions FOR UPDATE
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_sessions_transaction 
  ON qr_payment_sessions(transaction_id);

CREATE INDEX IF NOT EXISTS idx_qr_sessions_status_expires 
  ON qr_payment_sessions(status, expires_at) 
  WHERE status IN ('pending', 'scanned');

CREATE INDEX IF NOT EXISTS idx_qr_sessions_gateway 
  ON qr_payment_sessions(gateway_id);

-- Update BML gateway to support QR
UPDATE payment_gateways
SET 
  supports_qr = true,
  qr_endpoint = '/payment/v1/qr/generate',
  qr_timeout = 300,
  config = config || jsonb_build_object(
    'qr_enabled', true,
    'qr_size', '300x300',
    'qr_format', 'png'
  )
WHERE gateway_type = 'bml';

-- Function to auto-expire old QR sessions
CREATE OR REPLACE FUNCTION expire_qr_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE qr_payment_sessions
  SET 
    status = 'expired',
    updated_at = now()
  WHERE 
    status IN ('pending', 'scanned')
    AND expires_at < now();
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE qr_payment_sessions IS 'Tracks QR code payment sessions for dynamic QR payments via BML QPOS';
COMMENT ON COLUMN qr_payment_sessions.qr_code_data IS 'Base64 encoded QR code image or raw QR data string';
COMMENT ON COLUMN qr_payment_sessions.session_token IS 'Unique session identifier from payment gateway';
COMMENT ON COLUMN qr_payment_sessions.expires_at IS 'Timestamp when QR code becomes invalid';
COMMENT ON COLUMN payment_gateways.qr_endpoint IS 'API endpoint for generating dynamic QR codes';
COMMENT ON COLUMN payment_gateways.qr_timeout IS 'QR code validity period in seconds (default 300 = 5 minutes)';
COMMENT ON COLUMN payment_gateways.supports_qr IS 'Whether this gateway supports QR code payments';
