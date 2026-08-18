/*
  # Auto-Update POS Session Totals

  1. Changes
    - Creates a trigger to automatically update session totals when transactions are created
    - Updates total_sales and total_transactions in real-time
    - Ensures data integrity and consistency
  
  2. Security
    - Trigger runs automatically with proper permissions
    - Only updates the related session record
*/

-- Create function to update session totals
CREATE OR REPLACE FUNCTION update_pos_session_totals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update the session totals
  UPDATE pos_sessions
  SET 
    total_sales = total_sales + NEW.total_amount,
    total_transactions = total_transactions + 1,
    updated_at = now()
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_pos_session_totals ON pos_transactions;

-- Create trigger that fires after insert
CREATE TRIGGER trigger_update_pos_session_totals
  AFTER INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_pos_session_totals();