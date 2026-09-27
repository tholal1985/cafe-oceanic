import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Link2, Link2Off, AlertCircle,
  Package, Users, ShoppingCart, Settings, Zap, ArrowRight,
  Activity, Server, Eye, EyeOff, Save, RotateCw, Loader2,
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

type ToastType = { type: 'success' | 'error' | 'info'; text: string } | null;

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-sync`;

export default function UltimatePosIntegration() {
  const [config, setConfig] = useState<UltimatePosConfig | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [salePushes, setSalePushes] = useState<SalePush[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'logs' | 'queue'>('dashboard');
  const [showSecrets, setShowSecrets] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastType>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
  });

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, logsRes, pushesRes] = await Promise.all([
        supabase.from('ultimatepos_config').select('*').maybeSingle(),
        supabase.from('ultimatepos_sync_logs').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('ultimatepos_sale_pushes').select('*').order('created_at', { ascending: false }).limit(20),
      ]);

      const configData = configRes.data as UltimatePosConfig | null;
      setConfig(configData);
      setSyncLogs(logsRes.data || []);
      setSalePushes(pushesRes.data || []);

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
      <div className="mb-6 flex gap-1 rounded-xl bg-white p-1 shadow-soft ring-1 ring-ink-100">
        {[
          { key: 'dashboard', label: 'Dashboard', icon: Server },
          { key: 'config', label: 'Configuration', icon: Settings },
          { key: 'logs', label: 'Sync History', icon: Activity },
          { key: 'queue', label: 'Sale Push Queue', icon: ShoppingCart },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
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
                      <li><span className="font-semibold">3. Check Cloudflare:</span> If your site uses Cloudflare, use a Personal Access Token (PAT) instead of OAuth. Generate one from UltimatePOS admin → your profile → Personal Access Tokens.</li>
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
