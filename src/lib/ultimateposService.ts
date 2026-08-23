import { supabase } from './supabase';

const FUNCTION_NAME = 'ultimatepos-sync';

function getFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${supabaseUrl}/functions/v1/${FUNCTION_NAME}`;
}

async function callFunction(action: string, payload: Record<string, unknown> = {}) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };

  const response = await fetch(getFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }
  return data;
}

export async function testConnection(): Promise<{ message: string }> {
  return callFunction('test-connection');
}

export async function pushOrderToUltimatePos(orderId: string): Promise<{ saleId?: number; message: string }> {
  return callFunction('push-order', { orderId });
}

export async function syncProductsFromUltimatePos(): Promise<{ matched: number; updated: number; total: number; message: string }> {
  return callFunction('sync-products');
}

export async function fetchUltimatePosProducts(): Promise<{ products: any[] }> {
  return callFunction('fetch-products');
}

export interface UltimatePosConfig {
  id: string;
  base_url: string;
  client_id: string;
  client_secret: string;
  api_token: string;
  api_username: string;
  api_password: string;
  auth_method: 'oauth' | 'token' | 'password';
  business_id: number | null;
  location_id: number | null;
  is_enabled: boolean;
  auto_push_orders: boolean;
  auto_sync_products: boolean;
  last_product_sync_at: string | null;
  last_connected_at: string | null;
  connection_status: string;
}

export async function getConfig(): Promise<UltimatePosConfig | null> {
  const { data, error } = await supabase
    .from('ultimatepos_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UltimatePosConfig | null;
}

export async function updateConfig(updates: Partial<UltimatePosConfig>): Promise<void> {
  const { data: existing } = await supabase
    .from('ultimatepos_config')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('ultimatepos_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('ultimatepos_config')
      .insert({ ...updates });
    if (error) throw new Error(error.message);
  }
}

export async function getOrderLogs(limit = 20): Promise<any[]> {
  const { data, error } = await supabase
    .from('ultimatepos_order_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSyncLogs(limit = 20): Promise<any[]> {
  const { data, error } = await supabase
    .from('ultimatepos_sync_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
