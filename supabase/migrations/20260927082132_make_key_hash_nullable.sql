/*
# Make key_hash and key_prefix nullable

The original api_keys table had NOT NULL on key_hash and key_prefix.
Since we switched to consumer_key + consumer_secret authentication,
these columns are no longer used for new keys and must be nullable.
*/

ALTER TABLE api_keys
  ALTER COLUMN key_hash DROP NOT NULL,
  ALTER COLUMN key_prefix DROP NOT NULL;
