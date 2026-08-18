/*
  # Auto-Update Customer Stats on Purchase

  1. Changes
    - Creates a trigger to automatically update customer stats when POS transactions are created
    - Updates total_visits and total_spent in real-time
    - Ensures data integrity and consistency
  
  2. Security
    - Trigger runs automatically with proper permissions
    - Only updates when customer_id is present
*/

-- Create function to update customer stats
CREATE OR REPLACE FUNCTION update_customer_stats_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update if customer_id is present
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE customers
    SET 
      total_visits = total_visits + 1,
      total_spent = total_spent + NEW.total_amount,
      last_visit_date = now(),
      updated_at = now()
    WHERE id = NEW.customer_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_customer_stats ON pos_transactions;

-- Create trigger that fires after insert
CREATE TRIGGER trigger_update_customer_stats
  AFTER INSERT ON pos_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_stats_on_purchase();