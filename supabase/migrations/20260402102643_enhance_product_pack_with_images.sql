/*
  # Enhanced Product Pack System with Image Storage
  
  ## Overview
  This migration enhances the product pack system to include comprehensive image storage,
  making it a complete marketplace-ready solution similar to Shopify themes or WooCommerce packages.
  
  ## 1. Storage Bucket Configuration
  - Creates a dedicated storage bucket for product pack images
  - Implements proper access policies for secure image handling
  
  ## 2. Enhanced Pack Data Structure
  The pack_data JSONB now includes:
  ```json
  {
    "version": "2.0.0",
    "exported_at": "ISO timestamp",
    "metadata": {
      "name": "Premium Restaurant Pack",
      "author": "Restaurant Name",
      "description": "Complete restaurant menu with images",
      "thumbnail": "base64 or url",
      "tags": ["restaurant", "food", "premium"]
    },
    "images": {
      "product_images": [
        {
          "product_id": "original-uuid",
          "image_url": "original url",
          "image_data": "base64 encoded image",
          "file_name": "pizza.jpg",
          "content_type": "image/jpeg"
        }
      ],
      "category_images": [...],
      "addon_images": [...]
    },
    "categories": [...],
    "products": [...],
    "addons": [...],
    "product_categories": [...],
    "product_addons": [...],
    "upsell_suggestions": [...],
    "promotional_gifts": [...]
  }
  ```
  
  ## 3. New Tables
  
  ### `product_pack_images`
  Temporary storage for images during pack creation/download
  - `id` (uuid, primary key)
  - `pack_id` (uuid, references product_packs)
  - `entity_type` (text) - 'product', 'category', 'addon'
  - `entity_id` (uuid) - Original entity ID
  - `image_url` (text) - Original image URL
  - `storage_path` (text) - Path in Supabase storage
  - `file_name` (text) - Original file name
  - `content_type` (text) - MIME type
  - `file_size` (integer) - Size in bytes
  - `created_at` (timestamptz)
  
  ## 4. Features
  - Base64 image embedding for offline packs
  - Storage bucket integration for large packs
  - Image compression and optimization metadata
  - Version 2.0.0 format for enhanced compatibility
  - Marketplace metadata (author, tags, ratings)
  
  ## 5. Security
  - RLS policies for image access
  - Secure storage bucket policies
  - Size limits and file type validation
*/

-- Create storage bucket for product pack images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-pack-images',
  'product-pack-images',
  false,
  10485760, -- 10MB limit per file
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create product_pack_images table for image metadata
CREATE TABLE IF NOT EXISTS product_pack_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid REFERENCES product_packs(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('product', 'category', 'addon', 'thumbnail')),
  entity_id uuid,
  image_url text,
  storage_path text,
  file_name text NOT NULL,
  content_type text NOT NULL,
  file_size integer DEFAULT 0,
  image_data text, -- Base64 encoded image for portability
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_pack_images_pack_id ON product_pack_images(pack_id);
CREATE INDEX IF NOT EXISTS idx_product_pack_images_entity ON product_pack_images(entity_type, entity_id);

-- Enable RLS
ALTER TABLE product_pack_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_pack_images
CREATE POLICY "Authenticated users can view pack images"
  ON product_pack_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert pack images"
  ON product_pack_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

CREATE POLICY "Admin users can delete pack images"
  ON product_pack_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

-- Storage bucket policies
CREATE POLICY "Authenticated users can view pack images in storage"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-pack-images');

CREATE POLICY "Admin users can upload pack images to storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-pack-images' AND
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

CREATE POLICY "Admin users can delete pack images from storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-pack-images' AND
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      JOIN user_roles ur ON ura.role_id = ur.id
      WHERE ura.user_id = auth.uid()
      AND ur.name IN ('admin', 'owner')
      AND ura.is_active = true
    )
  );

-- Function to clean up pack images when pack is deleted
CREATE OR REPLACE FUNCTION cleanup_pack_images()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete associated images from storage
  DELETE FROM storage.objects
  WHERE bucket_id = 'product-pack-images'
  AND name LIKE OLD.id || '/%';
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_cleanup_pack_images
  BEFORE DELETE ON product_packs
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_pack_images();

-- Add downloadable flag and marketplace metadata to product_packs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'is_downloadable'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN is_downloadable boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'download_count'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN download_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN file_size bigint DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN thumbnail_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'tags'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN tags text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_packs' AND column_name = 'author'
  ) THEN
    ALTER TABLE product_packs ADD COLUMN author text;
  END IF;
END $$;

-- Create index on tags for searching
CREATE INDEX IF NOT EXISTS idx_product_packs_tags ON product_packs USING gin(tags);

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_pack_download()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.operation_type = 'export' AND NEW.operation_status = 'success' THEN
    UPDATE product_packs
    SET download_count = download_count + 1
    WHERE id = NEW.pack_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_increment_pack_download
  AFTER INSERT ON product_pack_history
  FOR EACH ROW
  EXECUTE FUNCTION increment_pack_download();
