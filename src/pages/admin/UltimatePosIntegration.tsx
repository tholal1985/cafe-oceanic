import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, Save, Eye, EyeOff, Plug, Package, Users, ShoppingCart,
  CheckCircle2, XCircle, AlertCircle, Clock, ArrowRightLeft, Zap, Activity, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface UltimatePosConfig {
  id: string;
  api_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  is_active: boolean;
  auto_sync_products: boolean;
  auto_sync_customers: boolean;
  auto_push_sales: boolean;
  auth_mode: string;
  personal_access_token: string | null;
  last_product_sync_at: string | null;
  last_customer_sync_at: string | null;
  last_sale_push_at: string | null;
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
  created_at: string;
}

type ToastType = { type: 'success' | 'error' | 'info'; text: string } | null;

export default function UltimatePosIntegration() {
  const [config, setConfig] = useState<UltimatePosConfig | null>(null);
  const [form, setForm] = useState({
    api_url: '',
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    is_active: true,
    auto_sync_products: false,
    auto_sync_customers: false,
    auto_push_sales: true,
    auth_mode: 'oauth' as 'oauth' | 'pat',
    personal_access_token: '',
  });
  const [showSecrets, setShowSecrets] = useState({ client_secret: false, password: false, pat: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [retryingSales, setRetryingSales] = useState(false);
  const [toast, setToast] = useState<ToastType>(null);
  const [activeTab, setActiveTab] = useState<'connection' | 'sync' | 'logs'>('connection');
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [salePushes, setSalePushes] = useState<SalePush[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: configData } = await supabase
        .from('ultimatepos_config')
        .select('*')
        .maybeSingle();

      if (configData) {
        setConfig(configData);
        setForm({
          api_url: configData.api_url || '',
          client_id: configData.client_id || '',
          client_secret: configData.client_secret || '',
          username: configData.username || '',
          password: configData.password || '',
          is_active: configData.is_active ?? true,
          auto_sync_products: configData.auto_sync_products ?? false,
          auto_sync_customers: configData.auto_sync_customers ?? false,
          auto_push_sales: configData.auto_push_sales ?? true,
          auth_mode: (configData.auth_mode as 'oauth' | 'pat') || 'oauth',
          personal_access_token: configData.personal_access_token || '',
        });
      }

      const [logsRes, pushesRes] = await Promise.all([
        supabase
          .from('ultimatepos_sync_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('ultimatepos_sale_pushes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      setSyncLogs(logsRes.data || []);
      setSalePushes(pushesRes.data || []);
    } catch (error) {
      console.error('Error loading UltimatePOS data:', error);
      showToast('error', 'Failed to load integration data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const callEdgeFunction = async (action: string, extra?: Record<string, unknown>) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-sync`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...extra }),
    });
    const result = await response.json();
    return { response, result };
  };

  const handleSave = async () => {
    if (!form.api_url) {
      showToast('error', 'Please enter your UltimatePOS API URL');
      return;
    }
    if (form.auth_mode === 'oauth' && (!form.client_id || !form.client_secret || !form.username || !form.password)) {
      showToast('error', 'Please fill in all OAuth connection fields (Client ID, Client Secret, Username, Password)');
      return;
    }
    if (form.auth_mode === 'pat' && !form.personal_access_token) {
      showToast('error', 'Please enter your Personal Access Token');
      return;
    }

    setSaving(true);
    try {
      const saveData = {
        api_url: form.api_url,
        client_id: form.client_id,
        client_secret: form.client_secret,
        username: form.username,
        password: form.password,
        is_active: form.is_active,
        auto_sync_products: form.auto_sync_products,
        auto_sync_customers: form.auto_sync_customers,
        auto_push_sales: form.auto_push_sales,
        auth_mode: form.auth_mode,
        personal_access_token: form.auth_mode === 'pat' ? form.personal_access_token : null,
        updated_at: new Date().toISOString(),
      };

      if (config) {
        const { error } = await supabase
          .from('ultimatepos_config')
          .update(saveData)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ultimatepos_config')
          .insert(saveData);

        if (error) throw error;
      }

      showToast('success', 'UltimatePOS settings saved successfully');
      loadData();
    } catch (error: any) {
      console.error('Save error:', error);
      showToast('error', error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config) {
      showToast('error', 'Save your settings first before testing the connection');
      return;
    }

    setTesting(true);
    setConnectionStatus('unknown');
    try {
      const { response, result } = await callEdgeFunction('test_connection');
      if (response.ok && result.success) {
        setConnectionStatus('connected');
        showToast('success', 'Connection successful! Credentials are valid.');
      } else {
        setConnectionStatus('disconnected');
        showToast('error', result.error || 'Connection failed');
      }
    } catch (error: any) {
      setConnectionStatus('disconnected');
      showToast('error', error.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProducts = async () => {
    setSyncingProducts(true);
    try {
      const { response, result } = await callEdgeFunction('sync_products');
      if (response.ok && result.success) {
        showToast('success', result.message || 'Product sync complete');
        loadData();
      } else {
        showToast('error', result.error || 'Product sync failed');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Product sync failed');
    } finally {
      setSyncingProducts(false);
    }
  };

  const handleSyncCustomers = async () => {
    setSyncingCustomers(true);
    try {
      const { response, result } = await callEdgeFunction('sync_customers');
      if (response.ok && result.success) {
        showToast('success', result.message || 'Customer sync complete');
        loadData();
      } else {
        showToast('error', result.error || 'Customer sync failed');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Customer sync failed');
    } finally {
      setSyncingCustomers(false);
    }
  };

  const handleRetrySales = async () => {
    setRetryingSales(true);
    try {
      const { response, result } = await callEdgeFunction('retry_failed_sales');
      if (response.ok && result.success) {
        showToast('success', result.message || 'Retry complete');
        loadData();
      } else {
        showToast('error', result.error || 'Retry failed');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Retry failed');
    } finally {
      setRetryingSales(false);
    }
  };

  const handlePushSale = async (orderId: string) => {
    try {
      const { response, result } = await callEdgeFunction('push_sale', { orderId });
      if (response.ok && result.success) {
        showToast('success', 'Sale pushed to UltimatePOS');
        loadData();
      } else {
        showToast('error', result.error || 'Failed to push sale');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Failed to push sale');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      partial: 'bg-amber-100 text-amber-700',
      pending: 'bg-sky-100 text-sky-700',
      retrying: 'bg-orange-100 text-orange-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'success') return <CheckCircle2 size={14} className="text-emerald-500" />;
    if (status === 'failed') return <XCircle size={14} className="text-red-500" />;
    if (status === 'retrying' || status === 'pending') return <Clock size={14} className="text-orange-500" />;
    return <AlertCircle size={14} className="text-amber-500" />;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
          <p className="text-ink-500 text-xs tracking-[0.2em] uppercase">Loading integration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-ivory-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink-900">UltimatePOS Integration</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              Sync products and customers from UltimatePOS, and push completed sales back automatically.
            </p>
          </div>
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 ring-1 ring-emerald-200">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">Connected</span>
            </div>
          )}
          {connectionStatus === 'disconnected' && (
            <div className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 ring-1 ring-red-200">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-xs font-semibold text-red-700">Disconnected</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl bg-white p-1 shadow-soft ring-1 ring-ink-100">
          {[
            { key: 'connection', label: 'Connection', icon: Plug },
            { key: 'sync', label: 'Sync & Sales', icon: ArrowRightLeft },
            { key: 'logs', label: 'Activity Log', icon: Activity },
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
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'connection' && (
            <motion.div
              key="connection"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="rounded-2xl bg-white p-8 shadow-lifted ring-1 ring-ink-100">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                    <Plug size={20} />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-semibold text-ink-900">Connection Settings</h2>
                    <p className="text-xs text-ink-500">Enter your UltimatePOS REST API credentials</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                      UltimatePOS API URL
                    </label>
                    <input
                      type="text"
                      value={form.api_url}
                      onChange={(e) => setForm({ ...form, api_url: e.target.value })}
                      placeholder="https://yourstore.pos.ultimatefosters.com"
                      className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                    />
                    <p className="mt-1 text-xs text-ink-400">The base URL of your UltimatePOS installation</p>
                  </div>

                  {/* Auth Mode Selector */}
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                      Authentication Method
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, auth_mode: 'oauth' })}
                        className={`flex-1 rounded-lg border px-4 py-3 text-left transition-all ${
                          form.auth_mode === 'oauth'
                            ? 'border-ocean-500 bg-ocean-50 ring-2 ring-ocean-200'
                            : 'border-ink-200 bg-white hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-full border-2 ${form.auth_mode === 'oauth' ? 'border-ocean-600 bg-ocean-600' : 'border-ink-300'}`} />
                          <span className="text-sm font-semibold text-ink-800">OAuth (Password Grant)</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-500">Use Client ID, Secret, username & password. May be blocked by Cloudflare.</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, auth_mode: 'pat' })}
                        className={`flex-1 rounded-lg border px-4 py-3 text-left transition-all ${
                          form.auth_mode === 'pat'
                            ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                            : 'border-ink-200 bg-white hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`h-4 w-4 rounded-full border-2 ${form.auth_mode === 'pat' ? 'border-emerald-600 bg-emerald-600' : 'border-ink-300'}`} />
                          <span className="text-sm font-semibold text-ink-800">Personal Access Token</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-500">Bypasses Cloudflare. Generate a token from your browser.</p>
                      </button>
                    </div>
                  </div>

                  {form.auth_mode === 'pat' && (
                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Personal Access Token
                      </label>
                      <div className="relative">
                        <input
                          type={showSecrets.pat ? 'text' : 'password'}
                          value={form.personal_access_token}
                          onChange={(e) => setForm({ ...form, personal_access_token: e.target.value })}
                          placeholder="Paste your Personal Access Token here"
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 pr-11 text-sm text-ink-900 outline-none transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecrets({ ...showSecrets, pat: !showSecrets.pat })}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                        >
                          {showSecrets.pat ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="mt-2 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200">
                        <p className="text-xs text-emerald-800">
                          <strong>How to get a token:</strong> Log in to your UltimatePOS from your browser (this passes Cloudflare).
                          Go to your profile page, find "Personal Access Tokens", generate a new token, copy it, and paste it here.
                          This bypasses the Cloudflare-protected OAuth endpoint entirely.
                        </p>
                      </div>
                    </div>
                  )}

                  {form.auth_mode === 'oauth' && (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={form.client_id}
                          onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                          placeholder="Enter Client ID"
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                          Client Secret
                        </label>
                        <div className="relative">
                          <input
                            type={showSecrets.client_secret ? 'text' : 'password'}
                            value={form.client_secret}
                            onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
                            placeholder="Enter Client Secret"
                            className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 pr-11 text-sm text-ink-900 outline-none transition-colors focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecrets({ ...showSecrets, client_secret: !showSecrets.client_secret })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                          >
                            {showSecrets.client_secret ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                          Username
                        </label>
                        <input
                          type="text"
                          value={form.username}
                          onChange={(e) => setForm({ ...form, username: e.target.value })}
                          placeholder="UltimatePOS admin username"
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none transition-colors focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showSecrets.password ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder="UltimatePOS admin password"
                            className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 pr-11 text-sm text-ink-900 outline-none transition-colors focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecrets({ ...showSecrets, password: !showSecrets.password })}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                          >
                            {showSecrets.password ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-6 space-y-3 rounded-xl bg-ivory-50 p-5 ring-1 ring-ink-100">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">Automation Settings</h3>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-ocean-700 focus:ring-ocean-500" />
                    <span className="text-sm text-ink-700">Enable integration</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={form.auto_sync_products} onChange={(e) => setForm({ ...form, auto_sync_products: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-ocean-700 focus:ring-ocean-500" />
                    <span className="text-sm text-ink-700">Auto-sync products from UltimatePOS</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={form.auto_sync_customers} onChange={(e) => setForm({ ...form, auto_sync_customers: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-ocean-700 focus:ring-ocean-500" />
                    <span className="text-sm text-ink-700">Auto-sync customers from UltimatePOS</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={form.auto_push_sales} onChange={(e) => setForm({ ...form, auto_push_sales: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-ocean-700 focus:ring-ocean-500" />
                    <span className="text-sm text-ink-700">Automatically push completed sales to UltimatePOS</span>
                  </label>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-ocean-800 px-6 py-2.5 text-sm font-semibold text-white shadow-lifted transition-colors hover:bg-ocean-900 disabled:opacity-50"
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !config}
                    className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-6 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
                  >
                    <Zap size={16} />
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sync' && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {/* Product Sync Card */}
                <div className="rounded-2xl bg-white p-6 shadow-lifted ring-1 ring-ink-100">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                      <Package size={20} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900">Product Sync</h3>
                      <p className="text-xs text-ink-500">Import products from UltimatePOS</p>
                    </div>
                  </div>
                  <div className="mb-4 space-y-1.5 rounded-lg bg-ivory-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Last sync</span>
                      <span className="font-medium text-ink-800">{formatDate(config?.last_product_sync_at ?? null)}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSyncProducts}
                    disabled={syncingProducts || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lifted transition-colors hover:bg-ocean-900 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={syncingProducts ? 'animate-spin' : ''} />
                    {syncingProducts ? 'Syncing...' : 'Sync Products Now'}
                  </button>
                </div>

                {/* Customer Sync Card */}
                <div className="rounded-2xl bg-white p-6 shadow-lifted ring-1 ring-ink-100">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Users size={20} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900">Customer Sync</h3>
                      <p className="text-xs text-ink-500">Import customers from UltimatePOS</p>
                    </div>
                  </div>
                  <div className="mb-4 space-y-1.5 rounded-lg bg-ivory-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Last sync</span>
                      <span className="font-medium text-ink-800">{formatDate(config?.last_customer_sync_at ?? null)}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSyncCustomers}
                    disabled={syncingCustomers || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lifted transition-colors hover:bg-amber-700 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={syncingCustomers ? 'animate-spin' : ''} />
                    {syncingCustomers ? 'Syncing...' : 'Sync Customers Now'}
                  </button>
                </div>

                {/* Sale Push Card */}
                <div className="rounded-2xl bg-white p-6 shadow-lifted ring-1 ring-ink-100">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <ShoppingCart size={20} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900">Sale Push</h3>
                      <p className="text-xs text-ink-500">Retry failed sale pushes</p>
                    </div>
                  </div>
                  <div className="mb-4 space-y-1.5 rounded-lg bg-ivory-50 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Last push</span>
                      <span className="font-medium text-ink-800">{formatDate(config?.last_sale_push_at ?? null)}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleRetrySales}
                    disabled={retryingSales || !config}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lifted transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={retryingSales ? 'animate-spin' : ''} />
                    {retryingSales ? 'Retrying...' : 'Retry Failed Sales'}
                  </button>
                </div>
              </div>

              {/* Recent Sale Pushes */}
              <div className="mt-6 rounded-2xl bg-white p-6 shadow-lifted ring-1 ring-ink-100">
                <h3 className="mb-4 font-display text-base font-semibold text-ink-900">Recent Sale Pushes</h3>
                {salePushes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingCart size={32} className="mb-2 text-ink-300" />
                    <p className="text-sm text-ink-400">No sale pushes yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                          <th className="pb-2 pr-4 font-semibold">Order ID</th>
                          <th className="pb-2 pr-4 font-semibold">Status</th>
                          <th className="pb-2 pr-4 font-semibold">UltimatePOS Sale ID</th>
                          <th className="pb-2 pr-4 font-semibold">Retries</th>
                          <th className="pb-2 pr-4 font-semibold">Date</th>
                          <th className="pb-2 pr-4 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {salePushes.map((push) => (
                          <tr key={push.id} className="hover:bg-ivory-50">
                            <td className="py-3 pr-4 text-ink-700">{push.order_id.slice(0, 8)}...</td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(push.status)}`}>
                                <StatusIcon status={push.status} />
                                {push.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-ink-600">{push.ultimatepos_sale_id || '—'}</td>
                            <td className="py-3 pr-4 text-ink-600">{push.retry_count}/{push.max_retries}</td>
                            <td className="py-3 pr-4 text-xs text-ink-500">{formatDate(push.created_at)}</td>
                            <td className="py-3 pr-4">
                              {(push.status === 'failed' || push.status === 'retrying') && !push.ultimatepos_sale_id && (
                                <button
                                  onClick={() => handlePushSale(push.order_id)}
                                  className="rounded-md bg-ocean-50 px-3 py-1 text-xs font-medium text-ocean-700 hover:bg-ocean-100"
                                >
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
              </div>
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="rounded-2xl bg-white p-6 shadow-lifted ring-1 ring-ink-100">
                <h3 className="mb-4 font-display text-base font-semibold text-ink-900">Sync Activity Log</h3>
                {syncLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Activity size={32} className="mb-2 text-ink-300" />
                    <p className="text-sm text-ink-400">No sync activity yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wider text-ink-400">
                          <th className="pb-2 pr-4 font-semibold">Type</th>
                          <th className="pb-2 pr-4 font-semibold">Status</th>
                          <th className="pb-2 pr-4 font-semibold">Processed</th>
                          <th className="pb-2 pr-4 font-semibold">Created</th>
                          <th className="pb-2 pr-4 font-semibold">Updated</th>
                          <th className="pb-2 pr-4 font-semibold">Skipped</th>
                          <th className="pb-2 pr-4 font-semibold">Error</th>
                          <th className="pb-2 pr-4 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {syncLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-ivory-50">
                            <td className="py-3 pr-4">
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                                {log.sync_type === 'products' && <Package size={12} />}
                                {log.sync_type === 'customers' && <Users size={12} />}
                                {log.sync_type === 'sales' && <ShoppingCart size={12} />}
                                {log.sync_type}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadge(log.status)}`}>
                                <StatusIcon status={log.status} />
                                {log.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-ink-600">{log.records_processed}</td>
                            <td className="py-3 pr-4 text-emerald-600">{log.records_created}</td>
                            <td className="py-3 pr-4 text-sky-600">{log.records_updated}</td>
                            <td className="py-3 pr-4 text-amber-600">{log.records_skipped}</td>
                            <td className="py-3 pr-4 text-xs text-red-500 max-w-[200px] truncate" title={log.error_message || ''}>
                              {log.error_message || '—'}
                            </td>
                            <td className="py-3 pr-4 text-xs text-ink-500">{formatDate(log.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-6 left-1/2 z-50 flex items-center gap-3 rounded-xl px-5 py-3 shadow-lifted ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' :
              toast.type === 'error' ? 'bg-red-600 text-white' :
              'bg-ocean-800 text-white'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            {toast.type === 'error' && <XCircle size={18} />}
            {toast.type === 'info' && <AlertCircle size={18} />}
            <span className="text-sm font-medium">{toast.text}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
