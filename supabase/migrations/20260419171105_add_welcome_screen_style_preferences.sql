/*
  # Welcome Screen Style Preferences

  Stores the active welcome-screen visual style chosen by users.

  1. New Tables
    - `welcome_screen_preferences`
      - `id` (uuid, primary key)
      - `scope` (text, unique) - "global" or a user/session identifier
      - `style_id` (text) - one of: minimalist, dark, gradient, corporate, creative, classic
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - Public (anon + authenticated) SELECT on the single "global" row
    - Only authenticated users may insert/update the global preference
*/

CREATE TABLE IF NOT EXISTS welcome_screen_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text UNIQUE NOT NULL DEFAULT 'global',
  style_id text NOT NULL DEFAULT 'minimalist',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE welcome_screen_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_screen_preferences'
      AND policyname = 'Anyone can read welcome style preference'
  ) THEN
    CREATE POLICY "Anyone can read welcome style preference"
      ON welcome_screen_preferences FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_screen_preferences'
      AND policyname = 'Authenticated users can insert welcome style preference'
  ) THEN
    CREATE POLICY "Authenticated users can insert welcome style preference"
      ON welcome_screen_preferences FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'welcome_screen_preferences'
      AND policyname = 'Authenticated users can update welcome style preference'
  ) THEN
    CREATE POLICY "Authenticated users can update welcome style preference"
      ON welcome_screen_preferences FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

INSERT INTO welcome_screen_preferences (scope, style_id)
VALUES ('global', 'minimalist')
ON CONFLICT (scope) DO NOTHING;
