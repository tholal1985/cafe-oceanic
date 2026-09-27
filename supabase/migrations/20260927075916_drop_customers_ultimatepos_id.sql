/*
# Drop remaining ultimatepos_id column from customers

The customers table still has an ultimatepos_id column from a previous migration.
This drops it to complete the UltimatePOS removal.
*/

ALTER TABLE customers DROP COLUMN IF EXISTS ultimatepos_id;
