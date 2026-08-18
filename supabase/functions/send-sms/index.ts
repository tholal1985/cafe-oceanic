import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SMSRequest {
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

    const { phoneNumber, message, orderId, messageType = 'order_confirmation' }: SMSRequest = await req.json();

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
      .eq("service_name", "sms")
      .eq("is_enabled", true)
      .maybeSingle();

    if (!config) {
      return new Response(
        JSON.stringify({ error: "SMS is not configured or disabled" }),
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
      const ooredooApiUrl = config.config_data?.api_url || 'https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2';
      const bearerToken = config.config_data?.bearer_token || '';
      const username = config.sender_id || '';
      const accessKey = config.api_secret || '';

      const formData = new FormData();
      formData.append('username', username);
      formData.append('access_key', accessKey);
      formData.append('message', message);
      formData.append('batch', formattedPhone);

      const response = await fetch(ooredooApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: formData,
      });

      const responseText = await response.text();
      let responseData;

      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { response: responseText };
      }

      if (response.ok) {
        if (
          responseData.status === 'success' ||
          responseData.success === true ||
          responseText.includes('success') ||
          responseText.includes('sent') ||
          response.status === 200
        ) {
          externalMessageId = responseData.message_id || responseData.id || `SMS_${Date.now()}`;
          status = 'sent';
        } else {
          status = 'failed';
          errorMessage = responseData.message || responseData.error || responseText || 'Failed to send SMS';
        }
      } else {
        status = 'failed';
        errorMessage = responseData.message || responseData.error || `HTTP ${response.status}: ${responseText}`;
      }

      result = { response: responseData, status: response.status };
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    }

    await supabase.from("message_logs").insert({
      order_id: orderId || null,
      phone_number: phoneNumber,
      service: 'sms',
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
    console.error("Error sending SMS:", error);
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
