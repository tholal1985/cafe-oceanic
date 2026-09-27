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

// ============================================================
// Path parsing — supports both native and WooCommerce formats
// Native:   /products, /products/{id}
// WooCommerce: /wc/v3/products, /wc/v3/products/{id}
// ============================================================
interface ParsedPath {
  resource: string;
  id: string | null;
  isWooCommerce: boolean;
}

function parsePath(pathname: string): ParsedPath {
  let path = pathname.replace(/^\/functions\/v1\/rest-api\/?/, "");
  const isWooCommerce = path.startsWith("wc/v3/");
  if (isWooCommerce) {
    path = path.replace(/^wc\/v3\//, "");
  }
  const parts = path.split("/").filter(Boolean);
  return {
    resource: parts[0] || "",
    id: parts[1] || null,
    isWooCommerce,
  };
}

// ============================================================
// Auth extraction — supports headers, query params, and HTTP Basic
// ============================================================
function extractCredentials(req: Request, url: URL): { key: string; secret: string } | null {
  // 1. X-Consumer-Key / X-Consumer-Secret headers
  const headerKey = req.headers.get("x-consumer-key");
  const headerSecret = req.headers.get("x-consumer-secret");
  if (headerKey && headerSecret) return { key: headerKey, secret: headerSecret };

  // 2. Query parameters (WooCommerce style)
  const queryKey = url.searchParams.get("consumer_key");
  const querySecret = url.searchParams.get("consumer_secret");
  if (queryKey && querySecret) return { key: queryKey, secret: querySecret };

  // 3. HTTP Basic Auth (WooCommerce style)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIdx = decoded.indexOf(":");
      if (colonIdx > 0) {
        const basicKey = decoded.slice(0, colonIdx);
        const basicSecret = decoded.slice(colonIdx + 1);
        if (basicKey && basicSecret) return { key: basicKey, secret: basicSecret };
      }
    } catch { /* invalid base64 */ }
  }

  return null;
}

// ============================================================
// WooCommerce response formatters
// ============================================================
function formatWooProduct(p: any): any {
  return {
    id: p.id,
    name: p.name,
    slug: p.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "",
    permalink: `/product/${p.id}`,
    date_created: p.created_at,
    date_modified: p.updated_at,
    type: "simple",
    status: p.is_available ? "publish" : "draft",
    featured: false,
    catalog_visibility: "visible",
    description: p.description || "",
    short_description: p.description || "",
    sku: p.ultimatepos_id || "",
    price: String(p.price ?? "0"),
    regular_price: String(p.price ?? "0"),
    sale_price: "",
    on_sale: false,
    purchasable: p.is_available ?? true,
    total_sales: 0,
    virtual: false,
    downloadable: false,
    downloads: [],
    download_limit: -1,
    download_expiry: -1,
    external_url: "",
    button_text: "",
    tax_status: "taxable",
    tax_class: "",
    manage_stock: false,
    stock_quantity: null,
    stock_status: "instock",
    backorders: "no",
    backorders_allowed: false,
    backordered: false,
    sold_individually: false,
    weight: "",
    dimensions: { length: "", width: "", height: "" },
    shipping_required: false,
    shipping_taxable: false,
    reviews_allowed: true,
    average_rating: "0",
    rating_count: 0,
    related_ids: [],
    upsell_ids: [],
    cross_sell_ids: [],
    parent_id: 0,
    purchase_note: "",
    categories: [],
    tags: [],
    images: p.image_url ? [{ id: 0, src: p.image_url, name: p.name, alt: p.name }] : [],
    attributes: [],
    default_attributes: [],
    variations: [],
    grouped_products: [],
    menu_order: p.display_order ?? 0,
    meta_data: [
      { key: "_cost", value: p.cost ?? "0" },
      { key: "_recipe", value: p.recipe ?? "" },
    ],
  };
}

function formatWooCategory(c: any): any {
  return {
    id: c.id,
    name: c.name,
    slug: c.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "",
    parent: 0,
    description: "",
    display: "default",
    image: c.image_url ? { src: c.image_url } : null,
    menu_order: c.display_order ?? 0,
    count: 0,
  };
}

function formatWooOrder(o: any): any {
  return {
    id: o.id,
    number: o.order_number || String(o.id).slice(0, 8),
    order_key: `wc_order_${String(o.id).replace(/-/g, "").slice(0, 20)}`,
    date_created: o.created_at,
    date_modified: o.updated_at,
    status: mapOrderStatusToWoo(o.status),
    currency: "USD",
    total: String(o.total_price ?? "0"),
    total_tax: "0",
    shipping_total: "0",
    discount_total: "0",
    payment_method: o.payment_method || "",
    payment_method_title: o.payment_method || "",
    prices_include_tax: false,
    customer_id: o.customer_id ? 0 : 0,
    customer_note: "",
    billing: {
      first_name: "",
      last_name: "",
      company: "",
      email: "",
      phone: o.phone_number || "",
      address_1: "",
      address_2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    shipping: {
      first_name: "",
      last_name: "",
      company: "",
      address_1: "",
      address_2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    line_items: (o.order_items || []).map((item: any) => ({
      id: item.id,
      name: item.product_name,
      product_id: item.product_id,
      variation_id: 0,
      quantity: item.quantity,
      tax_class: "",
      subtotal: String(item.product_price ?? "0"),
      subtotal_tax: "0",
      total: String(item.item_total ?? "0"),
      total_tax: "0",
      sku: "",
      price: parseFloat(item.product_price) || 0,
      meta_data: item.addons ? [{ key: "addons", value: item.addons }] : [],
    })),
    tax_lines: [],
    shipping_lines: [],
    fee_lines: [],
    coupon_lines: [],
    refunds: [],
    meta_data: [
      { key: "_order_type", value: o.order_type || "dine_in" },
      { key: "_ultimatepos_sale_id", value: o.ultimatepos_sale_id || "" },
    ],
  };
}

function mapOrderStatusToWoo(status: string): string {
  const map: Record<string, string> = {
    pending: "pending",
    confirmed: "processing",
    preparing: "processing",
    ready: "completed",
    completed: "completed",
    cancelled: "cancelled",
    delivered: "completed",
    served: "completed",
  };
  return map[status] || status || "pending";
}

function mapWooStatusFromWoo(wooStatus: string): string {
  const map: Record<string, string> = {
    pending: "pending",
    processing: "confirmed",
    on_hold: "confirmed",
    completed: "completed",
    cancelled: "cancelled",
    refunded: "cancelled",
    failed: "cancelled",
  };
  return map[wooStatus] || wooStatus || "pending";
}

function formatWooCustomer(c: any): any {
  return {
    id: c.id,
    date_created: c.created_at,
    date_modified: c.updated_at,
    email: c.email || "",
    first_name: c.first_name || "",
    last_name: c.last_name || "",
    role: "customer",
    username: c.email ? c.email.split("@")[0] : (c.phone || String(c.id)),
    billing: {
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      company: "",
      email: c.email || "",
      phone: c.phone || "",
      address_1: "",
      address_2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    shipping: {
      first_name: c.first_name || "",
      last_name: c.last_name || "",
      company: "",
      address_1: "",
      address_2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    is_paying_customer: false,
    orders_count: c.total_visits || 0,
    total_spent: String(c.total_spent || "0"),
    avatar_url: "",
    meta_data: [
      { key: "_loyalty_points", value: c.loyalty_points || 0 },
      { key: "_ultimatepos_id", value: c.ultimatepos_id || "" },
      { key: "_phone", value: c.phone || "" },
    ],
  };
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const url = new URL(req.url);
  const { resource, id, isWooCommerce } = parsePath(url.pathname);

  if (!resource) {
    return errorResponse(200, "REST API is running. Available endpoints: /products, /categories, /orders, /customers, /addons, /wc/v3/products, /wc/v3/categories, /wc/v3/orders, /wc/v3/customers");
  }

  const creds = extractCredentials(req, url);
  if (!creds) {
    await logRequest(null, resource, req.method, 401, req, startTime);
    return errorResponse(401, "Missing credentials. Provide Consumer Key and Consumer Secret via headers (X-Consumer-Key, X-Consumer-Secret), query params (consumer_key, consumer_secret), or HTTP Basic Auth.");
  }

  const validation = await validateKey(creds.key, creds.secret);
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
        return await handleProducts(req, supabase, id, url, validation.api_key_id!, startTime, isWooCommerce);
      case "categories":
        return await handleCategories(req, supabase, id, url, validation.api_key_id!, startTime, isWooCommerce);
      case "orders":
        return await handleOrders(req, supabase, id, url, validation.api_key_id!, startTime, isWooCommerce);
      case "customers":
        return await handleCustomers(req, supabase, id, url, validation.api_key_id!, startTime, isWooCommerce);
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
async function handleProducts(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number, isWoo: boolean): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "products", "GET", 404, req, startTime); return errorResponse(404, "Product not found"); }
    await logRequest(apiKeyId, "products", "GET", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooProduct(data) : data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("per_page") || url.searchParams.get("limit") || "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const search = url.searchParams.get("search") || url.searchParams.get("q");
    let query = supabase.from("products").select("*", { count: "exact" });
    if (search) query = query.ilike("name", `%${search}%`);
    const { data, error, count } = await query.range(offset, offset + limit - 1).order("display_order", { ascending: true });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "products", "GET", 200, req, startTime);
    if (isWoo) {
      const headers = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-WP-Total": String(count || 0),
        "X-WP-TotalPages": String(Math.ceil((count || 0) / limit)),
      };
      return new Response(JSON.stringify((data || []).map(formatWooProduct)), { status: 200, headers });
    }
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const insertData = isWoo ? {
      name: body.name,
      description: body.description || body.short_description || "",
      price: parseFloat(body.regular_price || body.price || "0"),
      image_url: body.images?.[0]?.src || null,
      is_available: body.status !== "draft",
      display_order: body.menu_order || 0,
    } : body;
    const { data, error } = await supabase.from("products").insert(insertData).select("*").single();
    if (error) return errorResponse(400, "Failed to create product", error.message);
    await logRequest(apiKeyId, "products", "POST", 201, req, startTime);
    return jsonResponse(isWoo ? formatWooProduct(data) : data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const updateData: any = {};
    if (isWoo) {
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.regular_price !== undefined) updateData.price = parseFloat(body.regular_price);
      if (body.price !== undefined) updateData.price = parseFloat(body.price);
      if (body.images !== undefined) updateData.image_url = body.images?.[0]?.src || null;
      if (body.status !== undefined) updateData.is_available = body.status !== "draft";
      if (body.menu_order !== undefined) updateData.display_order = body.menu_order;
    } else {
      Object.assign(updateData, body);
    }
    const { data, error } = await supabase.from("products").update(updateData).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update product", error.message);
    if (!data) { await logRequest(apiKeyId, "products", "PUT", 404, req, startTime); return errorResponse(404, "Product not found"); }
    await logRequest(apiKeyId, "products", "PUT", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooProduct(data) : data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete product", error.message);
    await logRequest(apiKeyId, "products", "DELETE", 200, req, startTime);
    return jsonResponse(isWoo ? { deleted: true, previous: { id } } : { success: true, message: "Product deleted" });
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Categories
// ============================================================
async function handleCategories(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number, isWoo: boolean): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "categories", "GET", 404, req, startTime); return errorResponse(404, "Category not found"); }
    await logRequest(apiKeyId, "categories", "GET", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooCategory(data) : data);
  }

  if (req.method === "GET") {
    const { data, error } = await supabase.from("categories").select("*").order("display_order", { ascending: true });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "categories", "GET", 200, req, startTime);
    if (isWoo) {
      const headers = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-WP-Total": String(data?.length || 0),
        "X-WP-TotalPages": "1",
      };
      return new Response(JSON.stringify((data || []).map(formatWooCategory)), { status: 200, headers });
    }
    return jsonResponse({ data });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const insertData = isWoo ? {
      name: body.name,
      image_url: body.image?.src || null,
      display_order: body.menu_order || 0,
      is_active: true,
    } : body;
    const { data, error } = await supabase.from("categories").insert(insertData).select("*").single();
    if (error) return errorResponse(400, "Failed to create category", error.message);
    await logRequest(apiKeyId, "categories", "POST", 201, req, startTime);
    return jsonResponse(isWoo ? formatWooCategory(data) : data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const updateData: any = {};
    if (isWoo) {
      if (body.name !== undefined) updateData.name = body.name;
      if (body.image !== undefined) updateData.image_url = body.image?.src || null;
      if (body.menu_order !== undefined) updateData.display_order = body.menu_order;
    } else {
      Object.assign(updateData, body);
    }
    const { data, error } = await supabase.from("categories").update(updateData).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update category", error.message);
    if (!data) { await logRequest(apiKeyId, "categories", "PUT", 404, req, startTime); return errorResponse(404, "Category not found"); }
    await logRequest(apiKeyId, "categories", "PUT", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooCategory(data) : data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete category", error.message);
    await logRequest(apiKeyId, "categories", "DELETE", 200, req, startTime);
    return jsonResponse(isWoo ? { deleted: true, previous: { id } } : { success: true, message: "Category deleted" });
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Orders
// ============================================================
async function handleOrders(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number, isWoo: boolean): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "orders", "GET", 404, req, startTime); return errorResponse(404, "Order not found"); }
    await logRequest(apiKeyId, "orders", "GET", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooOrder(data) : data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("per_page") || url.searchParams.get("limit") || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");
    let query = supabase.from("orders").select("*, order_items(*)", { count: "exact" });
    if (status) {
      const mappedStatus = isWoo ? mapWooStatusFromWoo(status) : status;
      query = query.eq("status", mappedStatus);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "orders", "GET", 200, req, startTime);
    if (isWoo) {
      const headers = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-WP-Total": String(count || 0),
        "X-WP-TotalPages": String(Math.ceil((count || 0) / limit)),
      };
      return new Response(JSON.stringify((data || []).map(formatWooOrder)), { status: 200, headers });
    }
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    let orderData: any;
    let orderItems: any[] = [];

    if (isWoo) {
      orderData = {
        status: mapWooStatusFromWoo(body.status || "pending"),
        payment_method: body.payment_method_title || body.payment_method || "",
        payment_status: body.set_paid ? "paid" : "pending",
        phone_number: body.billing?.phone || "",
        order_type: body.meta_data?.find((m: any) => m.key === "_order_type")?.value || "dine_in",
        total_price: parseFloat(body.total || "0"),
      };
      orderItems = (body.line_items || []).map((item: any) => ({
        product_id: item.product_id,
        product_name: item.name,
        product_price: parseFloat(item.subtotal || item.price || "0"),
        quantity: item.quantity,
        item_total: parseFloat(item.total || "0"),
        addons: item.meta_data?.find((m: any) => m.key === "addons")?.value || null,
      }));
    } else {
      const { order_items, ...rest } = body;
      orderData = rest;
      orderItems = order_items || [];
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select("*")
      .single();
    if (orderError) return errorResponse(400, "Failed to create order", orderError.message);

    if (orderItems.length > 0) {
      const items = orderItems.map((item: any) => ({ ...item, order_id: order.id }));
      const { error: itemsError } = await supabase.from("order_items").insert(items);
      if (itemsError) {
        await logRequest(apiKeyId, "orders", "POST", 400, req, startTime);
        return errorResponse(400, "Order created but failed to add items", itemsError.message);
      }
    }

    const { data: fullOrder } = await supabase.from("orders").select("*, order_items(*)").eq("id", order.id).maybeSingle();
    await logRequest(apiKeyId, "orders", "POST", 201, req, startTime);
    return jsonResponse(isWoo ? formatWooOrder(fullOrder || order) : (fullOrder || order), 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    let updateData: any;

    if (isWoo) {
      updateData = {};
      if (body.status !== undefined) updateData.status = mapWooStatusFromWoo(body.status);
      if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;
      if (body.set_paid !== undefined) updateData.payment_status = body.set_paid ? "paid" : "pending";
      if (body.billing?.phone !== undefined) updateData.phone_number = body.billing.phone;
      if (body.total !== undefined) updateData.total_price = parseFloat(body.total);
      const orderTypeMeta = body.meta_data?.find((m: any) => m.key === "_order_type");
      if (orderTypeMeta) updateData.order_type = orderTypeMeta.value;
    } else {
      const { order_items, ...rest } = body;
      updateData = rest;
    }

    const { data, error } = await supabase.from("orders").update(updateData).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update order", error.message);
    if (!data) { await logRequest(apiKeyId, "orders", "PUT", 404, req, startTime); return errorResponse(404, "Order not found"); }
    await logRequest(apiKeyId, "orders", "PUT", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooOrder(data) : data);
  }

  return errorResponse(405, "Method not allowed");
}

// ============================================================
// Customers
// ============================================================
async function handleCustomers(req: Request, supabase: any, id: string | null, url: URL, apiKeyId: string, startTime: number, isWoo: boolean): Promise<Response> {
  if (req.method === "GET" && id) {
    const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) return errorResponse(500, "Database error", error.message);
    if (!data) { await logRequest(apiKeyId, "customers", "GET", 404, req, startTime); return errorResponse(404, "Customer not found"); }
    await logRequest(apiKeyId, "customers", "GET", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooCustomer(data) : data);
  }

  if (req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("per_page") || url.searchParams.get("limit") || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const search = url.searchParams.get("search");
    let query = supabase.from("customers").select("*", { count: "exact" });
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (error) return errorResponse(500, "Database error", error.message);
    await logRequest(apiKeyId, "customers", "GET", 200, req, startTime);
    if (isWoo) {
      const headers = {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-WP-Total": String(count || 0),
        "X-WP-TotalPages": String(Math.ceil((count || 0) / limit)),
      };
      return new Response(JSON.stringify((data || []).map(formatWooCustomer)), { status: 200, headers });
    }
    return jsonResponse({ data, total: count, limit, offset });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const insertData = isWoo ? {
      first_name: body.first_name || body.billing?.first_name || "",
      last_name: body.last_name || body.billing?.last_name || "",
      email: body.email || body.billing?.email || null,
      phone: body.billing?.phone || "",
      is_active: true,
    } : body;
    const { data, error } = await supabase.from("customers").insert(insertData).select("*").single();
    if (error) return errorResponse(400, "Failed to create customer", error.message);
    await logRequest(apiKeyId, "customers", "POST", 201, req, startTime);
    return jsonResponse(isWoo ? formatWooCustomer(data) : data, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    const updateData: any = {};
    if (isWoo) {
      if (body.first_name !== undefined) updateData.first_name = body.first_name;
      if (body.last_name !== undefined) updateData.last_name = body.last_name;
      if (body.email !== undefined) updateData.email = body.email;
      if (body.billing?.first_name !== undefined) updateData.first_name = body.billing.first_name;
      if (body.billing?.last_name !== undefined) updateData.last_name = body.billing.last_name;
      if (body.billing?.email !== undefined) updateData.email = body.billing.email;
      if (body.billing?.phone !== undefined) updateData.phone = body.billing.phone;
    } else {
      Object.assign(updateData, body);
    }
    const { data, error } = await supabase.from("customers").update(updateData).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(400, "Failed to update customer", error.message);
    if (!data) { await logRequest(apiKeyId, "customers", "PUT", 404, req, startTime); return errorResponse(404, "Customer not found"); }
    await logRequest(apiKeyId, "customers", "PUT", 200, req, startTime);
    return jsonResponse(isWoo ? formatWooCustomer(data) : data);
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return errorResponse(400, "Failed to delete customer", error.message);
    await logRequest(apiKeyId, "customers", "DELETE", 200, req, startTime);
    return jsonResponse(isWoo ? { deleted: true, previous: { id } } : { success: true, message: "Customer deleted" });
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
