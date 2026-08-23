import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExportRequest {
  name: string;
  description?: string;
  author?: string;
  tags?: string;
  includeCategories?: boolean;
  includeAddons?: boolean;
  includeUpsells?: boolean;
  includeGifts?: boolean;
  productIds?: string[];
  categoryIds?: string[];
}

interface ProductImage {
  productId: string;
  imageUrl: string;
  filename: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('Export function started');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verifying user authentication');
    const token = authHeader.replace('Bearer ', '');

    // Create client with user's token for auth, then elevate to service role for operations
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Now create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user has admin access (either in admin_users table or has admin role assignment)
    console.log('Checking admin access');
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id, is_active')
      .eq('id', user.id)
      .maybeSingle();

    let isAdmin = !!adminRow && adminRow.is_active !== false;

    if (!isAdmin) {
      const { data: roleRows } = await supabase
        .from('user_role_assignments')
        .select('role_id, user_roles(name)')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (roleRows && roleRows.length > 0) {
        isAdmin = roleRows.some((r: { user_roles?: { name?: string } | { name?: string }[] }) => {
          const ur = r.user_roles;
          const name = Array.isArray(ur) ? ur[0]?.name : ur?.name;
          return name === 'admin' || name === 'owner' || name === 'manager';
        });
      }
    }

    if (!isAdmin) {
      console.error('User is not admin:', user.id);
      throw new Error('Admin access required');
    }

    console.log('Admin verified, parsing request data');
    const requestData: ExportRequest = await req.json();
    console.log('Request data:', requestData);
    const {
      name,
      description,
      author,
      tags,
      includeCategories = true,
      includeAddons = true,
      includeUpsells = true,
      includeGifts = true,
      productIds,
      categoryIds
    } = requestData;

    const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

    // Export categories (include all, filter-only when explicit IDs provided)
    console.log('Exporting categories, includeCategories:', includeCategories);
    let categories = [];
    if (includeCategories) {
      let categoryQuery = supabase.from('categories').select('*');

      if (categoryIds && categoryIds.length > 0) {
        categoryQuery = categoryQuery.in('id', categoryIds);
      }

      const { data: categoriesData, error: categoriesError } = await categoryQuery;
      if (categoriesError) {
        console.error('Categories error:', categoriesError);
        throw new Error(`Failed to load categories: ${categoriesError.message}`);
      }
      categories = categoriesData || [];
      console.log('Categories exported:', categories.length);
    }

    // Export products (all products, not just available ones)
    console.log('Exporting products');
    let productQuery = supabase
      .from('products')
      .select('*');

    if (productIds && productIds.length > 0) {
      productQuery = productQuery.in('id', productIds);
    } else if (categoryIds && categoryIds.length > 0) {
      // Get products that belong to selected categories
      const { data: prodCats } = await supabase
        .from('product_categories')
        .select('product_id')
        .in('category_id', categoryIds);

      if (prodCats && prodCats.length > 0) {
        const prodIds = [...new Set(prodCats.map(pc => pc.product_id))];
        productQuery = productQuery.in('id', prodIds);
      }
    }

    const { data: products, error: productsError } = await productQuery;
    if (productsError) {
      console.error('Products error:', productsError);
      throw new Error(`Failed to load products: ${productsError.message}`);
    }
    console.log('Products exported:', products?.length || 0);

    const productIdList = products?.map(p => p.id) || [];

    // Download product images
    console.log('Downloading product images');
    const productImages: ProductImage[] = [];
    let downloadedImages: any[] = [];

    try {
      const imageDownloadPromises = products?.map(async (product) => {
        if (product.image_url) {
          try {
            console.log(`Downloading image for product ${product.id}: ${product.image_url}`);
            const response = await fetch(product.image_url);
            if (response.ok) {
              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();
              const filename = `product_${product.id}_${product.image_url.split('/').pop() || 'image.jpg'}`;

              productImages.push({
                productId: product.id,
                imageUrl: product.image_url,
                filename: filename
              });

              return {
                productId: product.id,
                filename: filename,
                data: arrayBuffer
              };
            } else {
              console.log(`Failed to download image for product ${product.id}: ${response.status}`);
            }
          } catch (err) {
            console.error(`Failed to download image for product ${product.id}:`, err);
          }
        }
        return null;
      }) || [];

      downloadedImages = (await Promise.all(imageDownloadPromises)).filter(img => img !== null);
      console.log('Images downloaded:', downloadedImages.length);
    } catch (imageError) {
      console.error('Error during image download:', imageError);
      // Continue without images
      downloadedImages = [];
    }

    // Export addons (all addons, not just available ones)
    let addons = [];
    if (includeAddons) {
      const { data: addonsData, error: addonsError } = await supabase
        .from('addons')
        .select('*');

      if (addonsError) {
        console.error('Addons error:', addonsError);
        throw new Error(`Failed to load addons: ${addonsError.message}`);
      }
      addons = addonsData || [];
    }

    // Export product-category relationships
    let productCategories = [];
    if (productIdList.length > 0) {
      const { data: prodCatsData, error: prodCatsError } = await supabase
        .from('product_categories')
        .select('product_id, category_id')
        .in('product_id', productIdList);

      if (prodCatsError) {
        console.warn('product_categories fetch warning:', prodCatsError.message);
      }
      productCategories = prodCatsData || [];
    }

    // Export product-addon relationships
    let productAddons = [];
    if (includeAddons && productIdList.length > 0) {
      const { data: prodAddonsData, error: prodAddonsError } = await supabase
        .from('product_addons')
        .select('product_id, addon_id')
        .in('product_id', productIdList);

      if (prodAddonsError) {
        console.warn('product_addons fetch warning:', prodAddonsError.message);
      }
      productAddons = prodAddonsData || [];
    }

    // Export upsell suggestions
    let upsellSuggestions = [];
    if (includeUpsells && productIdList.length > 0) {
      const { data: upsellsData, error: upsellsError } = await supabase
        .from('upsell_suggestions')
        .select('*')
        .in('source_product_id', productIdList);

      if (upsellsError) {
        console.warn('upsell_suggestions fetch warning:', upsellsError.message);
      }
      upsellSuggestions = upsellsData || [];
    }

    // Export promotional gifts
    let promotionalGifts = [];
    if (includeGifts && productIdList.length > 0) {
      const { data: giftsData, error: giftsError } = await supabase
        .from('promotional_gifts')
        .select('*')
        .in('qualifying_product_id', productIdList);

      if (giftsError) {
        console.warn('promotional_gifts fetch warning:', giftsError.message);
      }
      promotionalGifts = giftsData || [];
    }

    // Build pack data with image mappings
    const packData = {
      version: '2.0.0',
      exported_at: new Date().toISOString(),
      exported_by: user.id,
      metadata: {
        name: name,
        description: description,
        author: author || user.email || 'Unknown',
        tags: tagsArray,
        total_products: products?.length || 0,
        total_categories: categories.length,
        total_addons: addons.length,
        total_images: downloadedImages.length
      },
      image_mappings: productImages.map(img => ({
        product_id: img.productId,
        original_url: img.imageUrl,
        local_file: `images/${img.filename}`
      })),
      categories: categories.map(c => ({
        name: c.name,
        display_order: c.display_order,
        is_active: c.is_active,
        original_id: c.id
      })),
      products: products?.map(p => {
        const imageMapping = productImages.find(img => img.productId === p.id);
        return {
          name: p.name,
          description: p.description,
          price: p.price,
          image_url: p.image_url,
          local_image: imageMapping ? `images/${imageMapping.filename}` : null,
          is_available: p.is_available,
          category_id: p.category_id,
          recipe: p.recipe,
          display_order: p.display_order,
          original_id: p.id
        };
      }) || [],
      addons: addons.map(a => ({
        name: a.name,
        price: a.price,
        is_available: a.is_available,
        original_id: a.id
      })),
      product_categories: productCategories,
      product_addons: productAddons,
      upsell_suggestions: upsellSuggestions.map(u => ({
        source_product_id: u.source_product_id,
        suggested_product_id: u.suggested_product_id,
        suggestion_text: u.suggestion_text,
        display_order: u.display_order,
        is_active: u.is_active,
        original_id: u.id
      })),
      promotional_gifts: promotionalGifts.map(g => ({
        qualifying_product_id: g.qualifying_product_id,
        gift_product_id: g.gift_product_id,
        min_quantity: g.min_quantity,
        gift_text: g.gift_text,
        is_active: g.is_active,
        original_id: g.id
      }))
    };

    // Create product pack record
    console.log('Creating product pack record in database');
    const { data: pack, error: packError } = await supabase
      .from('product_packs')
      .insert({
        name,
        version: '2.0.0',
        description,
        created_by: user.id,
        author: author || user.email || 'Unknown',
        tags: tagsArray,
        pack_data: packData,
        checksum: '',
        is_downloadable: true
      })
      .select()
      .maybeSingle();

    if (packError || !pack) {
      console.error('Pack insert error:', packError);
      throw new Error(`Failed to save product pack: ${packError?.message || 'unknown error'}`);
    }
    console.log('Pack record created:', pack.id);

    // Log export operation
    await supabase
      .from('product_pack_history')
      .insert({
        pack_id: pack.id,
        operation_type: 'export',
        operation_status: 'success',
        performed_by: user.id,
        details: {
          total_products: products?.length || 0,
          total_categories: categories.length,
          total_addons: addons.length,
          total_upsells: upsellSuggestions.length,
          total_gifts: promotionalGifts.length,
          total_images: downloadedImages.length
        }
      });

    // Create ZIP file
    console.log('Creating ZIP file');
    const zip = new JSZip();

    // Add manifest.json with pack metadata
    const manifest = {
      pack_name: name,
      pack_description: description,
      pack_version: pack.version,
      pack_id: pack.id,
      exported_at: packData.exported_at,
      checksum: pack.checksum,
      total_products: pack.total_products,
      total_categories: pack.total_categories,
      total_addons: pack.total_addons,
      total_images: downloadedImages.length
    };
    console.log('Adding manifest.json');
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Add pack data
    console.log('Adding pack_data.json');
    zip.file('pack_data.json', JSON.stringify(packData, null, 2));

    // Add README
    const readme = `# Product Pack: ${name}

## Description
${description || 'No description provided'}

## Contents
- Products: ${pack.total_products}
- Categories: ${pack.total_categories}
- Addons: ${pack.total_addons}
- Product Images: ${downloadedImages.length}
- Upsell Suggestions: ${upsellSuggestions.length}
- Promotional Gifts: ${promotionalGifts.length}

## Export Information
- Exported At: ${new Date(packData.exported_at).toLocaleString()}
- Version: ${pack.version}
- Checksum: ${pack.checksum}

## Import Instructions
1. Upload this ZIP file to the Product Packs import section
2. Select your conflict resolution strategy
3. Review and confirm the import

## File Structure
- manifest.json: Pack metadata and checksums
- pack_data.json: Complete product data with relationships
- images/: Product images (${downloadedImages.length} files)
- README.md: This file
`;
    zip.file('README.md', readme);

    // Add images folder
    console.log('Adding images to ZIP');
    const imagesFolder = zip.folder('images');
    if (imagesFolder && downloadedImages.length > 0) {
      for (const image of downloadedImages) {
        console.log('Adding image:', image.filename);
        imagesFolder.file(image.filename, image.data);
      }
    }

    // Generate ZIP file
    console.log('Generating ZIP file');
    const zipBlob = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    console.log('ZIP file generated, size:', zipBlob.length, 'bytes');

    return new Response(
      zipBlob,
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip"`
        }
      }
    );

  } catch (error) {
    console.error('Export error:', error);

    let errorMessage = 'Export failed';
    let errorDetails = '';

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    } else if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      errorMessage = (errObj.message as string) ||
                     (errObj.error as string) ||
                     (errObj.hint as string) ||
                     (errObj.details as string) ||
                     (errObj.code as string) ||
                     'Unknown database error';
      try {
        errorDetails = JSON.stringify(error);
      } catch {
        errorDetails = String(errorMessage);
      }
    } else {
      errorMessage = String(error);
    }

    console.error('Resolved error message:', errorMessage);
    console.error('Error details:', errorDetails);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorDetails
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
