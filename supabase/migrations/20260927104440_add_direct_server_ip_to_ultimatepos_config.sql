/*
# Add Direct Server IP field to UltimatePOS config

1. Modified Tables
- `ultimatepos_config`: Added `direct_server_ip` column (text, nullable)
  - When set, the sync function will connect to this IP address directly with a Host header,
    bypassing Cloudflare's bot challenge entirely.
  - When null, the sync function uses the api_url as before.

2. Security
- No RLS changes needed — this is an admin-only config table with existing policies.
*/

ALTER TABLE ultimatepos_config
ADD COLUMN IF NOT EXISTS direct_server_ip text;
