import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface UltimatePosConfig {
  base_url: string;
  client_id: string;
  client_secret: string;
  api_token: string;
  api_username: string;
  api_password: string;
  auth_method: string;
  business_id: number | null;
  location_id: number | null;
  is_enabled: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "test-connection":
        return await testConnection(supabase, body);
      case "push-order":
        return await pushOrder(supabase, body);
      case "sync-products":
        return await syncProducts(supabase, body);
      case "fetch-products":
        return await fetchProducts(supabase, body);
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("UltimatePOS sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function getConfig(supabase: any): Promise<UltimatePosConfig | null> {
  const { data, error } = await supabase
    .from("ultimatepos_config")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as UltimatePosConfig;
}

async function getAccessToken(config: UltimatePosConfig): Promise<string> {
  const baseUrl = config.base_url.replace(/\/+$/, "");

  if (config.auth_method === "token" && config.api_token) {
    return config.api_token;
  }

  if (config.auth_method === "password") {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: config.client_id,
        client_secret: config.client_secret,
        username: config.api_username,
        password: config.api_password,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`UltimatePOS password grant failed (${response.status}): ${errText.substring(0, 300)}`);
    }

    const tokenData = await response.json();
    return tokenData.access_token;
  }

  // OAuth2 client credentials grant
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`UltimatePOS OAuth token request failed (${response.status}): ${errText.substring(0, 300)}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

async function testConnection(supabase: any, _body: any) {
  const config = await getConfig(supabase);
  if (!config) {
    return jsonError("UltimatePOS not configured");
  }

  try {
    const token = await getAccessToken(config);
    const baseUrl = config.base_url.replace(/\/+$/, "");

    const response = await fetch(`${baseUrl}/connector/api/business-details`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      await updateConnectionStatus(supabase, "error");
      return jsonError(`Connection failed (${response.status}): ${errText.substring(0, 200)}`);
    }

    await updateConnectionStatus(supabase, "connected");
    return jsonResponse({ success: true, message: "Connection successful" });
  } catch (error) {
    await updateConnectionStatus(supabase, "error");
    return jsonError(error instanceof Error ? error.message : "Connection failed");
  }
}

async function updateConnectionStatus(supabase: any, status: string) {
  await supabase
    .from("ultimatepos_config")
    .update({
      connection_status: status,
      last_connected_at: status === "connected" ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .neq("id", "00000000-0000-0000-0000-000000000000");
}

async function pushOrder(supabase: any, body: any) {
  const { orderId } = body;
  if (!orderId) return jsonError("Missing orderId");

  const config = await getConfig(supabase);
  if (!config || !config.is_enabled) {
    return jsonError("UltimatePOS integration is not enabled");
  }

  // Fetch the order with items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id, order_number, total_price, status, payment_method,
      order_items (id, product_id, product_name, product_price, quantity, item_total, addons)
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return jsonError("Order not found");
  }

  // Create order log entry
  const { data: logEntry } = await supabase
    .from("ultimatepos_order_log")
    .insert({
      order_id: order.id,
      order_number: order.order_number,
      status: "pending",
    })
    .select()
    .maybeSingle();

  try {
    const token = await getAccessToken(config);
    const baseUrl = config.base_url.replace(/\/+$/, "");

    // Fetch linked products to get UltimatePOS IDs
    const productIds = (order.order_items || []).map((item: any) => item.product_id);
    const { data: products } = await supabase
      .from("products")
      .select("id, ultimatepos_id, ultimatepos_variation_id, name")
      .in("id", productIds);

    const productMap = new Map<string, any>();
    (products || []).forEach((p: any) => productMap.set(p.id, p));

    // Build UltimatePOS sell payload
    const sellLines: any[] = [];
    let unmappedItems = 0;

    for (const item of (order.order_items || [])) {
      const linkedProduct = productMap.get(item.product_id);
      if (!linkedProduct || !linkedProduct.ultimatepos_id) {
        unmappedItems++;
        continue;
      }

      sellLines.push({
        product_id: linkedProduct.ultimatepos_id,
        variation_id: linkedProduct.ultimatepos_variation_id || null,
        quantity: Number(item.quantity),
        unit_price: Number(item.product_price),
        unit_price_inc_tax: Number(item.product_price),
        sell_line_note: null,
      });

      // Add addons as separate lines if present
      if (item.addons && Array.isArray(item.addons)) {
        for (const addon of item.addons) {
          if (addon.name && addon.price) {
            sellLines.push({
              product_id: linkedProduct.ultimatepos_id,
              variation_id: linkedProduct.ultimatepos_variation_id || null,
              quantity: Number(item.quantity),
              unit_price: Number(addon.price),
              unit_price_inc_tax: Number(addon.price),
              sell_line_note: `Addon: ${addon.name}`,
            });
          }
        }
      }
    }

    if (sellLines.length === 0) {
      const errMsg = `No products are linked to UltimatePOS. ${unmappedItems} unmapped item(s). Map products in the Products page first.`;
      await updateOrderLog(supabase, logEntry?.id, "failed", errMsg, null, null);
      return jsonError(errMsg);
    }

    const paymentType = order.payment_method === "card" ? "card" : "cash";

    const sellPayload: any = {
      business_id: config.business_id || 1,
      location_id: config.location_id || 1,
      status: "final",
      payment_status: "paid",
      sell_lines: sellLines,
      payment: [
        {
          amount: Number(order.total_price),
          method: paymentType,
        },
      ],
      invoice_number: order.order_number,
      note: `Kiosk Order #${order.order_number}`,
    };

    const response = await fetch(`${baseUrl}/connector/api/sell`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sellPayload),
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText.substring(0, 1000) };
    }

    if (!response.ok) {
      const errMsg = responseData.message || responseData.error || `HTTP ${response.status}`;
      await updateOrderLog(supabase, logEntry?.id, "failed", errMsg, sellPayload, responseData);
      return jsonError(`UltimatePOS rejected the sale: ${errMsg}`);
    }

    const saleId = responseData.id || responseData.sale_id || responseData.data?.id;
    await updateOrderLog(supabase, logEntry?.id, "success", null, sellPayload, responseData, saleId);

    return jsonResponse({
      success: true,
      message: "Order pushed to UltimatePOS successfully",
      saleId,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await updateOrderLog(supabase, logEntry?.id, "failed", errMsg, null, null);
    return jsonError(`Failed to push order: ${errMsg}`);
  }
}

async function updateOrderLog(
  supabase: any,
  logId: string | undefined,
  status: string,
  errorMessage: string | null,
  requestPayload: any,
  responsePayload: any,
  saleId?: number | null
) {
  if (!logId) return;
  await supabase
    .from("ultimatepos_order_log")
    .update({
      status,
      error_message: errorMessage,
      request_payload: requestPayload || {},
      response_payload: responsePayload || {},
      ultimatepos_sale_id: saleId ?? null,
      pushed_at: new Date().toISOString(),
    })
    .eq("id", logId);
}

async function fetchProducts(supabase: any, _body: any) {
  const config = await getConfig(supabase);
  if (!config || !config.is_enabled) {
    return jsonError("UltimatePOS integration is not enabled");
  }

  try {
    const token = await getAccessToken(config);
    const baseUrl = config.base_url.replace(/\/+$/, "");

    const response = await fetch(
      `${baseUrl}/connector/api/product?business_id=${config.business_id || 1}&location_id=${config.location_id || 1}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return jsonError(`Failed to fetch products (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const products = data.data || data.products || data || [];

    return jsonResponse({ success: true, products });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Failed to fetch products");
  }
}

async function syncProducts(supabase: any, _body: any) {
  const config = await getConfig(supabase);
  if (!config || !config.is_enabled) {
    return jsonError("UltimatePOS integration is not enabled");
  }

  // Create sync log
  const { data: syncLog } = await supabase
    .from("ultimatepos_sync_log")
    .insert({ sync_type: "products", status: "in_progress", started_at: new Date().toISOString() })
    .select()
    .maybeSingle();

  try {
    const token = await getAccessToken(config);
    const baseUrl = config.base_url.replace(/\/+$/, "");

    const response = await fetch(
      `${baseUrl}/connector/api/product?business_id=${config.business_id || 1}&location_id=${config.location_id || 1}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      await supabase.from("ultimatepos_sync_log").update({
        status: "failed",
        error_message: `HTTP ${response.status}: ${errText.substring(0, 200)}`,
        completed_at: new Date().toISOString(),
      }).eq("id", syncLog?.id);
      return jsonError(`Failed to fetch products from UltimatePOS: HTTP ${response.status}`);
    }

    const data = await response.json();
    const posProducts: any[] = data.data || data.products || data || [];

    // Fetch existing kiosk products
    const { data: kioskProducts } = await supabase
      .from("products")
      .select("id, name, ultimatepos_id, ultimatepos_variation_id");

    let matched = 0;
    let updated = 0;

    for (const posProduct of posProducts) {
      const posId = posProduct.id;
      const posName = posProduct.name;
      if (!posId || !posName) continue;

      // Match by name (case-insensitive)
      const kioskProduct = (kioskProducts || []).find(
        (p: any) => p.name.toLowerCase().trim() === posName.toLowerCase().trim()
      );

      if (kioskProduct) {
        matched++;
        const variationId = posProduct.variations?.[0]?.id || posProduct.variation_id || null;

        if (kioskProduct.ultimatepos_id !== posId) {
          await supabase
            .from("products")
            .update({
              ultimatepos_id: posId,
              ultimatepos_variation_id: variationId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", kioskProduct.id);
          updated++;
        }
      }
    }

    await supabase.from("ultimatepos_sync_log").update({
      status: "success",
      items_synced: updated,
      completed_at: new Date().toISOString(),
    }).eq("id", syncLog?.id);

    await supabase
      .from("ultimatepos_config")
      .update({
        last_product_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    return jsonResponse({
      success: true,
      message: `Synced ${updated} product(s). ${matched} matched by name out of ${posProducts.length} UltimatePOS products.`,
      matched,
      updated,
      total: posProducts.length,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await supabase.from("ultimatepos_sync_log").update({
      status: "failed",
      error_message: errMsg,
      completed_at: new Date().toISOString(),
    }).eq("id", syncLog?.id);
    return jsonError(`Product sync failed: ${errMsg}`);
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
