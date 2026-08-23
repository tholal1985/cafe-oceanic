ALTER TABLE ultimatepos_config
  ADD COLUMN IF NOT EXISTS api_username text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS api_password text NOT NULL DEFAULT '';