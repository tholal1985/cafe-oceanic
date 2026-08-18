/*
  # Add Auto-Generated POS Transaction Numbers

  1. Changes
    - Creates a function to auto-generate unique transaction numbers (TXN-YYYYMMDD-XXXX format)
    - Creates a trigger to automatically set transaction_number when inserting new transactions
    - Makes transaction_number nullable with a default value set by trigger
    - Adds an index on transaction_number for faster lookups
  
  2. Security
    - Function is SECURITY DEFINER to allow operations
    - Trigger runs automatically, no manual intervention needed
  
  3. Format
    - Transaction numbers follow the pattern: TXN-20260330-0001
    - XXXX is a daily sequence that resets each day
*/

-- Create a function to generate transaction numbers
CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_date text;
  sequence_num integer;
  transaction_num text;
  max_num text;
BEGIN
  -- Get today's date in YYYYMMDD format
  today_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get the highest transaction number for today
  SELECT transaction_number INTO max_num
  FROM pos_transactions
  WHERE transaction_number LIKE 'TXN-' || today_date || '-%'
  ORDER BY transaction_number DESC
  LIMIT 1;
  
  -- Extract sequence number or start from 1
  IF max_num IS NULL THEN
    sequence_num := 1;
  ELSE
    sequence_num := (substring(max_num from '[0-9]+$'))::integer + 1;
  END IF;
  
  -- Format the transaction number: TXN-YYYYMMDD-XXXX
  transaction_num := 'TXN-' || today_date || '-' || lpad(sequence_num::text, 4, '0');
  
  RETURN transaction_num;
END;
$$;

-- Create trigger function to auto-assign transaction number
CREATE OR REPLACE FUNCTION set_transaction_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = '' THEN
    NEW.transaction_number := generate_transaction_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_transaction_number ON pos_transactions;

-- Create trigger that fires before insert
CREATE TRIGGER trigger_set_transaction_number
  BEFORE INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_transaction_number();

-- Make transaction_number nullable (it will be set by trigger)
ALTER TABLE pos_transactions ALTER COLUMN transaction_number DROP NOT NULL;

-- Create index for faster transaction number lookups
CREATE INDEX IF NOT EXISTS idx_pos_transactions_transaction_number ON pos_transactions(transaction_number);

-- Update any existing transactions that might have NULL transaction_number
DO $$
DECLARE
  transaction_record RECORD;
  new_transaction_num text;
BEGIN
  FOR transaction_record IN 
    SELECT id FROM pos_transactions WHERE transaction_number IS NULL OR transaction_number = ''
  LOOP
    new_transaction_num := generate_transaction_number();
    UPDATE pos_transactions SET transaction_number = new_transaction_num WHERE id = transaction_record.id;
  END LOOP;
END $$;