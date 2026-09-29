import { useEffect, useState, useCallback } from 'react';
import {
  KeyRound, Plus, Trash2, Power, Copy, Check, Eye, EyeOff,
  Activity, Clock, ShieldCheck, X, Code, AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface ApiKey {
  id: string;
  name: string;
  consumer_key: string | null;
  permissions: Record<string, string[]>;
  rate_limit: number;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface ApiRequestLog {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string;
  response_time_ms: number;
  created_at: string;
}

interface GeneratedCredentials {
  consumerKey: string;
  consumerSecret: string;
}

const RESOURCES = ['products', 'categories', 'orders', 'customers', 'addons'];
const PERMISSION_LABELS: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  '*': 'Full',
};

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  products: ['read'],
  categories: ['read'],
  orders: ['read', 'write'],
  customers: ['read', 'write'],
  addons: ['read'],
};

type ToastType = { type: 'success' | 'error' | 'info'; text: string } | null;

function generateRandomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashSecret(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function RestApiKeys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState(DEFAULT_PERMISSIONS);
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(1000);
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [generatedCreds, setGeneratedCreds] = useState<GeneratedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<'key' | 'secret' | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [toast, setToast] = useState<ToastType>(null);
  const [activeTab, setActiveTab] = useState<'keys' | 'logs' | 'docs'>('keys');

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [keysRes, logsRes] = await Promise.all([
        supabase.from('api_keys').select('*').order('created_at', { ascending: false }),
        supabase.from('api_requests_log').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      setKeys(keysRes.data || []);
      setLogs(logsRes.data || []);
    } catch {
      showToast('error', 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      showToast('error', 'Please enter a name for the API key');
      return;
    }

    const consumerKey = 'ck_' + generateRandomHex(16);
    const consumerSecret = 'cs_' + generateRandomHex(24);
    const secretHash = await hashSecret(consumerSecret);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('api_keys').insert({
        name: newKeyName.trim(),
        consumer_key: consumerKey,
        consumer_secret: secretHash,
        permissions: newKeyPerms,
        rate_limit: newKeyRateLimit,
        expires_at: newKeyExpiry || null,
        created_by: userData.user?.id || null,
      });

      if (error) throw error;

      setGeneratedCreds({ consumerKey, consumerSecret });
      setShowSecret(true);
      loadData();
      showToast('success', 'API credentials created successfully');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create API credentials');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this API key? Any integrations using it will stop working immediately.')) return;
    try {
      await supabase.from('api_keys').delete().eq('id', id);
      loadData();
      showToast('success', 'API key deleted');
    } catch {
      showToast('error', 'Failed to delete API key');
    }
  };

  const toggleActive = async (key: ApiKey) => {
    try {
      await supabase.from('api_keys').update({ is_active: !key.is_active }).eq('id', key.id);
      loadData();
    } catch {
      showToast('error', 'Failed to toggle key status');
    }
  };

  const copyToClipboard = (text: string, field: 'key' | 'secret') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const closeModal = () => {
    setShowModal(false);
    setNewKeyName('');
    setNewKeyPerms(DEFAULT_PERMISSIONS);
    setNewKeyRateLimit(1000);
    setNewKeyExpiry('');
    setGeneratedCreds(null);
    setShowSecret(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getPermBadge = (perms: string[]) => {
    if (perms.includes('*')) return 'Full';
    return perms.map((p) => PERMISSION_LABELS[p] || p).join(', ');
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-emerald-600';
    if (status >= 400 && status < 500) return 'text-amber-600';
    return 'text-rose-600';
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
          <p className="text-ink-500 text-xs tracking-[0.2em] uppercase">Loading API keys</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Integrations</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">REST API Keys</h1>
            <p className="mt-1 text-sm text-ink-500">
              Generate Consumer Key and Consumer Secret pairs to let external systems access your data.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            <Plus className="h-4 w-4" /> Create key
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-lg">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Total Keys</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{keys.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Active</p>
          <p className="mt-1 font-display text-2xl text-ocean-800 tabular-nums">{keys.filter((k) => k.is_active).length}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Requests (24h)</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">
            {logs.filter((l) => new Date(l.created_at) > new Date(Date.now() - 86400000)).length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-white p-1 shadow-soft ring-1 ring-ink-100">
        {[
          { key: 'keys', label: 'API Keys', icon: KeyRound },
          { key: 'logs', label: 'Request Log', icon: Activity },
          { key: 'docs', label: 'Documentation', icon: Code },
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
        {/* Keys Tab */}
        {activeTab === 'keys' && (
          <motion.div key="keys" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {keys.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                  <KeyRound className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink-700">No API keys yet</p>
                <p className="text-xs text-ink-400">Create an API key to let external systems connect to your data.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {keys.map((key) => (
                  <motion.div
                    key={key.id}
                    layout
                    whileHover={{ y: -2 }}
                    className="group overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition hover:shadow-lifted"
                  >
                    <div className="p-6">
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${key.is_active ? 'bg-ocean-50 text-ocean-800' : 'bg-ink-100 text-ink-400'}`}>
                            <KeyRound className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="font-display text-lg text-ink-900">{key.name}</h3>
                            <p className="font-mono text-xs text-ink-400">{key.consumer_key || '—'}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                          key.is_active
                            ? 'ring-1 ring-inset ring-emerald-400/40 bg-emerald-50 text-emerald-700'
                            : 'ring-1 ring-inset ring-ink-200 bg-ink-50 text-ink-500'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${key.is_active ? 'bg-emerald-500' : 'bg-ink-400'}`} />
                          {key.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="mb-4 flex flex-wrap gap-1.5">
                        {RESOURCES.map((res) => {
                          const perms = key.permissions?.[res];
                          if (!perms || perms.length === 0) return null;
                          return (
                            <span key={res} className="inline-flex items-center gap-1 rounded-full bg-ocean-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ocean-700 ring-1 ring-inset ring-ocean-200">
                              {res}: {getPermBadge(perms)}
                            </span>
                          );
                        })}
                      </div>

                      <div className="mb-4 space-y-1.5 rounded-2xl bg-ivory-100 px-4 py-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-ink-400">Rate limit</span>
                          <span className="font-medium text-ink-700">{key.rate_limit} req/hr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-400">Last used</span>
                          <span className="font-medium text-ink-700">{formatDate(key.last_used_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-400">Created</span>
                          <span className="font-medium text-ink-700">{formatDate(key.created_at)}</span>
                        </div>
                        {key.expires_at && (
                          <div className="flex justify-between">
                            <span className="text-ink-400">Expires</span>
                            <span className="font-medium text-amber-600">{formatDate(key.expires_at)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleActive(key)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition ${
                            key.is_active
                              ? 'border border-rose-200 text-rose-600 hover:bg-rose-50'
                              : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {key.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDelete(key.id)}
                          className="flex items-center justify-center rounded-full border border-ink-100 px-2.5 py-2 text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {logs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                  <Activity className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-ink-700">No API requests logged yet</p>
                <p className="text-xs text-ink-400">Requests made with your API keys will appear here.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-soft">
                <table className="w-full text-sm">
                  <thead className="border-b border-ink-100 bg-ivory-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Endpoint</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Method</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">IP</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider text-ink-400">Duration</th>
                      <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-ivory-50">
                        <td className="px-4 py-3 font-mono text-xs text-ink-700">/{log.endpoint}</td>
                        <td className="px-4 py-3 text-xs font-medium text-ink-600">{log.method}</td>
                        <td className={`px-4 py-3 text-xs font-semibold ${getStatusColor(log.status_code)}`}>{log.status_code}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-500">{log.ip_address}</td>
                        <td className="px-4 py-3 text-right text-xs text-ink-500 tabular-nums">{log.response_time_ms}ms</td>
                        <td className="px-4 py-3 text-xs text-ink-400">{formatDate(log.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Docs Tab */}
        {activeTab === 'docs' && (
          <motion.div key="docs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            <div className="space-y-6">
              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
                  <Code size={18} className="text-ocean-700" />
                  Getting Started
                </h3>
                <div className="space-y-3 text-sm text-ink-600">
                  <p>1. Create an API key using the "Create key" button above. You'll receive a <strong>Consumer Key</strong> and <strong>Consumer Secret</strong> pair.</p>
                  <p>2. Send both credentials with every request. Three methods are supported:
                    <br />&nbsp;&nbsp;a. Headers: <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">X-Consumer-Key</code> and <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">X-Consumer-Secret</code>
                    <br />&nbsp;&nbsp;b. Query params: <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">?consumer_key=ck_...&amp;consumer_secret=cs_...</code>
                    <br />&nbsp;&nbsp;c. HTTP Basic Auth: <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">Authorization: Basic base64(ck_...:cs_...)</code>
                  </p>
                  <p>3. All requests go to <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/rest-api/</code></p>
                  <p>4. For WooCommerce-compatible endpoints (UltimatePOS integration), prefix paths with <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">/wc/v3/</code> — e.g. <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">/wc/v3/products</code>. These return WooCommerce-shaped JSON with <code className="rounded bg-ivory-100 px-1.5 py-0.5 font-mono text-xs text-ocean-800">X-WP-Total</code> pagination headers.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
                  <ShieldCheck size={18} className="text-ocean-700" />
                  Available Endpoints
                </h3>
                <p className="mb-3 text-xs text-ink-500">Two endpoint formats are supported: <strong>Native</strong> (simple JSON) and <strong>WooCommerce-compatible</strong> (prefixed with <code className="rounded bg-ivory-100 px-1 font-mono text-ocean-800">/wc/v3/</code>, returns WooCommerce-shaped responses with <code className="rounded bg-ivory-100 px-1 font-mono text-ocean-800">X-WP-Total</code> headers). Use the WooCommerce format to connect UltimatePOS or any system that speaks the WooCommerce REST API.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-ink-100">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Method</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Endpoint</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink-400">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {[
                        { m: 'GET', e: '/products or /wc/v3/products', d: 'List all products (paginated)' },
                        { m: 'GET', e: '/products/{id} or /wc/v3/products/{id}', d: 'Get a single product' },
                        { m: 'POST', e: '/products or /wc/v3/products', d: 'Create a product' },
                        { m: 'PUT', e: '/products/{id} or /wc/v3/products/{id}', d: 'Update a product' },
                        { m: 'DELETE', e: '/products/{id} or /wc/v3/products/{id}', d: 'Delete a product' },
                        { m: 'GET', e: '/categories or /wc/v3/categories', d: 'List all categories' },
                        { m: 'GET', e: '/orders or /wc/v3/orders', d: 'List all orders with items' },
                        { m: 'GET', e: '/orders/{id} or /wc/v3/orders/{id}', d: 'Get a single order with items' },
                        { m: 'POST', e: '/orders or /wc/v3/orders', d: 'Create an order (with line_items)' },
                        { m: 'PUT', e: '/orders/{id} or /wc/v3/orders/{id}', d: 'Update an order' },
                        { m: 'GET', e: '/customers or /wc/v3/customers', d: 'List all customers (searchable)' },
                        { m: 'GET', e: '/customers/{id} or /wc/v3/customers/{id}', d: 'Get a single customer' },
                        { m: 'POST', e: '/customers or /wc/v3/customers', d: 'Create a customer' },
                        { m: 'PUT', e: '/customers/{id} or /wc/v3/customers/{id}', d: 'Update a customer' },
                        { m: 'DELETE', e: '/customers/{id} or /wc/v3/customers/{id}', d: 'Delete a customer' },
                        { m: 'GET', e: '/addons', d: 'List all addons' },
                        { m: 'POST', e: '/addons', d: 'Create an addon' },
                        { m: 'PUT', e: '/addons/{id}', d: 'Update an addon' },
                        { m: 'DELETE', e: '/addons/{id}', d: 'Delete an addon' },
                      ].map((row) => (
                        <tr key={row.m + row.e}>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              row.m === 'GET' ? 'bg-sky-50 text-sky-700' :
                              row.m === 'POST' ? 'bg-emerald-50 text-emerald-700' :
                              row.m === 'PUT' ? 'bg-amber-50 text-amber-700' :
                              'bg-rose-50 text-rose-700'
                            }`}>{row.m}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-ink-700">{row.e}</td>
                          <td className="px-3 py-2 text-xs text-ink-500">{row.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
                  <Code size={18} className="text-ocean-700" />
                  Example Requests
                </h3>
                <p className="mb-2 text-xs font-semibold text-ink-500">Native format (headers):</p>
                <pre className="mb-4 overflow-x-auto rounded-xl bg-ocean-950 p-4 text-xs text-ivory-100">
{`curl -X GET "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rest-api/products?limit=10" \\
  -H "X-Consumer-Key: ck_your_consumer_key_here" \\
  -H "X-Consumer-Secret: cs_your_consumer_secret_here"`}
                </pre>
                <p className="mb-2 text-xs font-semibold text-ink-500">WooCommerce format (query params — for UltimatePOS):</p>
                <pre className="overflow-x-auto rounded-xl bg-ocean-950 p-4 text-xs text-ivory-100">
{`curl -X GET "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rest-api/wc/v3/products?per_page=10&consumer_key=ck_your_key&consumer_secret=cs_your_secret"`}
                </pre>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-soft">
                <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
                  <AlertCircle size={18} className="text-amber-600" />
                  Query Parameters
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-3">
                    <code className="rounded bg-ivory-100 px-2 py-0.5 font-mono text-xs text-ocean-800 shrink-0">limit</code>
                    <span className="text-ink-500">Number of results per page (default: 50-100, max: 200-500)</span>
                  </div>
                  <div className="flex gap-3">
                    <code className="rounded bg-ivory-100 px-2 py-0.5 font-mono text-xs text-ocean-800 shrink-0">offset</code>
                    <span className="text-ink-500">Number of results to skip for pagination</span>
                  </div>
                  <div className="flex gap-3">
                    <code className="rounded bg-ivory-100 px-2 py-0.5 font-mono text-xs text-ocean-800 shrink-0">status</code>
                    <span className="text-ink-500">Filter orders by status (e.g. pending, completed)</span>
                  </div>
                  <div className="flex gap-3">
                    <code className="rounded bg-ivory-100 px-2 py-0.5 font-mono text-xs text-ocean-800 shrink-0">search</code>
                    <span className="text-ink-500">Search customers by name, email, or phone</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Key Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/50 backdrop-blur-sm p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
            >
              {generatedCreds ? (
                <div>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <Check className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-lg font-semibold text-ink-900">Credentials Created</h2>
                      <p className="text-xs text-ink-500">Copy these now. The Consumer Secret won't be shown again.</p>
                    </div>
                  </div>

                  {/* Consumer Key */}
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Consumer Key</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={generatedCreds.consumerKey}
                        readOnly
                        className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 pr-12 font-mono text-sm text-ink-900 outline-none"
                      />
                      <button
                        onClick={() => copyToClipboard(generatedCreds.consumerKey, 'key')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                      >
                        {copiedField === 'key' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Consumer Secret */}
                  <div className="mb-4">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500">Consumer Secret</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={generatedCreds.consumerSecret}
                        readOnly
                        className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 pr-16 font-mono text-sm text-ink-900 outline-none"
                      />
                      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        >
                          {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(generatedCreds.consumerSecret, 'secret')}
                          className="rounded p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                        >
                          {copiedField === 'secret' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                    <p className="text-xs text-amber-800">
                      <strong>Important:</strong> Store these credentials securely. The Consumer Secret is only shown once at creation. You can still manage permissions and revoke the key later.
                    </p>
                  </div>

                  <button
                    onClick={closeModal}
                    className="w-full rounded-lg bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                        <KeyRound className="h-5 w-5" />
                      </div>
                      <h2 className="font-display text-lg font-semibold text-ink-900">Create API Key</h2>
                    </div>
                    <button onClick={closeModal} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Key Name</label>
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="e.g. External POS, Mobile App, Webhook"
                        className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Permissions</label>
                      <div className="space-y-2 rounded-lg border border-ink-100 p-3">
                        {RESOURCES.map((res) => (
                          <div key={res} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-ink-700">{res}</span>
                            <div className="flex gap-1">
                              {['read', 'write', '*'].map((perm) => {
                                const active = (newKeyPerms[res] || []).includes(perm);
                                return (
                                  <button
                                    key={perm}
                                    type="button"
                                    onClick={() => {
                                      const current = newKeyPerms[res] || [];
                                      const updated = active
                                        ? current.filter((p) => p !== perm)
                                        : [...current, perm];
                                      setNewKeyPerms({ ...newKeyPerms, [res]: updated });
                                    }}
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                                      active
                                        ? 'bg-ocean-800 text-white'
                                        : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                                    }`}
                                  >
                                    {PERMISSION_LABELS[perm]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Rate Limit (req/hr)</label>
                        <input
                          type="number"
                          value={newKeyRateLimit}
                          onChange={(e) => setNewKeyRateLimit(parseInt(e.target.value) || 0)}
                          min="1"
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">Expires (optional)</label>
                        <input
                          type="date"
                          value={newKeyExpiry}
                          onChange={(e) => setNewKeyExpiry(e.target.value)}
                          className="w-full rounded-lg border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-500 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCreate}
                      className="w-full rounded-lg bg-ocean-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900"
                    >
                      Generate Consumer Key & Secret
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
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
