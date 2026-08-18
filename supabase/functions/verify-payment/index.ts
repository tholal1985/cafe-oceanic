import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyRequest {
  transactionId: string;
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let body: VerifyRequest;
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

    const { transactionId } = body;

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

    const { data: transaction, error: txnError } = await supabase
      .from("payment_transactions")
      .select("id, status, amount, currency, transaction_reference, order_id, gateway_id, gateway_response, expires_at, completed_at, payment_gateways(id, name, gateway_type, is_active, config, api_url)")
      .eq("id", transactionId)
      .maybeSingle();

    if (txnError || !transaction) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Transaction not found"
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (transaction.expires_at && new Date(transaction.expires_at) < new Date() && transaction.status === "pending") {
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

    if (transaction.status === "completed") {
      return new Response(
        JSON.stringify({
          success: true,
          transaction: {
            id: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency
          }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const gateway = transaction.payment_gateways;

    if (!gateway || !gateway.is_active) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway not available"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (gateway.gateway_type === "bml") {
      return await verifyBMLPayment(transaction, gateway, supabase);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: `Verification not supported for gateway: ${gateway.gateway_type}`
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Payment verification error:", error);
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

async function verifyBMLPayment(transaction: any, gateway: any, supabase: any) {
  try {
    const config = gateway.config;

    if (!config.api_key || !transaction.transaction_reference) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Cannot verify payment - missing configuration or transaction reference"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiUrl = gateway.api_url || config.api_url || "https://api.uat.merchants.bankofmaldives.com.mv/public";
    const verifyEndpoint = `${apiUrl}/transactions/${transaction.transaction_reference}`;

    console.log("Verifying BML payment:", {
      transactionReference: transaction.transaction_reference,
      endpoint: verifyEndpoint
    });

    const bmlResponse = await fetch(verifyEndpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": config.api_key,
      },
    });

    if (!bmlResponse.ok) {
      const errorText = await bmlResponse.text();
      console.error("BML verification error:", {
        status: bmlResponse.status,
        error: errorText
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment verification failed",
          details: errorText
        }),
        {
          status: bmlResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const bmlData = await bmlResponse.json();
    console.log("BML verification response:", bmlData);

    let newStatus = transaction.status;
    let errorMessage = null;
    let errorCode = null;

    const status = (bmlData.state || bmlData.status || "").toUpperCase();

    if (status === "APPROVED" || status === "SUCCESS" || status === "COMPLETED" || status === "CONFIRMED" || status === "PAID") {
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
    } else if (status === "PENDING" || status === "PROCESSING" || status === "INITIATED" || status === "QR_CODE_GENERATED") {
      newStatus = "processing";
    } else if (status === "FAILED" || status === "DECLINED" || status === "REJECTED") {
      newStatus = "failed";
      errorMessage = bmlData.error_message || bmlData.errorMessage || bmlData.error || "Payment declined";
      errorCode = bmlData.error_code || bmlData.errorCode || bmlData.code || "PAYMENT_FAILED";
    } else if (status === "CANCELLED" || status === "CANCELED") {
      newStatus = "cancelled";
    } else if (status === "REFUNDED" || status === "REFUND_REQUESTED") {
      newStatus = "refunded";
    }

    const updateData: any = {
      status: newStatus,
      gateway_response: {
        ...transaction.gateway_response,
        verification: bmlData,
        verified_at: new Date().toISOString()
      }
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    if (errorCode) {
      updateData.error_code = errorCode;
    }

    if (newStatus === "completed" && !transaction.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updatedTransaction } = await supabase
      .from("payment_transactions")
      .update(updateData)
      .eq("id", transaction.id)
      .select()
      .maybeSingle();

    return new Response(
      JSON.stringify({
        success: true,
        transaction: {
          id: updatedTransaction.id,
          status: updatedTransaction.status,
          amount: updatedTransaction.amount,
          currency: updatedTransaction.currency,
          transaction_reference: updatedTransaction.transaction_reference,
          error_message: updatedTransaction.error_message
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("BML payment verification error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to verify payment with BML gateway"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
