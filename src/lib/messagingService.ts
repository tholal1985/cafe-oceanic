import { supabase } from './supabase';

interface TemplateVariables {
  customer_name?: string;
  customer_phone?: string;
  order_number?: string;
  order_total?: string;
  order_items?: string;
  order_status?: string;
  order_type?: string;
  table_number?: string;
  tracking_link?: string;
  business_name?: string;
  business_phone?: string;
  estimated_time?: string;
  current_time?: string;
  custom_message?: string;
}

async function getTemplate(templateType: string, channel: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('message_body')
    .eq('template_type', templateType)
    .eq('channel', channel)
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.message_body;
}

function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    rendered = rendered.replace(regex, value || '');
  });

  return rendered;
}

async function getBusinessInfo() {
  const { data } = await supabase
    .from('system_settings')
    .select('business_name, business_phone')
    .maybeSingle();

  return {
    business_name: data?.business_name || 'Restaurant',
    business_phone: data?.business_phone || '',
  };
}

export async function sendOrderConfirmation(
  phoneNumber: string,
  orderNumber: string,
  orderId: string,
  orderType: 'dine-in' | 'takeaway',
  total: number,
  customerName?: string
) {
  const businessInfo = await getBusinessInfo();
  const trackingLink = `${window.location.origin}/track/${orderId}`;

  const variables: TemplateVariables = {
    customer_name: customerName || 'Valued Customer',
    order_number: orderNumber,
    order_total: `$${total.toFixed(2)}`,
    order_type: orderType === 'dine-in' ? 'Dine In' : 'Takeaway',
    tracking_link: trackingLink,
    business_name: businessInfo.business_name,
    business_phone: businessInfo.business_phone,
    current_time: new Date().toLocaleString(),
  };

  const fallbackMessage = `🎉 Order Confirmed!\n\nOrder #${orderNumber}\nType: ${variables.order_type}\nTotal: ${variables.order_total}\n\nThank you for your order! We'll notify you when it's ready.`;

  const results = await Promise.allSettled([
    (async () => {
      const template = await getTemplate('order_confirmation', 'whatsapp');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendWhatsApp(phoneNumber, message, orderId, 'order_confirmation');
    })(),
    (async () => {
      const template = await getTemplate('order_confirmation', 'viber');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendViber(phoneNumber, message, orderId, 'order_confirmation');
    })(),
    (async () => {
      const template = await getTemplate('order_confirmation', 'sms');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendSMS(phoneNumber, message, orderId, 'order_confirmation');
    })(),
  ]);

  return results;
}

export async function sendOrderReadyNotification(
  phoneNumber: string,
  orderNumber: string,
  orderId: string,
  orderType: 'dine-in' | 'takeaway',
  customerName?: string
) {
  const businessInfo = await getBusinessInfo();
  const customMessage = orderType === 'takeaway'
    ? 'Please come to the counter to collect your order.'
    : 'Your food will be served shortly. Enjoy your meal!';

  const variables: TemplateVariables = {
    customer_name: customerName || 'Valued Customer',
    order_number: orderNumber,
    order_type: orderType === 'dine-in' ? 'Dine In' : 'Takeaway',
    custom_message: customMessage,
    business_name: businessInfo.business_name,
    current_time: new Date().toLocaleString(),
  };

  const fallbackMessage = orderType === 'takeaway'
    ? `✅ Your order #${orderNumber} is ready for pickup!\n\n${customMessage}\n\nThank you!`
    : `✅ Your order #${orderNumber} is ready!\n\n${customMessage}`;

  const results = await Promise.allSettled([
    (async () => {
      const template = await getTemplate('order_ready', 'whatsapp');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendWhatsApp(phoneNumber, message, orderId, 'ready_notification');
    })(),
    (async () => {
      const template = await getTemplate('order_ready', 'viber');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendViber(phoneNumber, message, orderId, 'ready_notification');
    })(),
    (async () => {
      const template = await getTemplate('order_ready', 'sms');
      const message = template ? renderTemplate(template, variables) : fallbackMessage;
      return sendSMS(phoneNumber, message, orderId, 'ready_notification');
    })(),
  ]);

  return results;
}

export async function sendOrderStatusUpdate(
  phoneNumber: string,
  orderNumber: string,
  orderId: string,
  status: string
) {
  const statusMessages: Record<string, string> = {
    preparing: `👨‍🍳 Your order #${orderNumber} is being prepared!\n\nOur chefs are working on it.`,
    ready: `✅ Your order #${orderNumber} is ready!\n\nPlease come to collect it.`,
    completed: `🎉 Order #${orderNumber} completed!\n\nThank you for dining with us!`,
  };

  const message = statusMessages[status] || `Order #${orderNumber} status: ${status}`;

  const results = await Promise.allSettled([
    sendWhatsApp(phoneNumber, message, orderId, 'status_update'),
    sendViber(phoneNumber, message, orderId, 'status_update'),
    sendSMS(phoneNumber, message, orderId, 'status_update'),
  ]);

  return results;
}

async function sendWhatsApp(
  phoneNumber: string,
  message: string,
  orderId?: string,
  messageType: string = 'order_confirmation'
) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        message,
        orderId,
        messageType,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp send failed:', result);
      throw new Error(result.error || 'Failed to send WhatsApp message');
    }

    return result;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    throw error;
  }
}

async function sendViber(
  phoneNumber: string,
  message: string,
  orderId?: string,
  messageType: string = 'order_confirmation'
) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-viber`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        message,
        orderId,
        messageType,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Viber send failed:', result);
      throw new Error(result.error || 'Failed to send Viber message');
    }

    return result;
  } catch (error) {
    console.error('Error sending Viber:', error);
    throw error;
  }
}

async function sendSMS(
  phoneNumber: string,
  message: string,
  orderId?: string,
  messageType: string = 'order_confirmation'
) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber,
        message,
        orderId,
        messageType,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('SMS send failed:', result);
      throw new Error(result.error || 'Failed to send SMS');
    }

    return result;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}
