import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Key,
  Plus,
  Download,
  Ban,
  CheckCircle,
  Copy,
  Trash2,
  Upload,
  Package,
  Shield,
  AlertCircle,
  X,
} from 'lucide-react';

interface SoftwareModule {
  key: string;
  display_name: string;
  description: string;
  category: string;
  is_core: boolean;
  price: number;
}

interface PackTier {
  id: string;
  name: string;
  display_name: string;
  max_products: number;
  max_categories: number;
  max_addons: number;
  price: number;
}

interface ActivationKey {
  id: string;
  key_code: string;
  product_name: string;
  modules: string[];
  pack_tier: string;
  max_products: number;
  customer_name: string;
  customer_email: string;
  max_activations: number;
  activation_count: number;
  expires_at: string | null;
  is_revoked: boolean;
  notes: string;
  created_at: string;
}

function generateKeyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = '';
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 5; i++) {
      seg += alphabet[bytes[i] % alphabet.length];
    }
    segments.push(seg);
  }
  return segments.join('-');
}

export default function ActivationKeys() {
  const [keys, setKeys] = useState<ActivationKey[]>([]);
  const [modules, setModules] = useState<SoftwareModule[]>([]);
  const [tiers, setTiers] = useState<PackTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemMessage, setRedeemMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    product_name: 'Kiosk Suite',
    customer_name: '',
    customer_email: '',
    modules: [] as string[],
    pack_tier: '',
    max_products: 0,
    max_activations: 1,
    expires_at: '',
    notes: '',
  });

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [k, m, t] = await Promise.all([
      supabase.from('activation_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('software_modules').select('*').order('category'),
      supabase.from('product_pack_tiers').select('*').eq('is_active', true).order('display_order'),
    ]);
    setKeys(k.data || []);
    setModules(m.data || []);
    setTiers(t.data || []);
    setLoading(false);
  }

  function toggleModule(key: string) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(key) ? f.modules.filter((x) => x !== key) : [...f.modules, key],
    }));
  }

  function applyTier(tierName: string) {
    const t = tiers.find((x) => x.name === tierName);
    setForm((f) => ({
      ...f,
      pack_tier: tierName,
      max_products: t ? t.max_products : f.max_products,
    }));
  }

  async function createKey() {
    if (form.modules.length === 0) {
      alert('Select at least one module to include in this license.');
      return;
    }

    const key_code = generateKeyCode();
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      key_code,
      product_name: form.product_name.trim() || 'Kiosk Suite',
      modules: form.modules,
      pack_tier: form.pack_tier || '',
      max_products: Number(form.max_products) || 0,
      customer_name: form.customer_name.trim(),
      customer_email: form.customer_email.trim(),
      max_activations: Math.max(1, Number(form.max_activations) || 1),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      notes: form.notes.trim(),
      created_by: user?.id || null,
    };

    const { data, error } = await supabase
      .from('activation_keys')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error || !data) {
      alert('Failed to create license: ' + (error?.message || 'unknown'));
      return;
    }

    setShowCreate(false);
    setForm({
      product_name: 'Kiosk Suite',
      customer_name: '',
      customer_email: '',
      modules: [],
      pack_tier: '',
      max_products: 0,
      max_activations: 1,
      expires_at: '',
      notes: '',
    });
    await loadAll();
    downloadLicenseFile(data);
  }

  function downloadLicenseFile(k: ActivationKey) {
    const payload = {
      format: 'kiosk-license-v1',
      key_code: k.key_code,
      product: k.product_name,
      modules: k.modules,
      pack_tier: k.pack_tier,
      max_products: k.max_products,
      customer: { name: k.customer_name, email: k.customer_email },
      max_activations: k.max_activations,
      issued_at: k.created_at,
      expires_at: k.expires_at,
    };

    const text =
      `# ================================\n` +
      `# KIOSK SUITE LICENSE\n` +
      `# ================================\n` +
      `# Product: ${k.product_name}\n` +
      `# Customer: ${k.customer_name || 'N/A'}\n` +
      `# Email: ${k.customer_email || 'N/A'}\n` +
      `# Pack Tier: ${k.pack_tier || 'N/A'}\n` +
      `# Max Products: ${k.max_products || 'Unlimited'}\n` +
      `# Modules: ${k.modules.join(', ')}\n` +
      `# Issued: ${new Date(k.created_at).toLocaleString()}\n` +
      `# Expires: ${k.expires_at ? new Date(k.expires_at).toLocaleString() : 'Never'}\n` +
      `# ================================\n\n` +
      `KEY: ${k.key_code}\n\n` +
      `--- PAYLOAD ---\n` +
      btoa(JSON.stringify(payload)) +
      `\n--- END ---\n`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (k.customer_name || 'customer').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    a.href = url;
    a.download = `license_${safeName}_${k.key_code.split('-')[0]}.key`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleRevoke(k: ActivationKey) {
    const { error } = await supabase
      .from('activation_keys')
      .update({ is_revoked: !k.is_revoked })
      .eq('id', k.id);
    if (error) return alert(error.message);
    loadAll();
  }

  async function deleteKey(k: ActivationKey) {
    if (!confirm(`Delete license ${k.key_code}? This cannot be undone.`)) return;
    const { error } = await supabase.from('activation_keys').delete().eq('id', k.id);
    if (error) return alert(error.message);
    loadAll();
  }

  async function copyKey(k: ActivationKey) {
    await navigator.clipboard.writeText(k.key_code);
    setCopiedId(k.id);
    setTimeout(() => setCopiedId(null), 1200);
  }

  async function redeemKey() {
    setRedeemMessage(null);
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;

    const { data: keyRow, error: keyErr } = await supabase
      .from('activation_keys')
      .select('*')
      .eq('key_code', code)
      .maybeSingle();

    if (keyErr || !keyRow) {
      setRedeemMessage({ type: 'error', text: 'License key not found.' });
      return;
    }
    if (keyRow.is_revoked) {
      setRedeemMessage({ type: 'error', text: 'This license has been revoked.' });
      return;
    }
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      setRedeemMessage({ type: 'error', text: 'This license has expired.' });
      return;
    }
    if (keyRow.activation_count >= keyRow.max_activations) {
      setRedeemMessage({ type: 'error', text: 'Activation limit reached for this license.' });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const installation_id = (window.localStorage.getItem('installation_id') ||
      (() => {
        const id = crypto.randomUUID();
        window.localStorage.setItem('installation_id', id);
        return id;
      })());

    const rows = keyRow.modules.map((m: string) => ({
      module_key: m,
      activation_key_id: keyRow.id,
      installation_id,
      activated_by: user?.id || null,
      is_active: true,
    }));

    const { error: insErr } = await supabase.from('module_activations').insert(rows);
    if (insErr) {
      setRedeemMessage({ type: 'error', text: 'Activation failed: ' + insErr.message });
      return;
    }

    await supabase
      .from('activation_keys')
      .update({ activation_count: keyRow.activation_count + 1 })
      .eq('id', keyRow.id);

    setRedeemMessage({
      type: 'success',
      text: `Successfully activated ${keyRow.modules.length} module(s).`,
    });
    setRedeemCode('');
    loadAll();
  }

  const modulesByCategory = modules.reduce<Record<string, SoftwareModule[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Key className="w-8 h-8 text-emerald-600" />
            License & Activation Keys
          </h1>
          <p className="text-slate-600 mt-1">
            Generate activation keys to sell individual modules and product pack tiers.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRedeem(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Upload className="w-4 h-4" /> Redeem Key
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Generate License
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Licenses" value={keys.length} color="emerald" icon={<Key className="w-5 h-5" />} />
        <StatCard
          label="Active"
          value={keys.filter((k) => !k.is_revoked).length}
          color="blue"
          icon={<CheckCircle className="w-5 h-5" />}
        />
        <StatCard
          label="Revoked"
          value={keys.filter((k) => k.is_revoked).length}
          color="rose"
          icon={<Ban className="w-5 h-5" />}
        />
        <StatCard
          label="Modules Available"
          value={modules.length}
          color="amber"
          icon={<Package className="w-5 h-5" />}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Key</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Modules</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Tier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Usage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Expires</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Loading licenses...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No licenses yet. Click "Generate License" to create your first activation key.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-slate-100 text-slate-800 px-2 py-1 rounded">
                          {k.key_code}
                        </code>
                        <button
                          onClick={() => copyKey(k)}
                          className="text-slate-400 hover:text-emerald-600"
                          title="Copy"
                        >
                          {copiedId === k.id ? (
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{k.product_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{k.customer_name || '-'}</div>
                      <div className="text-xs text-slate-500">{k.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {k.modules.slice(0, 4).map((m) => (
                          <span
                            key={m}
                            className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded"
                          >
                            {m}
                          </span>
                        ))}
                        {k.modules.length > 4 && (
                          <span className="text-xs text-slate-500">+{k.modules.length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {k.pack_tier ? (
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded uppercase">
                          {k.pack_tier} · {k.max_products || '∞'} products
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {k.activation_count} / {k.max_activations}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      {k.is_revoked ? (
                        <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded">
                          Revoked
                        </span>
                      ) : (
                        <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => downloadLicenseFile(k)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded"
                          title="Download .key file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleRevoke(k)}
                          className={`p-1.5 rounded hover:bg-slate-100 ${
                            k.is_revoked ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                          title={k.is_revoked ? 'Reactivate' : 'Revoke'}
                        >
                          {k.is_revoked ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteKey(k)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <Modal onClose={() => setShowCreate(false)} title="Generate License Key" icon={<Shield className="w-5 h-5 text-emerald-600" />}>
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Product Name">
                <input
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                />
              </Field>
              <Field label="Max Activations">
                <input
                  type="number"
                  min={1}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.max_activations}
                  onChange={(e) => setForm({ ...form, max_activations: Number(e.target.value) })}
                />
              </Field>
              <Field label="Customer Name">
                <input
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                />
              </Field>
              <Field label="Customer Email">
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.customer_email}
                  onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                />
              </Field>
              <Field label="Product Pack Tier (optional)">
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.pack_tier}
                  onChange={(e) => applyTier(e.target.value)}
                >
                  <option value="">- None -</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.display_name} · up to {t.max_products} products
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Max Products (override)">
                <input
                  type="number"
                  min={0}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.max_products}
                  onChange={(e) => setForm({ ...form, max_products: Number(e.target.value) })}
                />
              </Field>
              <Field label="Expires On (optional)">
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </Field>
              <Field label="Notes">
                <input
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">Modules to License</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, modules: modules.map((m) => m.key) }))}
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, modules: [] }))}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="space-y-3 max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
                {Object.entries(modulesByCategory).map(([cat, list]) => (
                  <div key={cat}>
                    <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">
                      {cat}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {list.map((m) => (
                        <label
                          key={m.key}
                          className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${
                            form.modules.includes(m.key)
                              ? 'bg-emerald-50 border-emerald-300'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={form.modules.includes(m.key)}
                            onChange={() => toggleModule(m.key)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {m.display_name}
                              {m.is_core && (
                                <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded">
                                  core
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{m.description}</div>
                            {m.price > 0 && (
                              <div className="text-xs text-emerald-700 font-medium mt-0.5">${m.price}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
              >
                <Key className="w-4 h-4" /> Generate & Download
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showRedeem && (
        <Modal onClose={() => { setShowRedeem(false); setRedeemMessage(null); }} title="Redeem License Key" icon={<Upload className="w-5 h-5 text-blue-600" />}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter a license key to activate its modules on this installation.
            </p>
            <input
              autoFocus
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              className="w-full font-mono tracking-wider text-center px-3 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            {redeemMessage && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                  redeemMessage.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-800'
                }`}
              >
                {redeemMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 mt-0.5" />
                )}
                {redeemMessage.text}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowRedeem(false); setRedeemMessage(null); }}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={redeemKey}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Activate
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'blue' | 'rose' | 'amber';
  icon: React.ReactNode;
}) {
  const map = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  children,
  onClose,
  title,
  icon,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
