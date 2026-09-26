/*
# Add WooCommerce REST API keys

1. New Tables
- `woocommerce_api_keys`
  - `id` (uuid, primary key)
  - `description` (text, not null) - human-readable label for the key
  - `wp_user` (text, not null) - the WordPress/WooCommerce user this key belongs to
  - `permissions` (text, not null) - 'read', 'write', or 'read_write'
  - `consumer_key` (text, unique, not null) - the public key (ck_...)
  - `consumer_secret_hash` (text, not null) - SHA-256 hash of the secret; the plaintext secret is shown only once at creation
  - `consumer_key_prefix` (text, not null) - first 8 chars for safe display in lists
  - `is_active` (boolean, default true)
  - `last_used_at` (timestamptz)
  - `created_by` (uuid, references auth.users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `woocommerce_api_keys`.
- Admin-only CRUD (same pattern as existing `api_keys` table).
- The consumer secret is NEVER stored in plaintext — only its SHA-256 hash is persisted, so the database cannot leak usable secrets.

3. Notes
- The consumer_key is stored in full because it acts as a public identifier (like a username).
- The consumer_secret is shown once at creation time and must be copied immediately.
*/

CREATE TABLE IF NOT EXISTS woocommerce_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  wp_user text NOT NULL,
  permissions text NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'write', 'read_write')),
  consumer_key text UNIQUE NOT NULL,
  consumer_secret_hash text NOT NULL,
  consumer_key_prefix text NOT NULL,
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_woocommerce_api_keys_consumer_key ON woocommerce_api_keys(consumer_key);
CREATE INDEX IF NOT EXISTS idx_woocommerce_api_keys_is_active ON woocommerce_api_keys(is_active);

ALTER TABLE woocommerce_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view WooCommerce API keys" ON woocommerce_api_keys;
CREATE POLICY "Admins can view WooCommerce API keys"
  ON woocommerce_api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can create WooCommerce API keys" ON woocommerce_api_keys;
CREATE POLICY "Admins can create WooCommerce API keys"
  ON woocommerce_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update WooCommerce API keys" ON woocommerce_api_keys;
CREATE POLICY "Admins can update WooCommerce API keys"
  ON woocommerce_api_keys FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete WooCommerce API keys" ON woocommerce_api_keys;
CREATE POLICY "Admins can delete WooCommerce API keys"
  ON woocommerce_api_keys FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );