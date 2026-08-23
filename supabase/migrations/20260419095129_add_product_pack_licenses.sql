/*
  # Product Pack License System

  1. New Tables
    - `product_pack_licenses`
      - `id` (uuid) primary key
      - `pack_id` (uuid) reference to product_packs (nullable for external packs)
      - `pack_name` (text) snapshot of pack name
      - `license_key` (text, unique) human-readable key shown to user
      - `licensed_to` (text) tenant/company name
      - `issued_by` (text) issuer (vendor) name
      - `issued_at` (timestamptz) when license was issued
      - `activated_at` (timestamptz) when activated on this install
      - `starts_at` (timestamptz) not_before
      - `expires_at` (timestamptz) hard expiry
      - `grace_period_days` (int) extra tolerance after expiry
      - `status` (text) active | expired | revoked | suspended | pending
      - `max_activations` (int) device cap
      - `current_activations` (int) used
      - `device_fingerprint` (text) binding
      - `features` (jsonb) feature flags shipped in license
      - `signature` (text) base64 signature of payload
      - `notes` (text) admin notes
      - `last_verified_at` (timestamptz) last online check
      - `created_at`, `updated_at`
    - `product_pack_license_events`
      - Audit log of license operations (issued, activated, verified, expired, revoked, renewed)

  2. Security
    - Enable RLS on both tables
    - Only authenticated admin users can read/write licenses
    - Events readable by authenticated admins; insert via trigger + backend

  3. Logic
    - Auto-update `status` to 'expired' for rows where now() > expires_at + grace
    - Trigger writes `updated_at` and logs status changes into events

  4. Indexes
    - license_key unique, pack_id, status, expires_at
*/

CREATE TABLE IF NOT EXISTS product_pack_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid REFERENCES product_packs(id) ON DELETE SET NULL,
  pack_name text NOT NULL DEFAULT '',
  license_key text UNIQUE NOT NULL,
  licensed_to text NOT NULL DEFAULT '',
  issued_by text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  grace_period_days int NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'active',
  max_activations int NOT NULL DEFAULT 1,
  current_activations int NOT NULL DEFAULT 0,
  device_fingerprint text DEFAULT '',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text DEFAULT '',
  notes text DEFAULT '',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_pack_licenses_status_check
    CHECK (status IN ('active','expired','revoked','suspended','pending'))
);

CREATE INDEX IF NOT EXISTS idx_ppl_pack_id ON product_pack_licenses(pack_id);
CREATE INDEX IF NOT EXISTS idx_ppl_status ON product_pack_licenses(status);
CREATE INDEX IF NOT EXISTS idx_ppl_expires_at ON product_pack_licenses(expires_at);

ALTER TABLE product_pack_licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view licenses"
  ON product_pack_licenses FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can insert licenses"
  ON product_pack_licenses FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can update licenses"
  ON product_pack_licenses FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can delete licenses"
  ON product_pack_licenses FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE TABLE IF NOT EXISTS product_pack_license_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES product_pack_licenses(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_message text DEFAULT '',
  event_meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppl_events_type_check
    CHECK (event_type IN ('issued','activated','verified','expired','revoked','renewed','suspended','reactivated','deleted'))
);

CREATE INDEX IF NOT EXISTS idx_ppl_events_license ON product_pack_license_events(license_id);
CREATE INDEX IF NOT EXISTS idx_ppl_events_created ON product_pack_license_events(created_at DESC);

ALTER TABLE product_pack_license_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view license events"
  ON product_pack_license_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY "Admins can insert license events"
  ON product_pack_license_events FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE OR REPLACE FUNCTION set_ppl_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppl_updated_at ON product_pack_licenses;
CREATE TRIGGER trg_ppl_updated_at
  BEFORE UPDATE ON product_pack_licenses
  FOR EACH ROW EXECUTE FUNCTION set_ppl_updated_at();

CREATE OR REPLACE FUNCTION compute_license_status(expires timestamptz, grace int, current_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF current_status IN ('revoked','suspended') THEN
    RETURN current_status;
  END IF;
  IF now() > (expires + (grace || ' days')::interval) THEN
    RETURN 'expired';
  END IF;
  RETURN 'active';
END;
$$;

CREATE OR REPLACE VIEW product_pack_licenses_view AS
SELECT
  l.*,
  GREATEST(0, EXTRACT(EPOCH FROM (l.expires_at - now())) / 86400)::int AS days_remaining,
  (now() > l.expires_at) AS is_expired,
  (now() > (l.expires_at + (l.grace_period_days || ' days')::interval)) AS is_past_grace
FROM product_pack_licenses l;
