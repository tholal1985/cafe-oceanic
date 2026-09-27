import { useEffect, useState } from 'react';
import {
  RefreshCw, Save, Plug, CheckCircle, XCircle, AlertCircle,
  ShoppingCart, Package, Clock, ArrowUpRight, ChevronDown, ChevronUp,
  Wifi, WifiOff, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface UltimatePOSConfig {
  id: string;
  base_url: string;
  api_token: string;
  auth_method: string;
  api_username: string;
  api_password: string;
  client_id: string;
  client_secret: string;
  business_id: number;
  location_id: number;
  is_enabled: boolean;
  auto_push_orders: boolean;
  auto_sync_products: boolean;
  last_product_sync_at: string | null;
  last_connected_at: string | null;
  connection_status: string;
}

interface OrderLog {
  id: string;
  order_number: string;
  ultimatepos_sale_id: number | null;
  status: string;
  error_message: string | null;
  pushed_at: string | null;
  created_at: string;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  items_synced: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  connected: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  disconnected: 'text-ink-500 bg-ink-50 border-ink-200',
  error: 'text-red-700 bg-red-50 border-red-200',
};

const LOG_STATUS_STYLES: Record<string, string> = {
  success: 'text-emerald-700 bg-emerald-50',
  failed: 'text-red-700 bg-red-50',
  pending: 'text-amber-700 bg-amber-50',
  running: 'text-blue-700 bg-blue-50',
  completed: 'text-emerald-700 bg-emerald-50',
};

export default function UltimatePOSIntegration() {
  const [config, setConfig] = useState<UltimatePOSConfig | null>(null);
  const [form, setForm] = useState({
    base_url: '',
    api_token: '',
    auth_method: 'password',
    api_username: '',
    api_password: '',
    client_id: '',
    client_secret: '',
    business_id: 1,
    location_id: 1,
    is_enabled: false,
    auto_push_orders: true,
    auto_sync_products: false,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [activeTab, setActiveTab] = useState<'config' | 'orders' | 'syncs'>('config');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadOrderLogs();
    loadSyncLogs();
  }, []);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadConfig = async () => {
    const { data } = await supabase.from('ultimatepos_config').select('*').single();
    if (data) {
      setConfig(data as unknown as UltimatePOSConfig);
      setForm({
        base_url: data.base_url ?? '',
        api_token: data.api_token ?? '',
        auth_method: data.auth_method ?? 'password',
        api_username: data.api_username ?? '',
        api_password: data.api_password ?? '',
        client_id: data.client_id ?? '',
        client_secret: data.client_secret ?? '',
        business_id: data.business_id ?? 1,
        location_id: data.location_id ?? 1,
        is_enabled: data.is_enabled ?? false,
        auto_push_orders: data.auto_push_orders ?? true,
        auto_sync_products: data.auto_sync_products ?? false,
      });
    }
  };

  const loadOrderLogs = async () => {
    const { data } = await supabase
      .from('ultimatepos_order_log')
      .select('id, order_number, ultimatepos_sale_id, status, error_message, pushed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setOrderLogs(data as unknown as OrderLog[]);
  };

  const loadSyncLogs = async () => {
    const { data } = await supabase
      .from('ultimatepos_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setSyncLogs(data as unknown as SyncLog[]);
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('ultimatepos_config')
      .update({
        base_url: form.base_url.trim(),
        api_token: form.api_token.trim(),
        auth_method: form.auth_method,
        api_username: form.api_username.trim(),
        api_password: form.api_password,
        client_id: form.client_id.trim(),
        client_secret: form.client_secret.trim(),
        business_id: form.business_id,
        location_id: form.location_id,
        is_enabled: form.is_enabled,
        auto_push_orders: form.auto_push_orders,
        auto_sync_products: form.auto_sync_products,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config!.id);

    setSaving(false);
    if (error) {
      showToast('error', 'Failed to save settings');
    } else {
      showToast('success', 'Settings saved');
      loadConfig();
    }
  };

  const handleTestConnection = async () => {
    if (!form.base_url) {
      showToast('error', 'Please fill in the Base URL first');
      return;
    }
    if (form.auth_method === 'token' && !form.api_token) {
      showToast('error', 'Please enter your API Token first');
      return;
    }
    if (form.auth_method === 'password' && (!form.client_id || !form.client_secret || !form.api_username || !form.api_password)) {
      showToast('error', 'Client ID, Client Secret, Username and Password are all required');
      return;
    }
    if (form.auth_method === 'oauth' && (!form.client_id || !form.client_secret)) {
      showToast('error', 'Please fill in Client ID and Client Secret first');
      return;
    }
    setTesting(true);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-proxy?action=test`;
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.session?.access_token ?? ''}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          base_url: form.base_url.trim(),
          auth_method: form.auth_method,
          api_token: form.api_token.trim(),
          api_username: form.api_username.trim(),
          api_password: form.api_password,
          client_id: form.client_id.trim(),
          client_secret: form.client_secret.trim(),
        }),
      });
      const json = await resp.json();

      if (json.success) {
        showToast('success', 'Connected to UltimatePOS successfully!');
        loadConfig();
      } else {
        showToast('error', json.error || 'Connection failed');
        if (config) {
          await supabase.from('ultimatepos_config').update({ connection_status: 'error' }).eq('id', config.id);
          loadConfig();
        }
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProducts = async () => {
    setSyncing(true);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-proxy?action=sync_products`;
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(fnUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      const json = await resp.json();

      if (json.success) {
        showToast('success', `Synced ${json.synced} products from UltimatePOS`);
        loadSyncLogs();
        loadConfig();
      } else {
        showToast('error', json.error || 'Sync failed');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const statusInfo = config?.connection_status ?? 'disconnected';

  const tabs = [
    { key: 'config', label: 'Configuration', icon: Plug },
    { key: 'orders', label: 'Order Push Log', icon: ShoppingCart },
    { key: 'syncs', label: 'Sync Log', icon: Package },
  ] as const;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lifted text-sm font-medium
              ${toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'}`}
          >
            {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="mb-8 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink-900">UltimatePOS Integration</h1>
          <p className="mt-1 text-sm text-ink-500">Connect your kiosk to UltimatePOS for product sync and order push</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${STATUS_STYLES[statusInfo] ?? STATUS_STYLES.disconnected}`}>
          {statusInfo === 'connected' ? <Wifi size={13} /> : <WifiOff size={13} />}
          {statusInfo === 'connected' ? 'Connected' : statusInfo === 'error' ? 'Connection Error' : 'Disconnected'}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-ink-100 bg-ink-50 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all
              ${activeTab === key
                ? 'bg-white text-ink-900 shadow-soft'
                : 'text-ink-500 hover:text-ink-800'}`}
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Connection card */}
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                <Plug size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-ink-900">API Credentials</h2>
                <p className="text-xs text-ink-400">Connect to your UltimatePOS installation at <span className="font-mono text-ink-600">faseyhapos.com</span></p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Base URL */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                  Base URL
                </label>
                <input
                  type="url"
                  value={form.base_url}
                  onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                  placeholder="https://faseyhapos.com"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                />
                <p className="mt-1 text-xs text-ink-400">Your UltimatePOS URL — no trailing slash</p>
              </div>

              {/* Auth method toggle */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-2">
                  Authentication Method
                </label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, auth_method: 'password' }))}
                    className={`flex-1 min-w-[130px] rounded-lg border py-2.5 text-sm font-medium transition-all ${form.auth_method === 'password' ? 'border-ocean-600 bg-ocean-50 text-ocean-700' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300'}`}
                  >
                    Password Grant
                    <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">Recommended</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, auth_method: 'token' }))}
                    className={`flex-1 min-w-[130px] rounded-lg border py-2.5 text-sm font-medium transition-all ${form.auth_method === 'token' ? 'border-ocean-600 bg-ocean-50 text-ocean-700' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300'}`}
                  >
                    Personal Access Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, auth_method: 'oauth' }))}
                    className={`flex-1 min-w-[130px] rounded-lg border py-2.5 text-sm font-medium transition-all ${form.auth_method === 'oauth' ? 'border-ocean-600 bg-ocean-50 text-ocean-700' : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300'}`}
                  >
                    OAuth2 Client Credentials
                  </button>
                </div>
              </div>

              {/* Password Grant method */}
              {form.auth_method === 'password' && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    <p className="font-semibold mb-1">Use your UltimatePOS login credentials + the Client ID &amp; Secret from the Connector module.</p>
                    <p className="text-blue-600">In UltimatePOS: <strong>Connector</strong> → <strong>Clients</strong> → use the numeric ID (e.g. 16) and its secret.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Client ID <span className="normal-case font-normal text-ink-400">(numeric)</span>
                      </label>
                      <input
                        type="text"
                        value={form.client_id}
                        onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                        placeholder="16"
                        className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Client Secret
                      </label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={form.client_secret}
                          onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                          placeholder="Client Secret from Connector"
                          className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                        />
                        <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                          {showSecret ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Admin Username / Email
                      </label>
                      <input
                        type="text"
                        value={form.api_username}
                        onChange={e => setForm(f => ({ ...f, api_username: e.target.value }))}
                        placeholder="admin@example.com"
                        className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Admin Password
                      </label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={form.api_password}
                          onChange={e => setForm(f => ({ ...f, api_password: e.target.value }))}
                          placeholder="Your UltimatePOS password"
                          className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                        />
                        <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                          {showSecret ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Token method */}
              {form.auth_method === 'token' && (
                <div>
                  <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                    <p className="font-semibold mb-1">How to get your API Token:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
                      <li>Log in to UltimatePOS as admin</li>
                      <li>Click your profile icon (top right) → <strong>My Profile</strong></li>
                      <li>Scroll to <strong>API Token</strong> section</li>
                      <li>Click <strong>Generate new token</strong> and copy it</li>
                    </ol>
                  </div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                    API Token
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={form.api_token}
                      onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
                      placeholder="Paste your UltimatePOS API token here"
                      className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                    >
                      {showSecret ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* OAuth method */}
              {form.auth_method === 'oauth' && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold mb-1">How to get OAuth2 credentials:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-amber-700">
                      <li>Log in to UltimatePOS as admin</li>
                      <li>Go to <strong>Connector</strong> module → <strong>Clients</strong></li>
                      <li>Create a new <strong>Client Credentials Grant</strong> client</li>
                      <li>Copy the numeric <strong>Client ID</strong> (e.g. 1) and the <strong>Client Secret</strong></li>
                    </ol>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Client ID <span className="normal-case text-ink-400">(numeric, e.g. 1)</span>
                      </label>
                      <input
                        type="text"
                        value={form.client_id}
                        onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                        placeholder="1"
                        className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                        Client Secret
                      </label>
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          value={form.client_secret}
                          onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                          placeholder="Client Secret from Connector module"
                          className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(s => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                        >
                          {showSecret ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                    Business ID
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.business_id}
                    onChange={e => setForm(f => ({ ...f, business_id: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.15em] text-ink-500 mb-1.5">
                    Location ID
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.location_id}
                    onChange={e => setForm(f => ({ ...f, location_id: parseInt(e.target.value) || 1 }))}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-600 focus:ring-2 focus:ring-ocean-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Behaviour card */}
          <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
            <h2 className="mb-4 font-semibold text-ink-900">Behaviour</h2>
            <div className="space-y-3">
              {[
                { key: 'is_enabled', label: 'Enable Integration', desc: 'Master switch — turns the entire integration on or off' },
                { key: 'auto_push_orders', label: 'Auto-push orders to UltimatePOS', desc: 'Automatically push each confirmed order as a sale' },
                { key: 'auto_sync_products', label: 'Auto-sync products on startup', desc: 'Pull product list from UltimatePOS when the admin loads' },
              ].map(({ key, label, desc }) => (
                <label key={key} className="flex cursor-pointer items-start gap-4 rounded-xl border border-ink-100 p-4 hover:bg-ink-50 transition-colors">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={form[key as keyof typeof form] as boolean}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="h-5 w-9 rounded-full bg-ink-200 peer-checked:bg-ocean-700 transition-colors" />
                    <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{label}</p>
                    <p className="text-xs text-ink-400">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 space-y-1">
                <p className="font-semibold">Prerequisites</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li>Purchase and install the <strong>REST API Module</strong> on your UltimatePOS instance</li>
                  <li>Generate Client ID and Secret from <strong>Connector &rarr; Clients</strong> in UltimatePOS (superadmin only)</li>
                  <li>Ensure your UltimatePOS server is reachable from the internet</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Last sync info */}
          {config && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-ink-100 bg-white px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-400">Last Connected</p>
                <p className="mt-1 text-sm font-semibold text-ink-900">
                  {config.last_connected_at
                    ? new Date(config.last_connected_at).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <div className="rounded-xl border border-ink-100 bg-white px-4 py-3.5">
                <p className="text-xs uppercase tracking-[0.18em] text-ink-400">Last Product Sync</p>
                <p className="mt-1 text-sm font-semibold text-ink-900">
                  {config.last_product_sync_at
                    ? new Date(config.last_product_sync_at).toLocaleString()
                    : 'Never'}
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 shadow-soft transition-all hover:border-ocean-600 hover:text-ocean-700 disabled:opacity-50"
            >
              {testing ? <RefreshCw size={15} className="animate-spin" /> : <Wifi size={15} />}
              {testing ? 'Testing…' : 'Test Connection'}
            </button>

            <button
              onClick={handleSyncProducts}
              disabled={syncing || !form.is_enabled}
              className="flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 shadow-soft transition-all hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            >
              {syncing ? <RefreshCw size={15} className="animate-spin" /> : <Package size={15} />}
              {syncing ? 'Syncing…' : 'Sync Products Now'}
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="ml-auto flex items-center gap-2 rounded-xl bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition-all hover:bg-ocean-900 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Order Push Log Tab */}
      {activeTab === 'orders' && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-900">Order Push Log</h2>
              <p className="text-xs text-ink-400">Orders pushed to UltimatePOS as sales</p>
            </div>
            <button
              onClick={loadOrderLogs}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <RotateCcw size={13} />
              Refresh
            </button>
          </div>

          {orderLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-400">
              <ShoppingCart size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No orders pushed yet</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {orderLogs.map(log => (
                <div key={log.id} className="px-5 py-4">
                  <div
                    className="flex cursor-pointer items-center gap-3"
                    onClick={() => setExpandedOrder(expandedOrder === log.id ? null : log.id)}
                  >
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${LOG_STATUS_STYLES[log.status] ?? 'text-ink-600 bg-ink-50'}`}>
                      {log.status}
                    </span>
                    <span className="font-mono text-sm font-semibold text-ink-900">{log.order_number}</span>
                    {log.ultimatepos_sale_id && (
                      <span className="flex items-center gap-1 text-xs text-ink-400">
                        <ArrowUpRight size={12} />
                        Sale #{log.ultimatepos_sale_id}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-ink-400">
                      {log.pushed_at
                        ? new Date(log.pushed_at).toLocaleString()
                        : new Date(log.created_at).toLocaleString()}
                    </span>
                    {expandedOrder === log.id ? <ChevronUp size={15} className="text-ink-400" /> : <ChevronDown size={15} className="text-ink-400" />}
                  </div>

                  <AnimatePresence>
                    {expandedOrder === log.id && log.error_message && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 font-mono">
                          {log.error_message}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sync Log Tab */}
      {activeTab === 'syncs' && (
        <div className="rounded-2xl border border-ink-100 bg-white shadow-soft overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-900">Product Sync Log</h2>
              <p className="text-xs text-ink-400">History of product syncs from UltimatePOS</p>
            </div>
            <button
              onClick={loadSyncLogs}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 transition-colors"
            >
              <RotateCcw size={13} />
              Refresh
            </button>
          </div>

          {syncLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-ink-400">
              <Package size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No syncs performed yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-[0.15em] text-ink-400">
                <tr>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Items Synced</th>
                  <th className="px-5 py-3 text-left">Started</th>
                  <th className="px-5 py-3 text-left">Completed</th>
                  <th className="px-5 py-3 text-left">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {syncLogs.map(log => (
                  <tr key={log.id} className="hover:bg-ink-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${LOG_STATUS_STYLES[log.status] ?? 'text-ink-600 bg-ink-50'}`}>
                        {log.status === 'running' && <RefreshCw size={10} className="animate-spin" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-ink-900">{log.items_synced}</td>
                    <td className="px-5 py-3.5 text-ink-500">{new Date(log.started_at).toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-ink-500">
                      {log.completed_at ? new Date(log.completed_at).toLocaleString() : <Clock size={14} className="text-ink-300" />}
                    </td>
                    <td className="px-5 py-3.5 text-red-600 text-xs font-mono max-w-[200px] truncate">
                      {log.error_message ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}