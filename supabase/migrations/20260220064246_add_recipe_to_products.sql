/*
  # Add Recipe Field to Products

  1. Changes
    - Add `recipe` column to products table to store cooking instructions
    - Recipe is optional (nullable) text field
    - Allows chefs to view detailed cooking instructions in Kitchen Display

  2. Notes
    - Existing products will have NULL recipes by default
    - Admins can add/edit recipes through the Products management page
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'recipe'
  ) THEN
    ALTER TABLE products ADD COLUMN recipe text;
  END IF;
END $$;