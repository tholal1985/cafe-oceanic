/*
  # Kiosk Lock System

  ## Summary
  Creates a comprehensive kiosk lock system that allows administrators to lock categories 
  during specific time periods to prevent online orders.

  ## Features
  1. Lock all categories globally or specific categories
  2. Set time-based locks (start time to end time)
  3. Set day-based locks (specific days of the week)
  4. Enable/disable locks without deleting them
  5. Multiple lock schedules can exist simultaneously

  ## New Tables
    - `kiosk_lock_settings`
      - `id` (uuid, primary key)
      - `name` (text) - Descriptive name for the lock rule
      - `lock_type` (text) - 'all' or 'specific' categories
      - `locked_category_ids` (uuid[]) - Array of category IDs to lock (null if lock_type = 'all')
      - `start_time` (time) - Daily start time for lock (e.g., '12:30:00')
      - `end_time` (time) - Daily end time for lock (e.g., '23:30:00')
      - `days_of_week` (integer[]) - Days when lock is active (0=Sunday, 1=Monday, ..., 6=Saturday)
      - `is_active` (boolean) - Whether this lock rule is currently active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## Security
    - Enable RLS on `kiosk_lock_settings` table
    - Admins can manage all lock settings
    - Public (anonymous) can read active locks to check availability

  ## Notes
    - Time ranges can span midnight (e.g., 23:00 to 02:00 means lock from 11 PM to 2 AM next day)
    - Empty days_of_week array means lock applies every day
    - Empty locked_category_ids with lock_type='all' locks everything
*/

-- Create kiosk_lock_settings table
CREATE TABLE IF NOT EXISTS kiosk_lock_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lock_type text NOT NULL CHECK (lock_type IN ('all', 'specific')),
  locked_category_ids uuid[] DEFAULT '{}',
  start_time time NOT NULL,
  end_time time NOT NULL,
  days_of_week integer[] DEFAULT '{}' CHECK (
    days_of_week <@ ARRAY[0,1,2,3,4,5,6]
  ),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_kiosk_lock_active ON kiosk_lock_settings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_kiosk_lock_category_ids ON kiosk_lock_settings USING gin(locked_category_ids);

-- Enable RLS
ALTER TABLE kiosk_lock_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read active lock settings (needed to check if ordering is allowed)
CREATE POLICY "Anyone can view active kiosk locks"
  ON kiosk_lock_settings
  FOR SELECT
  USING (is_active = true);

-- Policy: Admins can view all lock settings
CREATE POLICY "Admins can view all kiosk locks"
  ON kiosk_lock_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name = 'admin'
      AND ura.is_active = true
    )
  );

-- Policy: Admins can insert lock settings
CREATE POLICY "Admins can create kiosk locks"
  ON kiosk_lock_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name = 'admin'
      AND ura.is_active = true
    )
  );

-- Policy: Admins can update lock settings
CREATE POLICY "Admins can update kiosk locks"
  ON kiosk_lock_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name = 'admin'
      AND ura.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name = 'admin'
      AND ura.is_active = true
    )
  );

-- Policy: Admins can delete lock settings
CREATE POLICY "Admins can delete kiosk locks"
  ON kiosk_lock_settings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name = 'admin'
      AND ura.is_active = true
    )
  );

-- Function to check if a category is currently locked
CREATE OR REPLACE FUNCTION is_category_locked(category_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_day integer;
  check_time time;
  is_locked boolean;
BEGIN
  -- Get current day of week (0=Sunday, 6=Saturday)
  current_day := EXTRACT(DOW FROM CURRENT_TIMESTAMP);
  check_time := CURRENT_TIME;

  -- Check if any active lock rule applies
  SELECT EXISTS (
    SELECT 1
    FROM kiosk_lock_settings
    WHERE is_active = true
    AND (
      -- Check if today is in the days_of_week array (empty array means all days)
      (array_length(days_of_week, 1) IS NULL OR current_day = ANY(days_of_week))
    )
    AND (
      -- Check time range
      CASE
        -- Normal time range (e.g., 09:00 to 17:00)
        WHEN start_time <= end_time THEN
          check_time >= start_time AND check_time <= end_time
        -- Time range spanning midnight (e.g., 23:00 to 02:00)
        ELSE
          check_time >= start_time OR check_time <= end_time
      END
    )
    AND (
      -- Check if this lock applies to the category
      lock_type = 'all' OR category_id_param = ANY(locked_category_ids)
    )
  ) INTO is_locked;

  RETURN COALESCE(is_locked, false);
END;
$$;

-- Function to get all currently locked category IDs
CREATE OR REPLACE FUNCTION get_locked_category_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  current_day integer;
  check_time time;
  locked_ids uuid[];
  all_categories_locked boolean;
BEGIN
  current_day := EXTRACT(DOW FROM CURRENT_TIMESTAMP);
  check_time := CURRENT_TIME;

  -- Check if there's an active "lock all" rule
  SELECT EXISTS (
    SELECT 1
    FROM kiosk_lock_settings
    WHERE is_active = true
    AND lock_type = 'all'
    AND (array_length(days_of_week, 1) IS NULL OR current_day = ANY(days_of_week))
    AND (
      CASE
        WHEN start_time <= end_time THEN
          check_time >= start_time AND check_time <= end_time
        ELSE
          check_time >= start_time OR check_time <= end_time
      END
    )
  ) INTO all_categories_locked;

  IF all_categories_locked THEN
    -- Return all category IDs
    SELECT array_agg(id) INTO locked_ids FROM categories;
  ELSE
    -- Return specific locked categories
    SELECT array_agg(DISTINCT unnest_id)
    FROM (
      SELECT unnest(locked_category_ids) as unnest_id
      FROM kiosk_lock_settings
      WHERE is_active = true
      AND lock_type = 'specific'
      AND (array_length(days_of_week, 1) IS NULL OR current_day = ANY(days_of_week))
      AND (
        CASE
          WHEN start_time <= end_time THEN
            check_time >= start_time AND check_time <= end_time
          ELSE
            check_time >= start_time OR check_time <= end_time
        END
      )
    ) AS unlocked_categories
    INTO locked_ids;
  END IF;

  RETURN COALESCE(locked_ids, ARRAY[]::uuid[]);
END;
$$;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kiosk_lock_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_kiosk_lock_timestamp
  BEFORE UPDATE ON kiosk_lock_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_kiosk_lock_updated_at();
