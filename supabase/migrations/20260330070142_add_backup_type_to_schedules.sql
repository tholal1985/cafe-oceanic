/*
  # Add Backup Type to Schedules

  1. Changes
    - Add `backup_type` column to `backup_schedules` table
      - Values: 'full' (default) or 'incremental'
      - Determines whether scheduled backups are full or incremental

  2. Notes
    - Full backups include all data regardless of date
    - Incremental backups may only include recent changes (future enhancement)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'backup_schedules' AND column_name = 'backup_type'
  ) THEN
    ALTER TABLE backup_schedules
    ADD COLUMN backup_type text DEFAULT 'full' CHECK (backup_type IN ('full', 'incremental'));
  END IF;
END $$;
