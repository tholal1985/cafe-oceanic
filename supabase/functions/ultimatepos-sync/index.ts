// UltimatePOS Sync — Cloudflare bypass via direct IP + OAuth password grant (v4 - price fix)
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
  webhook_secret: string | null;
  webhook_enabled: boolean;
  sync_product_name: boolean;
  sync_product_price: boolean;
  sync_product_category: boolean;
  sync_product_quantity: boolean;
  sync_product_weight: boolean;
  sync_product_images: boolean;
  sync_product_description: boolean;
  sync_product_tax_class: boolean;
  sync_order_status_pending: string;
  sync_order_status_processing: string;
  sync_order_status_completed: string;
  sync_order_status_cancelled: string;
  sync_order_location_id: number | null;
  sync_order_order_type: string;
  last_webhook_at: string | null;
  last_webhook_event: string | null;
  direct_server_ip: string | null;
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
// URL normalization
// ============================================================
function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.replace(/\/+$/, "");
}

function getCandidateBaseUrls(rawUrl: string): string[] {
  const base = normalizeBaseUrl(rawUrl);
  const candidates: string[] = [base];
  if (!base.endsWith("/public")) {
    candidates.push(`${base}/public`);
  }
  return candidates;
}

// ============================================================
// Cloudflare bypass: when a direct server IP is configured, we
// rewrite the URL to use the IP directly and set the Host header
// so the origin server routes the request correctly.
// The server may redirect HTTP→HTTPS; we follow manually but
// keep rewriting to the direct IP to stay behind Cloudflare.
// ============================================================
function getHostFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "";
  }
}

function rewriteUrlWithIp(url: string, directIp: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = directIp;
    parsed.protocol = "http:";
    parsed.port = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function decodeChunked(body: string): string {
  let result = "";
  let pos = 0;
  while (pos < body.length) {
    const lineEnd = body.indexOf("\r\n", pos);
    if (lineEnd === -1) break;
    const sizeStr = body.substring(pos, lineEnd).trim();
    const chunkSize = parseInt(sizeStr, 16);
    if (isNaN(chunkSize) || chunkSize === 0) break;
    pos = lineEnd + 2;
    result += body.substring(pos, pos + chunkSize);
    pos += chunkSize + 2;
  }
  return result;
}

async function fetchWithBypass(
  url: string,
  options: RequestInit & { directIp?: string },
): Promise<Response> {
  const directIp = (options as any).directIp;
  const cleanOptions = { ...options } as any;
  delete cleanOptions.directIp;

  if (!directIp) {
    return await fetch(url, { ...cleanOptions, redirect: "follow" });
  }

  const originalUrl = new URL(url);
  const host = originalUrl.host;
  const path = originalUrl.pathname + originalUrl.search;
  const method = (cleanOptions.method as string) || "GET";
  const body = cleanOptions.body as string | undefined;
  const headers = new Headers(cleanOptions.headers || {});

  // Build raw HTTP request — Deno's fetch strips the Host header,
  // so we use a raw TCP connection to send it manually.
  const conn = await Deno.connect({ hostname: directIp, port: 80 });
  const lines: string[] = [
    `${method} ${path} HTTP/1.1`,
    `Host: ${host}`,
    `Connection: close`,
  ];
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() !== "host") lines.push(`${key}: ${value}`);
  }
  if (body) {
    const bodyBytes = new TextEncoder().encode(body);
    lines.push(`Content-Length: ${bodyBytes.length}`);
  }
  const requestStr = lines.join("\r\n") + "\r\n\r\n" + (body || "");
  const requestBytes = new TextEncoder().encode(requestStr);
  await conn.write(requestBytes);

  // Read full response
  const responseChunks: Uint8Array[] = [];
  const buf = new Uint8Array(65536);
  while (true) {
    const n = await conn.read(buf);
    if (n === null) break;
    responseChunks.push(buf.slice(0, n));
  }
  conn.close();

  // Parse raw HTTP response
  const totalLen = responseChunks.reduce((sum, c) => sum + c.length, 0);
  const fullResponse = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of responseChunks) {
    fullResponse.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  const responseStr = decoder.decode(fullResponse);
  const headerEnd = responseStr.indexOf("\r\n\r\n");
  const headerSection = responseStr.substring(0, headerEnd);
  const [statusLine, ...headerLines] = headerSection.split("\r\n");
  const statusCode = parseInt(statusLine.split(" ")[1] || "0", 10);

  const responseHeaders = new Headers();
  for (const line of headerLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      responseHeaders.set(key, value);
    }
  }

  // Decode chunked transfer encoding if present
  let responseBody = responseStr.substring(headerEnd + 4);
  const isChunked = responseHeaders.get("transfer-encoding")?.toLowerCase().includes("chunked");
  if (isChunked) {
    responseBody = decodeChunked(responseBody);
    responseHeaders.delete("transfer-encoding");
  }

  // Handle redirects manually (rewriting to direct IP)
  if ((statusCode >= 301 && statusCode <= 308) && responseHeaders.get("location")) {
    const location = responseHeaders.get("location")!;
    const redirectUrl = location.startsWith("http") ? location : new URL(location, url).toString();
    return await fetchWithBypass(redirectUrl, {
      ...cleanOptions,
      directIp,
      method: statusCode === 303 ? "GET" : method,
      body: statusCode === 303 ? undefined : body,
    });
  }

  return new Response(responseBody, {
    status: statusCode,
    headers: responseHeaders,
  });
}

function buildFetchOptions(
  method: string,
  headers: Record<string, string>,
  body?: string | undefined,
  directIp?: string | null,
  originalUrl?: string,
): { method: string; headers: Record<string, string>; body?: string | undefined } {
  const finalHeaders: Record<string, string> = { ...headers };
  if (directIp && originalUrl) {
    const host = getHostFromUrl(originalUrl);
    if (host) finalHeaders["Host"] = host;
  }
  return {
    method,
    headers: finalHeaders,
    body: body !== undefined ? body : undefined,
  };
}

// ============================================================
// Response checking
// ============================================================
function isHtmlResponse(text: string): boolean {
  const lower = text.trimStart().toLowerCase();
  return lower.startsWith("<!doctype") || lower.startsWith("<html") || lower.startsWith("<head");
}

// ============================================================
// Authentication
// ============================================================
async function getAuthToken(config: UltimatePosConfig): Promise<{ token: string; baseUrl: string }> {
  if (config.auth_mode === "pat" && config.personal_access_token) {
    return { token: config.personal_access_token, baseUrl: normalizeBaseUrl(config.api_url || "") };
  }

  const candidates = getCandidateBaseUrls(config.api_url || "");
  const errors: string[] = [];

  for (const baseUrl of candidates) {
    const tokenUrl = `${baseUrl}/oauth/token`;
    try {
      const body = new URLSearchParams({
        grant_type: "password",
        client_id: config.client_id || "",
        client_secret: config.client_secret || "",
        username: config.username || "",
        password: config.password || "",
      });

      const resp = await fetchWithBypass(tokenUrl, {
        method: "POST",
        directIp: config.direct_server_ip || undefined,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: body.toString(),
      });

      const text = await resp.text();

      if (isHtmlResponse(text)) {
        errors.push(`${tokenUrl} returned HTML (not a valid API endpoint)`);
        continue;
      }

      if (!resp.ok) {
        errors.push(`${tokenUrl} returned ${resp.status}: ${text.substring(0, 200)}`);
        continue;
      }

      const tokenData = JSON.parse(text);
      if (tokenData.access_token) {
        return { token: tokenData.access_token, baseUrl };
      }
      errors.push(`${tokenUrl} returned no access_token in response`);
    } catch (err) {
      errors.push(`${tokenUrl} threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `OAuth authentication failed. Tried ${candidates.length} URL(s):\n${errors.join("\n")}\n\n` +
    `Common fixes:\n` +
    `- Make sure your API URL includes /public if UltimatePOS was installed with it (e.g. https://yoursite.com/public)\n` +
    `- Verify the API Connector module is installed and enabled in UltimatePOS\n` +
    `- Check that client_id, client_secret, username, and password are all correct\n` +
    `- If your site is behind Cloudflare, set the Direct Server IP to bypass it`
  );
}

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// ============================================================
// API request helper — tries candidate base URLs, with
// Cloudflare bypass via direct IP when configured
// ============================================================
async function apiRequest(
  config: UltimatePosConfig,
  path: string,
  method: string = "GET",
  body?: any,
): Promise<{ data: any; baseUrl: string; rawText: string; status: number }> {
  const { token, baseUrl: authBaseUrl } = await getAuthToken(config);

  const candidates = config.auth_mode === "pat"
    ? getCandidateBaseUrls(config.api_url || "")
    : [authBaseUrl];

  const errors: string[] = [];

  for (const baseUrl of candidates) {
    const url = `${baseUrl}${path}`;

    try {
      const headers = authHeaders(token);

      const resp = await fetchWithBypass(url, {
        method,
        directIp: config.direct_server_ip || undefined,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await resp.text();

      if (isHtmlResponse(text)) {
        errors.push(`${url} returned HTML (not a valid API endpoint)`);
        continue;
      }

      if (!resp.ok) {
        if (resp.status === 404 && candidates.length > 1) {
          errors.push(`${url} returned 404`);
          continue;
        }
        throw new Error(`UltimatePOS API returned HTTP ${resp.status}: ${text.substring(0, 500)}`);
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`UltimatePOS returned non-JSON response: ${text.substring(0, 300)}`);
      }

      return { data, baseUrl, rawText: text, status: resp.status };
    } catch (err) {
      if (err instanceof Error && err.message.includes("UltimatePOS API returned")) {
        throw err;
      }
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(
    `All URL attempts failed for ${path}:\n${errors.join("\n")}\n\n` +
    `This usually means the API URL needs /public appended, or the API Connector module is not installed.`
  );
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
    const path = `/connector/api/product?business_id=${config.business_id}&per_page=100`;
    const { data: result } = await apiRequest(config, path);

    const products: any[] = result.data || result.products || result || [];
    const productArray = Array.isArray(products) ? products : [];

    let created = 0, updated = 0, skipped = 0;
    const details: any[] = [];

    for (const up of productArray) {
      const ultimateposId = String(up.id);
      const name = (config.sync_product_name ? (up.name || up.product_name || "Unnamed") : null);
      const description = config.sync_product_description ? (up.product_description || up.description || "") : null;
      const imageUrl = config.sync_product_images ? (up.image_url || up.image || null) : null;
      let price: number | null = null;
      if (config.sync_product_price) {
        const variationPrice = up.product_variations?.[0]?.variations?.[0]?.default_sell_price
          || up.product_variations?.[0]?.variations?.[0]?.sell_price_inc_tax
          || up.sell_price
          || up.price
          || up.selling_price
          || "0";
        price = parseFloat(variationPrice);
      }

      const { data: existing } = await supabase
        .from("products")
        .select("id, name, price, description, image_url")
        .eq("ultimatepos_id", ultimateposId)
        .maybeSingle();

      if (existing) {
        const updates: any = {};
        if (name !== null && existing.name !== name) updates.name = name;
        if (price !== null && parseFloat(existing.price) !== price) updates.price = price;
        if (description !== null && existing.description !== description) updates.description = description;
        if (imageUrl !== null && existing.image_url !== imageUrl) updates.image_url = imageUrl;

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
            name: name || "Unnamed",
            description: description || "",
            price: price || 0,
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
    return errorResponse(502, "Product sync failed", msg);
  }
}

// ============================================================
// Customer Sync (UltimatePOS → Kiosk)
// ============================================================
async function syncCustomers(supabase: any, config: UltimatePosConfig): Promise<Response> {
  const startedAt = Date.now();
  const logId = await createSyncLog(supabase, "customers", startedAt);

  try {
    const path = `/connector/api/contactapi?business_id=${config.business_id}&type=customer&per_page=100`;
    const { data: result } = await apiRequest(config, path);

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
    return errorResponse(502, "Customer sync failed", msg);
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
    location_id: config.sync_order_location_id || config.location_id,
    status: "final",
    payment_status: order.payment_status === "paid" ? "paid" : "due",
    final_total: parseFloat(order.total_price),
    total_before_tax: parseFloat(order.total_price),
    transaction_date: new Date(order.created_at).toISOString().split("T")[0],
    order_number: order.order_number,
    customer_phone: order.phone_number || null,
    sell_lines: lines,
    order_type: config.sync_order_order_type || order.order_type || "dine_in",
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

  if (!push.payload) {
    await supabase.from("ultimatepos_sale_pushes").update({ payload }).eq("id", pushId);
  }

  try {
    const path = `/connector/api/sell?business_id=${config.business_id}&location_id=${config.location_id}`;
    const { data: responseData } = await apiRequest(config, path, "POST", payload);

    const saleId = responseData.id ? String(responseData.id) : (responseData.sale_id ? String(responseData.sale_id) : null);

    await supabase.from("ultimatepos_sale_pushes").update({
      status: "success",
      ultimatepos_sale_id: saleId,
      response: responseData,
      error_message: null,
      pushed_at: new Date().toISOString(),
      next_retry_at: null,
    }).eq("id", pushId);

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
// Connection test — tries multiple URL variants, uses direct IP
// when configured, and tests the product endpoint (not business,
// which may not exist on all installations)
// ============================================================
async function testConnection(config: UltimatePosConfig): Promise<Response> {
  const diagnostics: any[] = [];
  const candidates = getCandidateBaseUrls(config.api_url || "");

  let token: string | null = null;
  let workingBaseUrl: string | null = null;

  diagnostics.push({
    step: "config",
    status: "info",
    message: `auth_mode=${config.auth_mode}, business_id=${config.business_id}, location_id=${config.location_id}, direct_ip=${config.direct_server_ip || "not set"}`,
  });

  // Step 1: Get auth token
  try {
    if (config.auth_mode === "pat" && config.personal_access_token) {
      token = config.personal_access_token;
      diagnostics.push({ step: "auth", status: "ok", message: "Using Personal Access Token" });
    } else {
      const authResult = await getAuthToken(config);
      token = authResult.token;
      workingBaseUrl = authResult.baseUrl;
      diagnostics.push({ step: "auth", status: "ok", message: `OAuth token obtained from ${workingBaseUrl}${config.direct_server_ip ? " via direct IP " + config.direct_server_ip : ""}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diagnostics.push({ step: "auth", status: "failed", message: msg });
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from("ultimatepos_config").update({ connection_status: "error" }).eq("id", config.id);
    return errorResponse(502, "Authentication failed", JSON.stringify(diagnostics, null, 2));
  }

  // Step 2: Try API call with each candidate URL
  const urlsToTry = workingBaseUrl ? [workingBaseUrl, ...candidates.filter(c => c !== workingBaseUrl)] : candidates;
  const apiErrors: string[] = [];

  for (const baseUrl of urlsToTry) {
    const apiUrl = `${baseUrl}/connector/api/product?business_id=${config.business_id}&per_page=1`;

    try {
      const headers = authHeaders(token);

      const resp = await fetchWithBypass(apiUrl, {
        method: "GET",
        directIp: config.direct_server_ip || undefined,
        headers,
      });
      const text = await resp.text();

      if (isHtmlResponse(text)) {
        apiErrors.push(`${baseUrl} → HTML response (not an API endpoint)`);
        diagnostics.push({ step: `api-test:${baseUrl}`, status: "html", message: "Got HTML page instead of JSON. This URL is wrong or the API Connector module is not installed." });
        continue;
      }

      if (!resp.ok) {
        apiErrors.push(`${baseUrl} → HTTP ${resp.status}: ${text.substring(0, 200)}`);
        diagnostics.push({ step: `api-test:${baseUrl}`, status: "error", message: `HTTP ${resp.status}: ${text.substring(0, 200)}` });
        continue;
      }

      const data = JSON.parse(text);
      diagnostics.push({ step: `api-test:${baseUrl}`, status: "ok", message: "API responded successfully" });

      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("ultimatepos_config").update({
        last_connected_at: new Date().toISOString(),
        connection_status: "connected",
      }).eq("id", config.id);

      return jsonResponse({
        success: true,
        connected: true,
        working_url: baseUrl,
        using_direct_ip: !!config.direct_server_ip,
        product_count: data.meta?.total ?? (data.data?.length ?? 0),
        diagnostics,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      apiErrors.push(`${baseUrl} → ${msg}`);
      diagnostics.push({ step: `api-test:${baseUrl}`, status: "error", message: msg });
    }
  }

  // All URLs failed
  const supabase = createClient(supabaseUrl, supabaseKey);
  await supabase.from("ultimatepos_config").update({ connection_status: "error" }).eq("id", config.id);

  return errorResponse(502, "Connection test failed", JSON.stringify({
    diagnostics,
    summary: "All URL attempts failed. Most common causes:\n" +
      "1. Wrong API URL — if UltimatePOS was installed with /public, add it to your URL (e.g. https://yoursite.com/public)\n" +
      "2. API Connector module not installed — go to UltimatePOS admin → Modules → install/enable 'API or Connector'\n" +
      "3. Cloudflare blocking — set the Direct Server IP to bypass Cloudflare\n" +
      "4. Wrong business_id — make sure the business ID matches your UltimatePOS business",
    tried_urls: urlsToTry,
  }, null, 2));
}

// ============================================================
// Debug endpoint — returns detailed diagnostic info
// ============================================================
async function debugConnection(config: UltimatePosConfig): Promise<Response> {
  const diag: any = {
    config: {
      api_url: config.api_url,
      auth_mode: config.auth_mode,
      business_id: config.business_id,
      location_id: config.location_id,
      is_active: config.is_active,
      has_pat: !!config.personal_access_token,
      has_client_id: !!config.client_id,
      has_client_secret: !!config.client_secret,
      has_username: !!config.username,
      has_password: !!config.password,
      direct_server_ip: config.direct_server_ip,
    },
    candidate_urls: getCandidateBaseUrls(config.api_url || ""),
    steps: [] as any[],
  };

  // Test 1: Check if base URL is reachable at all
  for (const baseUrl of diag.candidate_urls) {
    try {
      const resp = await fetchWithBypass(baseUrl, {
        method: "GET",
        directIp: config.direct_server_ip || undefined,
      });
      const text = await resp.text();
      diag.steps.push({
        step: `reachability:${baseUrl}${config.direct_server_ip ? " (via " + config.direct_server_ip + ")" : ""}`,
        status: resp.status,
        content_type: resp.headers.get("content-type"),
        is_html: isHtmlResponse(text),
        body_preview: text.substring(0, 200),
      });
    } catch (err) {
      diag.steps.push({
        step: `reachability:${baseUrl}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Test 2: Check if /connector/api/product endpoint exists
  for (const baseUrl of diag.candidate_urls) {
    const apiUrl = `${baseUrl}/connector/api/product?business_id=${config.business_id}&per_page=1`;
    try {
      const resp = await fetchWithBypass(apiUrl, {
        method: "GET",
        directIp: config.direct_server_ip || undefined,
        headers: { "Accept": "application/json" },
      });
      const text = await resp.text();
      diag.steps.push({
        step: `api:${apiUrl}${config.direct_server_ip ? " (via " + config.direct_server_ip + ")" : ""}`,
        status: resp.status,
        is_html: isHtmlResponse(text),
        body_preview: text.substring(0, 300),
      });
    } catch (err) {
      diag.steps.push({
        step: `api:${apiUrl}`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Test 3: Check if /oauth/token endpoint exists (for OAuth mode)
  if (config.auth_mode === "oauth") {
    for (const baseUrl of diag.candidate_urls) {
      const tokenUrl = `${baseUrl}/oauth/token`;
      try {
        const resp = await fetchWithBypass(tokenUrl, {
          method: "POST",
          directIp: config.direct_server_ip || undefined,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: "grant_type=password&test=1",
        });
        const text = await resp.text();
        diag.steps.push({
          step: `oauth:${tokenUrl}${config.direct_server_ip ? " (via " + config.direct_server_ip + ")" : ""}`,
          status: resp.status,
          is_html: isHtmlResponse(text),
          body_preview: text.substring(0, 300),
        });
      } catch (err) {
        diag.steps.push({
          step: `oauth:${tokenUrl}`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return jsonResponse({ success: true, debug: diag });
}

// ============================================================
// Webhook receiver (UltimatePOS → Kiosk)
// ============================================================
async function handleWebhook(req: Request, supabase: any): Promise<Response> {
  const config = await getConfig(supabase);

  if (config && config.webhook_secret) {
    const providedSecret = req.headers.get("x-webhook-secret") || new URL(req.url).searchParams.get("secret");
    if (providedSecret !== config.webhook_secret) {
      return errorResponse(401, "Invalid webhook secret");
    }
  }

  if (config && config.webhook_enabled === false) {
    return jsonResponse({ received: false, message: "Webhooks are disabled" });
  }

  const body = await req.json();
  const eventType = body.event || body.type || "unknown";
  const entityType = body.entity_type || body.resource || "";
  const entityData = body.data || body.entity || body;
  const entityId = String(entityData.id || entityData.product_id || entityData.contact_id || entityData.order_id || "");

  let result: Response;
  let status = "processed";
  let errorMsg: string | null = null;

  try {
    if (entityType === "product" || eventType.includes("product")) {
      result = await handleProductWebhook(supabase, entityData, eventType, config);
    } else if (entityType === "contact" || eventType.includes("customer") || eventType.includes("contact")) {
      result = await handleCustomerWebhook(supabase, entityData, eventType, config);
    } else if (entityType === "order" || eventType.includes("order")) {
      result = await handleOrderWebhook(supabase, entityData, eventType, config);
    } else {
      result = jsonResponse({ received: true, event: eventType, message: "Unhandled event type" });
      status = "ignored";
    }
  } catch (err) {
    status = "failed";
    errorMsg = err instanceof Error ? err.message : String(err);
    result = errorResponse(500, "Webhook processing failed", errorMsg);
  }

  await supabase.from("ultimatepos_webhook_events").insert({
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    status,
    payload: body,
    error_message: errorMsg,
    processed_at: new Date().toISOString(),
  });

  if (config) {
    await supabase.from("ultimatepos_config").update({
      last_webhook_at: new Date().toISOString(),
      last_webhook_event: eventType,
    }).eq("id", config.id);
  }

  return result;
}

async function handleProductWebhook(supabase: any, data: any, eventType: string, config: UltimatePosConfig | null): Promise<Response> {
  const ultimateposId = String(data.id || data.product_id || "");
  if (!ultimateposId) return errorResponse(400, "Missing product ID in webhook");

  const updates: any = {};
  if (!config || config.sync_product_name) updates.name = data.name || data.product_name || "Unnamed";
  if (!config || config.sync_product_price) updates.price = parseFloat(data.sell_price || data.price || "0");
  if (!config || config.sync_product_description) updates.description = data.description || "";
  if (!config || config.sync_product_images) updates.image_url = data.image_url || data.image || null;

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
    await supabase.from("products").update(updates).eq("id", existing.id);
    return jsonResponse({ received: true, action: "updated", ultimatepos_id: ultimateposId, local_id: existing.id });
  } else {
    const insertData = { ...updates, ultimatepos_id: ultimateposId, is_available: true, display_order: 0 };
    if (!insertData.name) insertData.name = "Unnamed";
    if (insertData.price === undefined) insertData.price = 0;
    const { data: newProduct } = await supabase.from("products").insert(insertData).select("id").single();
    return jsonResponse({ received: true, action: "created", ultimatepos_id: ultimateposId, local_id: newProduct?.id });
  }
}

async function handleOrderWebhook(supabase: any, data: any, eventType: string, config: UltimatePosConfig | null): Promise<Response> {
  const ultimateposId = String(data.id || data.order_id || data.sale_id || "");
  if (!ultimateposId) return errorResponse(400, "Missing order ID in webhook");

  const wooStatus = data.status || data.order_status || "";
  let mappedStatus = wooStatus;
  if (config && wooStatus) {
    if (wooStatus === "pending") mappedStatus = config.sync_order_status_pending;
    else if (wooStatus === "processing") mappedStatus = config.sync_order_status_processing;
    else if (wooStatus === "completed") mappedStatus = config.sync_order_status_completed;
    else if (wooStatus === "cancelled" || wooStatus === "failed" || wooStatus === "refunded") mappedStatus = config.sync_order_status_cancelled;
  }

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("ultimatepos_sale_id", ultimateposId)
    .maybeSingle();

  if (eventType.includes("delete") || eventType.includes("remove")) {
    if (existing) {
      await supabase.from("orders").update({ status: "cancelled" }).eq("id", existing.id);
    }
    return jsonResponse({ received: true, action: "cancelled", ultimatepos_id: ultimateposId });
  }

  if (existing) {
    await supabase.from("orders").update({ status: mappedStatus }).eq("id", existing.id);
    return jsonResponse({ received: true, action: "updated", ultimatepos_id: ultimateposId, local_id: existing.id, status: mappedStatus });
  }

  return jsonResponse({ received: true, action: "ignored", ultimatepos_id: ultimateposId, message: "Order not found locally — only status updates are processed via webhook" });
}

async function handleCustomerWebhook(supabase: any, data: any, eventType: string, config: UltimatePosConfig | null): Promise<Response> {
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
    if (routeAction === "webhook") {
      return await handleWebhook(req, supabase);
    }

    const config = await getConfig(supabase);
    if (!config) {
      return errorResponse(400, "UltimatePOS is not configured. Set up the integration in the admin panel first.");
    }

    switch (routeAction) {
      case "test-connection":
        return await testConnection(config);

      case "debug":
        return await debugConnection(config);

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

      case "webhook-events": {
        const { data: events } = await supabase
          .from("ultimatepos_webhook_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        return jsonResponse({ events: events || [] });
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
          webhook_enabled: config.webhook_enabled,
          last_product_sync_at: config.last_product_sync_at,
          last_customer_sync_at: config.last_customer_sync_at,
          last_sale_push_at: config.last_sale_push_at,
          last_connected_at: config.last_connected_at,
          last_webhook_at: config.last_webhook_at,
          last_webhook_event: config.last_webhook_event,
          pending_sale_pushes: pendingCount || 0,
          recent_sync_logs: recentLogs || [],
        });
      }

      default:
        return errorResponse(404, `Unknown action: ${routeAction}. Available: test-connection, debug, sync-products, sync-customers, push-sales, push-sale, status, webhook, webhook-events`);
    }
  } catch (error) {
    console.error("UltimatePOS sync error:", error);
    return errorResponse(500, "Internal server error", error instanceof Error ? error.message : String(error));
  }
});

// v3
