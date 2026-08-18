ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ultimatepos_id integer,
  ADD COLUMN IF NOT EXISTS ultimatepos_variation_id integer;