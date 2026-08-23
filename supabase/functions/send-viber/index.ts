import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ViberRequest {
  phoneNumber: string;
  message: string;
  orderId?: string;
  messageType?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { phoneNumber, message, orderId, messageType = 'order_confirmation' }: ViberRequest = await req.json();

    if (!phoneNumber || !message) {
      return new Response(
        JSON.stringify({ error: "Phone number and message are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: config } = await supabase
      .from("messaging_config")
      .select("*")
      .eq("service_name", "viber")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "Viber is not configured or disabled" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formattedPhone = phoneNumber.replace(/\D/g, '');

    let result;
    let externalMessageId = null;
    let status = 'sent';
    let errorMessage = null;

    try {
      const viberApiUrl = 'https://chatapi.viber.com/pa/send_message';

      const payload = {
        auth_token: config.api_key,
        receiver: formattedPhone,
        type: 'text',
        text: message,
        sender: {
          name: config.sender_id || 'Restaurant',
        },
      };

      const response = await fetch(viberApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      result = await response.json();

      if (response.ok && result.status === 0) {
        externalMessageId = result.message_token || result.msg_id;
        status = 'sent';
      } else {
        status = 'failed';
        errorMessage = result.status_message || 'Failed to send Viber message';
      }
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    }

    await supabase.from("message_logs").insert({
      order_id: orderId || null,
      phone_number: phoneNumber,
      service: 'viber',
      message_type: messageType,
      message_content: message,
      status: status,
      error_message: errorMessage,
      external_message_id: externalMessageId,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    });

    if (status === 'failed') {
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: result
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: externalMessageId,
        status: 'sent'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending Viber:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
