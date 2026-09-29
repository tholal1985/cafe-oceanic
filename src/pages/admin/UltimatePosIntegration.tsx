import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Link2, Link2Off, AlertCircle,
  Package, Users, ShoppingCart, Settings, Zap, ArrowRight,
  Activity, Server, Eye, EyeOff, Save, RotateCw, Loader2,
  Webhook, Copy, Check, Bell,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface UltimatePosConfig {
  id: string;
  api_url: string | null;
  client_id: string | null;
  client_secret: string | null;
  username: string | null;
  password: string | null;
  personal_access_token: string | null;
  auth_mode: 'oauth' | 'pat';
  business_id: number;
  location_id: number;
  is_active: boolean;
  auto_sync_products: boolean;
  auto_sync_customers: boolean;
  auto_push_sales: boolean;
  last_product_sync_at: string | null;
  last_customer_sync_at: string | null;
  last_sale_push_at: string | null;
  last_connected_at: string | null;
  connection_status: string;
  webhook_secret: string | null;
  webhook_enabled: boolean;
  sync_product_name: boolean;
  sync_product_price: boolean;
  sync_product_category: boolean;
  sync_product_quantity: boolean;
  sync_product_weight: boolean;
  sync_product_images: boolean;
  sync_product_description: boolean;
  sync_product_tax_class: boolean;
  sync_order_status_pending: string;
  sync_order_status_processing: string;
  sync_order_status_completed: string;
  sync_order_status_cancelled: string;
  sync_order_location_id: number | null;
  sync_order_order_type: string;
  last_webhook_at: string | null;
  last_webhook_event: string | null;
  direct_server_ip: string | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface SalePush {
  id: string;
  order_id: string;
  ultimatepos_sale_id: string | null;
  status: string;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  pushed_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

type ToastType = { type: 'success' | 'error' | 'info'; text: string } | null;

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-sync`;

export default function UltimatePosIntegration() {
  const [config, setConfig] = useState<UltimatePosConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [salePushes, setSalePushes] = useState<SalePush[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'webhooks' | 'product-sync' | 'order-sync' | 'logs' | 'queue'>('dashboard');
  const [showSecrets, setShowSecrets] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastType>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [debugging, setDebugging] = useState(false);

  // Config form state
  const [formData, setFormData] = useState({
    api_url: '',
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    personal_access_token: '',
    auth_mode: 'pat' as 'oauth' | 'pat',
    business_id: 1,
    location_id: 1,
    is_active: true,
    auto_sync_products: false,
    auto_sync_customers: false,
    auto_push_sales: true,
    webhook_secret: '',
    webhook_enabled: false,
    sync_product_name: true,
    sync_product_price: true,
    sync_product_category: false,
    sync_product_quantity: false,
    sync_product_weight: false,
    sync_product_images: true,
    sync_product_description: true,
    sync_product_tax_class: false,
    sync_order_status_pending: 'pending',
    sync_order_status_processing: 'confirmed',
    sync_order_status_completed: 'completed',
    sync_order_status_cancelled: 'cancelled',
    sync_order_location_id: null as number | null,
    sync_order_order_type: 'dine_in',
    direct_server_ip: '',
  });

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, logsRes, pushesRes, webhookRes] = await Promise.all([
        supabase.from('ultimatepos_config').select('*').maybeSingle(),
        supabase.from('ultimatepos_sync_logs').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('ultimatepos_sale_pushes').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('ultimatepos_webhook_events').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      const configData = configRes.data as UltimatePosConfig | null;
      setConfig(configData);
      setSyncLogs(logsRes.data || []);
      setSalePushes(pushesRes.data || []);
      setWebhookEvents(webhookRes.data || []);

      if (configData) {
        setFormData({
          api_url: configData.api_url || '',
          client_id: configData.client_id || '',
          client_secret: configData.client_secret || '',
          username: configData.username || '',
          password: configData.password || '',
          personal_access_token: configData.personal_access_token || '',
          auth_mode: configData.auth_mode,
          business_id: configData.business_id,
          location_id: configData.location_id,
          is_active: configData.is_active,
          auto_sync_products: configData.auto_sync_products,
          auto_sync_customers: configData.auto_sync_customers,
          auto_push_sales: configData.auto_push_sales,
          webhook_secret: configData.webhook_secret || '',
          webhook_enabled: configData.webhook_enabled,
          sync_product_name: configData.sync_product_name,
          sync_product_price: configData.sync_product_price,
          sync_product_category: configData.sync_product_category,
          sync_product_quantity: configData.sync_product_quantity,
          sync_product_weight: configData.sync_product_weight,
          sync_product_images: configData.sync_product_images,
          sync_product_description: configData.sync_product_description,
          sync_product_tax_class: configData.sync_product_tax_class,
          sync_order_status_pending: configData.sync_order_status_pending,
          sync_order_status_processing: configData.sync_order_status_processing,
          sync_order_status_completed: configData.sync_order_status_completed,
          sync_order_status_cancelled: configData.sync_order_status_cancelled,
          sync_order_location_id: configData.sync_order_location_id,
          sync_order_order_type: configData.sync_order_order_type,
          direct_server_ip: configData.direct_server_ip || '',
        });
      }
    } catch {
      showToast('error', 'Failed to load UltimatePOS configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const callEdgeFunction = async (action: string, method = 'POST', body?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${FUNCTION_URL}?action=${action}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await resp.json().catch(() => ({ error: 'Failed to parse response' }));
    if (!resp.ok) throw new Error(data.error || data.details || `Request failed (${resp.status})`);
    return data;
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      if (config) {
        const { error } = await (supabase.from('ultimatepos_config') as any).update(formData).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('ultimatepos_config') as any).insert(formData);
        if (error) throw error;
      }
      showToast('success', 'Configuration saved successfully');
      loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionError(null);
    try {
      const result = await callEdgeFunction('test-connection');
      showToast('success', `Connected to UltimatePOS via ${result.working_url || 'API'}`);
      setConnectionError(null);
      loadData();
    } catch (err: any) {
      const errorDetails = err.message || 'Connection test failed';
      setConnectionError(errorDetails);
      showToast('error', 'Connection test failed — see diagnostics below');
      loadData();
    } finally {
      setTesting(false);
    }
  };

  const handleDebug = async () => {
    setDebugging(true);
    setDebugInfo(null);
    try {
      const result = await callEdgeFunction('debug');
      setDebugInfo(result.debug || result);
      showToast('info', 'Diagnostics completed — see results below');
    } catch (err: any) {
      setConnectionError(err.message || 'Debug failed');
      showToast('error', 'Diagnostics failed');
    } finally {
      setDebugging(false);
    }
  };

  const handleSync = async (type: 'products' | 'customers') => {
    setSyncing(type);
    try {
      const result = await callEdgeFunction(`sync-${type}`);
      showToast('success', `Synced ${result.processed} ${type}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
      loadData();
    } catch (err: any) {
      showToast('error', err.message || `${type} sync failed`);
    } finally {
      setSyncing(null);
    }
  };

  const handlePushSales = async () => {
    setSyncing('sales');
    try {
      const result = await callEdgeFunction('push-sales');
      showToast('success', `Processed ${result.processed} sales: ${result.succeeded} succeeded, ${result.failed} failed, ${result.retried} retried`);
      loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Sale push failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleRetryPush = async (pushId: string) => {
    try {
      await callEdgeFunction('push-sale', 'POST', { push_id: pushId });
      showToast('success', 'Sale push retried');
      loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Retry failed');
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const generateWebhookSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = 'whsec_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    setFormData({ ...formData, webhook_secret: secret });
  };

  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-sync?action=webhook`;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'success': case 'connected': return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'failed': case 'error': return 'bg-rose-50 text-rose-700 ring-rose-200';
      case 'partial': case 'retrying': return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'pending': return 'bg-sky-50 text-sky-700 ring-sky-200';
      default: return 'bg-ink-50 text-ink-500 ring-ink-200';
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
          <p className="text-ink-500 text-xs tracking-[0.2em] uppercase">Loading UltimatePOS</p>
        </div>
      </div>
    );
  }

  const isConnected = config?.connection_status === 'connected';
  const pendingPushCount = salePushes.filter(p => p.status === 'pending' || p.status === 'retrying').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Integrations</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">UltimatePOS Integration</h1>
            <p className="mt-1 text-sm text-ink-500">
              Two-way sync between your kiosk and UltimatePOS. Products, customers, and orders stay in sync automatically.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${getStatusBg(config?.connection_status || 'disconnected')}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-ink-400'}`} />
            {isConnected ? 'Connected' : (config ? config.connection_status : 'Not configured')}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-2xl lg:grid-cols-4">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-ocean-600" />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Products Sync</p>
          </div>
          <p className="mt-1 font-display text-sm text-ink-700">{formatDate(config?.last_product_sync_at || null)}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-ocean-600" />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Customers Sync</p>
          </div>
          <p className="mt-1 font-display text-sm text-ink-700">{formatDate(config?.last_customer_sync_at || null)}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-ocean-600" />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Last Sale Push</p>
          </div>
          <p className="mt-1 font-display text-sm text-ink-700">{formatDate(config?.last_sale_push_at || null)}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-ocean-600" />
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Pending Pushes</p>
          </div>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{pendingPushCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-soft ring-1 ring-ink-100">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: Server },
          { key: 'config', label: 'Configuration', icon: Settings },
          { key: 'product-sync', label: 'Product Sync', icon: Package },
          { key: 'order-sync', label: 'Order Sync', icon: ShoppingCart },
          { key: 'webhooks', label: 'Webhooks', icon: Webhook },
          { key: 'logs', label: 'Sync History', icon: Activity },
          { key: 'queue', label: 'Sale Push Queue', icon: ShoppingCart },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-ocean-900 text-white shadow-lifted'
                  : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {tab.key === 'queue' && pendingPushCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ocean-950">{pendingPushCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                      <Package className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-ink-900">Sync Products</h3>
                  </div>
                  <p className="mb-4 text-xs text-ink-500">Pull products from UltimatePOS into your kiosk. New products are created; existing ones are updated.</p>
                  <button
                    onClick={() => handleSync('products')}
                    disabled={!!syncing || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {syncing === 'products' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync Now
                  </button>
                </div>

                <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-ink-900">Sync Customers</h3>
                  </div>
                  <p className="mb-4 text-xs text-ink-500">Pull customers from UltimatePOS. Matched by UltimatePOS ID, created or updated as needed.</p>
                  <button
                    onClick={() => handleSync('customers')}
                    disabled={!!syncing || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {syncing === 'customers' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync Now
                  </button>
                </div>

                <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                      <ShoppingCart className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-base font-semibold text-ink-900">Push Sales</h3>
                  </div>
                  <p className="mb-4 text-xs text-ink-500">Push completed orders to UltimatePOS as sales. Pending and retrying pushes are processed.</p>
                  <button
                    onClick={handlePushSales}
                    disabled={!!syncing || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {syncing === 'sales' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Push Pending
                  </button>
                </div>
              </div>

              {/* Connection Test */}
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-100 text-ink-400'}`}>
                      {isConnected ? <Link2 className="h-5 w-5" /> : <Link2Off className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900">Connection Status</h3>
                      <p className="text-xs text-ink-500">
                        {isConnected ? `Last connected: ${formatDate(config?.last_connected_at)}` : 'Not connected to UltimatePOS'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDebug}
                      disabled={debugging || !config}
                      className="flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-50"
                    >
                      {debugging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                      Run Diagnostics
                    </button>
                    <button
                      onClick={handleTestConnection}
                      disabled={testing || !config}
                      className="flex items-center gap-2 rounded-full border border-ocean-200 px-4 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-50"
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      Test Connection
                    </button>
                  </div>
                </div>

                {/* Connection Error Details */}
                {connectionError && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-rose-600" />
                      <p className="text-sm font-semibold text-rose-700">Connection Failed</p>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs text-rose-600 max-h-48 overflow-y-auto">{connectionError}</pre>
                  </div>
                )}

                {/* Debug Results */}
                {debugInfo && (
                  <div className="mt-4 rounded-2xl border border-ink-200 bg-ivory-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-ocean-600" />
                      <p className="text-sm font-semibold text-ink-700">Diagnostic Results</p>
                    </div>
                    <div className="mb-3 text-xs text-ink-500">
                      <p className="mb-1"><span className="font-semibold">Configured URL:</span> {debugInfo.config?.api_url || '—'}</p>
                      <p className="mb-1"><span className="font-semibold">Auth Mode:</span> {debugInfo.config?.auth_mode || '—'}</p>
                      <p><span className="font-semibold">Candidate URLs tried:</span></p>
                      <ul className="ml-4 list-disc">
                        {(debugInfo.candidate_urls || []).map((u: string, i: number) => <li key={i} className="font-mono text-xs">{u}</li>)}
                      </ul>
                    </div>
                    <div className="space-y-2">
                      {debugInfo.steps?.map((step: any, i: number) => (
                        <div key={i} className={`rounded-lg p-3 text-xs ${step.status === 200 || step.status === 'ok' ? 'bg-emerald-50' : step.is_html ? 'bg-amber-50' : 'bg-rose-50'}`}>
                          <p className="font-mono font-semibold text-ink-700">{step.step}</p>
                          {step.status && <p className="text-ink-500">HTTP {step.status} {step.is_html ? '(HTML page — not API)' : ''} {step.content_type ? `[${step.content_type}]` : ''}</p>}
                          {step.error && <p className="text-rose-600">{step.error}</p>}
                          {step.body_preview && <p className="mt-1 font-mono text-ink-400 max-h-20 overflow-y-auto">{step.body_preview}</p>}
                          {step.message && <p className="mt-1 text-ink-500">{step.message}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Help Tips */}
                {!isConnected && (
                  <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-sky-700">Troubleshooting Tips</p>
                    <ul className="space-y-1.5 text-xs text-sky-600">
                      <li><span className="font-semibold">1. Check your API URL:</span> If UltimatePOS was installed with /public, include it (e.g. https://yoursite.com/public). The system automatically tries both with and without /public.</li>
                      <li><span className="font-semibold">2. Verify API Connector module:</span> Go to UltimatePOS admin → Modules → make sure "API or Connector" module is installed and enabled.</li>
                      <li><span className="font-semibold">3. Cloudflare bypass:</span> If your site uses Cloudflare, enter the server's direct IP address in the Direct Server IP field above. This bypasses Cloudflare's bot protection by connecting to the server directly.</li>
                      <li><span className="font-semibold">4. Verify Business ID:</span> Make sure the business ID matches your UltimatePOS business number.</li>
                      <li><span className="font-semibold">5. Use Run Diagnostics:</span> Click "Run Diagnostics" above for a detailed breakdown of what's happening with each URL.</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Auto-sync settings summary */}
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <h3 className="mb-3 font-display text-base font-semibold text-ink-900">Automation</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-ink-400" />
                      <span className="text-sm text-ink-700">Auto-sync products</span>
                    </div>
                    <span className={`text-xs font-semibold ${config?.auto_sync_products ? 'text-emerald-600' : 'text-ink-400'}`}>
                      {config?.auto_sync_products ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-ink-400" />
                      <span className="text-sm text-ink-700">Auto-sync customers</span>
                    </div>
                    <span className={`text-xs font-semibold ${config?.auto_sync_customers ? 'text-emerald-600' : 'text-ink-400'}`}>
                      {config?.auto_sync_customers ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-ink-400" />
                      <span className="text-sm text-ink-700">Auto-push sales</span>
                    </div>
                    <span className={`text-xs font-semibold ${config?.auto_push_sales ? 'text-emerald-600' : 'text-ink-400'}`}>
                      {config?.auto_push_sales ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-400">Configure these settings in the Configuration tab.</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Config Tab */}
        {activeTab === 'config' && (
          <motion.div key="config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-ink-900">Connection Settings</h3>
                <button
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="flex items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50"
                >
                  {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showSecrets ? 'Hide secrets' : 'Show secrets'}
                </button>
              </div>

              <div className="space-y-5">
                {/* API URL */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">UltimatePOS API URL</label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={formData.api_url}
                    onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                    placeholder="https://your-store.ultimatepos.com"
                    className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                {/* Direct Server IP (Cloudflare bypass) */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Direct Server IP (Cloudflare Bypass)</label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={formData.direct_server_ip}
                    onChange={(e) => setFormData({ ...formData, direct_server_ip: e.target.value })}
                    placeholder="e.g. 50.6.156.135 (leave empty if not needed)"
                    className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                  />
                  <p className="mt-1 text-xs text-ink-400">If your UltimatePOS site is behind Cloudflare, enter the server's direct IP address here to bypass it. The system will route API requests directly to the server using this IP while keeping the correct Host header.</p>
                </div>

                {/* Auth Mode */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Authentication Mode</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, auth_mode: 'pat' })}
                      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${formData.auth_mode === 'pat' ? 'bg-ocean-800 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
                    >
                      Personal Access Token (Recommended)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, auth_mode: 'oauth' })}
                      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${formData.auth_mode === 'oauth' ? 'bg-ocean-800 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}
                    >
                      OAuth Password Grant
                    </button>
                  </div>
                </div>

                {/* PAT fields */}
                {formData.auth_mode === 'pat' && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Personal Access Token</label>
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      value={formData.personal_access_token}
                      onChange={(e) => setFormData({ ...formData, personal_access_token: e.target.value })}
                      placeholder="Paste your UltimatePOS PAT here"
                      className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                    />
                    <p className="mt-1 text-xs text-ink-400">Generate this from UltimatePOS admin panel under Settings {'>'} API {'>'} Personal Access Tokens.</p>
                  </div>
                )}

                {/* OAuth fields */}
                {formData.auth_mode === 'oauth' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Client ID</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formData.client_id}
                          onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Client Secret</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formData.client_secret}
                          onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Username</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formData.username}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Password</label>
                        <input
                          type={showSecrets ? 'text' : 'password'}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Business / Location */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Business ID</label>
                    <input
                      type="number"
                      value={formData.business_id}
                      onChange={(e) => setFormData({ ...formData, business_id: parseInt(e.target.value) || 1 })}
                      min="1"
                      className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Location ID</label>
                    <input
                      type="number"
                      value={formData.location_id}
                      onChange={(e) => setFormData({ ...formData, location_id: parseInt(e.target.value) || 1 })}
                      min="1"
                      className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2 rounded-2xl border border-ink-100 p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-ink-700">Integration Active</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                      className={`relative h-6 w-11 rounded-full transition ${formData.is_active ? 'bg-ocean-600' : 'bg-ink-200'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.is_active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-ink-700">Auto-sync Products</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, auto_sync_products: !formData.auto_sync_products })}
                      className={`relative h-6 w-11 rounded-full transition ${formData.auto_sync_products ? 'bg-ocean-600' : 'bg-ink-200'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.auto_sync_products ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-ink-700">Auto-sync Customers</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, auto_sync_customers: !formData.auto_sync_customers })}
                      className={`relative h-6 w-11 rounded-full transition ${formData.auto_sync_customers ? 'bg-ocean-600' : 'bg-ink-200'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.auto_sync_customers ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm font-medium text-ink-700">Auto-push Sales</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, auto_push_sales: !formData.auto_push_sales })}
                      className={`relative h-6 w-11 rounded-full transition ${formData.auto_push_sales ? 'bg-ocean-600' : 'bg-ink-200'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.auto_push_sales ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>

                {/* Save button */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || saving}
                    className="flex items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 py-2.5 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-50"
                  >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Test
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Product Sync Tab */}
        {activeTab === 'product-sync' && (
          <motion.div key="product-sync" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink-900">Product Sync Fields</h3>
                  <p className="text-xs text-ink-500">Choose which product fields are synced from UltimatePOS into your kiosk.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  { key: 'sync_product_name', label: 'Product Name', desc: 'Sync the product name' },
                  { key: 'sync_product_price', label: 'Price', desc: 'Sync the selling price' },
                  { key: 'sync_product_category', label: 'Category', desc: 'Sync product categories' },
                  { key: 'sync_product_quantity', label: 'Quantity / Stock', desc: 'Sync stock quantities' },
                  { key: 'sync_product_weight', label: 'Weight', desc: 'Sync product weight' },
                  { key: 'sync_product_images', label: 'Images', desc: 'Sync product images' },
                  { key: 'sync_product_description', label: 'Description', desc: 'Sync product descriptions' },
                  { key: 'sync_product_tax_class', label: 'Tax Class', desc: 'Sync tax class assignments' },
                ].map((field) => (
                  <label key={field.key} className="flex cursor-pointer items-center justify-between rounded-xl border border-ink-100 bg-ivory-50 px-4 py-3 transition hover:bg-ivory-100">
                    <div>
                      <p className="text-sm font-medium text-ink-700">{field.label}</p>
                      <p className="text-xs text-ink-400">{field.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={(formData as any)[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.checked })}
                      className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-ink-200 transition-colors checked:bg-ocean-600 relative after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-4"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs text-ink-400">Changes are saved when you click Save Configuration.</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSync('products')}
                    disabled={!!syncing || !config}
                    className="flex items-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {syncing === 'products' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Sync Now
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-full border border-ocean-200 px-4 py-2.5 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Order Sync Tab */}
        {activeTab === 'order-sync' && (
          <motion.div key="order-sync" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink-900">Order Status Mapping</h3>
                  <p className="text-xs text-ink-500">Map WooCommerce/UltimatePOS order statuses to your kiosk order statuses.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">WooCommerce: Pending</label>
                  <input
                    type="text"
                    value={formData.sync_order_status_pending}
                    onChange={(e) => setFormData({ ...formData, sync_order_status_pending: e.target.value })}
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">WooCommerce: Processing</label>
                  <input
                    type="text"
                    value={formData.sync_order_status_processing}
                    onChange={(e) => setFormData({ ...formData, sync_order_status_processing: e.target.value })}
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">WooCommerce: Completed</label>
                  <input
                    type="text"
                    value={formData.sync_order_status_completed}
                    onChange={(e) => setFormData({ ...formData, sync_order_status_completed: e.target.value })}
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">WooCommerce: Cancelled</label>
                  <input
                    type="text"
                    value={formData.sync_order_status_cancelled}
                    onChange={(e) => setFormData({ ...formData, sync_order_status_cancelled: e.target.value })}
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">Sync Order Location ID</label>
                  <input
                    type="number"
                    value={formData.sync_order_location_id ?? ''}
                    onChange={(e) => setFormData({ ...formData, sync_order_location_id: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Use default location"
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">Sync Order Type</label>
                  <select
                    value={formData.sync_order_order_type}
                    onChange={(e) => setFormData({ ...formData, sync_order_order_type: e.target.value })}
                    className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                  >
                    <option value="dine_in">Dine In</option>
                    <option value="takeaway">Takeaway</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Configuration
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <motion.div key="webhooks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="space-y-4">
              {/* Webhook Settings */}
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                      <Webhook className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900">Webhook Settings</h3>
                      <p className="text-xs text-ink-500">Configure incoming webhooks from UltimatePOS / WooCommerce.</p>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <span className="text-sm font-medium text-ink-600">{formData.webhook_enabled ? 'Enabled' : 'Disabled'}</span>
                    <input
                      type="checkbox"
                      checked={formData.webhook_enabled}
                      onChange={(e) => setFormData({ ...formData, webhook_enabled: e.target.checked })}
                      className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-ink-200 transition-colors checked:bg-ocean-600 relative after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-4"
                    />
                  </label>
                </div>

                {/* Webhook Secret */}
                <div className="mb-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-400">Webhook Secret</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.webhook_secret}
                        onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                        placeholder="Generate a secret to secure your webhooks"
                        className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 pr-10 text-sm font-mono text-ink-800 focus:border-ocean-500 focus:outline-none focus:ring-1 focus:ring-ocean-500"
                      />
                      <button
                        onClick={() => setShowSecrets(!showSecrets)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                      >
                        {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      onClick={generateWebhookSecret}
                      className="flex items-center gap-2 rounded-xl border border-ocean-200 px-4 py-2.5 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                    >
                      <Zap className="h-4 w-4" />
                      Generate
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">Include this secret in the <code className="rounded bg-ivory-100 px-1 font-mono text-ocean-800">X-Webhook-Secret</code> header when sending webhooks to verify authenticity.</p>
                </div>

                {/* Webhook Delivery URLs */}
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-400">Webhook Delivery URL</label>
                  <div className="space-y-2">
                    {[
                      { event: 'Order Created / Updated / Deleted', url: webhookBaseUrl },
                      { event: 'Product Created / Updated / Deleted', url: webhookBaseUrl },
                      { event: 'Customer Created / Updated / Deleted', url: webhookBaseUrl },
                    ].map((item) => (
                      <div key={item.event} className="flex items-center gap-2 rounded-xl border border-ink-100 bg-ivory-50 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-ink-600">{item.event}</p>
                          <p className="font-mono text-xs text-ink-500 break-all">{item.url}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(item.url, item.event)}
                          className="flex-shrink-0 rounded-lg border border-ink-200 p-2 text-ink-500 transition hover:bg-white hover:text-ocean-700"
                        >
                          {copiedField === item.event ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={handleSaveConfig}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-full bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                  </button>
                </div>
              </div>

              {/* Recent Webhook Events */}
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink-900">Recent Webhook Events</h3>
                    <p className="text-xs text-ink-500">Last webhook received: {formatDate(config?.last_webhook_at || null)}{config?.last_webhook_event ? ` (${config.last_webhook_event})` : ''}</p>
                  </div>
                </div>
                {webhookEvents.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                      <Webhook className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-ink-700">No webhook events yet</p>
                    <p className="text-xs text-ink-400">Webhook events will appear here once UltimatePOS starts sending them.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-ink-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Event</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Entity</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Error</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">When</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {webhookEvents.map((ev) => (
                          <tr key={ev.id} className="hover:bg-ivory-50">
                            <td className="px-3 py-2 text-xs font-medium text-ink-700">{ev.event_type}</td>
                            <td className="px-3 py-2 text-xs text-ink-500">{ev.entity_type || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${getStatusBg(ev.status)}`}>
                                {ev.status}
                              </span>
                            </td>
                            <td className="max-w-[200px] truncate px-3 py-2 text-xs text-rose-500" title={ev.error_message || ''}>{ev.error_message || '—'}</td>
                            <td className="px-3 py-2 text-xs text-ink-400">{formatDate(ev.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {syncLogs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                  <Activity className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink-700">No sync operations yet</p>
                <p className="text-xs text-ink-400">Sync history will appear here after you run a product, customer, or sale sync.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink-100 bg-ivory-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Type</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Processed</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Created</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Updated</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Skipped</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Error</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {syncLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-ivory-50">
                        <td className="px-4 py-3 text-xs font-medium capitalize text-ink-700">{log.sync_type}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${getStatusBg(log.status)}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-ink-600">{log.records_processed}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-600">{log.records_created}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-sky-600">{log.records_updated}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-ink-400">{log.records_skipped}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-rose-500" title={log.error_message || ''}>{log.error_message || '—'}</td>
                        <td className="px-4 py-3 text-xs text-ink-400">{formatDate(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <motion.div key="queue" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-ink-500">Completed orders are automatically queued for push to UltimatePOS. Failed pushes retry up to 3 times.</p>
              <button
                onClick={handlePushSales}
                disabled={!!syncing || !config}
                className="flex items-center gap-2 rounded-full bg-ocean-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ocean-900 disabled:opacity-50"
              >
                {syncing === 'sales' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Process All Pending
              </button>
            </div>
            {salePushes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink-700">No sale pushes yet</p>
                <p className="text-xs text-ink-400">Completed orders will appear here when they're queued for UltimatePOS.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink-100 bg-ivory-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Order ID</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">UPS Sale ID</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Retries</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Error</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">When</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {salePushes.map((push) => (
                      <tr key={push.id} className="hover:bg-ivory-50">
                        <td className="px-4 py-3 font-mono text-xs text-ink-700">{push.order_id.substring(0, 8)}...</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${getStatusBg(push.status)}`}>
                            {push.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-500">{push.ultimatepos_sale_id || '—'}</td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums text-ink-600">{push.retry_count}/{push.max_retries}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-xs text-rose-500" title={push.error_message || ''}>{push.error_message || '—'}</td>
                        <td className="px-4 py-3 text-xs text-ink-400">{formatDate(push.pushed_at || push.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {(push.status === 'pending' || push.status === 'failed' || push.status === 'retrying') && (
                            <button
                              onClick={() => handleRetryPush(push.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-ocean-200 px-2.5 py-1 text-xs font-medium text-ocean-700 transition hover:bg-ocean-50"
                            >
                              <RotateCw className="h-3 w-3" />
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-lifted ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' :
              toast.type === 'error' ? 'bg-rose-600 text-white' :
              'bg-ocean-800 text-white'
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
