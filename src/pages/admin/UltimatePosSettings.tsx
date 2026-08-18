import { useState, useEffect } from 'react';
import {
  Plug, Save, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Eye, EyeOff, Link2, ArrowRightLeft, Clock, Activity,
} from 'lucide-react';
import {
  getConfig, updateConfig, testConnection, syncProductsFromUltimatePos,
  getOrderLogs, getSyncLogs, type UltimatePosConfig,
} from '../../lib/ultimateposService';

export default function UltimatePosSettings() {
  const [config, setConfig] = useState<UltimatePosConfig | null>(null);
  const [orderLogs, setOrderLogs] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [form, setForm] = useState({
    base_url: '',
    auth_method: 'oauth' as 'oauth' | 'token' | 'password',
    client_id: '',
    client_secret: '',
    api_token: '',
    api_username: '',
    api_password: '',
    business_id: 1,
    location_id: 1,
    is_enabled: false,
    auto_push_orders: true,
    auto_sync_products: false,
  });

  useEffect(() => { loadData(); }, []);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, logs, syncs] = await Promise.all([
        getConfig(),
        getOrderLogs(15),
        getSyncLogs(15),
      ]);
      setConfig(cfg);
      setOrderLogs(logs);
      setSyncLogs(syncs);
      if (cfg) {
        setForm({
          base_url: cfg.base_url || '',
          auth_method: cfg.auth_method || 'oauth',
          client_id: cfg.client_id || '',
          client_secret: cfg.client_secret || '',
          api_token: cfg.api_token || '',
          api_username: cfg.api_username || '',
          api_password: cfg.api_password || '',
          business_id: cfg.business_id || 1,
          location_id: cfg.location_id || 1,
          is_enabled: cfg.is_enabled,
          auto_push_orders: cfg.auto_push_orders,
          auto_sync_products: cfg.auto_sync_products,
        });
      }
    } catch (e: any) {
      showToast('error', 'Failed to load settings: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.base_url.trim()) {
      showToast('error', 'Please enter your UltimatePOS server URL');
      return;
    }
    setSaving(true);
    try {
      await updateConfig({
        base_url: form.base_url.trim().replace(/\/+$/, ''),
        auth_method: form.auth_method,
        client_id: form.client_id,
        client_secret: form.client_secret,
        api_token: form.api_token,
        api_username: form.api_username,
        api_password: form.api_password,
        business_id: Number(form.business_id) || 1,
        location_id: Number(form.location_id) || 1,
        is_enabled: form.is_enabled,
        auto_push_orders: form.auto_push_orders,
        auto_sync_products: form.auto_sync_products,
      });
      showToast('success', 'Settings saved successfully');
      loadData();
    } catch (e: any) {
      showToast('error', 'Failed to save: ' + (e.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!form.base_url.trim()) {
      showToast('error', 'Enter your UltimatePOS URL first');
      return;
    }
    setTesting(true);
    try {
      await handleSave();
      const result = await testConnection();
      showToast('success', result.message || 'Connection successful');
      loadData();
    } catch (e: any) {
      showToast('error', 'Connection failed: ' + (e.message || 'Unknown error'));
      loadData();
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncProductsFromUltimatePos();
      showToast('success', result.message || 'Sync complete');
      loadData();
    } catch (e: any) {
      showToast('error', 'Sync failed: ' + (e.message || 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
      </div>
    );
  }

  const statusBadge = () => {
    const status = config?.connection_status || 'disconnected';
    const colors: Record<string, string> = {
      connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      disconnected: 'bg-ink-50 text-ink-500 border-ink-100',
      error: 'bg-red-50 text-red-700 border-red-200',
    };
    const icons: Record<string, any> = {
      connected: CheckCircle2,
      disconnected: XCircle,
      error: AlertCircle,
    };
    const Icon = icons[status] || XCircle;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colors[status] || colors.disconnected}`}>
        <Icon size={12} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-100 text-ocean-800">
            <Plug size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-900">UltimatePOS Integration</h1>
            <p className="text-sm text-ink-400">Connect kiosk sales to your main POS system</p>
          </div>
        </div>
        {statusBadge()}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
          toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
          toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' :
          'border-blue-200 bg-blue-50 text-blue-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : toast.type === 'error' ? <AlertCircle size={16} /> : <Activity size={16} />}
          {toast.message}
        </div>
      )}

      {/* Connection Settings */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Link2 size={16} className="text-ocean-700" />
            Connection Settings
          </h2>
        </div>
        <div className="space-y-5 p-6">
          {/* Enable toggle */}
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-800">Enable Integration</p>
              <p className="text-xs text-ink-400">Turn on to start pushing sales to UltimatePOS</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, is_enabled: !f.is_enabled }))}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.is_enabled ? 'bg-ocean-700' : 'bg-ink-200'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.is_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          {/* Server URL */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">UltimatePOS Server URL</label>
            <input
              type="url"
              value={form.base_url}
              onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
              placeholder="https://your-ultimatepos-domain.com"
              className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
            />
            <p className="mt-1 text-xs text-ink-400">The base URL of your UltimatePOS installation (without trailing slash)</p>
          </div>

          {/* Auth Method */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-700">Authentication Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['oauth', 'token', 'password'] as const).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, auth_method: method }))}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.auth_method === method
                      ? 'border-ocean-600 bg-ocean-50 text-ocean-800'
                      : 'border-ink-200 bg-white text-ink-500 hover:border-ink-300'
                  }`}
                >
                  {method === 'oauth' ? 'OAuth2' : method === 'token' ? 'API Token' : 'Password'}
                </button>
              ))}
            </div>
          </div>

          {/* OAuth fields */}
          {form.auth_method === 'oauth' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Client ID</label>
                <input
                  type="text"
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Client Secret</label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={form.client_secret}
                    onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                    className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 pr-10 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                  />
                  <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Token field */}
          {form.auth_method === 'token' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Personal Access Token</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.api_token}
                  onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
                  placeholder="Paste your UltimatePOS API token"
                  className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 pr-10 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                />
                <button type="button" onClick={() => setShowSecret(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-400">Generate this from your UltimatePOS admin panel under API settings</p>
            </div>
          )}

          {/* Password grant fields */}
          {form.auth_method === 'password' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">API Username</label>
                <input
                  type="text"
                  value={form.api_username}
                  onChange={e => setForm(f => ({ ...f, api_username: e.target.value }))}
                  className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">API Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.api_password}
                    onChange={e => setForm(f => ({ ...f, api_password: e.target.value }))}
                    className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 pr-10 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Client ID</label>
                <input
                  type="text"
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Client Secret</label>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.client_secret}
                  onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))}
                  className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
                />
              </div>
            </div>
          )}

          {/* Business & Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Business ID</label>
              <input
                type="number"
                value={form.business_id}
                onChange={e => setForm(f => ({ ...f, business_id: Number(e.target.value) }))}
                min={1}
                className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Location ID</label>
              <input
                type="number"
                value={form.location_id}
                onChange={e => setForm(f => ({ ...f, location_id: Number(e.target.value) }))}
                min={1}
                className="w-full rounded-lg border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none transition-colors focus:border-ocean-500 focus:ring-2 focus:ring-ocean-100"
              />
            </div>
          </div>

          {/* Auto push toggle */}
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-800">Auto-push Orders</p>
              <p className="text-xs text-ink-400">Automatically send completed kiosk sales to UltimatePOS</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, auto_push_orders: !f.auto_push_orders }))}
              className={`relative h-6 w-11 rounded-full transition-colors ${form.auto_push_orders ? 'bg-ocean-700' : 'bg-ink-200'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.auto_push_orders ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </label>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-ocean-800 px-4 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-ocean-900 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
            >
              <Activity size={16} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing...' : 'Sync Products'}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Order Pushes */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <ArrowRightLeft size={16} className="text-ocean-700" />
            Recent Order Pushes
          </h2>
        </div>
        <div className="p-6">
          {orderLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No orders have been pushed yet</p>
          ) : (
            <div className="space-y-2">
              {orderLogs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      log.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      log.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {log.status === 'success' ? <CheckCircle2 size={14} /> : log.status === 'failed' ? <XCircle size={14} /> : <Clock size={14} />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink-800">Order #{log.order_number || log.order_id?.slice(0, 8)}</p>
                      {log.error_message && <p className="text-xs text-red-500">{log.error_message}</p>}
                      {log.ultimatepos_sale_id && <p className="text-xs text-emerald-600">Sale ID: {log.ultimatepos_sale_id}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-ink-400">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Sync Logs */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <RefreshCw size={16} className="text-ocean-700" />
            Recent Product Syncs
          </h2>
        </div>
        <div className="p-6">
          {syncLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">No product syncs yet</p>
          ) : (
            <div className="space-y-2">
              {syncLogs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      log.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      log.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {log.status === 'success' ? <CheckCircle2 size={14} /> : log.status === 'failed' ? <XCircle size={14} /> : <Clock size={14} />}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink-800 capitalize">{log.sync_type} sync — {log.status}</p>
                      {log.items_synced !== undefined && log.items_synced > 0 && <p className="text-xs text-ink-400">{log.items_synced} product(s) updated</p>}
                      {log.error_message && <p className="text-xs text-red-500">{log.error_message}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-ink-400">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
