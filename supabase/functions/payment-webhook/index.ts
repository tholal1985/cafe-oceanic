import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Signature",
};

async function verifyBMLSignature(
  amount: number,
  currency: string,
  apiKey: string,
  receivedSignature: string,
  signMethod: string = 'sha256'
): Promise<boolean> {
  try {
    const signatureString = `amount=${amount}&currency=${currency}&${apiKey}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);

    if (signMethod.toLowerCase() === 'md5' || signMethod.toLowerCase() === 'sha1') {
      console.warn(`Weak signature method ${signMethod} is not supported. Use SHA-256 or stronger.`);
      return false;
    }

    const algorithm = signMethod.toUpperCase() === 'SHA256' ? 'SHA-256' : 'SHA-256';
    const hashBuffer = await crypto.subtle.digest(algorithm, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedSignature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const cleanReceived = receivedSignature.toLowerCase().replace(/[^a-f0-9]/g, '');

    const isValid = cleanReceived === computedSignature;

    if (!isValid) {
      console.error("Signature mismatch:", {
        expected: computedSignature.substring(0, 10) + '...',
        received: cleanReceived.substring(0, 10) + '...',
      });
    }

    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
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

    const url = new URL(req.url);
    const gatewayType = url.searchParams.get("gateway") || "bml";

    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("gateway_type", gatewayType)
      .eq("is_active", true)
      .maybeSingle();

    if (!gateway) {
      return new Response(
        JSON.stringify({ error: "Gateway not found or inactive" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload = await req.json();
    const signature = req.headers.get("X-Signature") || req.headers.get("X-BML-Signature") || payload.signature || "";
    const requestHeaders = Object.fromEntries(req.headers.entries());

    const eventType = payload.event || payload.eventType || payload.type || "payment.update";
    const eventId = payload.eventId || payload.id || crypto.randomUUID();

    const { data: webhook } = await supabase
      .from("payment_webhooks")
      .insert({
        gateway_id: gateway.id,
        event_type: eventType,
        event_id: eventId,
        payload: payload,
        headers: requestHeaders,
        signature: signature,
        is_verified: false,
        is_processed: false
      })
      .select()
      .maybeSingle();

    if (!webhook) {
      return new Response(
        JSON.stringify({ error: "Failed to log webhook" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const processingResult = await processWebhook(gateway, payload, signature, supabase);

    await supabase
      .from("payment_webhooks")
      .update({
        is_verified: processingResult.isVerified,
        is_processed: processingResult.success,
        processed_at: processingResult.success ? new Date().toISOString() : null,
        processing_error: processingResult.error || null,
        transaction_id: processingResult.transactionId || null
      })
      .eq("id", webhook.id);

    if (!processingResult.success) {
      return new Response(
        JSON.stringify({
          received: true,
          processed: false,
          error: processingResult.error
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        received: true,
        processed: true,
        verified: processingResult.isVerified,
        eventId: eventId
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({
        received: true,
        processed: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processWebhook(gateway: any, payload: any, signature: string, supabase: any) {
  try {
    if (gateway.gateway_type === "bml") {
      return await processBMLWebhook(gateway, payload, signature, supabase);
    }

    return {
      success: false,
      isVerified: false,
      error: `Unsupported gateway type: ${gateway.gateway_type}`
    };

  } catch (error) {
    console.error("Webhook processing error:", error);
    return {
      success: false,
      isVerified: false,
      error: error instanceof Error ? error.message : "Processing failed"
    };
  }
}

async function processBMLWebhook(gateway: any, payload: any, signature: string, supabase: any) {
  try {
    if (!payload || typeof payload !== "object") {
      return {
        success: false,
        isVerified: false,
        error: "Invalid payload format"
      };
    }

    const localId = payload.localId || payload.local_id || payload.reference;
    const status = payload.state || payload.status;
    const transactionReference = payload.transactionId || payload._id || payload.id;
    const amount = payload.amount;
    const currency = payload.currency;

    if (!localId || typeof localId !== "string") {
      return {
        success: false,
        isVerified: false,
        error: "Missing or invalid local transaction ID in webhook"
      };
    }

    if (localId.length > 100) {
      return {
        success: false,
        isVerified: false,
        error: "Invalid transaction ID format"
      };
    }

    const { data: transaction } = await supabase
      .from("payment_transactions")
      .select("id, status, amount, currency, order_id, gateway_response, completed_at")
      .eq("local_transaction_id", localId)
      .maybeSingle();

    if (!transaction) {
      console.error("Transaction not found for localId:", localId);
      return {
        success: false,
        isVerified: false,
        error: "Transaction not found"
      };
    }

    let isVerified = false;
    if (signature && amount && currency) {
      const config = gateway.config;
      const apiKey = config.api_key || gateway.secret_key;
      const signMethod = payload.signMethod || gateway.sign_method || config.sign_method || 'sha1';

      if (apiKey) {
        isVerified = await verifyBMLSignature(amount, currency, apiKey, signature, signMethod);

        if (!isVerified) {
          console.warn("BML webhook signature verification failed:", {
            localId,
            receivedSignature: signature
          });
        }
      }
    }

    if (transaction.status === "completed") {
      console.log("Transaction already completed:", localId);
      return {
        success: true,
        isVerified,
        transactionId: transaction.id
      };
    }

    const transactionAge = transaction.completed_at
      ? Date.now() - new Date(transaction.completed_at).getTime()
      : 0;

    if (transaction.status === "completed" && transactionAge > 300000) {
      console.warn("Duplicate webhook for old transaction:", localId);
      return {
        success: true,
        isVerified,
        transactionId: transaction.id
      };
    }

    let newStatus = transaction.status;
    let errorMessage = null;
    let errorCode = null;

    const normalizedStatus = (status || "").toUpperCase();

    if (normalizedStatus === "APPROVED" || normalizedStatus === "SUCCESS" || normalizedStatus === "COMPLETED" || normalizedStatus === "CONFIRMED" || normalizedStatus === "PAID") {
      newStatus = "completed";

      if (transaction.order_id) {
        await supabase
          .from("orders")
          .update({
            payment_status: "completed",
            status: "confirmed"
          })
          .eq("id", transaction.order_id);
      }
    } else if (normalizedStatus === "PENDING" || normalizedStatus === "PROCESSING" || normalizedStatus === "INITIATED" || normalizedStatus === "QR_CODE_GENERATED") {
      newStatus = "processing";
    } else if (normalizedStatus === "FAILED" || normalizedStatus === "DECLINED" || normalizedStatus === "REJECTED") {
      newStatus = "failed";
      errorMessage = payload.error_message || payload.errorMessage || payload.error || "Payment declined";
      errorCode = payload.error_code || payload.errorCode || payload.code || "PAYMENT_FAILED";
    } else if (normalizedStatus === "CANCELLED" || normalizedStatus === "CANCELED") {
      newStatus = "cancelled";
    } else if (normalizedStatus === "REFUNDED" || normalizedStatus === "REFUND_REQUESTED") {
      newStatus = "refunded";
    }

    const updateData: any = {
      status: newStatus,
      gateway_response: {
        ...transaction.gateway_response,
        webhook: payload,
        webhook_verified: isVerified,
        updated_at: new Date().toISOString()
      }
    };

    if (transactionReference && !transaction.transaction_reference) {
      updateData.transaction_reference = transactionReference;
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (errorCode) {
      updateData.error_code = errorCode;
    }

    if (newStatus === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    await supabase
      .from("payment_transactions")
      .update(updateData)
      .eq("id", transaction.id);

    console.log("Payment webhook processed successfully:", {
      localId,
      transactionId: transaction.id,
      status: newStatus,
      verified: isVerified
    });

    return {
      success: true,
      isVerified,
      transactionId: transaction.id
    };

  } catch (error) {
    console.error("BML webhook processing error:", error);
    return {
      success: false,
      isVerified: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
