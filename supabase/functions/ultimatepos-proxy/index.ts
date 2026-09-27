import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UltimatePOSConfig {
  id: string;
  base_url: string;
  auth_method: string;
  api_token: string;
  api_username: string;
  api_password: string;
  client_id: string;
  client_secret: string;
  business_id: number;
  location_id: number;
  is_enabled: boolean;
  auto_push_orders: boolean;
  auto_sync_products: boolean;
}

interface TokenCache {
  token: string;
  expires_at: number;
}

let tokenCache: TokenCache | null = null;

// Cloudflare blocks requests without a browser-like User-Agent, returning a
// 403 "Just a moment..." JS challenge page instead of the real API response.
// These headers make our server-side fetch look like a normal HTTP client.
const UPOS_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; UltimatePOS-Connector/1.0)",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getBearerToken(config: UltimatePOSConfig): Promise<string> {
  const baseUrl = config.base_url.replace(/\/$/, "");

  if (config.auth_method === "token") {
    if (!config.api_token) throw new Error("API Token is empty.");
    return config.api_token.trim();
  }

  if (config.auth_method === "password") {
    if (tokenCache && Date.now() < tokenCache.expires_at - 60000) return tokenCache.token;
    const resp = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { ...UPOS_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: config.client_id,
        client_secret: config.client_secret,
        username: config.api_username,
        password: config.api_password,
        scope: "",
      }).toString(),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Password grant failed (${baseUrl}/oauth/token): ${resp.status} — ${t}`);
    }
    const data = await resp.json();
    if (!data.access_token) throw new Error(`No access_token in response: ${JSON.stringify(data)}`);
    tokenCache = { token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
    return tokenCache.token;
  }

  // OAuth2 client_credentials
  if (tokenCache && Date.now() < tokenCache.expires_at - 60000) return tokenCache.token;
  const formBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.client_id,
    client_secret: config.client_secret,
  });
  let resp = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { ...UPOS_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
  });
  if (!resp.ok && resp.status >= 400 && resp.status < 500) {
    resp = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { ...UPOS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: config.client_id, client_secret: config.client_secret }),
    });
  }
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Client credentials grant failed: ${resp.status} — ${t}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No access_token in response: ${JSON.stringify(data)}`);
  tokenCache = { token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

async function uposRequest(
  config: UltimatePOSConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const token = await getBearerToken(config);
  const url = `${config.base_url.replace(/\/$/, "")}${path}`;
  const resp = await fetch(url, {
    method,
    headers: { ...UPOS_HEADERS, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok) throw new Error(`UltimatePOS ${method} ${path} failed ${resp.status}: ${text}`);
  return json;
}

async function verifyToken(config: UltimatePOSConfig, token: string): Promise<void> {
  const baseUrl = config.base_url.replace(/\/$/, "");
  const candidates = ["/connector/api/business_details", "/api/business_details", "/connector/api/location"];
  for (const path of candidates) {
    const r = await fetch(`${baseUrl}${path}`, {
      headers: { ...UPOS_HEADERS, "Authorization": `Bearer ${token}` },
    });
    if (r.status !== 404) {
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`API access denied (${baseUrl}${path}): ${r.status} — ${t}`);
      }
      return;
    }
  }
}

// ── Helpers for extracting variation data from UltimatePOS product response ──

function extractVariationData(product: Record<string, unknown>): {
  variationId: number | null;
  price: number;
} {
  // UltimatePOS returns variations in "product_variations" array
  // Each product_variation has a nested "variations" array
  // Structure: product.product_variations[0].variations[0].{id, sell_price_inc_tax, default_sell_price}
  const productVariations = Array.isArray(product.product_variations)
    ? product.product_variations as Record<string, unknown>[]
    : [];

  if (productVariations.length > 0) {
    const firstPV = productVariations[0];
    // Check nested variations array first (standard UltimatePOS structure)
    const nestedVariations = Array.isArray(firstPV.variations)
      ? firstPV.variations as Record<string, unknown>[]
      : [];

    if (nestedVariations.length > 0) {
      const v = nestedVariations[0];
      const varId = parseInt(String(v.id), 10) || null;
      const price = parseFloat(String(
        v.sell_price_inc_tax ?? v.default_sell_price ?? v.sell_price ?? 0
      )) || 0;
      return { variationId: varId, price };
    }

    // Fallback: product_variations itself holds the variation data (flat structure)
    const varId = parseInt(String(firstPV.id), 10) || null;
    const price = parseFloat(String(
      firstPV.sell_price_inc_tax ?? firstPV.default_sell_price ?? firstPV.sell_price ?? 0
    )) || 0;
    return { variationId: varId, price };
  }

  // Legacy: some installations use "variations" at product level directly
  const variations = Array.isArray(product.variations)
    ? product.variations as Record<string, unknown>[]
    : [];

  if (variations.length > 0) {
    const v = variations[0];
    const varId = parseInt(String(v.id), 10) || null;
    const price = parseFloat(String(
      v.sell_price_inc_tax ?? v.default_sell_price ?? v.sell_price ?? 0
    )) || 0;
    return { variationId: varId, price };
  }

  // Product-level price as last resort
  const price = parseFloat(String(
    product.sell_price_inc_tax ?? product.sell_price ?? 0
  )) || 0;
  return { variationId: null, price };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const reqUrl = new URL(req.url);
  const action = reqUrl.searchParams.get("action");

  try {
    const { data: configRow, error: configError } = await supabase
      .from("ultimatepos_config")
      .select("*")
      .single();

    if (configError || !configRow) {
      return Response.json({ error: "UltimatePOS not configured" }, { status: 400, headers: corsHeaders });
    }

    const dbConfig = configRow as UltimatePOSConfig;

    // ── TEST CONNECTION ──────────────────────────────────────────────────────
    if (action === "test") {
      let testConfig = { ...dbConfig };
      if (req.method === "POST") {
        try {
          const body = await req.json() as Partial<UltimatePOSConfig>;
          testConfig = {
            ...testConfig,
            base_url: body.base_url ?? testConfig.base_url,
            auth_method: body.auth_method ?? testConfig.auth_method,
            api_token: body.api_token ?? testConfig.api_token,
            api_username: body.api_username ?? testConfig.api_username,
            api_password: body.api_password ?? testConfig.api_password,
            client_id: body.client_id ?? testConfig.client_id,
            client_secret: body.client_secret ?? testConfig.client_secret,
          };
        } catch { /* use db config */ }
      }

      if (!testConfig.base_url) return Response.json({ error: "Base URL is required." }, { status: 400, headers: corsHeaders });
      if (testConfig.auth_method === "token" && !testConfig.api_token) return Response.json({ error: "API Token is required." }, { status: 400, headers: corsHeaders });
      if (testConfig.auth_method === "password" && (!testConfig.client_id || !testConfig.client_secret || !testConfig.api_username || !testConfig.api_password)) {
        return Response.json({ error: "Client ID, Client Secret, Username and Password are all required for Password Grant." }, { status: 400, headers: corsHeaders });
      }
      if (testConfig.auth_method === "oauth" && (!testConfig.client_id || !testConfig.client_secret)) {
        return Response.json({ error: "Client ID and Client Secret are required for OAuth2." }, { status: 400, headers: corsHeaders });
      }

      tokenCache = null;
      const token = await getBearerToken(testConfig);
      await verifyToken(testConfig, token);

      await supabase.from("ultimatepos_config").update({
        connection_status: "connected",
        last_connected_at: new Date().toISOString(),
      }).eq("id", configRow.id);

      return Response.json({ success: true, message: "Connection successful", auth_method: testConfig.auth_method }, { headers: corsHeaders });
    }

    if (!dbConfig.is_enabled) {
      return Response.json({ error: "UltimatePOS integration is disabled" }, { status: 400, headers: corsHeaders });
    }

    // ── SYNC PRODUCTS ────────────────────────────────────────────────────────
    if (action === "sync_products") {
      const { data: syncLog } = await supabase
        .from("ultimatepos_sync_log")
        .insert({ sync_type: "products", status: "running" })
        .select()
        .single();
      const syncId = syncLog?.id;

      try {
        const result = await uposRequest(
          dbConfig,
          "GET",
          `/connector/api/product?business_id=${dbConfig.business_id}&per_page=500`
        ) as { data?: unknown[]; total?: number };

        const products = Array.isArray(result) ? result : (result?.data ?? []);
        let synced = 0;

        for (const p of products as Record<string, unknown>[]) {
          const name = (p.name as string) ?? "";
          if (!name) continue;

          const uposId = typeof p.id === "number" ? p.id : parseInt(String(p.id), 10);
          const { variationId, price } = extractVariationData(p);
          const description = (p.description as string) ?? null;

          // Upsert by ultimatepos_id if it already exists
          const { data: existing } = await supabase
            .from("products")
            .select("id, price")
            .eq("ultimatepos_id", uposId)
            .maybeSingle();

          if (existing) {
            const updateData: Record<string, unknown> = {
              name,
              ultimatepos_variation_id: variationId,
              updated_at: new Date().toISOString(),
            };
            // Only update price if the synced price is > 0 (don't overwrite with zero)
            if (price > 0) updateData.price = price;
            await supabase.from("products").update(updateData).eq("id", existing.id);
          } else {
            // Case-insensitive name match for products created locally before sync
            const { data: byName } = await supabase
              .from("products")
              .select("id, price")
              .ilike("name", name)
              .maybeSingle();

            if (byName) {
              const updateData: Record<string, unknown> = {
                ultimatepos_id: uposId,
                ultimatepos_variation_id: variationId,
                updated_at: new Date().toISOString(),
              };
              // Only update price if synced price > 0 and local price is 0
              if (price > 0 && (!byName.price || parseFloat(String(byName.price)) === 0)) {
                updateData.price = price;
              }
              await supabase.from("products").update(updateData).eq("id", byName.id);
            } else {
              await supabase.from("products").insert({
                name,
                price: price > 0 ? price : 0,
                description,
                is_available: true,
                ultimatepos_id: uposId,
                ultimatepos_variation_id: variationId,
              });
            }
          }
          synced++;
        }

        if (syncId) {
          await supabase.from("ultimatepos_sync_log").update({
            status: "completed",
            items_synced: synced,
            completed_at: new Date().toISOString(),
          }).eq("id", syncId);
        }
        await supabase.from("ultimatepos_config").update({
          last_product_sync_at: new Date().toISOString(),
        }).eq("id", configRow.id);

        return Response.json({ success: true, synced }, { headers: corsHeaders });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (syncId) {
          await supabase.from("ultimatepos_sync_log").update({
            status: "failed",
            error_message: msg,
            completed_at: new Date().toISOString(),
          }).eq("id", syncId);
        }
        throw err;
      }
    }

    // ── PUSH ORDER ───────────────────────────────────────────────────────────
    if (action === "push_order") {
      const { orderId } = await req.json();
      if (!orderId) return Response.json({ error: "orderId required" }, { status: 400, headers: corsHeaders });

      // Idempotency: skip if already pushed successfully
      const { data: existingLog } = await supabase
        .from("ultimatepos_order_log")
        .select("id, status, ultimatepos_sale_id")
        .eq("order_id", orderId)
        .eq("status", "success")
        .maybeSingle();
      if (existingLog) {
        return Response.json({ success: true, already_pushed: true, sale_id: existingLog.ultimatepos_sale_id }, { headers: corsHeaders });
      }

      // Load order + items + product ultimatepos IDs
      const { data: order } = await supabase
        .from("orders")
        .select("*, order_items(*, products(ultimatepos_id, ultimatepos_variation_id))")
        .eq("id", orderId)
        .single();
      if (!order) return Response.json({ error: "Order not found" }, { status: 404, headers: corsHeaders });

      const orderItems = order.order_items as Record<string, unknown>[];

      // Build sell_lines — only include items that have valid UltimatePOS links
      const sellLines: Record<string, unknown>[] = [];
      const skippedItems: string[] = [];

      for (const item of orderItems) {
        const productMeta = (item.products as Record<string, unknown> | null) ?? {};
        const uposProductId = (productMeta.ultimatepos_id as number | null) ?? null;
        const uposVariationId = (productMeta.ultimatepos_variation_id as number | null) ?? null;
        const qty = item.quantity as number;
        const unitPrice = parseFloat(String(item.product_price)) || 0;
        const lineTotal = parseFloat(String(item.item_total)) || unitPrice * qty;

        if (!uposProductId) {
          skippedItems.push(item.product_name as string || "Unknown");
          continue;
        }

        sellLines.push({
          product_id: uposProductId,
          variation_id: uposVariationId || uposProductId,
          quantity: qty,
          unit_price_before_discount: unitPrice,
          discount_type: "fixed",
          discount_amount: "0",
          item_tax: 0,
          tax_amount: 0,
          unit_price: unitPrice,
          line_discount_type: "fixed",
          line_discount_amount: "0",
          enable_stock: 0,
          line_total: lineTotal,
        });
      }

      if (sellLines.length === 0) {
        const msg = `No items linked to Faseyha POS. Unlinked items: ${skippedItems.join(", ")}`;
        await supabase.from("ultimatepos_order_log").insert({
          order_id: orderId,
          order_number: order.order_number,
          status: "failed",
          error_message: msg,
        });
        return Response.json({ error: msg }, { status: 400, headers: corsHeaders });
      }

      // UltimatePOS payment method names
      const paymentMethodMap: Record<string, string> = {
        cash: "cash",
        card: "card",
        bank_transfer: "bank_transfer",
        credit: "credit",
        qr: "card",
      };
      const uposPayMethod = paymentMethodMap[order.payment_method as string] ?? "cash";

      const payload = {
        location_id: dbConfig.location_id,
        contact_id: null,
        transaction_date: new Date().toISOString().split("T")[0],
        invoice_no: order.order_number ?? undefined,
        status: "final",
        payment_status: "paid",
        products: sellLines,
        payment: [{ method: uposPayMethod, amount: parseFloat(String(order.total_price)) || 0 }],
      };

      const { data: logRow } = await supabase
        .from("ultimatepos_order_log")
        .insert({
          order_id: orderId,
          order_number: order.order_number,
          status: "pending",
          request_payload: payload,
        })
        .select()
        .single();
      const logId = logRow?.id;

      try {
        const result = await uposRequest(dbConfig, "POST", "/connector/api/sell", payload) as unknown;
        const resultObj = (Array.isArray(result) ? result[0] : result) as Record<string, unknown> | null;

        // Check if UltimatePOS returned an error in the response body
        const errorInResponse =
          (resultObj?.error as Record<string, unknown>)?.message ??
          (resultObj?.original as Record<string, unknown>)?.error ??
          ((resultObj?.original as Record<string, unknown>)?.error as Record<string, unknown>)?.message ??
          null;

        if (errorInResponse) {
          const errMsg = typeof errorInResponse === "string" ? errorInResponse : JSON.stringify(errorInResponse);
          if (logId) {
            await supabase.from("ultimatepos_order_log").update({
              status: "failed",
              error_message: `Faseyha POS rejected: ${errMsg}`,
              response_payload: result as Record<string, unknown>,
            }).eq("id", logId);
          }
          return Response.json({ error: `Faseyha POS rejected: ${errMsg}`, response: result }, { status: 400, headers: corsHeaders });
        }

        // Extract sale ID from successful response
        const saleData = (resultObj?.data as Record<string, unknown>) ?? resultObj;
        const saleId = (saleData?.id as number) ?? null;

        if (logId) {
          await supabase.from("ultimatepos_order_log").update({
            status: "success",
            ultimatepos_sale_id: saleId,
            response_payload: result as Record<string, unknown>,
            pushed_at: new Date().toISOString(),
          }).eq("id", logId);
        }
        return Response.json({
          success: true,
          sale_id: saleId,
          skipped_items: skippedItems.length > 0 ? skippedItems : undefined,
        }, { headers: corsHeaders });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (logId) {
          await supabase.from("ultimatepos_order_log").update({
            status: "failed",
            error_message: msg,
          }).eq("id", logId);
        }
        throw err;
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400, headers: corsHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500, headers: corsHeaders });
  }
});
