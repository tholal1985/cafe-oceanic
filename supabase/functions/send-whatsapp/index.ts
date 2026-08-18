import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface WhatsAppRequest {
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

    const { phoneNumber, message, orderId, messageType = 'order_confirmation' }: WhatsAppRequest = await req.json();

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
      .eq("service_name", "whatsapp")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "WhatsApp is not configured or disabled" }),
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
      const whatsappApiUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.api_key}/Messages.json`;

      const body = new URLSearchParams({
        From: `whatsapp:${config.sender_id}`,
        To: `whatsapp:${formattedPhone}`,
        Body: message,
      });

      const twilioAuth = btoa(`${config.api_key}:${config.api_secret}`);

      const response = await fetch(whatsappApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${twilioAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      result = await response.json();

      if (response.ok) {
        externalMessageId = result.sid;
        status = 'sent';
      } else {
        status = 'failed';
        errorMessage = result.message || 'Failed to send WhatsApp message';
      }
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    }

    await supabase.from("message_logs").insert({
      order_id: orderId || null,
      phone_number: phoneNumber,
      service: 'whatsapp',
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
    console.error("Error sending WhatsApp:", error);
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
