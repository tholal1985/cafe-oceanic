import { supabase } from './supabase';

export async function pushOrderToUltimatePOS(orderId: string): Promise<void> {
  try {
    const { data: config } = await supabase
      .from('ultimatepos_config')
      .select('is_enabled, auto_push_orders')
      .single();

    if (!config?.is_enabled || !config?.auto_push_orders) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token || supabaseKey;

    const fnUrl = `${supabaseUrl}/functions/v1/ultimatepos-proxy?action=push_order`;
    await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({ orderId }),
    });
  } catch {
    // Fire-and-forget: never block the order flow
  }
}
