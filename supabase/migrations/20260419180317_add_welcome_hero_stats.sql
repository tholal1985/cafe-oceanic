/*
  # Welcome Hero Stats

  1. New Tables
    - `welcome_hero_stats`
      - `id` (uuid, primary key)
      - `visits` (bigint) - total visit count
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS
    - Allow anonymous and authenticated users to read the single stats row
    - Allow anonymous and authenticated users to update the visits counter only

  3. Notes
    - This table stores a single singleton row tracking how many
      times the animated welcome hero screen has been viewed.
*/

CREATE TABLE IF NOT EXISTS welcome_hero_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visits bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE welcome_hero_stats ENABLE ROW LEVEL SECURITY;

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

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_hero_stats' AND policyname = 'Anyone can insert initial stats row'
  ) THEN
    CREATE POLICY "Anyone can insert initial stats row"
      ON welcome_hero_stats FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_hero_stats' AND policyname = 'Anyone can update visit counter'
  ) THEN
    CREATE POLICY "Anyone can update visit counter"
      ON welcome_hero_stats FOR UPDATE
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

INSERT INTO welcome_hero_stats (visits)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM welcome_hero_stats);
