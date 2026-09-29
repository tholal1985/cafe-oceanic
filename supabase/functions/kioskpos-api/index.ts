import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, randomBytes } from "node:crypto";

// ── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Kiosk-Key, Idempotency-Key",
};

// ── Supabase client (service role, bypasses RLS) ─────────────────────────────

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── Types ───────────────────────────────────────────────────────────────────

interface KioskRecord {
  id: string;
  name: string;
  kiosk_code: string;
  location_id: number | null;
  api_key_hash: string;
  status: string;
  last_seen_at: string | null;
}

interface SystemSettings {
  id: string;
  ultimatepos_url: string | null;
  ultimatepos_location_id: number;
  mock_mode: boolean;
  sync_interval_minutes: number;
  rate_limit_per_minute: number;
  allowed_origins: string | null;
  currency: string;
  timezone: string;
}

interface UltimatePOSConfig {
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
}

interface NormalizedProduct {
  id: string;
  sku: string | null;
  name: string;
  category: { id: string | null; name: string | null };
  price: number;
  stock: number;
  image: string | null;
  is_available: boolean;
}

// ── Response helpers ────────────────────────────────────────────────────────

function successResponse(data: unknown, pagination?: unknown): Response {
  const body: Record<string, unknown> = { success: true, data };
  if (pagination) body.pagination = pagination;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, statusCode = 400, requestId?: string): Response {
  const body: Record<string, unknown> = {
    success: false,
    error: { code, message, ...(requestId ? { request_id: requestId } : {}) },
  };
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateRequestId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = randomBytes(4).toString("hex");
  return `REQ-${date}-${rand}`;
}

function generateOrderNumber(kioskCode: string): string {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 999999).toString().padStart(6, "0");
  return `${kioskCode}-${stamp}-${rand}`;
}

function generateApiKey(): string {
  return `kiosk_${randomBytes(24).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ── Settings & config loaders ──────────────────────────────────────────────

async function getSystemSettings(): Promise<SystemSettings> {
  const { data } = await supabase
    .from("kp_system_settings")
    .select("*")
    .limit(1)
    .single();
  return data as SystemSettings;
}

async function getUltimatePOSConfig(): Promise<UltimatePOSConfig | null> {
  const { data } = await supabase
    .from("ultimatepos_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data as UltimatePOSConfig | null;
}

// ── Kiosk authentication ────────────────────────────────────────────────────

async function authenticateKiosk(req: Request): Promise<{ kiosk: KioskRecord | null; error?: Response }> {
  const key = req.headers.get("X-Kiosk-Key");
  if (!key) {
    return { kiosk: null, error: errorResponse("MISSING_API_KEY", "X-Kiosk-Key header is required", 401) };
  }

  const keyHash = hashApiKey(key);
  const { data: kiosk, error } = await supabase
    .from("kp_kiosks")
    .select("*")
    .eq("api_key_hash", keyHash)
    .maybeSingle();

  if (error || !kiosk) {
    return { kiosk: null, error: errorResponse("INVALID_API_KEY", "Invalid kiosk API key", 401) };
  }

  if (kiosk.status === "blocked") {
    return { kiosk: null, error: errorResponse("KIOSK_BLOCKED", "This kiosk is blocked", 403) };
  }

  if (kiosk.status === "inactive") {
    return { kiosk: null, error: errorResponse("KIOSK_INACTIVE", "This kiosk is inactive", 403) };
  }

  // Update last_seen_at
  await supabase
    .from("kp_kiosks")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", kiosk.id);

  return { kiosk: kiosk as KioskRecord };
}

// ── Rate limiting ────────────────────────────────────────────────────────────

async function checkRateLimit(kioskId: string, limit: number): Promise<boolean> {
  const { data } = await supabase.rpc("kp_check_rate_limit", {
    p_kiosk_id: kioskId,
    p_limit: limit,
  });
  return data === true;
}

// ── API logging ──────────────────────────────────────────────────────────────

async function logApiRequest(
  kioskId: string | null,
  requestId: string,
  method: string,
  endpoint: string,
  statusCode: number,
  durationMs: number,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await supabase.from("kp_api_logs").insert({
    kiosk_id: kioskId,
    request_id: requestId,
    method,
    endpoint,
    status_code: statusCode,
    duration_ms: durationMs,
    success,
    error_message: errorMessage || null,
  });
}

// ── UltimatePOS client ──────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getUltimatePOSToken(config: UltimatePOSConfig): Promise<string> {
  if (config.auth_mode === "pat" && config.personal_access_token) {
    return config.personal_access_token;
  }

  if (tokenCache && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  const baseUrl = (config.api_url || "").replace(/\/$/, "");
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.client_id || "",
    client_secret: config.client_secret || "",
    username: config.username || "",
    password: config.password || "",
  });

  const resp = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`UltimatePOS auth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error("No access_token in UltimatePOS response");

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

async function uposRequest(
  config: UltimatePOSConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getUltimatePOSToken(config);
  const baseUrl = (config.api_url || "").replace(/\/$/, "");
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await resp.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!resp.ok) {
      throw new Error(`UltimatePOS ${method} ${path} failed (${resp.status}): ${text}`);
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Mock UltimatePOS adapter ────────────────────────────────────────────────

function getMockProducts(): Record<string, unknown>[] {
  return [
    { id: 1, name: "Espresso", sku: "COF-001", category_id: 1, category_name: "Coffee", sell_price_inc_tax: 25, stock: 100, image: null, is_active: true, description: "Single shot espresso" },
    { id: 2, name: "Cappuccino", sku: "COF-002", category_id: 1, category_name: "Coffee", sell_price_inc_tax: 35, stock: 100, image: null, is_active: true, description: "Espresso with steamed milk" },
    { id: 3, name: "Latte", sku: "COF-003", category_id: 1, category_name: "Coffee", sell_price_inc_tax: 40, stock: 80, image: null, is_active: true, description: "Caffe latte" },
    { id: 4, name: "Croissant", sku: "BKR-001", category_id: 2, category_name: "Bakery", sell_price_inc_tax: 30, stock: 50, image: null, is_active: true, description: "Butter croissant" },
    { id: 5, name: "Sandwich", sku: "FD-001", category_id: 3, category_name: "Food", sell_price_inc_tax: 55, stock: 30, image: null, is_active: true, description: "Club sandwich" },
    { id: 6, name: "Orange Juice", sku: "BEV-001", category_id: 4, category_name: "Beverages", sell_price_inc_tax: 20, stock: 60, image: null, is_active: true, description: "Fresh orange juice" },
    { id: 7, name: "Water Bottle", sku: "BEV-002", category_id: 4, category_name: "Beverages", sell_price_inc_tax: 10, stock: 200, image: null, is_active: true, description: "500ml water" },
    { id: 8, name: "Chocolate Cake", sku: "DST-001", category_id: 5, category_name: "Desserts", sell_price_inc_tax: 45, stock: 25, image: null, is_active: true, description: "Slice of chocolate cake" },
  ];
}

function getMockCategories(): Record<string, unknown>[] {
  return [
    { id: 1, name: "Coffee", parent_id: null, is_active: true },
    { id: 2, name: "Bakery", parent_id: null, is_active: true },
    { id: 3, name: "Food", parent_id: null, is_active: true },
    { id: 4, name: "Beverages", parent_id: null, is_active: true },
    { id: 5, name: "Desserts", parent_id: null, is_active: true },
  ];
}

function getMockProduct(id: string): Record<string, unknown> | null {
  return getMockProducts().find(p => String(p.id) === String(id)) || null;
}

function mockCreateSale(items: { product_id: string; quantity: number }[]): Record<string, unknown> {
  const products = getMockProducts();
  let subtotal = 0;
  const lineItems = items.map((item, idx) => {
    const product = products.find(p => String(p.id) === String(item.product_id));
    if (!product) throw new Error(`Product ${item.product_id} not found`);
    const price = Number(product.sell_price_inc_tax);
    const lineTotal = price * item.quantity;
    subtotal += lineTotal;
    return {
      ultimatepos_product_id: String(product.id),
      sku: product.sku,
      product_name: product.name,
      quantity: item.quantity,
      unit_price: price,
      discount: 0,
      tax: 0,
      line_total: lineTotal,
    };
  });

  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const saleId = Math.floor(Math.random() * 999999) + 10000;
  const invoiceNumber = `INV-${String(saleId).padStart(5, "0")}`;

  return {
    sale_id: saleId,
    invoice_number: invoiceNumber,
    subtotal,
    tax,
    discount: 0,
    total,
    currency: "MVR",
    line_items: lineItems,
  };
}

// ── Product normalization ───────────────────────────────────────────────────

function normalizeProduct(raw: Record<string, unknown>): NormalizedProduct {
  return {
    id: String(raw.id ?? raw.ultimatepos_product_id ?? ""),
    sku: (raw.sku as string) ?? null,
    name: (raw.name as string) ?? "",
    category: {
      id: raw.category_id != null ? String(raw.category_id) : null,
      name: (raw.category_name as string) ?? null,
    },
    price: Number(raw.selling_price ?? raw.sell_price_inc_tax ?? 0),
    stock: Number(raw.stock_quantity ?? raw.stock ?? 0),
    image: (raw.image_url as string) ?? null,
    is_available: Boolean(raw.is_active ?? true),
  };
}

// ── Endpoint handlers ───────────────────────────────────────────────────────

async function handleHealth(settings: SystemSettings): Promise<Response> {
  let reachable = false;
  if (!settings.mock_mode && settings.ultimatepos_url) {
    try {
      const config = await getUltimatePOSConfig();
      if (config && config.is_active) {
        await uposRequest(config, "GET", "/connector/api/business_details");
        reachable = true;
      }
    } catch { reachable = false; }
  } else if (settings.mock_mode) {
    reachable = true;
  }

  return successResponse({
    service: "KioskPOS API Gateway",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    ultimatepos: {
      configured: Boolean(settings.ultimatepos_url || settings.mock_mode),
      reachable,
    },
  });
}

async function handleGetProducts(reqUrl: URL, settings: SystemSettings): Promise<Response> {
  const page = parseInt(reqUrl.searchParams.get("page") || "1", 10);
  const limit = Math.min(parseInt(reqUrl.searchParams.get("limit") || "50", 10), 100);
  const search = reqUrl.searchParams.get("search") || "";
  const categoryId = reqUrl.searchParams.get("category_id");
  const activeOnly = reqUrl.searchParams.get("active_only") !== "false";
  const offset = (page - 1) * limit;

  let query = supabase.from("kp_products_cache").select("*", { count: "exact" });

  if (activeOnly) query = query.eq("is_active", true);
  if (search) query = query.ilike("name", `%${search}%`);
  if (categoryId) query = query.eq("category_id", categoryId);

  query = query.order("name").range(offset, offset + limit - 1);
  const { data, count } = await query;

  const products = (data || []).map(normalizeProduct);

  return successResponse(products, {
    page,
    limit,
    total: count || 0,
  });
}

async function handleGetProduct(id: string): Promise<Response> {
  const { data } = await supabase
    .from("kp_products_cache")
    .select("*")
    .eq("ultimatepos_product_id", id)
    .maybeSingle();

  if (!data) return errorResponse("PRODUCT_NOT_FOUND", "Product was not found", 404);

  return successResponse(normalizeProduct(data));
}

async function handleGetCategories(): Promise<Response> {
  const { data } = await supabase
    .from("kp_categories_cache")
    .select("*")
    .order("name");

  const categories = (data || []).map((c: Record<string, unknown>) => ({
    id: String(c.ultimatepos_category_id ?? ""),
    name: c.name ?? "",
    parent_id: c.parent_id ? String(c.parent_id) : null,
    is_active: Boolean(c.is_active),
  }));

  return successResponse(categories);
}

async function handleGetStock(productId: string, settings: SystemSettings): Promise<Response> {
  const { data } = await supabase
    .from("kp_products_cache")
    .select("ultimatepos_product_id, stock_quantity, location_id, is_active")
    .eq("ultimatepos_product_id", productId)
    .maybeSingle();

  if (!data) return errorResponse("PRODUCT_NOT_FOUND", "Product was not found", 404);

  return successResponse({
    product_id: productId,
    location_id: data.location_id,
    stock: Number(data.stock_quantity),
    available: Number(data.stock_quantity) > 0 && data.is_active,
  });
}

async function handleCreateCustomer(body: { name?: string; phone?: string; email?: string }, settings: SystemSettings): Promise<Response> {
  if (!body.name) return errorResponse("VALIDATION_ERROR", "Customer name is required", 422);
  if (!body.phone) return errorResponse("VALIDATION_ERROR", "Customer phone is required", 422);

  if (!settings.mock_mode) {
    const config = await getUltimatePOSConfig();
    if (!config || !config.is_active) {
      return errorResponse("ULTIMATEPOS_NOT_CONFIGURED", "UltimatePOS is not configured", 503);
    }
    try {
      // TODO: Replace with actual UltimatePOS customer creation endpoint
      // The exact endpoint path and payload fields must match the UltimatePOS API documentation
      const result = await uposRequest(config, "POST", "/connector/api/contact", {
        name: body.name,
        mobile: body.phone,
        email: body.email || null,
        type: "customer",
      }) as Record<string, unknown>;
      return successResponse({
        id: String(result.id ?? ""),
        name: body.name,
        phone: body.phone,
        email: body.email || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return errorResponse("ULTIMATEPOS_ERROR", `Failed to create customer: ${msg}`, 502);
    }
  }

  // Mock mode
  const mockId = String(Math.floor(Math.random() * 999999) + 1000);
  return successResponse({
    id: mockId,
    name: body.name,
    phone: body.phone,
    email: body.email || null,
  });
}

async function handleCreateOrder(
  body: {
    location_id?: number;
    customer_id?: string | null;
    items: { product_id: string; quantity: number }[];
    payment_method?: string;
  },
  kiosk: KioskRecord,
  idempotencyKey: string,
  settings: SystemSettings
): Promise<Response> {
  if (!idempotencyKey) {
    return errorResponse("MISSING_IDEMPOTENCY_KEY", "Idempotency-Key header is required", 400);
  }

  if (!body.items || body.items.length === 0) {
    return errorResponse("VALIDATION_ERROR", "Order must contain at least one item", 422);
  }

  // Idempotency check: if an order with this key already exists, return it
  const { data: existingOrder } = await supabase
    .from("kp_orders")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingOrder) {
    const { data: items } = await supabase
      .from("kp_order_items")
      .select("*")
      .eq("order_id", existingOrder.id);

    return successResponse({
      order_id: existingOrder.id,
      order_number: existingOrder.order_number,
      ultimatepos_sale_id: existingOrder.ultimatepos_sale_id,
      invoice_number: existingOrder.ultimatepos_invoice_number,
      subtotal: Number(existingOrder.subtotal),
      tax: Number(existingOrder.tax),
      discount: Number(existingOrder.discount),
      total: Number(existingOrder.total),
      currency: existingOrder.currency,
      payment_status: existingOrder.payment_status,
      order_status: existingOrder.order_status,
    });
  }

  const orderNumber = generateOrderNumber(kiosk.kiosk_code);
  const locationId = body.location_id || kiosk.location_id || settings.ultimatepos_location_id;

  // Create pending order record
  const { data: order, error: orderError } = await supabase
    .from("kp_orders")
    .insert({
      order_number: orderNumber,
      kiosk_id: kiosk.id,
      location_id: locationId,
      customer_id: body.customer_id || null,
      payment_method: body.payment_method || "cash",
      payment_status: "pending",
      order_status: "processing",
      sync_status: "pending",
      idempotency_key: idempotencyKey,
      currency: settings.currency,
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
    })
    .select()
    .single();

  if (orderError || !order) {
    return errorResponse("ORDER_CREATE_FAILED", "Failed to create order record", 500);
  }

  // Validate products and get current prices from cache
  const lineItems: {
    ultimatepos_product_id: string;
    sku: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax: number;
    line_total: number;
  }[] = [];

  let subtotal = 0;

  for (const item of body.items) {
    const { data: product } = await supabase
      .from("kp_products_cache")
      .select("*")
      .eq("ultimatepos_product_id", String(item.product_id))
      .maybeSingle();

    if (!product) {
      await supabase
        .from("kp_orders")
        .update({
          order_status: "failed",
          sync_status: "failed",
          error_message: `Product ${item.product_id} not found`,
        })
        .eq("id", order.id);

      return errorResponse("PRODUCT_NOT_FOUND", `Product ${item.product_id} was not found`, 404);
    }

    if (!product.is_active) {
      await supabase
        .from("kp_orders")
        .update({
          order_status: "failed",
          sync_status: "failed",
          error_message: `Product ${product.name} is not available`,
        })
        .eq("id", order.id);

      return errorResponse("PRODUCT_UNAVAILABLE", `Product ${product.name} is not available`, 422);
    }

    if (Number(product.stock_quantity) < item.quantity) {
      await supabase
        .from("kp_orders")
        .update({
          order_status: "failed",
          sync_status: "failed",
          error_message: `Insufficient stock for ${product.name}`,
        })
        .eq("id", order.id);

      return errorResponse("INSUFFICIENT_STOCK", `Insufficient stock for ${product.name}`, 422);
    }

    const unitPrice = Number(product.selling_price);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    lineItems.push({
      ultimatepos_product_id: String(product.ultimatepos_product_id),
      sku: product.sku || "",
      product_name: product.name,
      quantity: item.quantity,
      unit_price: unitPrice,
      discount: 0,
      tax: 0,
      line_total: lineTotal,
    });
  }

  // Calculate tax (10% — TODO: make configurable)
  const taxRate = 0.1;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  // Insert order items
  if (lineItems.length > 0) {
    await supabase.from("kp_order_items").insert(
      lineItems.map((li) => ({ ...li, order_id: order.id }))
    );
  }

  // Update order totals
  await supabase
    .from("kp_orders")
    .update({
      subtotal,
      tax,
      total,
      payment_status: body.payment_method === "cash" ? "paid" : "pending",
    })
    .eq("id", order.id);

  // Create sale in UltimatePOS
  let ultimateposSaleId: string | null = null;
  let invoiceNumber: string | null = null;

  if (settings.mock_mode) {
    // Mock mode: simulate sale creation
    const mockResult = mockCreateSale(body.items) as Record<string, unknown>;
    ultimateposSaleId = String(mockResult.sale_id);
    invoiceNumber = mockResult.invoice_number as string;
  } else {
    const config = await getUltimatePOSConfig();
    if (config && config.is_active) {
      try {
        // TODO: Replace with actual UltimatePOS sale creation endpoint
        // The exact endpoint path, payload structure, and response fields must match
        // the UltimatePOS API documentation supplied by the user
        const salePayload = {
          location_id: locationId,
          customer_id: body.customer_id || null,
          product_lines: lineItems.map((li) => ({
            product_id: li.ultimatepos_product_id,
            quantity: li.quantity,
            unit_price: li.unit_price,
          })),
          payment: [{
            amount: total,
            method: body.payment_method || "cash",
          }],
        };

        const result = await uposRequest(config, "POST", "/connector/api/sale", salePayload) as Record<string, unknown>;
        ultimateposSaleId = String(result.id ?? "");
        invoiceNumber = (result.invoice_number as string) ?? null;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        await supabase
          .from("kp_orders")
          .update({
            sync_status: "failed",
            error_message: `UltimatePOS sale creation failed: ${errorMsg}`,
          })
          .eq("id", order.id);

        // Order is saved locally even if UltimatePOS fails
        return successResponse({
          order_id: order.id,
          order_number: orderNumber,
          ultimatepos_sale_id: null,
          invoice_number: null,
          subtotal,
          tax,
          discount: 0,
          total,
          currency: settings.currency,
          payment_status: body.payment_method === "cash" ? "paid" : "pending",
          order_status: "processing",
        });
      }
    }
  }

  // Update order with UltimatePOS sale info
  await supabase
    .from("kp_orders")
    .update({
      ultimatepos_sale_id: ultimateposSaleId,
      ultimatepos_invoice_number: invoiceNumber,
      order_status: "completed",
      sync_status: ultimateposSaleId ? "synced" : "pending",
    })
    .eq("id", order.id);

  // Record payment
  await supabase.from("kp_payments").insert({
    order_id: order.id,
    method: body.payment_method || "cash",
    amount: total,
    currency: settings.currency,
    status: body.payment_method === "cash" ? "completed" : "pending",
    paid_at: body.payment_method === "cash" ? new Date().toISOString() : null,
  });

  return successResponse({
    order_id: order.id,
    order_number: orderNumber,
    ultimatepos_sale_id: ultimateposSaleId,
    invoice_number: invoiceNumber,
    subtotal,
    tax,
    discount: 0,
    total,
    currency: settings.currency,
    payment_status: body.payment_method === "cash" ? "paid" : "pending",
    order_status: "completed",
  });
}

async function handleGetOrder(id: string): Promise<Response> {
  const { data: order } = await supabase
    .from("kp_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) return errorResponse("ORDER_NOT_FOUND", "Order was not found", 404);

  const { data: items } = await supabase
    .from("kp_order_items")
    .select("*")
    .eq("order_id", id);

  const { data: payments } = await supabase
    .from("kp_payments")
    .select("*")
    .eq("order_id", id);

  return successResponse({
    order_id: order.id,
    order_number: order.order_number,
    ultimatepos_sale_id: order.ultimatepos_sale_id,
    invoice_number: order.ultimatepos_invoice_number,
    location_id: order.location_id,
    customer_id: order.customer_id,
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    tax: Number(order.tax),
    total: Number(order.total),
    currency: order.currency,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    order_status: order.order_status,
    sync_status: order.sync_status,
    error_message: order.error_message,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: items || [],
    payments: payments || [],
  });
}

async function handleCancelOrder(id: string, body: { reason?: string }, kiosk: KioskRecord, settings: SystemSettings): Promise<Response> {
  const { data: order } = await supabase
    .from("kp_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) return errorResponse("ORDER_NOT_FOUND", "Order was not found", 404);

  if (order.order_status === "cancelled") {
    return errorResponse("ALREADY_CANCELLED", "Order is already cancelled", 409);
  }

  if (order.order_status === "completed" && order.ultimatepos_sale_id && !settings.mock_mode) {
    // Create sale return in UltimatePOS
    const config = await getUltimatePOSConfig();
    if (config && config.is_active) {
      try {
        // TODO: Replace with actual UltimatePOS sale return endpoint
        await uposRequest(config, "POST", `/connector/api/sale/${order.ultimatepos_sale_id}/return`, {
          reason: body.reason || "Customer cancellation",
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        return errorResponse("ULTIMATEPOS_ERROR", `Failed to cancel sale in UltimatePOS: ${errorMsg}`, 502);
      }
    }
  }

  await supabase
    .from("kp_orders")
    .update({
      order_status: "cancelled",
      cancel_reason: body.reason || "Cancelled by kiosk",
      cancelled_by: kiosk.kiosk_code,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", id);

  return successResponse({
    order_id: id,
    order_status: "cancelled",
    cancelled_at: new Date().toISOString(),
  });
}

async function handleCreatePayment(body: {
  order_id: string;
  method: string;
  amount?: number;
  reference?: string;
  provider?: string;
  provider_transaction_id?: string;
}, settings: SystemSettings): Promise<Response> {
  if (!body.order_id) return errorResponse("VALIDATION_ERROR", "order_id is required", 422);
  if (!body.method) return errorResponse("VALIDATION_ERROR", "method is required", 422);

  const { data: order } = await supabase
    .from("kp_orders")
    .select("*")
    .eq("id", body.order_id)
    .maybeSingle();

  if (!order) return errorResponse("ORDER_NOT_FOUND", "Order was not found", 404);

  const amount = body.amount ?? Number(order.total);

  const { data: payment } = await supabase
    .from("kp_payments")
    .insert({
      order_id: body.order_id,
      payment_reference: body.reference || null,
      method: body.method,
      amount,
      currency: order.currency,
      status: "completed",
      provider: body.provider || null,
      provider_transaction_id: body.provider_transaction_id || null,
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  await supabase
    .from("kp_orders")
    .update({ payment_status: "paid" })
    .eq("id", body.order_id);

  return successResponse({
    payment_id: payment.id,
    order_id: body.order_id,
    amount,
    currency: order.currency,
    status: "completed",
  });
}

async function handleSyncProducts(settings: SystemSettings): Promise<Response> {
  const { data: job } = await supabase
    .from("kp_sync_jobs")
    .insert({ job_type: "products", status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  try {
    let products: Record<string, unknown>[] = [];

    if (settings.mock_mode) {
      products = getMockProducts();
    } else {
      const config = await getUltimatePOSConfig();
      if (!config || !config.is_active) {
        throw new Error("UltimatePOS not configured");
      }
      // TODO: Replace with actual UltimatePOS products endpoint
      const result = await uposRequest(config, "GET", `/connector/api/product?business_id=${config.business_id}&per_page=500`) as { data?: unknown[] };
      products = (result?.data ?? []) as Record<string, unknown>[];
    }

    let processed = 0;
    let failed = 0;

    for (const p of products) {
      try {
        const uposId = String(p.id ?? "");
        if (!uposId) { failed++; continue; }

        const { data: existing } = await supabase
          .from("kp_products_cache")
          .select("id")
          .eq("ultimatepos_product_id", uposId)
          .maybeSingle();

        const productData = {
          ultimatepos_product_id: uposId,
          sku: (p.sku as string) ?? null,
          name: (p.name as string) ?? `Product ${uposId}`,
          description: (p.description as string) ?? null,
          category_id: p.category_id != null ? String(p.category_id) : null,
          category_name: (p.category_name as string) ?? null,
          selling_price: Number(p.sell_price_inc_tax ?? p.selling_price ?? 0),
          image_url: (p.image_url as string) ?? (p.image as string) ?? null,
          stock_quantity: Number(p.stock ?? p.stock_quantity ?? 0),
          location_id: settings.ultimatepos_location_id,
          is_active: Boolean(p.is_active ?? true),
          synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("kp_products_cache").update(productData).eq("id", existing.id);
        } else {
          await supabase.from("kp_products_cache").insert(productData);
        }
        processed++;
      } catch {
        failed++;
      }
    }

    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_processed: processed,
        records_failed: failed,
      })
      .eq("id", job.id);

    return successResponse({
      job_id: job.id,
      job_type: "products",
      status: "completed",
      records_processed: processed,
      records_failed: failed,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
      })
      .eq("id", job.id);

    return errorResponse("SYNC_FAILED", `Product sync failed: ${errorMsg}`, 502);
  }
}

async function handleSyncCategories(settings: SystemSettings): Promise<Response> {
  const { data: job } = await supabase
    .from("kp_sync_jobs")
    .insert({ job_type: "categories", status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  try {
    let categories: Record<string, unknown>[] = [];

    if (settings.mock_mode) {
      categories = getMockCategories();
    } else {
      const config = await getUltimatePOSConfig();
      if (!config || !config.is_active) {
        throw new Error("UltimatePOS not configured");
      }
      // TODO: Replace with actual UltimatePOS categories endpoint
      const result = await uposRequest(config, "GET", `/connector/api/categories?business_id=${config.business_id}`) as { data?: unknown[] };
      categories = (result?.data ?? []) as Record<string, unknown>[];
    }

    let processed = 0;
    let failed = 0;

    for (const c of categories) {
      try {
        const uposId = String(c.id ?? "");
        if (!uposId) { failed++; continue; }

        const { data: existing } = await supabase
          .from("kp_categories_cache")
          .select("id")
          .eq("ultimatepos_category_id", uposId)
          .maybeSingle();

        const catData = {
          ultimatepos_category_id: uposId,
          name: (c.name as string) ?? `Category ${uposId}`,
          parent_id: c.parent_id != null ? String(c.parent_id) : null,
          is_active: Boolean(c.is_active ?? true),
          synced_at: new Date().toISOString(),
        };

        if (existing) {
          await supabase.from("kp_categories_cache").update(catData).eq("id", existing.id);
        } else {
          await supabase.from("kp_categories_cache").insert(catData);
        }
        processed++;
      } catch {
        failed++;
      }
    }

    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_processed: processed,
        records_failed: failed,
      })
      .eq("id", job.id);

    return successResponse({
      job_id: job.id,
      job_type: "categories",
      status: "completed",
      records_processed: processed,
      records_failed: failed,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
      })
      .eq("id", job.id);

    return errorResponse("SYNC_FAILED", `Category sync failed: ${errorMsg}`, 502);
  }
}

async function handleSyncAll(settings: SystemSettings): Promise<Response> {
  const { data: job } = await supabase
    .from("kp_sync_jobs")
    .insert({ job_type: "all", status: "running", started_at: new Date().toISOString() })
    .select()
    .single();

  try {
    const catResult = await handleSyncCategories(settings);
    const prodResult = await handleSyncProducts(settings);

    const catData = await catResult.json();
    const prodData = await prodResult.json();

    const totalProcessed = (catData?.data?.records_processed || 0) + (prodData?.data?.records_processed || 0);
    const totalFailed = (catData?.data?.records_failed || 0) + (prodData?.data?.records_failed || 0);

    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        records_processed: totalProcessed,
        records_failed: totalFailed,
      })
      .eq("id", job.id);

    return successResponse({
      job_id: job.id,
      job_type: "all",
      status: "completed",
      records_processed: totalProcessed,
      records_failed: totalFailed,
      categories: catData?.data,
      products: prodData?.data,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("kp_sync_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: errorMsg,
      })
      .eq("id", job.id);

    return errorResponse("SYNC_FAILED", `Full sync failed: ${errorMsg}`, 502);
  }
}

async function handleRetryOrder(orderId: string, settings: SystemSettings): Promise<Response> {
  const { data: order } = await supabase
    .from("kp_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return errorResponse("ORDER_NOT_FOUND", "Order was not found", 404);

  if (order.sync_status === "synced") {
    return errorResponse("ALREADY_SYNCED", "Order is already synced with UltimatePOS", 409);
  }

  if (settings.mock_mode) {
    const mockSaleId = String(Math.floor(Math.random() * 999999) + 10000);
    const mockInvoice = `INV-${mockSaleId.padStart(5, "0")}`;
    await supabase
      .from("kp_orders")
      .update({
        ultimatepos_sale_id: mockSaleId,
        ultimatepos_invoice_number: mockInvoice,
        sync_status: "synced",
        order_status: "completed",
        error_message: null,
      })
      .eq("id", orderId);

    return successResponse({
      order_id: orderId,
      sync_status: "synced",
      ultimatepos_sale_id: mockSaleId,
      invoice_number: mockInvoice,
    });
  }

  const config = await getUltimatePOSConfig();
  if (!config || !config.is_active) {
    return errorResponse("ULTIMATEPOS_NOT_CONFIGURED", "UltimatePOS is not configured", 503);
  }

  try {
    const { data: items } = await supabase
      .from("kp_order_items")
      .select("*")
      .eq("order_id", orderId);

    const salePayload = {
      location_id: order.location_id,
      customer_id: order.customer_id,
      product_lines: (items || []).map((li: Record<string, unknown>) => ({
        product_id: li.ultimatepos_product_id,
        quantity: li.quantity,
        unit_price: li.unit_price,
      })),
      payment: [{
        amount: Number(order.total),
        method: order.payment_method || "cash",
      }],
    };

    // TODO: Replace with actual UltimatePOS sale creation endpoint
    const result = await uposRequest(config, "POST", "/connector/api/sale", salePayload) as Record<string, unknown>;

    await supabase
      .from("kp_orders")
      .update({
        ultimatepos_sale_id: String(result.id ?? ""),
        ultimatepos_invoice_number: (result.invoice_number as string) ?? null,
        sync_status: "synced",
        order_status: "completed",
        error_message: null,
      })
      .eq("id", orderId);

    return successResponse({
      order_id: orderId,
      sync_status: "synced",
      ultimatepos_sale_id: String(result.id ?? ""),
      invoice_number: (result.invoice_number as string) ?? null,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("kp_orders")
      .update({ sync_status: "failed", error_message: errorMsg })
      .eq("id", orderId);

    return errorResponse("RETRY_FAILED", `Retry failed: ${errorMsg}`, 502);
  }
}

// ── Admin endpoints (no kiosk auth, but protected by Supabase JWT) ───────────

async function handleAdminCreateKiosk(body: { name: string; kiosk_code: string; location_id?: number }): Promise<Response> {
  if (!body.name || !body.kiosk_code) {
    return errorResponse("VALIDATION_ERROR", "name and kiosk_code are required", 422);
  }

  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from("kp_kiosks")
    .insert({
      name: body.name,
      kiosk_code: body.kiosk_code,
      location_id: body.location_id || null,
      api_key_hash: apiKeyHash,
      status: "active",
    })
    .select("id, name, kiosk_code, location_id, status, created_at")
    .single();

  if (error) {
    return errorResponse("KIOSK_CREATE_FAILED", error.message, 500);
  }

  return successResponse({ ...data, api_key: apiKey });
}

async function handleAdminUpdateKiosk(id: string, body: { name?: string; location_id?: number; status?: string }): Promise<Response> {
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.location_id !== undefined) updateData.location_id = body.location_id;
  if (body.status !== undefined) updateData.status = body.status;

  const { data, error } = await supabase
    .from("kp_kiosks")
    .update(updateData)
    .eq("id", id)
    .select("id, name, kiosk_code, location_id, status, last_seen_at, created_at, updated_at")
    .single();

  if (error) return errorResponse("KIOSK_UPDATE_FAILED", error.message, 500);

  return successResponse(data);
}

async function handleAdminRegenerateApiKey(id: string): Promise<Response> {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from("kp_kiosks")
    .update({ api_key_hash: apiKeyHash })
    .eq("id", id)
    .select("id, name, kiosk_code")
    .single();

  if (error) return errorResponse("KIOSK_UPDATE_FAILED", error.message, 500);

  return successResponse({ ...data, api_key: apiKey });
}

async function handleAdminGetSettings(): Promise<Response> {
  const { data } = await supabase
    .from("kp_system_settings")
    .select("*")
    .limit(1)
    .single();
  return successResponse(data);
}

async function handleAdminUpdateSettings(body: Partial<SystemSettings>): Promise<Response> {
  const { data: current } = await supabase
    .from("kp_system_settings")
    .select("id")
    .limit(1)
    .single();

  if (!current) return errorResponse("SETTINGS_NOT_FOUND", "Settings not initialized", 500);

  const updateData: Record<string, unknown> = {};
  const allowed = [
    "ultimatepos_url", "ultimatepos_location_id", "mock_mode",
    "sync_interval_minutes", "rate_limit_per_minute", "allowed_origins",
    "currency", "timezone",
  ];
  for (const key of allowed) {
    if (body[key as keyof SystemSettings] !== undefined) {
      updateData[key] = body[key as keyof SystemSettings];
    }
  }

  const { data, error } = await supabase
    .from("kp_system_settings")
    .update(updateData)
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) return errorResponse("SETTINGS_UPDATE_FAILED", error.message, 500);

  return successResponse(data);
}

// ── Main router ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = generateRequestId();
  const reqUrl = new URL(req.url);
  const path = reqUrl.pathname.replace(/^\/+|\/+$/g, "");

  // Strip function name prefix if present
  const routePath = path.replace(/^kioskpos-api\/?/, "").replace(/^api\/v1\/?/, "");
  const parts = routePath.split("/").filter(Boolean);

  try {
    const settings = await getSystemSettings();
    if (!settings) {
      return errorResponse("SETTINGS_NOT_FOUND", "System settings not initialized", 500, requestId);
    }

    let response: Response;

    // ── Health endpoint (no auth) ─────────────────────────────────────────────
    if (parts[0] === "health" && req.method === "GET") {
      response = await handleHealth(settings);
    }

    // ── Admin endpoints (JWT-protected, no kiosk key) ─────────────────────────
    else if (parts[0] === "admin") {
      // Admin endpoints require Supabase JWT auth
      const authHeader = req.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        response = errorResponse("UNAUTHORIZED", "Admin authentication required", 401, requestId);
      } else {
        // Verify the JWT by making a request with the user's token
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) {
          response = errorResponse("UNAUTHORIZED", "Invalid admin session", 401, requestId);
        } else {
          // Verify user is an admin
          const { data: adminUser } = await supabase
            .from("admin_users")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

          if (!adminUser) {
            response = errorResponse("FORBIDDEN", "Admin access required", 403, requestId);
          } else {
            // Route admin endpoints
            const adminPath = parts.slice(1);

            if (adminPath[0] === "kiosks" && req.method === "POST") {
              const body = await req.json();
              response = await handleAdminCreateKiosk(body);
            } else if (adminPath[0] === "kiosks" && adminPath[1] && req.method === "PUT") {
              const body = await req.json();
              response = await handleAdminUpdateKiosk(adminPath[1], body);
            } else if (adminPath[0] === "kiosks" && adminPath[1] === "regenerate-key" && req.method === "POST") {
              response = await handleAdminRegenerateApiKey(adminPath[1]);
            } else if (adminPath[0] === "settings" && req.method === "GET") {
              response = await handleAdminGetSettings();
            } else if (adminPath[0] === "settings" && req.method === "PUT") {
              const body = await req.json();
              response = await handleAdminUpdateSettings(body);
            } else if (adminPath[0] === "orders" && adminPath[1] && adminPath[2] === "retry" && req.method === "POST") {
              response = await handleRetryOrder(adminPath[1], settings);
            } else {
              response = errorResponse("NOT_FOUND", "Admin endpoint not found", 404, requestId);
            }
          }
        }
      }
    }

    // ── Sync endpoints (require kiosk auth for consistency) ──────────────────
    else if (parts[0] === "sync") {
      const { kiosk, error: authError } = await authenticateKiosk(req);
      if (authError) {
        response = authError;
      } else if (kiosk) {
        const rateLimited = await checkRateLimit(kiosk.id, settings.rate_limit_per_minute);
        if (!rateLimited) {
          response = errorResponse("RATE_LIMITED", "Rate limit exceeded", 429, requestId);
        } else if (parts[1] === "products" && req.method === "POST") {
          response = await handleSyncProducts(settings);
        } else if (parts[1] === "categories" && req.method === "POST") {
          response = await handleSyncCategories(settings);
        } else if (parts[1] === "all" && req.method === "POST") {
          response = await handleSyncAll(settings);
        } else {
          response = errorResponse("NOT_FOUND", "Sync endpoint not found", 404, requestId);
        }
      } else {
        response = errorResponse("UNAUTHORIZED", "Kiosk authentication required", 401, requestId);
      }
    }

    // ── All other endpoints require kiosk authentication ──────────────────────
    else {
      const { kiosk, error: authError } = await authenticateKiosk(req);
      if (authError) {
        response = authError;
      } else if (kiosk) {
        const rateLimited = await checkRateLimit(kiosk.id, settings.rate_limit_per_minute);
        if (!rateLimited) {
          response = errorResponse("RATE_LIMITED", "Rate limit exceeded", 429, requestId);
        } else {
          // Route kiosk endpoints
          if (parts[0] === "products" && !parts[1] && req.method === "GET") {
            response = await handleGetProducts(reqUrl, settings);
          } else if (parts[0] === "products" && parts[1] && !parts[2] && req.method === "GET") {
            response = await handleGetProduct(parts[1]);
          } else if (parts[0] === "products" && parts[1] && parts[2] === "stock" && req.method === "GET") {
            response = await handleGetStock(parts[1], settings);
          } else if (parts[0] === "categories" && !parts[1] && req.method === "GET") {
            response = await handleGetCategories();
          } else if (parts[0] === "customers" && req.method === "POST") {
            const body = await req.json();
            response = await handleCreateCustomer(body, settings);
          } else if (parts[0] === "orders" && !parts[1] && req.method === "POST") {
            const idempotencyKey = req.headers.get("Idempotency-Key") || "";
            const body = await req.json();
            response = await handleCreateOrder(body, kiosk, idempotencyKey, settings);
          } else if (parts[0] === "orders" && parts[1] && !parts[2] && req.method === "GET") {
            response = await handleGetOrder(parts[1]);
          } else if (parts[0] === "orders" && parts[1] && parts[2] === "cancel" && req.method === "POST") {
            const body = await req.json();
            response = await handleCancelOrder(parts[1], body, kiosk, settings);
          } else if (parts[0] === "payments" && req.method === "POST") {
            const body = await req.json();
            response = await handleCreatePayment(body, settings);
          } else {
            response = errorResponse("NOT_FOUND", `Endpoint not found: /${routePath}`, 404, requestId);
          }
        }
      } else {
        response = errorResponse("UNAUTHORIZED", "Kiosk authentication required", 401, requestId);
      }
    }

    // Log the request
    const duration = Date.now() - startTime;
    const kioskId = await getKioskIdFromAuth(req);
    await logApiRequest(
      kioskId,
      requestId,
      req.method,
      reqUrl.pathname,
      response.status,
      duration,
      response.status < 400,
      response.status >= 400 ? await extractErrorMessage(response) : undefined
    );

    return response;
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    await logApiRequest(null, requestId, req.method, reqUrl.pathname, 500, duration, false, errorMsg);

    return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
  }
});

// ── Helper: extract kiosk ID from auth header for logging ───────────────────

async function getKioskIdFromAuth(req: Request): Promise<string | null> {
  const key = req.headers.get("X-Kiosk-Key");
  if (!key) return null;
  const keyHash = hashApiKey(key);
  const { data } = await supabase
    .from("kp_kiosks")
    .select("id")
    .eq("api_key_hash", keyHash)
    .maybeSingle();
  return data?.id || null;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const cloned = response.clone();
    const body = await cloned.json();
    return body?.error?.message || "Unknown error";
  } catch {
    return "Unknown error";
  }
}
