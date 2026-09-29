import { supabase } from './supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kioskpos-api`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${FUNCTION_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    const errMsg = data?.error?.message || `Request failed (${response.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}

export interface KioskGatewayStats {
  totalOrders: number;
  todayOrders: number;
  todaySales: number;
  pendingOrders: number;
  failedOrders: number;
  syncedProducts: number;
  activeKiosks: number;
}

export interface KioskRecord {
  id: string;
  name: string;
  kiosk_code: string;
  location_id: number | null;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  api_key?: string;
}

export interface KioskOrder {
  id: string;
  order_number: string;
  kiosk_id: string | null;
  ultimatepos_sale_id: string | null;
  ultimatepos_invoice_number: string | null;
  location_id: number | null;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  order_status: string;
  sync_status: string;
  error_message: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCache {
  id: string;
  ultimatepos_product_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  selling_price: number;
  image_url: string | null;
  stock_quantity: number;
  location_id: number | null;
  is_active: boolean;
  synced_at: string;
}

export interface SyncJob {
  id: string;
  job_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
}

export interface ApiLog {
  id: string;
  kiosk_id: string | null;
  request_id: string;
  method: string;
  endpoint: string;
  status_code: number | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface GatewaySettings {
  id: string;
  ultimatepos_url: string | null;
  ultimatepos_location_id: number;
  mock_mode: boolean;
  sync_interval_minutes: number;
  rate_limit_per_minute: number;
  allowed_origins: string | null;
  currency: string;
  timezone: string;
}

export const kioskposApi = {
  // Admin: Kiosks
  async createKiosk(data: { name: string; kiosk_code: string; location_id?: number }): Promise<KioskRecord & { api_key: string }> {
    return apiCall('/admin/kiosks', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateKiosk(id: string, data: { name?: string; location_id?: number; status?: string }): Promise<KioskRecord> {
    return apiCall(`/admin/kiosks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async regenerateApiKey(id: string): Promise<KioskRecord & { api_key: string }> {
    return apiCall(`/admin/kiosks/${id}/regenerate-key`, { method: 'POST' });
  },

  // Admin: Settings
  async getSettings(): Promise<GatewaySettings> {
    return apiCall('/admin/settings');
  },

  async updateSettings(data: Partial<GatewaySettings>): Promise<GatewaySettings> {
    return apiCall('/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
  },

  // Admin: Retry order
  async retryOrder(orderId: string): Promise<unknown> {
    return apiCall(`/admin/orders/${orderId}/retry`, { method: 'POST' });
  },
};
