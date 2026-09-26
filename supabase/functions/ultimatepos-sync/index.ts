import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UltimatePosConfig {
  id: string;
  base_url: string;
  client_id: string;
  client_secret: string;
  api_username: string;
  api_password: string;
  auth_method: string;
  business_id: number;
  location_id: number;
  is_enabled: boolean;
  auto_push_orders: boolean;
  auto_sync_products: boolean;
}

interface SyncAction {
  action: "test_connection" | "sync_products" | "push_order";
  orderId?: string;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function getAccessToken(config: UltimatePosConfig): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.base_url);
  const tokenUrl = `${baseUrl}/oauth/token`;

  const body = new URLSearchParams();
  body.append("grant_type", "password");
  body.append("client_id", config.client_id);
  body.append("client_secret", config.client_secret);
  body.append("username", config.api_username);
  body.append("password", config.api_password);

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token request failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error("No access_token in OAuth response");
  }
  return data.access_token as string;
}

async function ultimateposFetch(
  config: UltimatePosConfig,
  token: string,
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const baseUrl = normalizeBaseUrl(config.base_url);
  const url = `${baseUrl}/api${path}`;

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  const resp = await fetch(url, { ...options, headers });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`UltimatePOS API ${path} failed (${resp.status}): ${text}`);
  }

  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return resp.json();
  }
  return resp.text();
}

async function fetchAllProducts(
  config: UltimatePosConfig,
  token: string,
): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const data = await ultimateposFetch(
      config,
      token,
      `/products?per_page=${perPage}&page=${page}&business_id=${config.business_id}`,
    );

    const products = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    allProducts.push(...products);

    if (products.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allProducts;
}

async function syncProducts(supabase: any, config: UltimatePosConfig): Promise<{ itemsSynced: number; errors: string[] }> {
  const errors: string[] = [];
  let itemsSynced = 0;

  const token = await getAccessToken(config);
  const uposProducts = await fetchAllProducts(config, token);

  for (const uposProduct of uposProducts) {
    try {
      const productId = uposProduct.id;
      const name = uposProduct.name || uposProduct.product_name || "Unnamed";
      const description = uposProduct.description || null;
      const price = parseFloat(uposProduct.sell_price || uposProduct.price || "0");
      const cost = parseFloat(uposProduct.purchase_price || uposProduct.cost || "0");
      const imageUrl = uposProduct.image_url || null;
      const isAvailable = uposProduct.is_available !== false && uposProduct.enable_stock !== false;

      const variationId = uposProduct.variation_id || uposProduct.product_variation_id || null;

      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("ultimatepos_id", productId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("products")
          .update({
            name,
            description,
            price,
            cost,
            image_url: imageUrl,
            is_available: isAvailable,
            ultimatepos_variation_id: variationId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("products")
          .insert({
            name,
            description,
            price,
            cost,
            image_url: imageUrl,
            is_available: isAvailable,
            display_order: 0,
            ultimatepos_id: productId,
            ultimatepos_variation_id: variationId,
          });
      }
      itemsSynced++;
    } catch (err) {
      errors.push(`Product ID ${uposProduct.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await supabase
    .from("ultimatepos_config")
    .update({
      last_product_sync_at: new Date().toISOString(),
      connection_status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  return { itemsSynced, errors };
}

async function pushOrder(supabase: any, config: UltimatePosConfig, orderId: string): Promise<{ saleId: number | null }> {
  const { data: existingLog } = await supabase
    .from("ultimatepos_order_log")
    .select("id, ultimatepos_sale_id, status")
    .eq("order_id", orderId)
    .eq("status", "success")
    .maybeSingle();

  if (existingLog && existingLog.ultimatepos_sale_id) {
    return { saleId: existingLog.ultimatepos_sale_id };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, total_price, payment_method, order_type, phone_number")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) throw new Error("Order not found");

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_id, product_name, quantity, item_total, addons")
    .eq("order_id", orderId);

  if (!orderItems || orderItems.length === 0) throw new Error("Order has no items");

  const { data: products } = await supabase
    .from("products")
    .select("id, ultimatepos_id, ultimatepos_variation_id, name")
    .in("id", orderItems.map((item: any) => item.product_id));

  const productMap = new Map<string, any>();
  for (const p of products || []) {
    productMap.set(p.id, p);
  }

  const lines = orderItems.map((item: any) => {
    const product = productMap.get(item.product_id);
    const unitPrice = Number(item.item_total) / item.quantity;
    return {
      product_id: product?.ultimatepos_id || null,
      variation_id: product?.ultimatepos_variation_id || null,
      name: item.product_name,
      quantity: item.quantity,
      unit_price: unitPrice,
      unit_price_inc_tax: unitPrice,
    };
  }).filter((line: any) => line.product_id !== null);

  if (lines.length === 0) {
    throw new Error("No order items are linked to UltimatePOS products. Sync products first.");
  }

  const requestBody = {
    business_id: config.business_id,
    location_id: config.location_id,
    status: "final",
    payment_status: "paid",
    order_type: "sell",
    sell_lines: lines,
    total_amount: Number(order.total_price),
    payment_method: order.payment_method || "cash",
    contact_id: null,
    order_number: order.order_number,
  };

  const token = await getAccessToken(config);

  let logEntry: any = {
    order_id: orderId,
    order_number: order.order_number,
    status: "pending",
    request_payload: requestBody,
    pushed_at: new Date().toISOString(),
  };

  const { data: logRecord } = await supabase
    .from("ultimatepos_order_log")
    .insert(logEntry)
    .select()
    .single();
  logEntry = logRecord;

  try {
    const result = await ultimateposFetch(config, token, "/sell", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const saleId = result?.data?.id || result?.id || result?.sale?.id || null;

    await supabase
      .from("ultimatepos_order_log")
      .update({
        status: "success",
        ultimatepos_sale_id: saleId,
        response_payload: result,
        pushed_at: new Date().toISOString(),
      })
      .eq("id", logEntry.id);

    await supabase
      .from("ultimatepos_config")
      .update({
        last_order_push_at: new Date().toISOString(),
        connection_status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);

    return { saleId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await supabase
      .from("ultimatepos_order_log")
      .update({
        status: "failed",
        error_message: errorMsg,
        response_payload: { error: errorMsg },
        retry_count: (logEntry.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq("id", logEntry.id);

    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SyncAction = await req.json();
    const { action, orderId } = body;

    const { data: config, error: configError } = await supabase
      .from("ultimatepos_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "UltimatePOS not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!config.is_enabled && action !== "test_connection") {
      return new Response(
        JSON.stringify({ success: false, error: "UltimatePOS integration is disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!config.base_url || !config.client_id || !config.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "UltimatePOS connection settings are incomplete" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "test_connection") {
      try {
        const token = await getAccessToken(config);
        await ultimateposFetch(config, token, `/products?per_page=1&business_id=${config.business_id}`);

        await supabase
          .from("ultimatepos_config")
          .update({
            connection_status: "connected",
            last_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);

        return new Response(
          JSON.stringify({ success: true, message: "Connection successful" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        await supabase
          .from("ultimatepos_config")
          .update({ connection_status: "disconnected", updated_at: new Date().toISOString() })
          .eq("id", config.id);

        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (action === "sync_products") {
      const syncLogId = (await supabase
        .from("ultimatepos_sync_log")
        .insert({ sync_type: "products", status: "pending", started_at: new Date().toISOString() })
        .select()
        .single()).data?.id;

      try {
        const result = await syncProducts(supabase, config);

        await supabase
          .from("ultimatepos_sync_log")
          .update({
            status: result.errors.length > 0 && result.itemsSynced === 0 ? "failed" : "success",
            items_synced: result.itemsSynced,
            error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLogId);

        return new Response(
          JSON.stringify({ success: true, itemsSynced: result.itemsSynced, errors: result.errors }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        await supabase
          .from("ultimatepos_sync_log")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLogId);

        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (action === "push_order") {
      if (!orderId) {
        return new Response(
          JSON.stringify({ success: false, error: "orderId is required for push_order" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      try {
        const result = await pushOrder(supabase, config, orderId);
        return new Response(
          JSON.stringify({ success: true, saleId: result.saleId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
