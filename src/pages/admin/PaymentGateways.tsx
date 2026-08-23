import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Plus, Power, QrCode, Star, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type PaymentGateway = Database['public']['Tables']['payment_gateways']['Row'];

const GATEWAY_TYPES = [
  { value: 'bml', label: 'BML QPOS', subtitle: 'QR code payments via Bank of Maldives', icon: QrCode },
  { value: 'paypal', label: 'PayPal', subtitle: 'Card & wallet via PayPal checkout', icon: CreditCard },
  { value: 'skrill', label: 'Skrill', subtitle: 'International card & wallet payments', icon: CreditCard },
];

const EMPTY_FORM = {
  name: '',
  gateway_type: 'bml',
  is_active: false,
  is_default: false,
  display_order: 0,
};

const EMPTY_CONFIG: Record<string, string> = {
  environment: 'production',
  currency: 'MVR',
  merchant_id: '',
  account_number: '',
  access_key: '',
};

const EMPTY_GATEWAY = {
  client_id: '',
  client_secret: '',
  sandbox_client_id: '',
  sandbox_client_secret: '',
  use_sandbox: false,
  merchant_email: '',
  api_password: '',
  webhook_secret: '',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-ocean-800' : 'bg-ink-200'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function PaymentGateways() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [configFields, setConfigFields] = useState<Record<string, string>>(EMPTY_CONFIG);
  const [gatewayFields, setGatewayFields] = useState(EMPTY_GATEWAY);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchGateways(); }, []);

  const fetchGateways = async () => {
    setLoading(true);
    const { data } = await supabase.from('payment_gateways').select('*').order('display_order', { ascending: true });
    if (data) setGateways(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanConfig = Object.fromEntries(Object.entries(configFields).filter(([, v]) => v !== ''));
    const cleanGatewayFields = Object.fromEntries(Object.entries(gatewayFields).filter(([, v]) => v !== ''));

    if (editingGateway) {
      await supabase.from('payment_gateways').update({
        ...formData, ...cleanGatewayFields, config: cleanConfig, updated_at: new Date().toISOString(),
      }).eq('id', editingGateway.id);
    } else {
      await supabase.from('payment_gateways').insert({ ...formData, ...cleanGatewayFields, config: cleanConfig });
    }
    resetForm();
    fetchGateways();
  };

  const handleEdit = (g: PaymentGateway) => {
    setEditingGateway(g);
    setFormData({ name: g.name, gateway_type: g.gateway_type, is_active: g.is_active, is_default: g.is_default, display_order: g.display_order });
    const cfg = (g.config as Record<string, string>) || {};
    setConfigFields({ environment: cfg.environment || 'production', currency: cfg.currency || 'MVR', merchant_id: cfg.merchant_id || '', account_number: cfg.account_number || '', access_key: cfg.access_key || '' });
    setGatewayFields({
      client_id: g.client_id || '', client_secret: g.client_secret || '',
      sandbox_client_id: g.sandbox_client_id || '', sandbox_client_secret: g.sandbox_client_secret || '',
      use_sandbox: g.use_sandbox || false, merchant_email: g.merchant_email || '',
      api_password: g.api_password || '', webhook_secret: g.webhook_secret || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this gateway?')) return;
    await supabase.from('payment_gateways').delete().eq('id', id);
    fetchGateways();
  };

  const toggleActive = async (g: PaymentGateway) => {
    await supabase.from('payment_gateways').update({ is_active: !g.is_active, updated_at: new Date().toISOString() }).eq('id', g.id);
    fetchGateways();
  };

  const setAsDefault = async (g: PaymentGateway) => {
    await supabase.from('payment_gateways').update({ is_default: false });
    await supabase.from('payment_gateways').update({ is_default: true, is_active: true, updated_at: new Date().toISOString() }).eq('id', g.id);
    fetchGateways();
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingGateway(null);
    setFormData(EMPTY_FORM);
    setConfigFields({ ...EMPTY_CONFIG });
    setGatewayFields({ ...EMPTY_GATEWAY });
  };

  const activeCount = gateways.filter((g) => g.is_active).length;
  const defaultGateway = gateways.find((g) => g.is_default);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Finance</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Payment Gateways</h1>
            <p className="mt-1 text-sm text-ink-500">Configure and manage payment processing channels.</p>
          </div>
          <button
            onClick={() => { setEditingGateway(null); setFormData(EMPTY_FORM); setConfigFields({ ...EMPTY_CONFIG }); setGatewayFields({ ...EMPTY_GATEWAY }); setShowModal(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            <Plus className="h-4 w-4" /> Add gateway
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-sm">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Total</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{gateways.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Active</p>
          <p className="mt-1 font-display text-2xl text-ocean-800 tabular-nums">{activeCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-3xl border border-ink-100 bg-white" />)}
        </div>
      ) : gateways.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
            <CreditCard className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-ink-700">No gateways configured</p>
          <p className="text-xs text-ink-400">Add a payment gateway to start accepting payments.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {gateways.map((gateway) => {
            const typeInfo = GATEWAY_TYPES.find((t) => t.value === gateway.gateway_type);
            const Icon = typeInfo?.icon || CreditCard;
            return (
              <motion.div
                key={gateway.id}
                layout
                whileHover={{ y: -2 }}
                className="group overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition hover:shadow-lifted"
              >
                <div className="p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${gateway.is_active ? 'bg-ocean-50 text-ocean-800' : 'bg-ink-100 text-ink-400'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-ink-900">{gateway.name}</h3>
                        <p className="text-xs text-ink-400">{typeInfo?.subtitle || gateway.gateway_type}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      gateway.is_active
                        ? 'ring-1 ring-inset ring-emerald-400/40 bg-emerald-50 text-emerald-700'
                        : 'ring-1 ring-inset ring-ink-200 bg-ink-50 text-ink-500'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${gateway.is_active ? 'bg-emerald-500' : 'bg-ink-400'}`} />
                      {gateway.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {gateway.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-300/50">
                        <Star className="h-2.5 w-2.5" />
                        Default
                      </span>
                    )}
                    {gateway.gateway_type === 'bml' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-ocean-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ocean-700 ring-1 ring-inset ring-ocean-200">
                        <QrCode className="h-2.5 w-2.5" />
                        QR
                      </span>
                    )}
                  </div>

                  {gateway.gateway_type === 'bml' && (() => {
                    const cfg = (gateway.config as Record<string, string>) || {};
                    return cfg.merchant_id ? (
                      <div className="mb-4 rounded-2xl bg-ivory-100 px-4 py-3 space-y-1.5">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Account Number</p>
                          <p className="mt-0.5 font-mono text-xs text-ink-700">{cfg.account_number || <span className="text-amber-600 not-italic">Not set — edit to add</span>}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Merchant ID</p>
                          <p className="mt-0.5 font-mono text-xs text-ink-500 truncate">{cfg.merchant_id}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Environment</p>
                          <p className="mt-0.5 text-xs capitalize text-ink-700">{cfg.environment || 'production'}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700 ring-1 ring-inset ring-amber-200">
                        Merchant ID not configured — edit to add credentials.
                      </div>
                    );
                  })()}

                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleActive(gateway)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition ${
                        gateway.is_active
                          ? 'border border-rose-200 text-rose-600 hover:bg-rose-50'
                          : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {gateway.is_active ? 'Disable' : 'Enable'}
                    </button>
                    {!gateway.is_default && gateway.is_active && (
                      <button
                        onClick={() => setAsDefault(gateway)}
                        className="flex items-center justify-center gap-1 rounded-full border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                        title="Set as default"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(gateway)}
                      className="flex items-center justify-center gap-1 rounded-full border border-ink-100 px-3 py-2 text-xs font-medium text-ink-700 transition hover:border-ocean-200 hover:text-ocean-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(gateway.id)}
                      className="flex items-center justify-center rounded-full border border-ink-100 px-2.5 py-2 text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {defaultGateway && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-ocean-100 bg-ocean-50/50 px-5 py-4">
          <Star className="mt-0.5 h-4 w-4 shrink-0 text-ocean-700" />
          <div>
            <p className="text-sm font-medium text-ocean-900">
              <span className="font-semibold">{defaultGateway.name}</span> is the default gateway
            </p>
            <p className="text-xs text-ocean-700">All new payment transactions will be routed through this gateway.</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={resetForm}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Gateway</p>
                  <h2 className="font-display text-2xl text-ink-900">
                    {editingGateway ? 'Edit gateway' : 'New gateway'}
                  </h2>
                </div>
                <button onClick={resetForm} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto scroll-soft">
                <div className="space-y-4 px-6 py-5">
                  <Field label="Gateway name">
                    <TextInput value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} placeholder="e.g. BML QPOS" required />
                  </Field>

                  <Field label="Gateway type">
                    <div className="grid grid-cols-3 gap-2">
                      {GATEWAY_TYPES.map((t) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, gateway_type: t.value })}
                            className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
                              formData.gateway_type === t.value
                                ? 'border-ocean-700 bg-ocean-50 text-ocean-800'
                                : 'border-ink-100 text-ink-500 hover:border-ink-200'
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                            <span className="text-xs font-semibold">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <div className="rounded-2xl border border-ink-100 p-4">
                    <p className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-400">
                      {formData.gateway_type === 'bml' ? 'BML QPOS credentials' : formData.gateway_type === 'paypal' ? 'PayPal credentials' : 'Skrill credentials'}
                    </p>

                    {formData.gateway_type === 'bml' && (
                      <div className="space-y-3">
                        <Field label="Merchant ID">
                          <TextInput value={configFields.merchant_id} onChange={(v) => setConfigFields({ ...configFields, merchant_id: v })} placeholder="e.g. 4b6696e2-826f-453c-a243-..." required />
                        </Field>
                        <Field label="Account Number">
                          <TextInput value={configFields.account_number} onChange={(v) => setConfigFields({ ...configFields, account_number: v })} placeholder="Your BML merchant account number" required />
                          <p className="mt-1 px-1 text-[11px] text-ink-400">The account number shown to customers in the BML app when they scan the QR code.</p>
                        </Field>
                        <Field label="API Access Key">
                          <TextInput type="password" value={configFields.access_key} onChange={(v) => setConfigFields({ ...configFields, access_key: v })} placeholder="Your BML API Access Key" required />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Currency">
                            <select
                              value={configFields.currency}
                              onChange={(e) => setConfigFields({ ...configFields, currency: e.target.value })}
                              className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                            >
                              <option value="MVR">MVR — Rufiyaa</option>
                              <option value="USD">USD — US Dollar</option>
                            </select>
                          </Field>
                          <Field label="Environment">
                            <select
                              value={configFields.environment}
                              onChange={(e) => setConfigFields({ ...configFields, environment: e.target.value })}
                              className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                            >
                              <option value="production">Production</option>
                              <option value="sandbox">Sandbox</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    )}

                    {formData.gateway_type === 'paypal' && (
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
                          <div>
                            <p className="text-sm font-medium text-ink-900">Use Sandbox</p>
                            <p className="text-xs text-ink-500">Enable for testing mode</p>
                          </div>
                          <Toggle checked={gatewayFields.use_sandbox} onChange={(v) => setGatewayFields({ ...gatewayFields, use_sandbox: v })} />
                        </label>
                        {gatewayFields.use_sandbox ? (
                          <>
                            <Field label="Sandbox Client ID">
                              <TextInput value={gatewayFields.sandbox_client_id} onChange={(v) => setGatewayFields({ ...gatewayFields, sandbox_client_id: v })} placeholder="Sandbox Client ID" required />
                            </Field>
                            <Field label="Sandbox Client Secret">
                              <TextInput type="password" value={gatewayFields.sandbox_client_secret} onChange={(v) => setGatewayFields({ ...gatewayFields, sandbox_client_secret: v })} placeholder="Sandbox Secret" required />
                            </Field>
                          </>
                        ) : (
                          <>
                            <Field label="Live Client ID">
                              <TextInput value={gatewayFields.client_id} onChange={(v) => setGatewayFields({ ...gatewayFields, client_id: v })} placeholder="Live Client ID" required />
                            </Field>
                            <Field label="Live Client Secret">
                              <TextInput type="password" value={gatewayFields.client_secret} onChange={(v) => setGatewayFields({ ...gatewayFields, client_secret: v })} placeholder="Live Secret" required />
                            </Field>
                          </>
                        )}
                        <Field label="Currency">
                          <TextInput value={configFields.currency} onChange={(v) => setConfigFields({ ...configFields, currency: v })} placeholder="USD" />
                        </Field>
                        <Field label="Webhook Secret (optional)">
                          <TextInput type="password" value={gatewayFields.webhook_secret} onChange={(v) => setGatewayFields({ ...gatewayFields, webhook_secret: v })} placeholder="Webhook Secret" />
                        </Field>
                      </div>
                    )}

                    {formData.gateway_type === 'skrill' && (
                      <div className="space-y-3">
                        <Field label="Merchant Email">
                          <TextInput type="email" value={gatewayFields.merchant_email} onChange={(v) => setGatewayFields({ ...gatewayFields, merchant_email: v })} placeholder="merchant@example.com" required />
                        </Field>
                        <Field label="API / MQI Password (optional)">
                          <TextInput type="password" value={gatewayFields.api_password} onChange={(v) => setGatewayFields({ ...gatewayFields, api_password: v })} placeholder="MQI Password" />
                        </Field>
                        <Field label="Currency">
                          <TextInput value={configFields.currency} onChange={(v) => setConfigFields({ ...configFields, currency: v })} placeholder="USD" />
                        </Field>
                      </div>
                    )}
                  </div>

                  <Field label="Display order">
                    <input
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                    />
                  </Field>

                  <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
                    <div>
                      <p className="text-sm font-medium text-ink-900">Active</p>
                      <p className="text-xs text-ink-500">Accept payments through this gateway</p>
                    </div>
                    <Toggle checked={formData.is_active} onChange={(v) => setFormData({ ...formData, is_active: v })} />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
                    <div>
                      <p className="text-sm font-medium text-ink-900">Set as default</p>
                      <p className="text-xs text-ink-500">Route all new transactions here</p>
                    </div>
                    <Toggle checked={formData.is_default} onChange={(v) => setFormData({ ...formData, is_default: v })} />
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900">
                      {editingGateway ? 'Update gateway' : 'Create gateway'}
                    </button>
                    <button type="button" onClick={resetForm} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
