import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, AlertCircle, Loader2, Link2, Link2Off,
  Package, ShoppingBag, Clock, Settings, Power, Zap, ZapOff,
  History, ArrowRight, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface UltimatePosConfig {
  id: string;
  base_url: string;
  client_id: string;
  client_secret: string;
  api_username: string;
  api_password: string;
  auth_method: string;
  business_id: number;
  location_id: number;
  is_enabled: boolean;
  auto_push_orders: boolean;
  auto_sync_products: boolean;
  last_product_sync_at: string | null;
  last_order_push_at: string | null;
  last_connected_at: string | null;
  connection_status: string;
  updated_at: string;
}

interface SyncLogEntry {
  id: string;
  sync_type: string;
  status: string;
  items_synced: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface OrderLogEntry {
  id: string;
  order_id: string;
  order_number: string | null;
  ultimatepos_sale_id: number | null;
  status: string;
  error_message: string | null;
  pushed_at: string | null;
  retry_count: number;
}

type TabId = 'connection' | 'sync' | 'history';

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'connection', label: 'Connection', icon: Settings },
  { id: 'sync', label: 'Sync & Push', icon: RefreshCw },
  { id: 'history', label: 'History', icon: History },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

function statusChip(status: string): string {
  switch (status) {
    case 'connected':
    case 'success':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200';
    case 'disconnected':
    case 'failed':
      return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
    case 'pending':
      return 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';
    default:
      return 'bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200';
  }
}

function statusDot(status: string): string {
  switch (status) {
    case 'connected':
    case 'success':
      return 'bg-emerald-500';
    case 'disconnected':
    case 'failed':
      return 'bg-rose-500';
    case 'pending':
      return 'bg-amber-500';
    default:
      return 'bg-ink-400';
  }
}

export default function UltimatePosSettings() {
  const [config, setConfig] = useState<UltimatePosConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pushingOrderId, setPushingOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('connection');
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [orderLogs, setOrderLogs] = useState<OrderLogEntry[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  const [formData, setFormData] = useState({
    base_url: '',
    client_id: '',
    client_secret: '',
    api_username: '',
    api_password: '',
    business_id: 1,
    location_id: 1,
    is_enabled: false,
    auto_push_orders: true,
    auto_sync_products: false,
  });

  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('ultimatepos_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      showNotification('error', 'Failed to load UltimatePOS settings');
      return;
    }

    if (data) {
      setConfig(data as UltimatePosConfig);
      setFormData({
        base_url: data.base_url || '',
        client_id: data.client_id || '',
        client_secret: data.client_secret || '',
        api_username: data.api_username || '',
        api_password: data.api_password || '',
        business_id: data.business_id || 1,
        location_id: data.location_id || 1,
        is_enabled: data.is_enabled,
        auto_push_orders: data.auto_push_orders,
        auto_sync_products: data.auto_sync_products,
      });
    }
    setLoading(false);
  }, [showNotification]);

  const fetchSyncLogs = useCallback(async () => {
    const { data } = await supabase
      .from('ultimatepos_sync_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setSyncLogs(data as SyncLogEntry[]);
  }, []);

  const fetchOrderLogs = useCallback(async () => {
    const { data } = await supabase
      .from('ultimatepos_order_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setOrderLogs(data as OrderLogEntry[]);
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchSyncLogs();
    fetchOrderLogs();
  }, [fetchConfig, fetchSyncLogs, fetchOrderLogs]);

  const callEdgeFunction = async (action: string, orderId?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ultimatepos-sync`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, orderId }),
      },
    );
    return resp.json();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ultimatepos_config')
        .update({
          base_url: formData.base_url.replace(/\/+$/, ''),
          client_id: formData.client_id,
          client_secret: formData.client_secret,
          api_username: formData.api_username,
          api_password: formData.api_password,
          business_id: formData.business_id,
          location_id: formData.location_id,
          is_enabled: formData.is_enabled,
          auto_push_orders: formData.auto_push_orders,
          auto_sync_products: formData.auto_sync_products,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

      if (error) throw error;
      showNotification('success', 'Settings saved successfully');
      fetchConfig();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await callEdgeFunction('test_connection');
      if (result.success) {
        showNotification('success', 'Connected to UltimatePOS successfully');
      } else {
        showNotification('error', result.error || 'Connection failed');
      }
      fetchConfig();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncProducts = async () => {
    setSyncing(true);
    try {
      const result = await callEdgeFunction('sync_products');
      if (result.success) {
        showNotification('success', `Synced ${result.itemsSynced} products from UltimatePOS`);
      } else {
        showNotification('error', result.error || 'Product sync failed');
      }
      fetchConfig();
      fetchSyncLogs();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handlePushOrder = async (orderId: string) => {
    setPushingOrderId(orderId);
    try {
      const result = await callEdgeFunction('push_order', orderId);
      if (result.success) {
        showNotification('success', `Order pushed to UltimatePOS (Sale #${result.saleId})`);
      } else {
        showNotification('error', result.error || 'Order push failed');
      }
      fetchOrderLogs();
      fetchConfig();
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushingOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
          <p className="text-ink-500 text-xs tracking-[0.2em] uppercase">Loading</p>
        </div>
      </div>
    );
  }

  const isConnected = config?.connection_status === 'connected';

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-lifted ${
          notification.type === 'success' ? 'bg-emerald-600 text-white'
          : notification.type === 'error' ? 'bg-rose-600 text-white'
          : 'bg-ocean-800 text-white'
        }`}>
          {notification.type === 'success' && <CheckCircle size={18} />}
          {notification.type === 'error' && <AlertCircle size={18} />}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">System</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">UltimatePOS</h1>
            <p className="mt-1 text-sm text-ink-500">
              Sync products from UltimatePOS and push completed sales back.
            </p>
          </div>
          {config && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusChip(config.connection_status)}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot(config.connection_status)} ${config.connection_status === 'connected' ? 'animate-pulse' : ''}`} />
                {config.connection_status === 'connected' ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-ink-100">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 ${
                  active ? 'border-ocean-700 text-ocean-800' : 'border-transparent text-ink-500 hover:text-ink-800'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {/* Connection Tab */}
          {activeTab === 'connection' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
              <form onSubmit={handleSave} className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center gap-2">
                  <Link2 size={18} className="text-ocean-700" />
                  <h2 className="font-display text-lg text-ink-900">Connection Settings</h2>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                      UltimatePOS Installation URL
                    </label>
                    <input
                      type="url"
                      value={formData.base_url}
                      onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                      placeholder="https://your-store.com"
                      className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                    />
                    <p className="mt-1 text-xs text-ink-400">Your UltimatePOS base URL without trailing slash.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Client ID
                      </label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.client_id}
                        onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                        placeholder="OAuth2 client ID"
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Client Secret
                      </label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.client_secret}
                        onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                        placeholder="OAuth2 client secret"
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Username
                      </label>
                      <input
                        type="text"
                        value={formData.api_username}
                        onChange={(e) => setFormData({ ...formData, api_username: e.target.value })}
                        placeholder="UltimatePOS username"
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Password
                      </label>
                      <input
                        type={showSecrets ? 'text' : 'password'}
                        value={formData.api_password}
                        onChange={(e) => setFormData({ ...formData, api_password: e.target.value })}
                        placeholder="UltimatePOS password"
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Business ID
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.business_id}
                        onChange={(e) => setFormData({ ...formData, business_id: parseInt(e.target.value) || 1 })}
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
                        Location ID
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.location_id}
                        onChange={(e) => setFormData({ ...formData, location_id: parseInt(e.target.value) || 1 })}
                        className="w-full rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSecrets(!showSecrets)}
                      className="text-xs font-medium text-ocean-700 hover:text-ocean-800"
                    >
                      {showSecrets ? 'Hide secrets' : 'Show secrets'}
                    </button>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-ink-100 bg-ivory-50 p-4">
                    <label className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Power size={16} className="text-ink-600" />
                        <span className="text-sm font-medium text-ink-800">Enable Integration</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, is_enabled: !formData.is_enabled })}
                        className={`relative h-6 w-11 rounded-full transition ${formData.is_enabled ? 'bg-ocean-700' : 'bg-ink-200'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.is_enabled ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {formData.auto_sync_products ? <Zap size={16} className="text-amber-500" /> : <ZapOff size={16} className="text-ink-400" />}
                        <span className="text-sm font-medium text-ink-800">Auto-sync Products</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, auto_sync_products: !formData.auto_sync_products })}
                        className={`relative h-6 w-11 rounded-full transition ${formData.auto_sync_products ? 'bg-ocean-700' : 'bg-ink-200'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.auto_sync_products ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </label>
                    <label className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {formData.auto_push_orders ? <Zap size={16} className="text-amber-500" /> : <ZapOff size={16} className="text-ink-400" />}
                        <span className="text-sm font-medium text-ink-800">Auto-push Orders</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, auto_push_orders: !formData.auto_push_orders })}
                        className={`relative h-6 w-11 rounded-full transition ${formData.auto_push_orders ? 'bg-ocean-700' : 'bg-ink-200'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${formData.auto_push_orders ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </label>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testing || !formData.base_url || !formData.client_id}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-100 bg-white px-6 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-200 disabled:opacity-50"
                    >
                      {testing ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                      {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Status sidebar */}
              <div className="space-y-4">
                <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft">
                  <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-ink-500">Status</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-ink-500">
                        <Link2 size={14} /> Connection
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusChip(config?.connection_status || 'disconnected')}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(config?.connection_status || 'disconnected')}`} />
                        {config?.connection_status || 'Disconnected'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-ink-500">
                        <Package size={14} /> Last Product Sync
                      </span>
                      <span className="text-xs font-medium text-ink-700">{formatDate(config?.last_product_sync_at ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-ink-500">
                        <ShoppingBag size={14} /> Last Order Push
                      </span>
                      <span className="text-xs font-medium text-ink-700">{formatDate(config?.last_order_push_at ?? null)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-ivory-50 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-xs text-ink-500">
                        <Clock size={14} /> Last Connected
                      </span>
                      <span className="text-xs font-medium text-ink-700">{formatDate(config?.last_connected_at ?? null)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-ocean-100 bg-ocean-50/50 p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <ExternalLink size={14} className="text-ocean-700" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-ocean-800">Setup Guide</h3>
                  </div>
                  <ol className="space-y-1.5 text-xs text-ink-600">
                    <li>1. Install the REST API add-on in UltimatePOS</li>
                    <li>2. Go to Connector &gt; Clients, create a client</li>
                    <li>3. Copy the client ID and secret</li>
                    <li>4. Enter your UltimatePOS username &amp; password</li>
                    <li>5. Set the business and location IDs</li>
                    <li>6. Save and test the connection</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Sync Tab */}
          {activeTab === 'sync' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-2">
                  <Package size={18} className="text-ocean-700" />
                  <h2 className="font-display text-lg text-ink-900">Product Sync</h2>
                </div>
                <p className="mb-4 text-sm text-ink-500">
                  Pull all products from UltimatePOS into the kiosk menu. Existing products are
                  updated by their UltimatePOS ID; new ones are created automatically.
                </p>
                <button
                  onClick={handleSyncProducts}
                  disabled={syncing || !isConnected}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900 disabled:opacity-50"
                >
                  {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {syncing ? 'Syncing...' : 'Sync Products Now'}
                </button>
                {!isConnected && (
                  <p className="mt-2 text-xs text-rose-600">Test the connection first before syncing.</p>
                )}
                <div className="mt-4 rounded-xl bg-ivory-50 px-4 py-3">
                  <p className="text-xs text-ink-500">
                    <Clock size={12} className="mr-1 inline" />
                    Last sync: <span className="font-medium text-ink-700">{formatDate(config?.last_product_sync_at ?? null)}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <div className="mb-4 flex items-center gap-2">
                  <ShoppingBag size={18} className="text-ocean-700" />
                  <h2 className="font-display text-lg text-ink-900">Manual Order Push</h2>
                </div>
                <p className="mb-4 text-sm text-ink-500">
                  Push a completed kiosk order to UltimatePOS as a sale. Only orders with
                  UltimatePOS-linked products can be pushed.
                </p>
                <ManualPushForm onPush={handlePushOrder} pushing={pushingOrderId !== null} pushingId={pushingOrderId} />
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-5">
              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <h2 className="mb-4 flex items-center gap-2 font-display text-lg text-ink-900">
                  <Package size={18} className="text-ocean-700" /> Product Sync History
                </h2>
                {syncLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">No sync history yet</p>
                ) : (
                  <div className="space-y-2">
                    {syncLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 rounded-xl border border-ink-100 px-4 py-3">
                        <span className={`h-2 w-2 rounded-full ${statusDot(log.status)}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink-900 capitalize">{log.sync_type}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusChip(log.status)}`}>
                              {log.status}
                            </span>
                            {log.items_synced > 0 && (
                              <span className="text-xs text-ink-500">{log.items_synced} items</span>
                            )}
                          </div>
                          {log.error_message && (
                            <p className="mt-0.5 text-xs text-rose-600">{log.error_message}</p>
                          )}
                          <p className="mt-0.5 text-xs text-ink-400">{formatDate(log.started_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-soft">
                <h2 className="mb-4 flex items-center gap-2 font-display text-lg text-ink-900">
                  <ShoppingBag size={18} className="text-ocean-700" /> Order Push History
                </h2>
                {orderLogs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-400">No order push history yet</p>
                ) : (
                  <div className="space-y-2">
                    {orderLogs.map((log) => (
                      <div key={log.id} className="flex items-center gap-3 rounded-xl border border-ink-100 px-4 py-3">
                        <span className={`h-2 w-2 rounded-full ${statusDot(log.status)}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink-900 tabular-nums">{log.order_number || log.order_id.slice(0, 8)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusChip(log.status)}`}>
                              {log.status}
                            </span>
                            {log.ultimatepos_sale_id && (
                              <span className="text-xs text-ink-500">Sale #{log.ultimatepos_sale_id}</span>
                            )}
                            {log.retry_count > 0 && (
                              <span className="text-xs text-amber-600">{log.retry_count} retries</span>
                            )}
                          </div>
                          {log.error_message && (
                            <p className="mt-0.5 text-xs text-rose-600">{log.error_message}</p>
                          )}
                          <p className="mt-0.5 text-xs text-ink-400">{formatDate(log.pushed_at)}</p>
                        </div>
                        {log.status === 'failed' && (
                          <button
                            onClick={() => handlePushOrder(log.order_id)}
                            disabled={pushingOrderId === log.order_id}
                            className="inline-flex items-center gap-1 rounded-full border border-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-200"
                          >
                            {pushingOrderId === log.order_id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ManualPushForm({ onPush, pushing, pushingId }: { onPush: (orderId: string) => void; pushing: boolean; pushingId: string | null }) {
  const [orderId, setOrderId] = useState('');
  const [orders, setOrders] = useState<{ id: string; order_number: string; total_price: number; status: string }[]>([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, total_price, status')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setOrders(data);
    };
    fetchOrders();
  }, []);

  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-400">No completed orders to push</p>
      ) : (
        <div className="scroll-soft max-h-64 space-y-1.5 overflow-y-auto">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => onPush(order.id)}
              disabled={pushing}
              className="flex w-full items-center justify-between rounded-xl border border-ink-100 bg-ivory-50 px-4 py-2.5 text-left transition hover:border-ocean-200 hover:bg-ocean-50 disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-medium text-ink-900 tabular-nums">{order.order_number}</p>
                <p className="text-xs text-ink-500">${Number(order.total_price).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-2">
                {pushingId === order.id ? (
                  <Loader2 size={14} className="animate-spin text-ocean-700" />
                ) : (
                  <ArrowRight size={14} className="text-ocean-700" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
