ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS api_token text NOT NULL DEFAULT '';
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'oauth';