import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UltimatePosConfig {
  id: string;
  api_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  is_active: boolean;
  auto_push_sales: boolean;
}

interface SyncRequest {
  action: "test_connection" | "sync_products" | "sync_customers" | "push_sale" | "retry_failed_sales";
  orderId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: SyncRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON payload");
    }

    const { action } = body;
    if (!action) {
      return jsonError(400, "Missing 'action' field");
    }

    const { data: config, error: configError } = await supabase
      .from("ultimatepos_config")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (configError || !config) {
      return jsonError(404, "UltimatePOS is not configured. Add your API credentials in the Integration settings page first.");
    }

    const posConfig: UltimatePosConfig = config;

    switch (action) {
      case "test_connection":
        return await testConnection(posConfig, supabase);
      case "sync_products":
        return await syncProducts(posConfig, supabase);
      case "sync_customers":
        return await syncCustomers(posConfig, supabase);
      case "push_sale":
        if (!body.orderId) return jsonError(400, "Missing 'orderId' for push_sale action");
        return await pushSale(posConfig, supabase, body.orderId);
      case "retry_failed_sales":
        return await retryFailedSales(posConfig, supabase);
      default:
        return jsonError(400, `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error("UltimatePOS sync error:", error);
    return jsonError(500, "Internal server error", error instanceof Error ? error.message : undefined);
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, error: string, details?: string): Response {
  return jsonResponse({ success: false, error, details }, status);
}

// ============================================================
// Token Management
// ============================================================

// Browser-like headers to pass Cloudflare bot protection on UltimatePOS
const browserHeaders: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

function buildFormData(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .join("&");
}

async function getAccessToken(config: UltimatePosConfig): Promise<string> {
  const tokenUrl = `${config.api_url.replace(/\/$/, "")}/oauth/token`;

  const formData = buildFormData({
    grant_type: "password",
    client_id: config.client_id,
    client_secret: config.client_secret,
    username: config.username,
    password: config.password,
    scope: "*",
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      ...browserHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    console.error("UltimatePOS token error:", tokenResponse.status, errText);
    const isCloudflare = errText.includes("Just a moment") || errText.includes("cloudflare") || errText.includes("cf-browser");
    if (isCloudflare) {
      throw new Error(`UltimatePOS is behind Cloudflare bot protection which is blocking the server-side request. Please whitelist the Supabase edge function IPs in your UltimatePOS Cloudflare settings, or contact UltimatePOS support to allow API access from server environments.`);
    }
    throw new Error(`Authentication failed (${tokenResponse.status}): ${errText.substring(0, 300)}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("No access_token in UltimatePOS response");
  }

  return accessToken;
}

async function posApiGet(config: UltimatePosConfig, token: string, endpoint: string, params?: Record<string, string>): Promise<any> {
  const baseUrl = config.api_url.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/api/${endpoint.replace(/^\//, "")}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...browserHeaders,
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`UltimatePOS GET ${endpoint} failed (${response.status}): ${errText.substring(0, 300)}`);
  }

  return response.json();
}

async function posApiPost(config: UltimatePosConfig, token: string, endpoint: string, payload: any): Promise<any> {
  const baseUrl = config.api_url.replace(/\/$/, "");
  const url = `${baseUrl}/api/${endpoint.replace(/^\//, "")}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...browserHeaders,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let responseData: any;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(`UltimatePOS POST ${endpoint} failed (${response.status}): ${responseText.substring(0, 500)}`);
  }

  return responseData;
}

// ============================================================
// Test Connection
// ============================================================
async function testConnection(config: UltimatePosConfig, supabase: any): Promise<Response> {
  try {
    const token = await getAccessToken(config);
    await posApiGet(config, token, "products", { limit: "1" });
    return jsonResponse({ success: true, message: "Connection successful. Credentials are valid." });
  } catch (error) {
    return jsonError(502, error instanceof Error ? error.message : "Connection test failed");
  }
}

// ============================================================
// Product Sync (UltimatePOS -> Kiosk)
// ============================================================
async function syncProducts(config: UltimatePosConfig, supabase: any): Promise<Response> {
  let token: string;
  try {
    token = await getAccessToken(config);
  } catch (error) {
    await logSync(supabase, "products", "failed", 0, 0, 0, 0, error instanceof Error ? error.message : "Token error");
    return jsonError(502, error instanceof Error ? error.message : "Failed to authenticate with UltimatePOS");
  }

  let allProducts: any[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await posApiGet(config, token, "products", { page: String(page), limit: String(perPage) });
      const products = data.data || data.products || data || [];
      if (!Array.isArray(products) || products.length === 0) {
        hasMore = false;
        break;
      }
      allProducts = allProducts.concat(products);
      hasMore = products.length === perPage;
      page++;
    } catch (error) {
      if (allProducts.length === 0) {
        await logSync(supabase, "products", "failed", 0, 0, 0, 0, error instanceof Error ? error.message : "Fetch error");
        return jsonError(502, error instanceof Error ? error.message : "Failed to fetch products from UltimatePOS");
      }
      break;
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const details: any[] = [];

  for (const posProduct of allProducts) {
    const posId = String(posProduct.id ?? posProduct.product_id ?? "");
    if (!posId) { skipped++; continue; }

    const name = posProduct.name || posProduct.product_name || "Unnamed Product";
    const price = parseFloat(posProduct.sell_price || posProduct.price || posProduct.unit_price || "0");
    const cost = parseFloat(posProduct.purchase_price || posProduct.cost || "0");
    const description = posProduct.description || posProduct.product_description || null;
    const imageUrl = posProduct.image_url || posProduct.image || posProduct.product_image || null;
    const isAvailable = posProduct.is_active !== false && posProduct.status !== "inactive";

    const { data: existing } = await supabase
      .from("products")
      .select("id, name, price, ultimatepos_id")
      .eq("ultimatepos_id", posId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("products")
        .update({
          name,
          price,
          cost,
          description,
          image_url: imageUrl,
          is_available: isAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        details.push({ posId, action: "update_failed", error: error.message });
        skipped++;
      } else {
        updated++;
        details.push({ posId, action: "updated", localId: existing.id });
      }
    } else {
      const { data: created_product, error } = await supabase
        .from("products")
        .insert({
          name,
          price,
          cost,
          description,
          image_url: imageUrl,
          is_available: isAvailable,
          ultimatepos_id: posId,
          display_order: created + 1,
        })
        .select("id")
        .single();

      if (error) {
        details.push({ posId, action: "create_failed", error: error.message });
        skipped++;
      } else {
        created++;
        details.push({ posId, action: "created", localId: created_product?.id });
      }
    }
  }

  await supabase
    .from("ultimatepos_config")
    .update({ last_product_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", config.id);

  await logSync(supabase, "products", "success", allProducts.length, created, updated, skipped, null, details);

  return jsonResponse({
    success: true,
    message: `Product sync complete: ${created} added, ${updated} updated, ${skipped} skipped`,
    summary: { total: allProducts.length, created, updated, skipped },
  });
}

// ============================================================
// Customer Sync (UltimatePOS -> Kiosk)
// ============================================================
async function syncCustomers(config: UltimatePosConfig, supabase: any): Promise<Response> {
  let token: string;
  try {
    token = await getAccessToken(config);
  } catch (error) {
    await logSync(supabase, "customers", "failed", 0, 0, 0, 0, error instanceof Error ? error.message : "Token error");
    return jsonError(502, error instanceof Error ? error.message : "Failed to authenticate with UltimatePOS");
  }

  let allCustomers: any[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const data = await posApiGet(config, token, "customers", { page: String(page), limit: String(perPage) });
      const customers = data.data || data.customers || data || [];
      if (!Array.isArray(customers) || customers.length === 0) {
        hasMore = false;
        break;
      }
      allCustomers = allCustomers.concat(customers);
      hasMore = customers.length === perPage;
      page++;
    } catch (error) {
      if (allCustomers.length === 0) {
        await logSync(supabase, "customers", "failed", 0, 0, 0, 0, error instanceof Error ? error.message : "Fetch error");
        return jsonError(502, error instanceof Error ? error.message : "Failed to fetch customers from UltimatePOS");
      }
      break;
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const details: any[] = [];

  for (const posCustomer of allCustomers) {
    const posId = String(posCustomer.id ?? posCustomer.customer_id ?? "");
    if (!posId) { skipped++; continue; }

    const firstName = posCustomer.first_name || posCustomer.name || "";
    const lastName = posCustomer.last_name || "";
    const email = posCustomer.email || null;
    const phone = posCustomer.phone || posCustomer.mobile || posCustomer.phone_number || null;

    const { data: existing } = await supabase
      .from("customers")
      .select("id, ultimatepos_id, phone")
      .eq("ultimatepos_id", posId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("customers")
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (error) {
        details.push({ posId, action: "update_failed", error: error.message });
        skipped++;
      } else {
        updated++;
        details.push({ posId, action: "updated", localId: existing.id });
      }
    } else {
      let matchByPhone: any = null;
      if (phone) {
        const { data: phoneMatch } = await supabase
          .from("customers")
          .select("id, phone")
          .eq("phone", phone)
          .maybeSingle();
        matchByPhone = phoneMatch;
      }

      if (matchByPhone) {
        const { error } = await supabase
          .from("customers")
          .update({
            first_name: firstName,
            last_name: lastName,
            email,
            ultimatepos_id: posId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchByPhone.id);

        if (error) {
          details.push({ posId, action: "link_failed", error: error.message });
          skipped++;
        } else {
          updated++;
          details.push({ posId, action: "linked_by_phone", localId: matchByPhone.id });
        }
      } else {
        const { data: newCustomer, error } = await supabase
          .from("customers")
          .insert({
            customer_number: `UP-${posId}`,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            ultimatepos_id: posId,
            is_active: true,
            loyalty_points: 0,
            lifetime_points: 0,
            total_visits: 0,
            total_spent: 0,
            average_order_value: 0,
            marketing_opt_in: false,
            sms_opt_in: false,
            email_opt_in: false,
            is_vip: false,
            approval_status: "approved",
            credit_limit: 0,
            current_balance: 0,
          })
          .select("id")
          .single();

        if (error) {
          details.push({ posId, action: "create_failed", error: error.message });
          skipped++;
        } else {
          created++;
          details.push({ posId, action: "created", localId: newCustomer?.id });
        }
      }
    }
  }

  await supabase
    .from("ultimatepos_config")
    .update({ last_customer_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", config.id);

  await logSync(supabase, "customers", "success", allCustomers.length, created, updated, skipped, null, details);

  return jsonResponse({
    success: true,
    message: `Customer sync complete: ${created} added, ${updated} updated, ${skipped} skipped`,
    summary: { total: allCustomers.length, created, updated, skipped },
  });
}

// ============================================================
// Sale Push (Kiosk -> UltimatePOS)
// ============================================================
async function pushSale(config: UltimatePosConfig, supabase: any, orderId: string): Promise<Response> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number, total_price, status, payment_method, payment_status, customer_id, order_type, phone_number")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return jsonError(404, "Order not found");
  }

  if (order.ultimatepos_sale_id) {
    return jsonResponse({ success: true, message: "Sale already pushed to UltimatePOS", ultimateposSaleId: order.ultimatepos_sale_id });
  }

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("product_id, product_name, product_price, quantity, item_total, addons")
    .eq("order_id", orderId);

  let customer: any = null;
  if (order.customer_id) {
    const { data: customerData } = await supabase
      .from("customers")
      .select("id, first_name, last_name, email, phone, ultimatepos_id")
      .eq("id", order.customer_id)
      .maybeSingle();
    customer = customerData;
  }

  const salePayload: any = {
    order_number: order.order_number,
    total_price: parseFloat(order.total_price),
    payment_method: mapPaymentMethod(order.payment_method),
    order_type: order.order_type || "dine_in",
    products: (orderItems || []).map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      unit_price: parseFloat(item.product_price),
      quantity: item.quantity,
      total: parseFloat(item.item_total),
    })),
  };

  if (customer) {
    salePayload.customer = {
      ultimatepos_id: customer.ultimatepos_id,
      name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
      email: customer.email,
      phone: customer.phone,
    };
  } else if (order.phone_number) {
    salePayload.customer = { phone: order.phone_number };
  }

  const { data: pushRecord } = await supabase
    .from("ultimatepos_sale_pushes")
    .insert({
      order_id: orderId,
      status: "pending",
      payload: salePayload,
      max_retries: 3,
    })
    .select("id")
    .single();

  try {
    const token = await getAccessToken(config);
    const result = await posApiPost(config, token, "sales", salePayload);
    const posSaleId = String(result.id || result.sale_id || result.data?.id || "");

    await supabase
      .from("orders")
      .update({ ultimatepos_sale_id: posSaleId })
      .eq("id", orderId);

    await supabase
      .from("ultimatepos_sale_pushes")
      .update({
        status: "success",
        ultimatepos_sale_id: posSaleId,
        response: result,
        pushed_at: new Date().toISOString(),
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pushRecord?.id);

    await supabase
      .from("ultimatepos_config")
      .update({ last_sale_push_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", config.id);

    return jsonResponse({ success: true, message: "Sale pushed to UltimatePOS", ultimateposSaleId: posSaleId });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    await supabase
      .from("ultimatepos_sale_pushes")
      .update({
        status: "retrying",
        error_message: errorMsg,
        retry_count: 1,
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pushRecord?.id);

    return jsonError(502, `Failed to push sale to UltimatePOS: ${errorMsg}`);
  }
}

// ============================================================
// Retry Failed Sales
// ============================================================
async function retryFailedSales(config: UltimatePosConfig, supabase: any): Promise<Response> {
  const { data: failedPushes } = await supabase
    .from("ultimatepos_sale_pushes")
    .select("id, order_id, retry_count, max_retries, payload")
    .in("status", ["failed", "retrying"])
    .lt("retry_count", 3)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!failedPushes || failedPushes.length === 0) {
    return jsonResponse({ success: true, message: "No failed sales to retry", retried: 0 });
  }

  let succeeded = 0;
  let failed = 0;
  const results: any[] = [];

  for (const push of failedPushes) {
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, ultimatepos_sale_id")
      .eq("id", push.order_id)
      .maybeSingle();

    if (!order || order.ultimatepos_sale_id) {
      await supabase
        .from("ultimatepos_sale_pushes")
        .update({ status: "success", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", push.id);
      continue;
    }

    try {
      const token = await getAccessToken(config);
      const result = await posApiPost(config, token, "sales", push.payload);
      const posSaleId = String(result.id || result.sale_id || result.data?.id || "");

      await supabase
        .from("orders")
        .update({ ultimatepos_sale_id: posSaleId })
        .eq("id", order.id);

      await supabase
        .from("ultimatepos_sale_pushes")
        .update({
          status: "success",
          ultimatepos_sale_id: posSaleId,
          response: result,
          error_message: null,
          pushed_at: new Date().toISOString(),
          next_retry_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", push.id);

      succeeded++;
      results.push({ orderId: order.id, status: "success", posSaleId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      const newRetryCount = push.retry_count + 1;
      const status = newRetryCount >= push.max_retries ? "failed" : "retrying";

      await supabase
        .from("ultimatepos_sale_pushes")
        .update({
          status,
          error_message: errorMsg,
          retry_count: newRetryCount,
          next_retry_at: status === "retrying" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", push.id);

      failed++;
      results.push({ orderId: order.id, status, error: errorMsg });
    }
  }

  return jsonResponse({
    success: true,
    message: `Retry complete: ${succeeded} succeeded, ${failed} still failing`,
    retried: failedPushes.length,
    succeeded,
    failed,
    results,
  });
}

// ============================================================
// Helpers
// ============================================================
function mapPaymentMethod(method: string | null): string {
  if (!method) return "cash";
  const m = method.toLowerCase();
  if (m === "card" || m === "credit_card" || m === "debit_card") return "card";
  if (m === "cash") return "cash";
  if (m === "qr" || m === "qr_code") return "qr";
  return m;
}

async function logSync(
  supabase: any,
  syncType: string,
  status: string,
  processed: number,
  created: number,
  updated: number,
  skipped: number,
  errorMessage?: string | null,
  details?: any[]
): Promise<void> {
  await supabase.from("ultimatepos_sync_logs").insert({
    sync_type: syncType,
    status,
    records_processed: processed,
    records_created: created,
    records_updated: updated,
    records_skipped: skipped,
    error_message: errorMessage || null,
    details: details || {},
  });
}
