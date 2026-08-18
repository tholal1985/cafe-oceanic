/*
  # Extend welcome_hero_stats with display values

  1. Changes
    - Add `scope` (text, unique) for global config lookup
    - Add display stat columns (`rating`, `orders_served`, `average_checkout`, `happy_guests`)
    - Insert a default global row if missing

  2. Security
    - Keep existing RLS. Add SELECT policy for anon/authenticated if not present.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'welcome_hero_stats' AND column_name = 'scope'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD COLUMN scope text DEFAULT 'global';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'welcome_hero_stats' AND column_name = 'rating'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD COLUMN rating text DEFAULT '4.9';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'welcome_hero_stats' AND column_name = 'orders_served'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD COLUMN orders_served text DEFAULT '120k+';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'welcome_hero_stats' AND column_name = 'average_checkout'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD COLUMN average_checkout text DEFAULT '30s';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'welcome_hero_stats' AND column_name = 'happy_guests'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD COLUMN happy_guests text DEFAULT '98%';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'welcome_hero_stats_scope_key'
  ) THEN
    ALTER TABLE welcome_hero_stats ADD CONSTRAINT welcome_hero_stats_scope_key UNIQUE (scope);
  END IF;
END $$;

INSERT INTO welcome_hero_stats (scope, rating, orders_served, average_checkout, happy_guests)
VALUES ('global', '4.9', '120k+', '30s', '98%')
ON CONFLICT (scope) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_hero_stats' AND policyname = 'Anyone can read welcome hero stats'
  ) THEN
    CREATE POLICY "Anyone can read welcome hero stats"
      ON welcome_hero_stats FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
