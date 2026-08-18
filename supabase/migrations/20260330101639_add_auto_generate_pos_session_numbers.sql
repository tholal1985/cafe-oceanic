/*
  # Add Auto-Generated POS Session Numbers

  1. Changes
    - Creates a function to auto-generate unique session numbers (SES-YYYYMMDD-XXXX format)
    - Creates a trigger to automatically set session_number when inserting new sessions
    - Makes session_number nullable with a default value set by trigger
    - Adds an index on session_number for faster lookups
  
  2. Security
    - Function is SECURITY DEFINER to allow operations
    - Trigger runs automatically, no manual intervention needed
  
  3. Format
    - Session numbers follow the pattern: SES-20260330-0001
    - XXXX is a daily sequence that resets each day
*/

-- Create a function to generate session numbers
CREATE OR REPLACE FUNCTION generate_session_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_date text;
  sequence_num integer;
  session_num text;
  max_num text;
BEGIN
  -- Get today's date in YYYYMMDD format
  today_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get the highest session number for today
  SELECT session_number INTO max_num
  FROM pos_sessions
  WHERE session_number LIKE 'SES-' || today_date || '-%'
  ORDER BY session_number DESC
  LIMIT 1;
  
  -- Extract sequence number or start from 1
  IF max_num IS NULL THEN
    sequence_num := 1;
  ELSE
    sequence_num := (substring(max_num from '[0-9]+$'))::integer + 1;
  END IF;
  
  -- Format the session number: SES-YYYYMMDD-XXXX
  session_num := 'SES-' || today_date || '-' || lpad(sequence_num::text, 4, '0');
  
  RETURN session_num;
END;
$$;

-- Create trigger function to auto-assign session number
CREATE OR REPLACE FUNCTION set_session_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_number IS NULL OR NEW.session_number = '' THEN
    NEW.session_number := generate_session_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_session_number ON pos_sessions;

-- Create trigger that fires before insert
CREATE TRIGGER trigger_set_session_number
  BEFORE INSERT ON pos_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_number();

-- Make session_number nullable (it will be set by trigger)
ALTER TABLE pos_sessions ALTER COLUMN session_number DROP NOT NULL;

-- Create index for faster session number lookups
CREATE INDEX IF NOT EXISTS idx_pos_sessions_session_number ON pos_sessions(session_number);

-- Update any existing sessions that might have NULL session_number
DO $$
DECLARE
  session_record RECORD;
  new_session_num text;
BEGIN
  FOR session_record IN 
    SELECT id FROM pos_sessions WHERE session_number IS NULL OR session_number = ''
  LOOP
    new_session_num := generate_session_number();
    UPDATE pos_sessions SET session_number = new_session_num WHERE id = session_record.id;
  END LOOP;
END $$;