import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-API-Key",
};

interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to validate API key
async function validateApiKey(apiKey: string): Promise<{ isValid: boolean; apiKeyId?: string; error?: string }> {
  try {
    const keyHash = createHash("sha256").update(apiKey).digest("hex");

    const { data, error } = await supabase.rpc("validate_api_key", {
      p_key_hash: keyHash,
      p_endpoint: "/api",
      p_permission: "read"
    });

    if (error) throw error;

    if (!data || data.length === 0 || !data[0].is_valid) {
      return { isValid: false, error: "Invalid or expired API key" };
    }

    return { isValid: true, apiKeyId: data[0].api_key_id };
  } catch (error) {
    console.error("API key validation error:", error);
    return { isValid: false, error: "Authentication failed" };
  }
}

// Log API request
async function logRequest(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress: string,
  userAgent: string,
  responseTimeMs: number
) {
  try {
    await supabase.rpc("log_api_request", {
      p_api_key_id: apiKeyId,
      p_endpoint: endpoint,
      p_method: method,
      p_status_code: statusCode,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_response_time_ms: responseTimeMs
    });
  } catch (error) {
    console.error("Failed to log API request:", error);
  }
}

// Helper to create error response
function errorResponse(code: string, message: string, statusCode: number = 400): Response {
  const response: ApiResponse = {
    success: false,
    error: { code, message }
  };
  return new Response(JSON.stringify(response), {
    status: statusCode,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Helper to create success response
function successResponse(data: unknown, pagination?: { limit: number; offset: number; total: number }): Response {
  const response: ApiResponse = {
    success: true,
    data,
    ...(pagination && { pagination })
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Products endpoints
async function handleProducts(req: Request, pathParts: string[], method: string) {
  const url = new URL(req.url);

  if (method === "GET" && pathParts.length === 0) {
    // List products
    const categoryId = url.searchParams.get("category_id");
    const isAvailable = url.searchParams.get("is_available");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = supabase
      .from("products")
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (isAvailable !== null) query = query.eq("is_available", isAvailable === "true");

    const { data, error, count } = await query;

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);

    return successResponse(data, { limit, offset, total: count || 0 });
  }

  if (method === "GET" && pathParts.length === 1) {
    // Get single product
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", pathParts[0])
      .maybeSingle();

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);
    if (!data) return errorResponse("NOT_FOUND", "Product not found", 404);

    return successResponse(data);
  }

  if (method === "POST" && pathParts.length === 0) {
    // Create product
    const body = await req.json();
    const { data, error } = await supabase
      .from("products")
      .insert(body)
      .select()
      .single();

    if (error) return errorResponse("CREATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  if (method === "PUT" && pathParts.length === 1) {
    // Update product
    const body = await req.json();
    const { data, error } = await supabase
      .from("products")
      .update(body)
      .eq("id", pathParts[0])
      .select()
      .single();

    if (error) return errorResponse("UPDATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  if (method === "DELETE" && pathParts.length === 1) {
    // Delete product
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", pathParts[0]);

    if (error) return errorResponse("DELETE_ERROR", error.message, 400);

    return successResponse({ message: "Product deleted successfully" });
  }

  return errorResponse("NOT_FOUND", "Endpoint not found", 404);
}

// Categories endpoints
async function handleCategories(req: Request, pathParts: string[], method: string) {
  const url = new URL(req.url);

  if (method === "GET" && pathParts.length === 0) {
    // List categories
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const { data, error, count } = await supabase
      .from("categories")
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1);

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);

    return successResponse(data, { limit, offset, total: count || 0 });
  }

  if (method === "GET" && pathParts.length === 1) {
    // Get single category
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("id", pathParts[0])
      .maybeSingle();

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);
    if (!data) return errorResponse("NOT_FOUND", "Category not found", 404);

    return successResponse(data);
  }

  if (method === "POST" && pathParts.length === 0) {
    // Create category
    const body = await req.json();
    const { data, error } = await supabase
      .from("categories")
      .insert(body)
      .select()
      .single();

    if (error) return errorResponse("CREATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  if (method === "PUT" && pathParts.length === 1) {
    // Update category
    const body = await req.json();
    const { data, error } = await supabase
      .from("categories")
      .update(body)
      .eq("id", pathParts[0])
      .select()
      .single();

    if (error) return errorResponse("UPDATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  if (method === "DELETE" && pathParts.length === 1) {
    // Delete category
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", pathParts[0]);

    if (error) return errorResponse("DELETE_ERROR", error.message, 400);

    return successResponse({ message: "Category deleted successfully" });
  }

  return errorResponse("NOT_FOUND", "Endpoint not found", 404);
}

// Orders endpoints
async function handleOrders(req: Request, pathParts: string[], method: string) {
  const url = new URL(req.url);

  if (method === "GET" && pathParts.length === 0) {
    // List orders
    const status = url.searchParams.get("status");
    const orderType = url.searchParams.get("order_type");
    const dateFrom = url.searchParams.get("date_from");
    const dateTo = url.searchParams.get("date_to");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = supabase
      .from("orders")
      .select("*, order_items(*)", { count: "exact" })
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (orderType) query = query.eq("order_type", orderType);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data, error, count } = await query;

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);

    return successResponse(data, { limit, offset, total: count || 0 });
  }

  if (method === "GET" && pathParts.length === 1) {
    // Get single order
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", pathParts[0])
      .maybeSingle();

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);
    if (!data) return errorResponse("NOT_FOUND", "Order not found", 404);

    return successResponse(data);
  }

  if (method === "POST" && pathParts.length === 0) {
    // Create order
    const body = await req.json();
    const { items, ...orderData } = body;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) return errorResponse("CREATE_ERROR", orderError.message, 400);

    // Create order items
    const orderItems = items.map((item: { product_id: string; quantity: number; price: number }) => ({
      order_id: order.id,
      ...item
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) return errorResponse("CREATE_ERROR", itemsError.message, 400);

    return successResponse(order);
  }

  if (method === "PATCH" && pathParts.length === 2 && pathParts[1] === "status") {
    // Update order status
    const body = await req.json();
    const { data, error } = await supabase
      .from("orders")
      .update({ status: body.status })
      .eq("id", pathParts[0])
      .select()
      .single();

    if (error) return errorResponse("UPDATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  return errorResponse("NOT_FOUND", "Endpoint not found", 404);
}

// Customers endpoints
async function handleCustomers(req: Request, pathParts: string[], method: string) {
  const url = new URL(req.url);

  if (method === "GET" && pathParts.length === 0) {
    // List customers
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const { data, error, count } = await supabase
      .from("customers")
      .select("*", { count: "exact" })
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);

    return successResponse(data, { limit, offset, total: count || 0 });
  }

  if (method === "GET" && pathParts.length === 1) {
    // Get single customer
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", pathParts[0])
      .maybeSingle();

    if (error) return errorResponse("QUERY_ERROR", error.message, 500);
    if (!data) return errorResponse("NOT_FOUND", "Customer not found", 404);

    return successResponse(data);
  }

  if (method === "POST" && pathParts.length === 0) {
    // Create customer
    const body = await req.json();
    const { data, error } = await supabase
      .from("customers")
      .insert(body)
      .select()
      .single();

    if (error) return errorResponse("CREATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  if (method === "PUT" && pathParts.length === 1) {
    // Update customer
    const body = await req.json();
    const { data, error } = await supabase
      .from("customers")
      .update(body)
      .eq("id", pathParts[0])
      .select()
      .single();

    if (error) return errorResponse("UPDATE_ERROR", error.message, 400);

    return successResponse(data);
  }

  return errorResponse("NOT_FOUND", "Endpoint not found", 404);
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get API key from header
    const apiKey = req.headers.get("X-API-Key");
    if (!apiKey) {
      return errorResponse("UNAUTHORIZED", "API key required", 401);
    }

    // Validate API key
    const { isValid, apiKeyId, error: authError } = await validateApiKey(apiKey);
    if (!isValid) {
      return errorResponse("UNAUTHORIZED", authError || "Invalid API key", 401);
    }

    // Parse URL
    const url = new URL(req.url);
    const pathParts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    // Remove 'api' from path if present
    if (pathParts[0] === "api") pathParts.shift();

    const resource = pathParts[0];
    const resourcePath = pathParts.slice(1);
    const method = req.method;

    let response: Response;

    // Route to appropriate handler
    switch (resource) {
      case "products":
        response = await handleProducts(req, resourcePath, method);
        break;
      case "categories":
        response = await handleCategories(req, resourcePath, method);
        break;
      case "orders":
        response = await handleOrders(req, resourcePath, method);
        break;
      case "customers":
        response = await handleCustomers(req, resourcePath, method);
        break;
      default:
        response = errorResponse("NOT_FOUND", "Resource not found", 404);
    }

    // Log request
    const responseTime = Date.now() - startTime;
    const ipAddress = req.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    await logRequest(
      apiKeyId!,
      url.pathname,
      method,
      response.status,
      ipAddress,
      userAgent,
      responseTime
    );

    return response;
  } catch (error) {
    console.error("API error:", error);
    return errorResponse("INTERNAL_ERROR", "Internal server error", 500);
  }
});
