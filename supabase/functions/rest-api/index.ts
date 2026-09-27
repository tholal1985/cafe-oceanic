import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Consumer-Key, X-Consumer-Secret, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ApiKeyValidation {
  is_valid: boolean;
  api_key_id: string | null;
  rate_limit: number;
  request_count: number;
  permissions: Record<string, string[]> | null;
}

async function hashSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function validateKey(consumerKey: string, consumerSecret: string): Promise<ApiKeyValidation | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const secretHash = await hashSecret(consumerSecret);

  const { data, error } = await supabase
    .rpc("validate_api_key", {
      p_consumer_key: consumerKey,
      p_consumer_secret_hash: secretHash,
      p_endpoint: "",
    })
    .maybeSingle();

  if (error || !data || !data.is_valid) {
    return data ? data as ApiKeyValidation : null;
  }
  return data as ApiKeyValidation;
}

async function logRequest(
  apiKeyId: string | null,
  endpoint: string,
  method: string,
  statusCode: number,
  req: Request,
  startTime: number,
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const responseTime = Date.now() - startTime;
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  await supabase.rpc("log_api_request", {
    p_api_key_id: apiKeyId,
    p_endpoint,
    p_method: method,
    p_status_code: statusCode,
    p_ip_address: ip,
    p_user_agent: userAgent,
    p_response_time_ms: responseTime,
  });
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

function checkPermission(permissions: Record<string, string[]> | null, resource: string, action: string): boolean {
  if (!permissions) return false;
  const perms = permissions[resource];
  if (!perms) return false;
  return perms.includes(action) || perms.includes("*");
}

function parsePath(pathname: string): { resource: string; id: string | null } {
  const parts = pathname.replace(/^\/functions\/v1\/rest-api\/?/, "").split("/").filter(Boolean);
  return {
    resource: parts[0] || "",
    id: parts[1] || null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const url = new URL(req.url);
  const { resource, id } = parsePath(url.pathname);

  if (!resource) {
    return errorResponse(200, "REST API is running. Available endpoints: /products, /categories, /orders, /customers, /addons");
  }

  const consumerKey = req.headers.get("x-consumer-key") || url.searchParams.get("consumer_key");
  const consumerSecret = req.headers.get("x-consumer-secret") || url.searchParams.get("consumer_secret");

  if (!consumerKey || !consumerSecret) {
    await logRequest(null, resource, req.method, 401, req, startTime);
    return errorResponse(401, "Missing credentials. Provide Consumer Key and Consumer Secret via the X-Consumer-Key and X-Consumer-Secret headers, or as consumer_key and consumer_secret query parameters.");
  }

  const validation = await validateKey(consumerKey, consumerSecret);
  if (!validation || !validation.is_valid) {
    const reason = validation && validation.request_count >= validation.rate_limit
      ? "Rate limit exceeded. Too many requests in the last hour."
      : "Invalid, inactive, or expired credentials.";
    await logRequest(validation?.api_key_id ?? null, resource, req.method, 401, req, startTime);
    return errorResponse(401, reason);
  }

  const action = req.method === "GET" ? "read" : "write";
  if (!checkPermission(validation.permissions, resource, action)) {
    await logRequest(validation.api_key_id, resource, req.method, 403, req, startTime);
    return errorResponse(403, `Your API key does not have ${action} permission for ${resource}.`);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    switch (resource) {
      case "products":
        return await handleProducts(req, supabase, id, url, validation.api_key_id!, startTime);
      case "categories":
        return await handleCategories(req, supabase, id, validation.api_key_id!, startTime);
      case "orders":
        return await handleOrders(req, supabase, id, url, validation.api_key_id!, startTime);
      case "customers":
        return await handleCustomers(req, supabase, id, url, validation.api_key_id!, startTime);
      case "addons":
        return await handleAddons(req, supabase, id, validation.api_key_id!, startTime);
      default:
        await logRequest(validation.api_key_id, resource, req.method, 404, req, startTime);
        return errorResponse(404, `Unknown resource: ${resource}. Available: products, categories, orders, customers, addons`);
    }
  } catch (error) {
    console.error("REST API error:", error);
    await logRequest(validation.api_key_id, resource, req.method, 500, req, startTime);
    return errorResponse(500, "Internal server error", error instanceof Error ? error.message : undefined);
  }
});

// ============================================================
// Products
// ============================================================
async function handleProducts(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "products", "GET", 404, req, startTime); return errorResponse(404, "Product not found"); }
    await logRequest(apiKeyId, "products", "GET", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const { data, error, count } = await supabase.from("products").select("*", { count: "exact" }).range(offset, offset + limit - 1).order("display_order", { ascending: true });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "products", "GET", 200, req, startTime);
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { data, error } = await supabase.from("products").insert(body).select("*").single();
    if (error) return errorResponse(400, "Failed to create product", error.message);
    await logRequest(apiKeyId, "products", "POST", 201, req, startTime);
    return jsonResponse(data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const { data, error } = await supabase.from("products").update(body).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update product", error.message);
    if (!data) { await logRequest(apiKeyId, "products", "PUT", 404, req, startTime); return errorResponse(404, "Product not found"); }
    await logRequest(apiKeyId, "products", "PUT", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete product", error.message);
    await logRequest(apiKeyId, "products", "DELETE", 200, req, startTime);
    return jsonResponse({ success: true, message: "Product deleted" });
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Categories
// ============================================================
async function handleCategories(req: Request, supabase: any, id: string | null, apiKeyId: string, startTime: number): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "categories", "GET", 404, req, startTime); return errorResponse(404, "Category not found"); }
    await logRequest(apiKeyId, "categories", "GET", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "GET") {
    const { data, error } = await supabase.from("categories").select("*").order("display_order", { ascending: true });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "categories", "GET", 200, req, startTime);
    return jsonResponse({ data });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { data, error } = await supabase.from("categories").insert(body).select("*").single();
    if (error) return errorResponse(400, "Failed to create category", error.message);
    await logRequest(apiKeyId, "categories", "POST", 201, req, startTime);
    return jsonResponse(data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const { data, error } = await supabase.from("categories").update(body).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update category", error.message);
    if (!data) { await logRequest(apiKeyId, "categories", "PUT", 404, req, startTime); return errorResponse(404, "Category not found"); }
    await logRequest(apiKeyId, "categories", "PUT", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete category", error.message);
    await logRequest(apiKeyId, "categories", "DELETE", 200, req, startTime);
    return jsonResponse({ success: true, message: "Category deleted" });
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Orders
// ============================================================
async function handleOrders(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "orders", "GET", 404, req, startTime); return errorResponse(404, "Order not found"); }
    await logRequest(apiKeyId, "orders", "GET", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");
    let query = supabase.from("orders").select("*, order_items(*)", { count: "exact" });
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "orders", "GET", 200, req, startTime);
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { order_items, ...orderData } = body;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select("*")
      .single();
    if (orderError) return errorResponse(400, "Failed to create order", orderError.message);

    if (order_items && Array.isArray(order_items) && order_items.length > 0) {
      const items = order_items.map((item: any) => ({ ...item, order_id: order.id }));
      const { error: itemsError } = await supabase.from("order_items").insert(items);
      if (itemsError) {
        await logRequest(apiKeyId, "orders", "POST", 400, req, startTime);
        return errorResponse(400, "Order created but failed to add items", itemsError.message);
      }
    }

    await logRequest(apiKeyId, "orders", "POST", 201, req, startTime);
    return jsonResponse(order, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const { order_items, ...orderData } = body;
    const { data, error } = await supabase.from("orders").update(orderData).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update order", error.message);
    if (!data) { await logRequest(apiKeyId, "orders", "PUT", 404, req, startTime); return errorResponse(404, "Order not found"); }
    await logRequest(apiKeyId, "orders", "PUT", 200, req, startTime);
    return jsonResponse(data);
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Customers
// ============================================================
async function handleCustomers(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "customers", "GET", 404, req, startTime); return errorResponse(404, "Customer not found"); }
    await logRequest(apiKeyId, "customers", "GET", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const search = url.searchParams.get("search");
    let query = supabase.from("customers").select("*", { count: "exact" });
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "customers", "GET", 200, req, startTime);
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { data, error } = await supabase.from("customers").insert(body).select("*").single();
    if (error) return errorResponse(400, "Failed to create customer", error.message);
    await logRequest(apiKeyId, "customers", "POST", 201, req, startTime);
    return jsonResponse(data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const { data, error } = await supabase.from("customers").update(body).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update customer", error.message);
    if (!data) { await logRequest(apiKeyId, "customers", "PUT", 404, req, startTime); return errorResponse(404, "Customer not found"); }
    await logRequest(apiKeyId, "customers", "PUT", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete customer", error.message);
    await logRequest(apiKeyId, "customers", "DELETE", 200, req, startTime);
    return jsonResponse({ success: true, message: "Customer deleted" });
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Addons
// ============================================================
async function handleAddons(req: Request, supabase: any, id: string | null, apiKeyId: string, startTime: number): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("addons").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "addons", "GET", 404, req, startTime); return errorResponse(404, "Addon not found"); }
    await logRequest(apiKeyId, "addons", "GET", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "GET") {
    const { data, error } = await supabase.from("addons").select("*").order("name", { ascending: true });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "addons", "GET", 200, req, startTime);
    return jsonResponse({ data });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { data, error } = await supabase.from("addons").insert(body).select("*").single();
    if (error) return errorResponse(400, "Failed to create addon", error.message);
    await logRequest(apiKeyId, "addons", "POST", 201, req, startTime);
    return jsonResponse(data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const { data, error } = await supabase.from("addons").update(body).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update addon", error.message);
    if (!data) { await logRequest(apiKeyId, "addons", "PUT", 404, req, startTime); return errorResponse(404, "Addon not found"); }
    await logRequest(apiKeyId, "addons", "PUT", 200, req, startTime);
    return jsonResponse(data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("addons").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete addon", error.message);
    await logRequest(apiKeyId, "addons", "DELETE", 200, req, startTime);
    return jsonResponse({ success: true, message: "Addon deleted" });
  }

  return errorResponse(405, "Method not allowed");
}
