import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PaymentRequest {
  transactionId: string;
  gatewayType: string;
}

interface PayPalConfig {
  environment?: string;
  currency?: string;
}

interface SkrillConfig {
  currency?: string;
  recipient_description?: string;
  return_url_text?: string;
}

const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5;
const RATE_LIMIT_WINDOW = 60000;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(identifier);

  if (!record || now > record.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// BML QPOS EMVCo QR format:
//   Tag 26 – Merchant Account Information
//     Sub-tag 00 – GUI: BML's registered app identifier "com.bml.mib"
//     Sub-tag 01 – Merchant account number (the value BML app resolves to show the payee)
// Without sub-tag 01 the BML app shows "account number missing".
function generateEMVCoQR(
  merchantId: string,
  accountNumber: string,
  amount: string,
  currency: string,
  transactionId: string,
): string {
  const currencyMap: Record<string, string> = {
    'MVR': '462',
    'USD': '840',
    'EUR': '978',
    'GBP': '826',
    'INR': '356',
    'AED': '784',
    'SAR': '682',
    'JPY': '392',
    'CNY': '156',
    'AUD': '036',
    'SGD': '702',
    'CHF': '756'
  };

  const currencyCode = currencyMap[currency.toUpperCase()] || '462';

  const tlv = (tag: string, value: string): string => {
    const length = value.length.toString().padStart(2, '0');
    return `${tag}${length}${value}`;
  };

  if (!accountNumber || accountNumber.length === 0) {
    accountNumber = merchantId || 'DEMO-ACCOUNT';
  }

  // Build Merchant Account Information (tag 26) with BML-specific sub-tags
  const gui = 'com.bml.mib';
  let merchantAccountInfo = '';
  merchantAccountInfo += tlv('00', gui);
  merchantAccountInfo += tlv('01', accountNumber.substring(0, 32));
  const merchantAccountBlock = tlv('26', merchantAccountInfo);

  let payload = '';
  payload += tlv('00', '01');         // Payload format indicator
  payload += tlv('01', '12');         // Point of initiation: dynamic
  payload += merchantAccountBlock;    // BML merchant account info
  payload += tlv('52', '5812');       // MCC: eating places / restaurants
  payload += tlv('53', currencyCode); // Transaction currency
  payload += tlv('54', amount);       // Transaction amount
  payload += tlv('58', 'MV');         // Country code
  payload += tlv('59', 'Restaurant'); // Merchant name (max 25 chars)
  payload += tlv('60', 'Male');       // Merchant city

  const additionalData = tlv('05', transactionId.substring(0, 25));
  payload += tlv('62', additionalData); // Additional data field template

  const crc = calculateCRC16(payload + '6304');
  payload += '63' + '04' + crc;

  return payload;
}

function calculateCRC16(data: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;

  for (let i = 0; i < data.length; i++) {
    const byte = data.charCodeAt(i);
    crc ^= (byte << 8);

    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: PaymentRequest;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON payload"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { transactionId, gatewayType } = body;

    if (!transactionId || typeof transactionId !== "string" || transactionId.length < 10) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid transaction ID"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!checkRateLimit(transactionId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Please try again later."
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: transaction, error: txnError } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();

    if (txnError || !transaction) {
      console.error("Transaction lookup error:", txnError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction not found",
          details: txnError?.message
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, total_price")
      .eq("id", transaction.order_id)
      .maybeSingle();

    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("id, name, gateway_type, is_active, config, api_url, client_id, client_secret, merchant_email, api_password, webhook_secret, use_sandbox, sandbox_client_id, sandbox_client_secret")
      .eq("id", transaction.gateway_id)
      .maybeSingle();

    if (!gateway) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway not found"
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!gateway.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway not configured or inactive"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const enrichedTransaction = {
      ...transaction,
      orders: order,
      payment_gateways: gateway
    };

    if (transaction.status !== "pending") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction already processed"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (transaction.expires_at && new Date(transaction.expires_at) < new Date()) {
      await supabase
        .from("payment_transactions")
        .update({ status: "expired" })
        .eq("id", transactionId);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction expired"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (transaction.amount <= 0 || transaction.amount > 100000) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid transaction amount"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (gateway.gateway_type === "paypal") {
      return await processPayPalPayment(enrichedTransaction, gateway, supabase);
    }

    if (gateway.gateway_type === "skrill") {
      return await processSkrillPayment(enrichedTransaction, gateway, supabase);
    }

    if (gateway.gateway_type === "bml") {
      return await processBMLQRPayment(enrichedTransaction, gateway, supabase);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Unsupported gateway type: ${gateway.gateway_type}`
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Payment initiation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processPayPalPayment(transaction: any, gateway: any, supabase: any) {
  try {
    const config = gateway.config as PayPalConfig;
    const useSandbox = gateway.use_sandbox || false;
    const currency = config.currency || transaction.currency || "USD";

    const clientId = useSandbox ? gateway.sandbox_client_id : gateway.client_id;
    const clientSecret = useSandbox ? gateway.sandbox_client_secret : gateway.client_secret;

    if (!clientId || !clientSecret) {
      const mode = useSandbox ? 'Sandbox' : 'Live';
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: `PayPal ${mode} credentials not configured. Please add ${mode} Client ID and Secret in payment gateway settings.`,
          error_code: "CONFIG_ERROR"
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: `PayPal ${mode} credentials not configured`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const baseUrl = useSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

    const auth = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`
      },
      body: "grant_type=client_credentials"
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error("PayPal token error:", errorData);

      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: `PayPal authentication failed: ${errorData.error_description || errorData.error || 'Invalid credentials'}`,
          error_code: errorData.error || "AUTH_ERROR",
          gateway_response: errorData
        })
        .eq("id", transaction.id);

      throw new Error(`Failed to authenticate with PayPal: ${errorData.error_description || errorData.error || 'Invalid credentials'}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: transaction.local_transaction_id,
        description: `Order #${transaction.orders?.order_number || transaction.id}`,
        amount: {
          currency_code: currency,
          value: parseFloat(transaction.amount).toFixed(2),
          breakdown: {
            item_total: {
              currency_code: currency,
              value: parseFloat(transaction.amount).toFixed(2)
            }
          }
        },
        items: [{
          name: `Order #${transaction.orders?.order_number || transaction.id}`,
          description: "Restaurant Order",
          quantity: "1",
          unit_amount: {
            currency_code: currency,
            value: parseFloat(transaction.amount).toFixed(2)
          },
          category: "DIGITAL_GOODS"
        }]
      }],
      application_context: {
        return_url: `${transaction.callback_url}?txn=${transaction.id}`,
        cancel_url: `${transaction.callback_url}?txn=${transaction.id}&status=cancelled`,
        brand_name: "Restaurant Kiosk",
        locale: "en-US",
        landing_page: "LOGIN",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW"
      }
    };

    await supabase
      .from("payment_transactions")
      .update({
        status: "processing",
        gateway_request: orderPayload
      })
      .eq("id", transaction.id);

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(orderPayload)
    });

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: orderData.message || "PayPal order creation failed",
          error_code: orderData.name || `HTTP_${orderResponse.status}`,
          gateway_response: orderData
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: orderData.message || "Payment initialization failed"
        }),
        {
          status: orderResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const approveLink = orderData.links?.find((link: any) => link.rel === "approve");
    const redirectUrl = approveLink?.href;

    if (!redirectUrl) {
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: "No approval URL received from PayPal",
          error_code: "NO_REDIRECT_URL",
          gateway_response: orderData
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway did not provide redirect URL"
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase
      .from("payment_transactions")
      .update({
        transaction_reference: orderData.id,
        redirect_url: redirectUrl,
        gateway_response: orderData,
        status: "processing"
      })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({
        success: true,
        transactionReference: orderData.id,
        redirectUrl,
        gatewayResponse: orderData
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("PayPal payment processing error:", error);

    await supabase
      .from("payment_transactions")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        error_code: "PROCESSING_ERROR"
      })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to process payment with PayPal gateway",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

async function processSkrillPayment(transaction: any, gateway: any, supabase: any) {
  try {
    const config = gateway.config as SkrillConfig;
    const merchantEmail = gateway.merchant_email;
    const apiPassword = gateway.api_password;
    const currency = config.currency || transaction.currency || "USD";

    if (!merchantEmail) {
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: "Skrill gateway not properly configured. Merchant Email is required.",
          error_code: "CONFIG_ERROR"
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway configuration error"
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentPayload: any = {
      pay_to_email: merchantEmail,
      amount: parseFloat(transaction.amount).toFixed(2),
      currency: currency,
      transaction_id: transaction.local_transaction_id,
      detail1_description: "Order Number",
      detail1_text: transaction.orders?.order_number || transaction.id,
      recipient_description: config.recipient_description || "Restaurant Kiosk",
      return_url: transaction.callback_url || `${Deno.env.get("SUPABASE_URL")}/payment-callback`,
      cancel_url: transaction.callback_url || `${Deno.env.get("SUPABASE_URL")}/payment-callback`,
      status_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
      return_url_text: config.return_url_text || "Return to Restaurant",
      language: "EN"
    };

    if (apiPassword) {
      const md5hash = await crypto.subtle.digest(
        "MD5",
        new TextEncoder().encode(apiPassword)
      );
      const hashArray = Array.from(new Uint8Array(md5hash));
      paymentPayload.api_password = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    await supabase
      .from("payment_transactions")
      .update({
        status: "processing",
        gateway_request: paymentPayload
      })
      .eq("id", transaction.id);

    const formBody = Object.keys(paymentPayload)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(paymentPayload[key]))
      .join('&');

    const skrillResponse = await fetch("https://pay.skrill.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody
    });

    const responseText = await skrillResponse.text();

    if (!skrillResponse.ok || !responseText) {
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: "Skrill payment initialization failed",
          error_code: `HTTP_${skrillResponse.status}`,
          gateway_response: { raw: responseText }
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment initialization failed"
        }),
        {
          status: skrillResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const sessionId = responseText.trim();
    const redirectUrl = `https://pay.skrill.com?sid=${sessionId}`;

    await supabase
      .from("payment_transactions")
      .update({
        transaction_reference: sessionId,
        redirect_url: redirectUrl,
        gateway_response: { session_id: sessionId },
        status: "processing"
      })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({
        success: true,
        transactionReference: sessionId,
        redirectUrl,
        gatewayResponse: { session_id: sessionId }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Skrill payment processing error:", error);

    await supabase
      .from("payment_transactions")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        error_code: "PROCESSING_ERROR"
      })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to process payment with Skrill gateway",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

async function generateDemoQRPayment(transaction: any, gateway: any, supabase: any, qrTimeout: number) {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + (qrTimeout * 1000));

  const config = gateway.config || {};
  const merchantId = config.merchant_id || gateway.app_id || 'DEMO-MERCHANT';
  const accountNumber = config.account_number || merchantId;

  const amount = parseFloat(transaction.amount).toFixed(2);
  const currency = (transaction.currency || 'MVR').toUpperCase();
  const transactionId = transaction.local_transaction_id;

  const qrCodeData = generateEMVCoQR(merchantId, accountNumber, amount, currency, transactionId);

  const qrPaymentData = {
    type: 'BML_QPOS_DEMO',
    transactionId: transaction.local_transaction_id,
    amount: parseFloat(transaction.amount),
    currency: currency,
    orderNumber: transaction.orders?.order_number || transaction.order_id,
    merchantName: 'Restaurant Kiosk',
    sessionToken: sessionToken,
    timestamp: new Date().toISOString()
  };

  await supabase
    .from("payment_transactions")
    .update({
      transaction_reference: sessionToken,
      qr_code_data: qrCodeData,
      qr_expires_at: expiresAt.toISOString(),
      payment_method: 'qr',
      status: "processing",
      gateway_response: { demo_mode: true, message: 'Demo QR code generated' },
      gateway_request: qrPaymentData
    })
    .eq("id", transaction.id);

  const { error: sessionError } = await supabase
    .from("qr_payment_sessions")
    .insert({
      transaction_id: transaction.id,
      gateway_id: gateway.id,
      qr_code_data: qrCodeData,
      qr_code_url: null,
      session_token: sessionToken,
      amount: parseFloat(transaction.amount),
      currency: transaction.currency || 'MVR',
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      metadata: {
        demo_mode: true,
        orderNumber: transaction.orders?.order_number
      }
    });

  if (sessionError) {
    console.error("Failed to create QR session:", sessionError);
  }

  return new Response(
    JSON.stringify({
      success: true,
      paymentMethod: 'qr',
      qrCodeData: qrCodeData,
      qrCodeUrl: null,
      sessionToken: sessionToken,
      expiresAt: expiresAt.toISOString(),
      expiresIn: qrTimeout,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency || 'MVR',
      message: "Demo QR code generated. This is a test payment - scan to simulate payment."
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function processBMLQRPayment(transaction: any, gateway: any, supabase: any) {
  try {
    const config = gateway.config || {};
    const accessKey = config.access_key || '';
    // BML Connect uses the appId (merchant_id UUID) as the app identifier
    const appId = config.merchant_id || '';
    const qrTimeout = gateway.qr_timeout || 300;

    // BML Connect production API base
    const environment = config.environment || 'production';
    const apiBase = environment === 'sandbox'
      ? 'https://api.uat.merchants.bankofmaldives.com.mv/public'
      : 'https://api.merchants.bankofmaldives.com.mv/public';

    if (!accessKey || !appId) {
      console.log("BML credentials not configured, using demo mode");
      return await generateDemoQRPayment(transaction, gateway, supabase, qrTimeout);
    }

    // Validate JWT has companyId — BML Connect rejects tokens with companyId: null
    try {
      const parts = accessKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (!payload.companyId) {
          console.error("BML access_key JWT has companyId: null — token is not linked to a company");
          await supabase
            .from("payment_transactions")
            .update({
              status: "failed",
              error_message: "BML access key is not linked to a company. Please generate a new API token from your BML merchant dashboard and update the gateway settings.",
              error_code: "BML_INVALID_TOKEN"
            })
            .eq("id", transaction.id);

          return new Response(
            JSON.stringify({
              success: false,
              error: "BML gateway configuration error: API token is not linked to a company account. Please update the access key in Payment Gateway settings."
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    } catch (jwtErr) {
      console.warn("Could not decode JWT for validation:", jwtErr);
    }

    // BML Connect transaction payload
    // localId must be unique per transaction — use the local_transaction_id
    const bmlPayload = {
      localId: transaction.local_transaction_id,
      amount: parseFloat(transaction.amount).toFixed(2),
      currency: transaction.currency || 'MVR',
      appId: appId,
      signMethod: 'sha1',
      appVersion: '1.0.0',
      apiVersion: '2.0',
    };

    console.log("Calling BML Connect API:", apiBase + '/transactions');

    let bmlResponse;
    try {
      bmlResponse = await fetch(`${apiBase}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessKey}`,
        },
        body: JSON.stringify(bmlPayload),
      });
    } catch (fetchError) {
      console.error("Failed to connect to BML Connect API:", fetchError);
      return await generateDemoQRPayment(transaction, gateway, supabase, qrTimeout);
    }

    const responseText = await bmlResponse.text();
    console.log("BML Connect response status:", bmlResponse.status);
    console.log("BML Connect response preview:", responseText.substring(0, 500));

    let bmlData: any;
    try {
      bmlData = JSON.parse(responseText);
    } catch (_) {
      console.error("BML Connect returned non-JSON response");
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: `BML Connect API error: ${responseText.substring(0, 200)}`,
          error_code: `HTTP_${bmlResponse.status}`,
          gateway_response: { raw: responseText.substring(0, 1000) }
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from BML Connect API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!bmlResponse.ok) {
      console.error("BML Connect transaction creation failed:", bmlData);
      const errMsg = bmlData.error || bmlData.message || bmlData.detail || "BML Connect request failed";
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          error_message: errMsg,
          error_code: bmlData.code || `HTTP_${bmlResponse.status}`,
          gateway_response: bmlData
        })
        .eq("id", transaction.id);

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: bmlResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // BML Connect returns: { id, qrCode (base64 PNG), localId, ... }
    const bmlTxnId = bmlData.id || bmlData._id || bmlData.transactionId;
    // qrCode is a base64-encoded PNG — display as data URI
    const qrBase64 = bmlData.qrCode || bmlData.qr_code || bmlData.qrcode || '';
    const qrCodeUrl = qrBase64 ? `data:image/png;base64,${qrBase64}` : null;
    // Also store raw base64 as qrCodeData for display fallback
    const qrCodeData = qrBase64;
    const expiresAt = new Date(Date.now() + (qrTimeout * 1000));

    await supabase
      .from("payment_transactions")
      .update({
        transaction_reference: bmlTxnId || transaction.local_transaction_id,
        qr_code_data: qrCodeData,
        qr_expires_at: expiresAt.toISOString(),
        payment_method: 'qr',
        status: "processing",
        gateway_response: { ...bmlData, qrCode: '[base64 omitted from log]' },
        gateway_request: bmlPayload
      })
      .eq("id", transaction.id);

    await supabase
      .from("qr_payment_sessions")
      .insert({
        transaction_id: transaction.id,
        gateway_id: gateway.id,
        qr_code_data: qrCodeData,
        qr_code_url: qrCodeUrl,
        session_token: bmlTxnId || transaction.local_transaction_id,
        amount: parseFloat(transaction.amount),
        currency: transaction.currency || 'MVR',
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        metadata: { orderNumber: transaction.orders?.order_number, bmlTransactionId: bmlTxnId }
      });

    return new Response(
      JSON.stringify({
        success: true,
        paymentMethod: 'qr',
        qrCodeData: qrCodeData,
        qrCodeUrl: qrCodeUrl,
        sessionToken: bmlTxnId || transaction.local_transaction_id,
        expiresAt: expiresAt.toISOString(),
        expiresIn: qrTimeout,
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        message: "QR code generated by BML Connect. Please scan with BML app to complete payment."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("BML QR payment error:", error);
    await supabase
      .from("payment_transactions")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        error_code: "QR_GENERATION_ERROR"
      })
      .eq("id", transaction.id);

    return new Response(
      JSON.stringify({ success: false, error: "Failed to generate BML QR payment", message: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
