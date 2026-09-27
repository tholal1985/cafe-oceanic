import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Secret",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface UltimatePosConfig {
  id: string;
  api_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  personal_access_token: string | null;
  auth_mode: string;
  business_id: number;
  location_id: number;
  is_active: boolean;
  auto_sync_products: boolean;
  auto_sync_customers: boolean;
  auto_push_sales: boolean;
  last_product_sync_at: string | null;
  last_customer_sync_at: string | null;
  last_sale_push_at: string | null;
  last_connected_at: string | null;
  connection_status: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, error: string, details?: string): Response {
  return jsonResponse({ error, details }, status);
}

async function getConfig(supabase: any): Promise<UltimatePosConfig | null> {
  const { data, error } = await supabase
    .from("ultimatepos_config")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as UltimatePosConfig;
}

// ============================================================
// Authentication
// ============================================================
async function getAuthToken(config: UltimatePosConfig): Promise<string> {
  if (config.auth_mode === "pat" && config.personal_access_token) {
    return config.personal_access_token;
  }

  // OAuth password grant
  const baseUrl = (config.api_url || "").replace(/\/$/, "");
  const tokenUrl = `${baseUrl}/oauth/token`;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.client_id || "",
    client_secret: config.client_secret || "",
    username: config.username || "",
    password: config.password || "",
    scope: "pos",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OAuth token request failed (${resp.status}): ${text}`);
  }

  const tokenData = await resp.json();
  return tokenData.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// ============================================================
// Sync logging
// ============================================================
async function createSyncLog(
  supabase: any,
  syncType: string,
  startedAt: number,
): Promise<string> {
  const { data, error } = await supabase
    .from("ultimatepos_sync_logs")
    .insert({
      sync_type: syncType,
      status: "pending",
      started_at: new Date(startedAt).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function completeSyncLog(
  supabase: any,
  logId: string,
  status: string,
  counts: { processed: number; created: number; updated: number; skipped: number },
  errorMessage: string | null,
  details: any,
): Promise<void> {
  await supabase
    .from("ultimatepos_sync_logs")
    .update({
      status,
      records_processed: counts.processed,
      records_created: counts.created,
      records_updated: counts.updated,
      records_skipped: counts.skipped,
      error_message: errorMessage,
      details: details || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

// ============================================================
// Product Sync (UltimatePOS → Kiosk)
// ============================================================
async function syncProducts(supabase: any, config: UltimatePosConfig): Promise<Response> {
  const startedAt = Date.now();
  const logId = await createSyncLog(supabase, "products", startedAt);

  try {
    const token = await getAuthToken(config);
    const baseUrl = (config.api_url || "").replace(/\/$/, "");
    const url = `${baseUrl}/connector/api/product?business_id=${config.business_id}&location_id=${config.location_id}&per_page=100`;

    const resp = await fetch(url, { method: "GET", headers: authHeaders(token) });
    if (!resp.ok) {
      const text = await resp.text();
      await completeSyncLog(supabase, logId, "failed", { processed: 0, created: 0, updated: 0, skipped: 0 }, `Failed to fetch products: ${text}`, null);
      return errorResponse(502, "Failed to fetch products from UltimatePOS", text);
    }

    const result = await resp.json();
    const products: any[] = result.data || result.products || result || [];
    const productArray = Array.isArray(products) ? products : [];

    let created = 0, updated = 0, skipped = 0;
    const details: any[] = [];

    for (const up of productArray) {
      const ultimateposId = String(up.id);
      const name = up.name || up.product_name || "Unnamed";
      const price = parseFloat(up.sell_price || up.price || up.selling_price || "0");
      const description = up.description || up.product_description || "";
      const imageUrl = up.image_url || up.image || null;

      // Check if product already exists by ultimatepos_id
      const { data: existing } = await supabase
        .from("products")
        .select("id, name, price, description, image_url")
        .eq("ultimatepos_id", ultimateposId)
        .maybeSingle();

      if (existing) {
        const updates: any = {};
        if (existing.name !== name) updates.name = name;
        if (parseFloat(existing.price) !== price) updates.price = price;
        if (existing.description !== description) updates.description = description;
        if (existing.image_url !== imageUrl) updates.image_url = imageUrl;

        if (Object.keys(updates).length > 0) {
          await supabase.from("products").update(updates).eq("id", existing.id);
          updated++;
          details.push({ ultimatepos_id: ultimateposId, action: "updated", local_id: existing.id });
        } else {
          skipped++;
          details.push({ ultimatepos_id: ultimateposId, action: "skipped" });
        }
      } else {
        const { data: newProduct, error } = await supabase
          .from("products")
          .insert({
            name,
            description,
            price,
            image_url: imageUrl,
            ultimatepos_id: ultimateposId,
            is_available: true,
            display_order: 0,
          })
          .select("id")
          .single();
        if (error) {
          skipped++;
          details.push({ ultimatepos_id: ultimateposId, action: "error", error: error.message });
        } else {
          created++;
          details.push({ ultimatepos_id: ultimateposId, action: "created", local_id: newProduct.id });
        }
      }
    }

    const processed = productArray.length;
    await completeSyncLog(supabase, logId, "success", { processed, created, updated, skipped }, null, { products: details });
    await supabase.from("ultimatepos_config").update({ last_product_sync_at: new Date().toISOString() }).eq("id", config.id);

    return jsonResponse({ success: true, sync_type: "products", processed, created, updated, skipped });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await completeSyncLog(supabase, logId, "failed", { processed: 0, created: 0, updated: 0, skipped: 0 }, msg, null);
    return errorResponse(500, "Product sync failed", msg);
  }
}

// ============================================================
// Customer Sync (UltimatePOS → Kiosk)
// ============================================================
async function syncCustomers(supabase: any, config: UltimatePosConfig): Promise<Response> {
  const startedAt = Date.now();
  const logId = await createSyncLog(supabase, "customers", startedAt);

  try {
    const token = await getAuthToken(config);
    const baseUrl = (config.api_url || "").replace(/\/$/, "");
    const url = `${baseUrl}/connector/api/contactapi?business_id=${config.business_id}&type=customer&per_page=100`;

    const resp = await fetch(url, { method: "GET", headers: authHeaders(token) });
    if (!resp.ok) {
      const text = await resp.text();
      await completeSyncLog(supabase, logId, "failed", { processed: 0, created: 0, updated: 0, skipped: 0 }, `Failed to fetch customers: ${text}`, null);
      return errorResponse(502, "Failed to fetch customers from UltimatePOS", text);
    }

    const result = await resp.json();
    const customers: any[] = result.data || result.contacts || result || [];
    const customerArray = Array.isArray(customers) ? customers : [];

    let created = 0, updated = 0, skipped = 0;
    const details: any[] = [];

    for (const uc of customerArray) {
      const ultimateposId = String(uc.id);
      const firstName = uc.first_name || uc.name || "";
      const lastName = uc.last_name || uc.surname || "";
      const email = uc.email || null;
      const phone = uc.mobile || uc.phone || uc.contact_number || null;

      // Check if customer exists by ultimatepos_id
      const { data: existing } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .eq("ultimatepos_id", ultimateposId)
        .maybeSingle();

      if (existing) {
        const updates: any = {};
        if (existing.first_name !== firstName) updates.first_name = firstName;
        if (existing.last_name !== lastName) updates.last_name = lastName;
        if (existing.email !== email) updates.email = email;
        if (existing.phone !== phone) updates.phone = phone;

        if (Object.keys(updates).length > 0) {
          await supabase.from("customers").update(updates).eq("id", existing.id);
          updated++;
          details.push({ ultimatepos_id: ultimateposId, action: "updated", local_id: existing.id });
        } else {
          skipped++;
          details.push({ ultimatepos_id: ultimateposId, action: "skipped" });
        }
      } else {
        const { data: newCustomer, error } = await supabase
          .from("customers")
          .insert({
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            ultimatepos_id: ultimateposId,
            is_active: true,
          })
          .select("id")
          .single();
        if (error) {
          skipped++;
          details.push({ ultimatepos_id: ultimateposId, action: "error", error: error.message });
        } else {
          created++;
          details.push({ ultimatepos_id: ultimateposId, action: "created", local_id: newCustomer.id });
        }
      }
    }

    const processed = customerArray.length;
    await completeSyncLog(supabase, logId, "success", { processed, created, updated, skipped }, null, { customers: details });
    await supabase.from("ultimatepos_config").update({ last_customer_sync_at: new Date().toISOString() }).eq("id", config.id);

    return jsonResponse({ success: true, sync_type: "customers", processed, created, updated, skipped });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await completeSyncLog(supabase, logId, "failed", { processed: 0, created: 0, updated: 0, skipped: 0 }, msg, null);
    return errorResponse(500, "Customer sync failed", msg);
  }
}

// ============================================================
// Sale Push (Kiosk → UltimatePOS)
// ============================================================
async function buildSalePayload(supabase: any, orderId: string, config: UltimatePosConfig): Promise<any> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error("Order not found");

  const lines = (order.order_items || []).map((item: any) => ({
    product_id: item.product_id || null,
    name: item.product_name,
    quantity: item.quantity,
    unit_price: parseFloat(item.item_total) / item.quantity,
    unit_price_inc_tax: parseFloat(item.item_total) / item.quantity,
    total_before_tax: parseFloat(item.item_total),
  }));

  return {
    business_id: config.business_id,
    location_id: config.location_id,
    status: "final",
    payment_status: order.payment_status === "paid" ? "paid" : "due",
    final_total: parseFloat(order.total_price),
    total_before_tax: parseFloat(order.total_price),
    transaction_date: new Date(order.created_at).toISOString().split("T")[0],
    order_number: order.order_number,
    customer_phone: order.phone_number || null,
    sell_lines: lines,
    order_type: order.order_type || "dine_in",
  };
}

async function pushSale(supabase: any, config: UltimatePosConfig, pushId: string): Promise<{ success: boolean; saleId?: string; error?: string }> {
  const { data: push, error } = await supabase
    .from("ultimatepos_sale_pushes")
    .select("*")
    .eq("id", pushId)
    .maybeSingle();
  if (error || !push) return { success: false, error: "Push record not found" };

  const orderId = push.order_id;
  const payload = push.payload || await buildSalePayload(supabase, orderId, config);

  // Store the payload if it was just built
  if (!push.payload) {
    await supabase.from("ultimatepos_sale_pushes").update({ payload }).eq("id", pushId);
  }

  try {
    const token = await getAuthToken(config);
    const baseUrl = (config.api_url || "").replace(/\/$/, "");
    const url = `${baseUrl}/connector/api/sell?business_id=${config.business_id}&location_id=${config.location_id}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });

    const responseText = await resp.text();
    let responseData: any = null;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

    if (!resp.ok) {
      const errorMsg = `UltimatePOS returned ${resp.status}: ${responseText.substring(0, 500)}`;
      await handlePushFailure(supabase, pushId, errorMsg, push.retry_count, push.max_retries, responseData);
      return { success: false, error: errorMsg };
    }

    const saleId = responseData.id ? String(responseData.id) : (responseData.sale_id ? String(responseData.sale_id) : null);

    await supabase.from("ultimatepos_sale_pushes").update({
      status: "success",
      ultimatepos_sale_id: saleId,
      response: responseData,
      error_message: null,
      pushed_at: new Date().toISOString(),
      next_retry_at: null,
    }).eq("id", pushId);

    // Write sale ID back to order
    if (saleId) {
      await supabase.from("orders").update({ ultimatepos_sale_id: saleId }).eq("id", orderId);
    }

    await supabase.from("ultimatepos_config").update({ last_sale_push_at: new Date().toISOString() }).eq("id", config.id);

    return { success: true, saleId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await handlePushFailure(supabase, pushId, msg, push.retry_count, push.max_retries, null);
    return { success: false, error: msg };
  }
}

async function handlePushFailure(
  supabase: any,
  pushId: string,
  errorMsg: string,
  retryCount: number,
  maxRetries: number,
  response: any,
): Promise<void> {
  const newRetryCount = retryCount + 1;
  if (newRetryCount < maxRetries) {
    // Schedule retry — exponential backoff: 1min, 5min, 15min
    const backoffMinutes = Math.pow(5, newRetryCount - 1);
    const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    await supabase.from("ultimatepos_sale_pushes").update({
      status: "retrying",
      retry_count: newRetryCount,
      error_message: errorMsg,
      response: response,
      next_retry_at: nextRetry,
    }).eq("id", pushId);
  } else {
    await supabase.from("ultimatepos_sale_pushes").update({
      status: "failed",
      retry_count: newRetryCount,
      error_message: errorMsg,
      response: response,
      next_retry_at: null,
    }).eq("id", pushId);
  }
}

async function processPendingSales(supabase: any, config: UltimatePosConfig): Promise<Response> {
  // Get all pending and retrying pushes (where next_retry_at has passed)
  const { data: pendingPushes, error } = await supabase
    .from("ultimatepos_sale_pushes")
    .select("id, order_id, status, retry_count, max_retries, next_retry_at")
    .in("status", ["pending", "retrying"])
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return errorResponse(500, "Failed to fetch pending sales", error.message);

  const pushes = pendingPushes || [];
  let succeeded = 0, failed = 0, retried = 0;

  for (const push of pushes) {
    // Skip retries that aren't due yet
    if (push.status === "retrying" && push.next_retry_at && new Date(push.next_retry_at) > new Date()) {
      continue;
    }

    const result = await pushSale(supabase, config, push.id);
    if (result.success) succeeded++;
    else if (push.retry_count + 1 < push.max_retries) retried++;
    else failed++;
  }

  return jsonResponse({ success: true, processed: pushes.length, succeeded, failed, retried });
}

// ============================================================
// Connection test
// ============================================================
async function testConnection(config: UltimatePosConfig): Promise<Response> {
  try {
    const token = await getAuthToken(config);
    const baseUrl = (config.api_url || "").replace(/\/$/, "");
    const url = `${baseUrl}/connector/api/business?business_id=${config.business_id}`;

    const resp = await fetch(url, { method: "GET", headers: authHeaders(token) });
    if (!resp.ok) {
      const text = await resp.text();
      return errorResponse(502, "Connection test failed", `UltimatePOS returned ${resp.status}: ${text.substring(0, 300)}`);
    }

    const data = await resp.json();
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from("ultimatepos_config").update({
      last_connected_at: new Date().toISOString(),
      connection_status: "connected",
    }).eq("id", config.id);

    return jsonResponse({ success: true, connected: true, business: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from("ultimatepos_config").update({
      connection_status: "error",
    }).eq("id", config.id);
    return errorResponse(502, "Connection test failed", msg);
  }
}

// ============================================================
// Webhook receiver (UltimatePOS → Kiosk)
// ============================================================
async function handleWebhook(req: Request, supabase: any): Promise<Response> {
  const body = await req.json();
  const eventType = body.event || body.type || "unknown";
  const entityType = body.entity_type || body.resource || "";
  const entityData = body.data || body.entity || body;

  if (entityType === "product" || eventType.includes("product")) {
    return handleProductWebhook(supabase, entityData, eventType);
  } else if (entityType === "contact" || eventType.includes("customer") || eventType.includes("contact")) {
    return handleCustomerWebhook(supabase, entityData, eventType);
  }

  return jsonResponse({ received: true, event: eventType, message: "Unhandled event type" });
}

async function handleProductWebhook(supabase: any, data: any, eventType: string): Promise<Response> {
  const ultimateposId = String(data.id || data.product_id || "");
  if (!ultimateposId) return errorResponse(400, "Missing product ID in webhook");

  const name = data.name || data.product_name || "Unnamed";
  const price = parseFloat(data.sell_price || data.price || "0");
  const description = data.description || "";
  const imageUrl = data.image_url || data.image || null;

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("ultimatepos_id", ultimateposId)
    .maybeSingle();

  if (eventType.includes("delete") || eventType.includes("remove")) {
    if (existing) {
      await supabase.from("products").update({ is_available: false }).eq("id", existing.id);
    }
    return jsonResponse({ received: true, action: "deactivated", ultimatepos_id: ultimateposId });
  }

  if (existing) {
    await supabase.from("products").update({
      name, description, price, image_url: imageUrl,
    }).eq("id", existing.id);
    return jsonResponse({ received: true, action: "updated", ultimatepos_id: ultimateposId, local_id: existing.id });
  } else {
    const { data: newProduct } = await supabase.from("products").insert({
      name, description, price, image_url: imageUrl,
      ultimatepos_id: ultimateposId, is_available: true, display_order: 0,
    }).select("id").single();
    return jsonResponse({ received: true, action: "created", ultimatepos_id: ultimateposId, local_id: newProduct?.id });
  }
}

async function handleCustomerWebhook(supabase: any, data: any, eventType: string): Promise<Response> {
  const ultimateposId = String(data.id || data.contact_id || "");
  if (!ultimateposId) return errorResponse(400, "Missing customer ID in webhook");

  const firstName = data.first_name || data.name || "";
  const lastName = data.last_name || data.surname || "";
  const email = data.email || null;
  const phone = data.mobile || data.phone || null;

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("ultimatepos_id", ultimateposId)
    .maybeSingle();

  if (eventType.includes("delete") || eventType.includes("remove")) {
    if (existing) {
      await supabase.from("customers").update({ is_active: false }).eq("id", existing.id);
    }
    return jsonResponse({ received: true, action: "deactivated", ultimatepos_id: ultimateposId });
  }

  if (existing) {
    await supabase.from("customers").update({
      first_name: firstName, last_name: lastName, email, phone,
    }).eq("id", existing.id);
    return jsonResponse({ received: true, action: "updated", ultimatepos_id: ultimateposId, local_id: existing.id });
  } else {
    const { data: newCustomer } = await supabase.from("customers").insert({
      first_name: firstName, last_name: lastName, email, phone,
      ultimatepos_id: ultimateposId, is_active: true,
    }).select("id").single();
    return jsonResponse({ received: true, action: "created", ultimatepos_id: ultimateposId, local_id: newCustomer?.id });
  }
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const pathParts = url.pathname.replace(/^\/functions\/v1\/ultimatepos-sync\/?/, "").split("/").filter(Boolean);
  const routeAction = action || pathParts[0] || "";

  try {
    // Webhook endpoint (no auth required — protected by webhook secret if configured)
    if (routeAction === "webhook") {
      return await handleWebhook(req, supabase);
    }

    // All other actions require config to exist
    const config = await getConfig(supabase);
    if (!config) {
      return errorResponse(400, "UltimatePOS is not configured. Set up the integration in the admin panel first.");
    }

    switch (routeAction) {
      case "test-connection":
        return await testConnection(config);

      case "sync-products":
        return await syncProducts(supabase, config);

      case "sync-customers":
        return await syncCustomers(supabase, config);

      case "push-sales":
        return await processPendingSales(supabase, config);

      case "push-sale": {
        const body = await req.json().catch(() => ({}));
        const pushId = body.push_id;
        if (!pushId) return errorResponse(400, "Missing push_id in request body");
        const result = await pushSale(supabase, config, pushId);
        return result.success
          ? jsonResponse({ success: true, sale_id: result.saleId })
          : errorResponse(502, "Sale push failed", result.error);
      }

      case "status": {
        const { data: pendingCount } = await supabase
          .from("ultimatepos_sale_pushes")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "retrying"]);

        const { data: recentLogs } = await supabase
          .from("ultimatepos_sync_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);

        return jsonResponse({
          connected: config.connection_status === "connected",
          is_active: config.is_active,
          auto_sync_products: config.auto_sync_products,
          auto_sync_customers: config.auto_sync_customers,
          auto_push_sales: config.auto_push_sales,
          last_product_sync_at: config.last_product_sync_at,
          last_customer_sync_at: config.last_customer_sync_at,
          last_sale_push_at: config.last_sale_push_at,
          last_connected_at: config.last_connected_at,
          pending_sale_pushes: pendingCount || 0,
          recent_sync_logs: recentLogs || [],
        });
      }

      default:
        return errorResponse(404, `Unknown action: ${routeAction}. Available: test-connection, sync-products, sync-customers, push-sales, push-sale, status, webhook`);
    }
  } catch (error) {
    console.error("UltimatePOS sync error:", error);
    return errorResponse(500, "Internal server error", error instanceof Error ? error.message : String(error));
  }
});
