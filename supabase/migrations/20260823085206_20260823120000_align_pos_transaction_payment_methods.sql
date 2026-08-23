/*
# Align POS transaction payment methods

1. Modified Tables
- `pos_transactions.payment_method`: update the validation rule to accept the payment methods currently offered by the POS screen: `cash`, `bank_transfer`, and `credit`.

2. Data Safety
- No rows, columns, or existing payment values are deleted or changed.
- The constraint is replaced only after removing the outdated validation rule.

3. Security
- No RLS policies or permissions are changed.

4. Notes
- This keeps POS checkout and transaction editing consistent with the existing orders payment-method rules.
*/

ALTER TABLE pos_transactions
  DROP CONSTRAINT IF EXISTS pos_transactions_payment_method_check;

ALTER TABLE pos_transactions
  ADD CONSTRAINT pos_transactions_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'credit'));