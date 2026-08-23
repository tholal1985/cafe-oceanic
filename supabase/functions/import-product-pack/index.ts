import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ImportRequest {
  packId?: string;
  packData?: any;
  zipFile?: string;
  conflictStrategy?: 'skip' | 'overwrite' | 'rename';
  clearExisting?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify user has admin role
    const { data: roleData } = await supabase
      .from('user_role_assignments')
      .select('role_id, user_roles(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    const isAdmin = roleData?.user_roles?.name === 'admin' || roleData?.user_roles?.name === 'owner';

    if (!isAdmin) {
      throw new Error('Admin access required');
    }

    const requestData: ImportRequest = await req.json();
    const {
      packId,
      packData: providedPackData,
      zipFile,
      conflictStrategy = 'skip',
      clearExisting = false
    } = requestData;

    let packData;
    let imageFiles = new Map<string, Uint8Array>();

    // Get pack data either from database, ZIP file, or JSON
    if (packId) {
      const { data: pack, error: packError } = await supabase
        .from('product_packs')
        .select('pack_data, checksum')
        .eq('id', packId)
        .maybeSingle();

      if (packError || !pack) {
        throw new Error('Product pack not found');
      }

      packData = pack.pack_data;
    } else if (zipFile) {
      const zipData = Uint8Array.from(atob(zipFile), c => c.charCodeAt(0));
      const zip = await JSZip.loadAsync(zipData);

      const packDataFile = zip.file('pack_data.json');
      if (!packDataFile) {
        throw new Error('pack_data.json not found in ZIP file');
      }

      const packDataText = await packDataFile.async('text');
      packData = JSON.parse(packDataText);

      const imagesFolder = zip.folder('images');
      if (imagesFolder) {
        const imagePromises = [];
        imagesFolder.forEach((relativePath, file) => {
          if (!file.dir) {
            imagePromises.push(
              file.async('uint8array').then(data => {
                imageFiles.set(relativePath, data);
              })
            );
          }
        });
        await Promise.all(imagePromises);
      }
    } else if (providedPackData) {
      packData = providedPackData;
    } else {
      throw new Error('Either packId, zipFile, or packData must be provided');
    }

    // Validate pack data structure
    if (!packData.version || !packData.products) {
      throw new Error('Invalid pack data structure');
    }

    const importStats = {
      categories_imported: 0,
      categories_skipped: 0,
      products_imported: 0,
      products_skipped: 0,
      addons_imported: 0,
      addons_skipped: 0,
      upsells_imported: 0,
      gifts_imported: 0,
      images_uploaded: 0,
      errors: [] as string[]
    };

    // Map to track old IDs to new IDs
    const categoryIdMap = new Map<string, string>();
    const productIdMap = new Map<string, string>();
    const addonIdMap = new Map<string, string>();

    // Clear existing data if requested
    if (clearExisting) {
      await supabase.from('promotional_gifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('upsell_suggestions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('product_addons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('product_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('addons').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }

    // Import categories
    if (packData.categories && Array.isArray(packData.categories)) {
      for (const category of packData.categories) {
        const { data: existing } = await supabase
          .from('categories')
          .select('id')
          .eq('name', category.name)
          .maybeSingle();

        if (existing && conflictStrategy === 'skip') {
          categoryIdMap.set(category.original_id, existing.id);
          importStats.categories_skipped++;
          continue;
        }

        const categoryData: any = {
          name: conflictStrategy === 'rename' && existing ? `${category.name} (imported)` : category.name,
          display_order: category.display_order,
          is_active: category.is_active
        };

        if (existing && conflictStrategy === 'overwrite') {
          const { data: updated } = await supabase
            .from('categories')
            .update(categoryData)
            .eq('id', existing.id)
            .select()
            .single();

          if (updated) {
            categoryIdMap.set(category.original_id, updated.id);
            importStats.categories_imported++;
          }
        } else {
          const { data: inserted, error } = await supabase
            .from('categories')
            .insert(categoryData)
            .select()
            .single();

          if (error) {
            importStats.errors.push(`Category "${category.name}": ${error.message}`);
          } else if (inserted) {
            categoryIdMap.set(category.original_id, inserted.id);
            importStats.categories_imported++;
          }
        }
      }
    }

    // Import addons
    if (packData.addons && Array.isArray(packData.addons)) {
      for (const addon of packData.addons) {
        const { data: existing } = await supabase
          .from('addons')
          .select('id')
          .eq('name', addon.name)
          .maybeSingle();

        if (existing && conflictStrategy === 'skip') {
          addonIdMap.set(addon.original_id, existing.id);
          importStats.addons_skipped++;
          continue;
        }

        const addonData: any = {
          name: conflictStrategy === 'rename' && existing ? `${addon.name} (imported)` : addon.name,
          price: addon.price,
          is_active: addon.is_active
        };

        if (existing && conflictStrategy === 'overwrite') {
          const { data: updated } = await supabase
            .from('addons')
            .update(addonData)
            .eq('id', existing.id)
            .select()
            .single();

          if (updated) {
            addonIdMap.set(addon.original_id, updated.id);
            importStats.addons_imported++;
          }
        } else {
          const { data: inserted, error } = await supabase
            .from('addons')
            .insert(addonData)
            .select()
            .single();

          if (error) {
            importStats.errors.push(`Addon "${addon.name}": ${error.message}`);
          } else if (inserted) {
            addonIdMap.set(addon.original_id, inserted.id);
            importStats.addons_imported++;
          }
        }
      }
    }

    // Import products
    if (packData.products && Array.isArray(packData.products)) {
      for (const product of packData.products) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('name', product.name)
          .maybeSingle();

        if (existing && conflictStrategy === 'skip') {
          productIdMap.set(product.original_id, existing.id);
          importStats.products_skipped++;
          continue;
        }

        let imageUrl = product.image_url;

        if (product.local_image && imageFiles.has(product.local_image.replace('images/', ''))) {
          const imagePath = product.local_image.replace('images/', '');
          const imageData = imageFiles.get(imagePath);

          if (imageData) {
            try {
              const fileName = `product-${Date.now()}-${imagePath}`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, imageData, {
                  contentType: imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
                  upsert: false
                });

              if (!uploadError && uploadData) {
                const { data: { publicUrl } } = supabase.storage
                  .from('product-images')
                  .getPublicUrl(uploadData.path);
                imageUrl = publicUrl;
                importStats.images_uploaded++;
              }
            } catch (err) {
              importStats.errors.push(`Failed to upload image for "${product.name}": ${err.message}`);
            }
          }
        }

        const productData: any = {
          name: conflictStrategy === 'rename' && existing ? `${product.name} (imported)` : product.name,
          description: product.description,
          price: product.price,
          image_url: imageUrl,
          is_active: product.is_active,
          recipe: product.recipe,
          category_id: product.category_id && categoryIdMap.has(product.category_id)
            ? categoryIdMap.get(product.category_id)
            : null
        };

        if (existing && conflictStrategy === 'overwrite') {
          const { data: updated } = await supabase
            .from('products')
            .update(productData)
            .eq('id', existing.id)
            .select()
            .single();

          if (updated) {
            productIdMap.set(product.original_id, updated.id);
            importStats.products_imported++;
          }
        } else {
          const { data: inserted, error } = await supabase
            .from('products')
            .insert(productData)
            .select()
            .single();

          if (error) {
            importStats.errors.push(`Product "${product.name}": ${error.message}`);
          } else if (inserted) {
            productIdMap.set(product.original_id, inserted.id);
            importStats.products_imported++;
          }
        }
      }
    }

    // Import product-category relationships
    if (packData.product_categories && Array.isArray(packData.product_categories)) {
      for (const rel of packData.product_categories) {
        const newProductId = productIdMap.get(rel.product_id);
        const newCategoryId = categoryIdMap.get(rel.category_id);

        if (newProductId && newCategoryId) {
          await supabase
            .from('product_categories')
            .insert({
              product_id: newProductId,
              category_id: newCategoryId
            });
        }
      }
    }

    // Import product-addon relationships
    if (packData.product_addons && Array.isArray(packData.product_addons)) {
      for (const rel of packData.product_addons) {
        const newProductId = productIdMap.get(rel.product_id);
        const newAddonId = addonIdMap.get(rel.addon_id);

        if (newProductId && newAddonId) {
          await supabase
            .from('product_addons')
            .insert({
              product_id: newProductId,
              addon_id: newAddonId
            });
        }
      }
    }

    // Import upsell suggestions
    if (packData.upsell_suggestions && Array.isArray(packData.upsell_suggestions)) {
      for (const upsell of packData.upsell_suggestions) {
        const sourceProductId = upsell.source_product_id || upsell.product_id;
        const newProductId = productIdMap.get(sourceProductId);
        const newSuggestedId = productIdMap.get(upsell.suggested_product_id);

        if (newProductId && newSuggestedId) {
          const { error } = await supabase
            .from('upsell_suggestions')
            .insert({
              source_product_id: newProductId,
              suggested_product_id: newSuggestedId,
              suggestion_text: upsell.suggestion_text,
              display_order: upsell.display_order,
              is_active: upsell.is_active
            });

          if (!error) {
            importStats.upsells_imported++;
          }
        }
      }
    }

    // Import promotional gifts
    if (packData.promotional_gifts && Array.isArray(packData.promotional_gifts)) {
      for (const gift of packData.promotional_gifts) {
        const qualifyingProductId = gift.qualifying_product_id || gift.trigger_product_id;
        const newQualifyingId = productIdMap.get(qualifyingProductId);
        const newGiftId = productIdMap.get(gift.gift_product_id);

        if (newQualifyingId && newGiftId) {
          const { error } = await supabase
            .from('promotional_gifts')
            .insert({
              qualifying_product_id: newQualifyingId,
              gift_product_id: newGiftId,
              min_quantity: gift.min_quantity || 1,
              gift_text: gift.gift_text,
              is_active: gift.is_active
            });

          if (!error) {
            importStats.gifts_imported++;
          }
        }
      }
    }

    // Log import operation
    await supabase
      .from('product_pack_history')
      .insert({
        pack_id: packId || null,
        operation_type: 'import',
        operation_status: importStats.errors.length > 0 ? 'partial' : 'success',
        performed_by: user.id,
        details: importStats,
        error_log: importStats.errors.length > 0 ? importStats.errors.join('\n') : null
      });

    return new Response(
      JSON.stringify({
        success: true,
        stats: importStats,
        message: `Import completed: ${importStats.products_imported} products, ${importStats.categories_imported} categories, ${importStats.addons_imported} addons, ${importStats.images_uploaded} images uploaded`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Import failed'
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
