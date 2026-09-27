/*
# Add Personal Access Token mode for UltimatePOS

## Purpose
Adds support for authenticating with UltimatePOS using a Personal Access Token (PAT)
instead of the OAuth password grant. This bypasses the Cloudflare-protected /oauth/token
endpoint entirely, since the PAT is generated from the user's browser (which passes
Cloudflare) and used directly as a Bearer token for all API calls.

## Modified Tables

### ultimatepos_config
- Added `auth_mode` (text, default 'oauth') — 'oauth' for password grant, 'pat' for personal access token
- Added `personal_access_token` (text, nullable) — the PAT generated from UltimatePOS admin panel

## Security
- No RLS changes needed (existing policies already cover the new columns)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ultimatepos_config' AND column_name = 'auth_mode'
  ) THEN
    ALTER TABLE ultimatepos_config ADD COLUMN auth_mode text NOT NULL DEFAULT 'oauth';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ultimatepos_config' AND column_name = 'personal_access_token'
  ) THEN
    ALTER TABLE ultimatepos_config ADD COLUMN personal_access_token text;
  END IF;
END $$;
