// UltimatePOS Sync — Cloudflare bypass via direct IP + OAuth + session-based POS
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
// Cloudflare bypass: raw TCP with Host header
// ============================================================
function getHostFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "";
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
  options: RequestInit & { directIp?: string; noRedirect?: boolean },
): Promise<Response> {
  const directIp = (options as any).directIp;
  const noRedirect = (options as any).noRedirect;
  const cleanOptions = { ...options } as any;
  delete cleanOptions.directIp;
  delete cleanOptions.noRedirect;

  if (!directIp) {
    return await fetch(url, { ...cleanOptions, redirect: noRedirect ? "manual" : "follow" });
  }

  const originalUrl = new URL(url);
  const host = originalUrl.host;
  const path = originalUrl.pathname + originalUrl.search;
  const method = (cleanOptions.method as string) || "GET";
  const body = cleanOptions.body as string | undefined;
  const headers = new Headers(cleanOptions.headers || {});

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

  const responseChunks: Uint8Array[] = [];
  const buf = new Uint8Array(65536);
  while (true) {
    const n = await conn.read(buf);
    if (n === null) break;
    responseChunks.push(buf.slice(0, n));
  }
  conn.close();

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
  if (headerEnd === -1) {
    return new Response(responseStr, { status: 200, headers: new Headers() });
  }
  const headerSection = responseStr.substring(0, headerEnd);
  const [statusLine, ...headerLines] = headerSection.split("\r\n");
  let statusCode = parseInt(statusLine.split(" ")[1] || "0", 10);
  if (statusCode === 0) statusCode = 200;

  const responseHeaders = new Headers();
  for (const line of headerLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      responseHeaders.set(key, value);
    }
  }

  let responseBody = responseStr.substring(headerEnd + 4);
  const isChunked = responseHeaders.get("transfer-encoding")?.toLowerCase().includes("chunked");
  if (isChunked) {
    responseBody = decodeChunked(responseBody);
    responseHeaders.delete("transfer-encoding");
  }

  // For redirect responses with noRedirect, return empty body
  if (noRedirect && statusCode >= 300 && statusCode < 400) {
    return new Response(null, {
      status: statusCode,
      headers: responseHeaders,
    });
  }

  // Handle redirects manually (rewriting to direct IP)
  if ((statusCode >= 301 && statusCode <= 308) && responseHeaders.get("location") && !noRedirect) {
    const location = responseHeaders.get("location")!;
    const redirectUrl = location.startsWith("http") ? location : new URL(location, url).toString();
    return await fetchWithBypass(redirectUrl, {
      ...cleanOptions,
      directIp,
      method: statusCode === 303 ? "GET" : method,
      body: statusCode === 303 ? undefined : body,
    });
  }

  return new Response(responseBody || null, {
    status: statusCode,
    headers: responseHeaders,
  });
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
        scope: "*",
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
    `- Make sure your API URL includes /public if UltimatePOS was installed with it\n` +
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
// API request helper
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

  throw new Error(`All API URL attempts failed:\n${errors.join("\n")}`);
}

// ============================================================
// Product Sync
// ============================================================
async function syncProducts(supabase: any, config: UltimatePosConfig): Promise<Response> {
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
        .select("id, ultimatepos_id")
        .or(`ultimatepos_id.eq.${ultimateposId}`)
        .maybeSingle();

      if (existing) {
        const updateData: any = {};
        if (name !== null) updateData.name = name;
        if (price !== null) updateData.price = price;
        if (description !== null) updateData.description = description;
        if (imageUrl !== null) updateData.image_url = imageUrl;

        if (Object.keys(updateData).length > 0) {
          await supabase.from("products").update(updateData).eq("id", existing.id);
          updated++;
          details.push({ id: ultimateposId, name, action: "updated" });
        } else {
          skipped++;
        }
      } else {
        const insertData: any = {
          name: name || "Unnamed",
          price: price || 0,
          is_available: true,
          ultimatepos_id: ultimateposId,
        };
        if (description) insertData.description = description;
        if (imageUrl) insertData.image_url = imageUrl;

        const { error: insertError } = await supabase.from("products").insert(insertData);
        if (insertError) {
          details.push({ id: ultimateposId, name, action: "error", error: insertError.message });
        } else {
          created++;
          details.push({ id: ultimateposId, name, action: "created" });
        }
      }
    }

    await supabase.from("ultimatepos_config").update({
      last_product_sync_at: new Date().toISOString(),
    }).eq("id", config.id);

    return jsonResponse({
      success: true,
      total: productArray.length,
      created,
      updated,
      skipped,
      details,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "Product sync failed", msg);
  }
}

// ============================================================
// Customer Sync
// ============================================================
async function syncCustomers(supabase: any, config: UltimatePosConfig): Promise<Response> {
  try {
    const path = `/connector/api/contactapi?business_id=${config.business_id}&type=customer&per_page=100`;
    const { data: result } = await apiRequest(config, path);

    const customers: any[] = result.data || result || [];
    const customerArray = Array.isArray(customers) ? customers : [];

    let created = 0, updated = 0;
    const details: any[] = [];

    for (const uc of customerArray) {
      const ultimateposId = String(uc.id);
      const name = uc.name || uc.contact_name || "Unknown";
      const phone = uc.mobile || uc.phone || null;
      const email = uc.email || null;

      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("ultimatepos_id", ultimateposId)
        .maybeSingle();

      if (existing) {
        await supabase.from("customers").update({
          name,
          phone,
          email,
        }).eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("customers").insert({
          name,
          phone,
          email,
          ultimatepos_id: ultimateposId,
        });
        created++;
      }
      details.push({ id: ultimateposId, name, action: existing ? "updated" : "created" });
    }

    await supabase.from("ultimatepos_config").update({
      last_customer_sync_at: new Date().toISOString(),
    }).eq("id", config.id);

    return jsonResponse({
      success: true,
      total: customerArray.length,
      created,
      updated,
      details,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "Customer sync failed", msg);
  }
}

// ============================================================
// Sale Push (Kiosk → UltimatePOS via session-based POS endpoint)
// ============================================================
function buildPosFormData(params: Record<string, any>, sellLines: any[], csrfToken: string): string {
  const parts: string[] = [];
  parts.push(`_token=${encodeURIComponent(csrfToken)}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  for (let i = 0; i < sellLines.length; i++) {
    const line = sellLines[i];
    for (const [field, val] of Object.entries(line)) {
      parts.push(`sell_lines[${i}][${encodeURIComponent(field)}]=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.join("&");
}

async function posLogin(config: UltimatePosConfig): Promise<{ cookies: string; csrfToken: string } | null> {
  const baseUrl = config.api_url || "";
  const directIp = config.direct_server_ip || undefined;
  const loginUrl = `${baseUrl}/login`;

  // Step 1: GET login page to get session cookie + CSRF token
  const resp1 = await fetchWithBypass(loginUrl, {
    method: "GET",
    directIp,
    headers: { "Accept": "text/html" },
  });
  const html = await resp1.text();

  const setCookie = resp1.headers.get("set-cookie") || "";
  const sessionCookie = setCookie.split(";")[0];

  const csrfMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : "";

  if (!sessionCookie || !csrfToken) return null;

  // Step 2: POST login credentials (don't follow redirect — we need the Set-Cookie)
  const loginBody = `_token=${encodeURIComponent(csrfToken)}&username=${encodeURIComponent(config.username || "")}&password=${encodeURIComponent(config.password || "")}`;
  const resp2 = await fetchWithBypass(loginUrl, {
    method: "POST",
    directIp,
    noRedirect: true,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "Cookie": sessionCookie,
      "X-CSRF-TOKEN": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: loginBody,
  });

  const setCookie2 = resp2.headers.get("set-cookie") || "";
  const updatedCookie = setCookie2.split(";")[0] || sessionCookie;

  // Step 3: GET /pos/create to verify login and get fresh CSRF token
  const resp3 = await fetchWithBypass(`${baseUrl}/pos/create`, {
    method: "GET",
    directIp,
    headers: {
      "Accept": "text/html",
      "Cookie": updatedCookie,
    },
  });
  const posHtml = await resp3.text();
  const posCsrfMatch = posHtml.match(/<meta name="csrf-token" content="([^"]+)"/);
  const posCsrfToken = posCsrfMatch ? posCsrfMatch[1] : csrfToken;

  if (posHtml.includes("add_pos_sell_form") || posHtml.includes("pos/create")) {
    return { cookies: updatedCookie, csrfToken: posCsrfToken };
  }

  return null;
}

async function buildSalePayload(supabase: any, orderId: string, config: UltimatePosConfig): Promise<any> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error("Order not found");

  // Look up UltimatePOS product IDs for each order item
  const kioskProductIds = (order.order_items || []).map((item: any) => item.product_id).filter(Boolean);
  const { data: products } = await supabase
    .from("products")
    .select("id, ultimatepos_id")
    .in("id", kioskProductIds);

  const productMap = new Map<string, string>();
  for (const p of products || []) {
    if (p.ultimatepos_id) productMap.set(p.id, String(p.ultimatepos_id));
  }

  // Fetch variation IDs from UltimatePOS for each product
  const variationCache = new Map<string, string>();
  for (const ultimateposProductId of new Set(productMap.values())) {
    try {
      const path = `/connector/api/product/${ultimateposProductId}?business_id=${config.business_id}`;
      const { data: productData } = await apiRequest(config, path);
      const product = Array.isArray(productData.data) ? productData.data[0] : productData.data;
      const variationId = product?.product_variations?.[0]?.variations?.[0]?.id;
      if (variationId) {
        variationCache.set(ultimateposProductId, String(variationId));
      }
    } catch {
      // If we can't get the variation ID, we'll send empty string
    }
  }

  const lines = (order.order_items || []).map((item: any) => {
    const ultimateposProductId = productMap.get(item.product_id) || "";
    const variationId = variationCache.get(ultimateposProductId) || "";
    return {
      product_id: ultimateposProductId,
      variation_id: variationId,
      name: item.product_name,
      quantity: item.quantity,
      unit_price: parseFloat(item.item_total) / item.quantity,
      unit_price_inc_tax: parseFloat(item.item_total) / item.quantity,
      total_before_tax: parseFloat(item.item_total),
    };
  });

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
    // Step 1: Login to UltimatePOS web interface
    const session = await posLogin(config);
    if (!session) {
      throw new Error("Failed to login to UltimatePOS web interface for sale push");
    }

    const baseUrl = config.api_url || "";
    const directIp = config.direct_server_ip || undefined;
    const posUrl = `${baseUrl}/pos`;

    // Step 2: Build form data with PHP array notation
    const sellLines = (payload.sell_lines || []).map((line: any) => ({
      product_id: line.product_id,
      variation_id: line.variation_id || "",
      quantity: line.quantity,
      unit_price: line.unit_price,
      unit_price_inc_tax: line.unit_price_inc_tax,
      total_before_tax: line.total_before_tax,
    }));

    const formData = buildPosFormData({
      location_id: config.sync_order_location_id || config.location_id,
      status: "final",
      payment_status: payload.payment_status || "paid",
      final_total: payload.final_total,
      sell_price_tax: "includes",
      contact_id: 1,
      "payment[0][method]": "cash",
      "payment[0][amount]": payload.final_total,
    }, sellLines, session.csrfToken);

    // Step 3: POST to /pos to create the sale
    const resp = await fetchWithBypass(posUrl, {
      method: "POST",
      directIp,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Cookie": session.cookies,
        "X-CSRF-TOKEN": session.csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    });

    const text = await resp.text();
    let responseData: any;
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { raw: text.substring(0, 500) };
    }

    if (responseData.success === 1 || responseData.success === true) {
      const saleId = responseData.data?.id ? String(responseData.data.id) : null;

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
    } else {
      const errorMsg = responseData.msg || responseData.message || "Sale creation failed";
      await handlePushFailure(supabase, pushId, errorMsg, push.retry_count, push.max_retries, responseData);
      return { success: false, error: errorMsg };
    }
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
// Connection test
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
      "1. Wrong API URL — if UltimatePOS was installed with /public, add it to your URL\n" +
      "2. API Connector module not installed — go to UltimatePOS admin → Modules → install/enable 'API or Connector'\n" +
      "3. Cloudflare blocking — set the Direct Server IP to bypass Cloudflare\n" +
      "4. Wrong business_id — make sure the business ID matches your UltimatePOS business",
    tried_urls: urlsToTry,
  }, null, 2));
}

// ============================================================
// Debug endpoint
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

  // Test 1: Check if base URL is reachable
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

  // Test 2: Check product endpoint
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

  // Test 3: Try auth
  try {
    const authResult = await getAuthToken(config);
    diag.steps.push({ step: "auth", status: "ok", message: `Token obtained from ${authResult.baseUrl}` });

    // Test 4: Authenticated API call
    const apiUrl = `${authResult.baseUrl}/connector/api/product?business_id=${config.business_id}&per_page=1`;
    const resp = await fetchWithBypass(apiUrl, {
      method: "GET",
      directIp: config.direct_server_ip || undefined,
      headers: authHeaders(authResult.token),
    });
    const text = await resp.text();
    const data = JSON.parse(text);
    diag.steps.push({
      step: "authenticated-api",
      status: resp.status,
      product_count: data.meta?.total ?? (data.data?.length ?? 0),
      body_preview: text.substring(0, 300),
    });
  } catch (err) {
    diag.steps.push({
      step: "auth",
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return jsonResponse(diag);
}

// ============================================================
// Status endpoint
// ============================================================
async function getStatus(supabase: any, config: UltimatePosConfig): Promise<Response> {
  const { data: pendingPushes } = await supabase
    .from("ultimatepos_sale_pushes")
    .select("id, status, error_message, retry_count, created_at")
    .in("status", ["pending", "retrying", "failed"])
    .order("created_at", { ascending: false })
    .limit(10);

  return jsonResponse({
    config: {
      api_url: config.api_url,
      auth_mode: config.auth_mode,
      business_id: config.business_id,
      location_id: config.location_id,
      connection_status: config.connection_status,
      direct_server_ip: config.direct_server_ip,
      last_connected_at: config.last_connected_at,
      last_product_sync_at: config.last_product_sync_at,
      last_sale_push_at: config.last_sale_push_at,
      auto_sync_products: config.auto_sync_products,
      auto_push_sales: config.auto_push_sales,
    },
    pending_pushes: pendingPushes || [],
  });
}

// ============================================================
// Webhook handler
// ============================================================
async function handleWebhook(req: Request, supabase: any, config: UltimatePosConfig): Promise<Response> {
  const webhookSecret = req.headers.get("X-Webhook-Secret");
  if (config.webhook_secret && webhookSecret !== config.webhook_secret) {
    return errorResponse(401, "Invalid webhook secret");
  }

  const body = await req.json();
  const event = body.event || "unknown";

  await supabase.from("ultimatepos_config").update({
    last_webhook_at: new Date().toISOString(),
    last_webhook_event: event,
  }).eq("id", config.id);

  if (event === "product.updated" || event === "product.created") {
    const productData = body.data || body.product;
    if (productData) {
      const ultimateposId = String(productData.id);
      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("ultimatepos_id", ultimateposId)
        .maybeSingle();

      const updateData: any = {
        name: productData.name,
        price: parseFloat(productData.sell_price || productData.product_variations?.[0]?.variations?.[0]?.default_sell_price || "0"),
      };

      if (existing) {
        await supabase.from("products").update(updateData).eq("id", existing.id);
      } else {
        await supabase.from("products").insert({
          ...updateData,
          ultimatepos_id: ultimateposId,
          is_available: true,
        });
      }
    }
  }

  return jsonResponse({ success: true, event });
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const config = await getConfig(supabase);

  if (!config) {
    return errorResponse(404, "No active UltimatePOS configuration found");
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "status";

  try {
    switch (action) {
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
        const pushId = url.searchParams.get("push_id");
        if (!pushId) return errorResponse(400, "Missing push_id parameter");
        const result = await pushSale(supabase, config, pushId);
        return jsonResponse(result);
      }

      case "status":
        return await getStatus(supabase, config);

      case "webhook":
        return await handleWebhook(req, supabase, config);

      default:
        return errorResponse(400, `Unknown action: ${action}. Available: test-connection, debug, sync-products, sync-customers, push-sales, push-sale, status, webhook, webhook-events`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return errorResponse(500, "Internal error", msg);
  }
});
