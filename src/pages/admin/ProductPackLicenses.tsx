import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ShieldCheck, ShieldAlert, ShieldX, Plus, Trash2, RefreshCw,
  Clock, Calendar, KeyRound, Copy, CheckCircle, AlertCircle,
  Search, Eye, XCircle, Power, History, Ban
} from 'lucide-react';

interface License {
  id: string;
  pack_id: string | null;
  pack_name: string;
  license_key: string;
  licensed_to: string;
  issued_by: string;
  issued_at: string;
  activated_at: string | null;
  starts_at: string;
  expires_at: string;
  grace_period_days: number;
  status: 'active' | 'expired' | 'revoked' | 'suspended' | 'pending';
  max_activations: number;
  current_activations: number;
  device_fingerprint: string;
  features: Record<string, unknown>;
  notes: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  days_remaining?: number;
  is_expired?: boolean;
  is_past_grace?: boolean;
}

interface LicenseEvent {
  id: string;
  license_id: string;
  event_type: string;
  event_message: string;
  event_meta: Record<string, unknown>;
  created_at: string;
}

interface ProductPackOption {
  id: string;
  name: string;
  version: string;
}

function generateLicenseKey(): string {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PPK-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ProductPackLicenses() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [packs, setPacks] = useState<ProductPackOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [showCreate, setShowCreate] = useState(false);
  const [showView, setShowView] = useState(false);
  const [selected, setSelected] = useState<License | null>(null);
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [form, setForm] = useState({
    pack_id: '',
    pack_name: '',
    licensed_to: '',
    issued_by: '',
    starts_at: new Date().toISOString().slice(0, 10),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    grace_period_days: 7,
    max_activations: 1,
    notes: '',
    features: '{}',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchLicenses(), fetchPacks()]);
    setLoading(false);
  };

  const fetchLicenses = async () => {
    const { data, error } = await supabase
      .from('product_pack_licenses_view')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setLicenses(data as License[]);
  };

  const fetchPacks = async () => {
    const { data } = await supabase
      .from('product_packs')
      .select('id, name, version')
      .order('created_at', { ascending: false });
    if (data) setPacks(data);
  };

  const fetchEvents = async (licenseId: string) => {
    const { data } = await supabase
      .from('product_pack_license_events')
      .select('*')
      .eq('license_id', licenseId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setEvents(data);
  };

  const notify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      notify('error', 'Failed to copy');
    }
  };

  const logEvent = async (license_id: string, event_type: string, event_message = '', meta: Record<string, unknown> = {}) => {
    await supabase.from('product_pack_license_events').insert({
      license_id,
      event_type,
      event_message,
      event_meta: meta,
    });
  };

  const handleCreate = async () => {
    if (!form.licensed_to.trim()) {
      notify('error', 'Licensed To is required');
      return;
    }
    if (!form.expires_at) {
      notify('error', 'Expiry date is required');
      return;
    }

    let featuresParsed: Record<string, unknown> = {};
    try {
      featuresParsed = form.features.trim() ? JSON.parse(form.features) : {};
    } catch {
      notify('error', 'Features must be valid JSON');
      return;
    }

    const pack = packs.find(p => p.id === form.pack_id);
    const licenseKey = generateLicenseKey();

    const { data, error } = await supabase
      .from('product_pack_licenses')
      .insert({
        pack_id: form.pack_id || null,
        pack_name: pack?.name || form.pack_name || 'External Pack',
        license_key: licenseKey,
        licensed_to: form.licensed_to,
        issued_by: form.issued_by,
        starts_at: new Date(form.starts_at).toISOString(),
        expires_at: new Date(form.expires_at).toISOString(),
        grace_period_days: form.grace_period_days,
        max_activations: form.max_activations,
        features: featuresParsed,
        notes: form.notes,
        status: 'active',
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      notify('error', error?.message || 'Failed to create license');
      return;
    }

    await logEvent(data.id, 'issued', `License issued to ${form.licensed_to}`);
    notify('success', 'License created successfully');
    setShowCreate(false);
    setForm({
      pack_id: '',
      pack_name: '',
      licensed_to: '',
      issued_by: '',
      starts_at: new Date().toISOString().slice(0, 10),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      grace_period_days: 7,
      max_activations: 1,
      notes: '',
      features: '{}',
    });
    fetchLicenses();
  };

  const handleDelete = async (lic: License) => {
    if (!confirm(`Delete license ${lic.license_key}? This cannot be undone.`)) return;
    const { error } = await supabase.from('product_pack_licenses').delete().eq('id', lic.id);
    if (error) { notify('error', error.message); return; }
    notify('success', 'License deleted');
    fetchLicenses();
  };

  const handleRevoke = async (lic: License) => {
    if (!confirm(`Revoke license ${lic.license_key}? Products will be disabled.`)) return;
    const { error } = await supabase
      .from('product_pack_licenses')
      .update({ status: 'revoked' })
      .eq('id', lic.id);
    if (error) { notify('error', error.message); return; }
    await logEvent(lic.id, 'revoked', 'License manually revoked by admin');
    notify('success', 'License revoked');
    fetchLicenses();
  };

  const handleSuspend = async (lic: License) => {
    const next = lic.status === 'suspended' ? 'active' : 'suspended';
    const { error } = await supabase
      .from('product_pack_licenses')
      .update({ status: next })
      .eq('id', lic.id);
    if (error) { notify('error', error.message); return; }
    await logEvent(lic.id, next === 'suspended' ? 'suspended' : 'reactivated', `Status changed to ${next}`);
    notify('success', `License ${next === 'suspended' ? 'suspended' : 'reactivated'}`);
    fetchLicenses();
  };

  const handleRenew = async (lic: License) => {
    const input = prompt('Extend license by how many days?', '365');
    if (!input) return;
    const days = parseInt(input, 10);
    if (isNaN(days) || days <= 0) { notify('error', 'Invalid number of days'); return; }

    const base = new Date(lic.expires_at);
    if (base.getTime() < Date.now()) base.setTime(Date.now());
    const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from('product_pack_licenses')
      .update({ expires_at: newExpiry.toISOString(), status: 'active' })
      .eq('id', lic.id);
    if (error) { notify('error', error.message); return; }
    await logEvent(lic.id, 'renewed', `Extended by ${days} days to ${newExpiry.toISOString()}`);
    notify('success', `License renewed until ${newExpiry.toLocaleDateString()}`);
    fetchLicenses();
  };

  const handleVerify = async (lic: License) => {
    const now = new Date();
    const expires = new Date(lic.expires_at);
    const pastGrace = now.getTime() > expires.getTime() + lic.grace_period_days * 86400000;
    const nextStatus = lic.status === 'revoked' || lic.status === 'suspended'
      ? lic.status
      : pastGrace ? 'expired' : 'active';

    const { error } = await supabase
      .from('product_pack_licenses')
      .update({ last_verified_at: now.toISOString(), status: nextStatus })
      .eq('id', lic.id);
    if (error) { notify('error', error.message); return; }
    await logEvent(lic.id, 'verified', `Verified. Status: ${nextStatus}`);
    notify('success', 'License verified');
    fetchLicenses();
  };

  const openView = async (lic: License) => {
    setSelected(lic);
    setShowView(true);
    await fetchEvents(lic.id);
  };

  const filtered = useMemo(() => {
    return licenses.filter(l => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        l.license_key.toLowerCase().includes(q) ||
        l.licensed_to.toLowerCase().includes(q) ||
        l.pack_name.toLowerCase().includes(q)
      );
    });
  }, [licenses, search, statusFilter]);

  const stats = useMemo(() => {
    const total = licenses.length;
    const active = licenses.filter(l => l.status === 'active' && !l.is_expired).length;
    const expiringSoon = licenses.filter(l =>
      l.status === 'active' && !l.is_expired && (l.days_remaining ?? 999) <= 14
    ).length;
    const expired = licenses.filter(l => l.status === 'expired' || l.is_expired).length;
    const revoked = licenses.filter(l => l.status === 'revoked').length;
    return { total, active, expiringSoon, expired, revoked };
  }, [licenses]);

  const statusBadge = (lic: License) => {
    const effective = lic.is_past_grace && lic.status === 'active' ? 'expired' : lic.status;
    const map: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
      active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: ShieldCheck },
      expired: { label: 'Expired', cls: 'bg-rose-100 text-rose-800 border-rose-200', Icon: ShieldX },
      revoked: { label: 'Revoked', cls: 'bg-slate-200 text-slate-800 border-slate-300', Icon: Ban },
      suspended: { label: 'Suspended', cls: 'bg-amber-100 text-amber-800 border-amber-200', Icon: ShieldAlert },
      pending: { label: 'Pending', cls: 'bg-blue-100 text-blue-800 border-blue-200', Icon: Clock },
    };
    const { label, cls, Icon } = map[effective] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
        <Icon size={12} /> {label}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{notification.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-blue-50 p-2.5 rounded-lg border border-blue-100">
            <KeyRound className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Product Pack Licenses</h1>
            <p className="text-sm text-slate-500">Manage licensing, expiry periods and activation limits</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm shadow-sm"
          >
            <Plus size={16} /> Issue License
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-700', bg: 'bg-white', accent: 'bg-slate-500' },
          { label: 'Active', value: stats.active, color: 'text-emerald-700', bg: 'bg-white', accent: 'bg-emerald-500' },
          { label: 'Expiring Soon', value: stats.expiringSoon, color: 'text-amber-700', bg: 'bg-white', accent: 'bg-amber-500' },
          { label: 'Expired', value: stats.expired, color: 'text-rose-700', bg: 'bg-white', accent: 'bg-rose-500' },
          { label: 'Revoked', value: stats.revoked, color: 'text-slate-700', bg: 'bg-white', accent: 'bg-slate-400' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-slate-200 rounded-lg p-4 relative overflow-hidden`}>
            <div className={`absolute top-0 left-0 w-1 h-full ${s.accent}`} />
            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by key, pack, or licensee..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <RefreshCw size={24} className="animate-spin mx-auto text-slate-400" />
            <p className="text-sm text-slate-500 mt-2">Loading licenses...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <KeyRound size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 font-medium">No licenses found</p>
            <p className="text-sm text-slate-400 mt-1">Issue your first license to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">License Key</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Pack</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Licensed To</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Expires</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Activations</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lic => {
                  const days = lic.days_remaining ?? daysBetween(new Date(), new Date(lic.expires_at));
                  const urgent = lic.status === 'active' && !lic.is_expired && days <= 14;
                  return (
                    <tr key={lic.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                            {lic.license_key}
                          </code>
                          <button
                            onClick={() => copyKey(lic.license_key)}
                            className="text-slate-400 hover:text-blue-600"
                            title="Copy"
                          >
                            {copied === lic.license_key ? <CheckCircle size={14} className="text-emerald-600" /> : <Copy size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{lic.pack_name || '—'}</p>
                        <p className="text-xs text-slate-500">{lic.issued_by || 'Internal'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{lic.licensed_to}</td>
                      <td className="px-4 py-3">{statusBadge(lic)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Calendar size={13} className="text-slate-400" />
                          <span>{new Date(lic.expires_at).toLocaleDateString()}</span>
                        </div>
                        <p className={`text-xs mt-0.5 ${
                          lic.is_past_grace ? 'text-rose-600' :
                          urgent ? 'text-amber-600 font-medium' :
                          'text-slate-500'
                        }`}>
                          {lic.is_past_grace
                            ? `Expired ${Math.abs(days)}d ago`
                            : days < 0
                              ? `In grace (${Math.abs(days)}d past)`
                              : `${days} day${days === 1 ? '' : 's'} left`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700 font-medium">
                          {lic.current_activations}/{lic.max_activations}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openView(lic)} title="View" className="p-1.5 text-slate-500 hover:bg-slate-100 rounded">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => handleVerify(lic)} title="Verify now" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                            <ShieldCheck size={15} />
                          </button>
                          <button onClick={() => handleRenew(lic)} title="Renew" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded">
                            <RefreshCw size={15} />
                          </button>
                          <button onClick={() => handleSuspend(lic)} title={lic.status === 'suspended' ? 'Reactivate' : 'Suspend'} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded">
                            <Power size={15} />
                          </button>
                          {lic.status !== 'revoked' && (
                            <button onClick={() => handleRevoke(lic)} title="Revoke" className="p-1.5 text-slate-600 hover:bg-slate-100 rounded">
                              <Ban size={15} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(lic)} title="Delete" className="p-1.5 text-rose-600 hover:bg-rose-50 rounded">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <KeyRound className="text-blue-600" size={22} />
                <h2 className="text-xl font-bold text-slate-800">Issue New License</h2>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product Pack</label>
                  <select
                    value={form.pack_id}
                    onChange={(e) => setForm({ ...form, pack_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">— External / Unlinked —</option>
                    {packs.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (v{p.version})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Pack Name (if external)</label>
                  <input
                    value={form.pack_name}
                    onChange={(e) => setForm({ ...form, pack_name: e.target.value })}
                    placeholder="e.g. Premium Menu Pack"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Licensed To *</label>
                  <input
                    value={form.licensed_to}
                    onChange={(e) => setForm({ ...form, licensed_to: e.target.value })}
                    placeholder="Company or tenant name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Issued By</label>
                  <input
                    value={form.issued_by}
                    onChange={(e) => setForm({ ...form, issued_by: e.target.value })}
                    placeholder="Vendor name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Starts At</label>
                  <input
                    type="date"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expires At *</label>
                  <input
                    type="date"
                    value={form.expires_at}
                    onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Grace (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.grace_period_days}
                    onChange={(e) => setForm({ ...form, grace_period_days: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Activations</label>
                  <input
                    type="number"
                    min={1}
                    value={form.max_activations}
                    onChange={(e) => setForm({ ...form, max_activations: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3 w-full">
                    Duration: <strong>{daysBetween(new Date(form.starts_at), new Date(form.expires_at))} days</strong>
                    {' '}+ {form.grace_period_days}d grace
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Features (JSON)</label>
                <textarea
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  placeholder='{"premium_support": true, "max_products": 500}'
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={handleCreate}
                className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
              >
                <KeyRound size={18} /> Issue License
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-200 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showView && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowView(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-800">License Details</h2>
                <code className="text-xs text-slate-500 font-mono">{selected.license_key}</code>
              </div>
              <button onClick={() => setShowView(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle size={22} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Status" value={statusBadge(selected)} />
                <Detail label="Pack" value={selected.pack_name} />
                <Detail label="Licensed To" value={selected.licensed_to} />
                <Detail label="Issued By" value={selected.issued_by || '—'} />
                <Detail label="Issued At" value={new Date(selected.issued_at).toLocaleString()} />
                <Detail label="Activated At" value={selected.activated_at ? new Date(selected.activated_at).toLocaleString() : 'Not activated'} />
                <Detail label="Starts" value={new Date(selected.starts_at).toLocaleDateString()} />
                <Detail label="Expires" value={new Date(selected.expires_at).toLocaleDateString()} />
                <Detail label="Grace Period" value={`${selected.grace_period_days} days`} />
                <Detail label="Activations" value={`${selected.current_activations} / ${selected.max_activations}`} />
                <Detail label="Last Verified" value={selected.last_verified_at ? new Date(selected.last_verified_at).toLocaleString() : 'Never'} />
                <Detail label="Device Fingerprint" value={selected.device_fingerprint || 'Not bound'} mono />
              </div>

              {Object.keys(selected.features || {}).length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Features</p>
                  <pre className="bg-slate-900 text-emerald-300 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selected.features, null, 2)}
                  </pre>
                </div>
              )}

              {selected.notes && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Notes</p>
                  <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">{selected.notes}</p>
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
                  <History size={12} /> Event Log
                </p>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No events yet</p>
                ) : (
                  <div className="space-y-2">
                    {events.map(ev => (
                      <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 capitalize">{ev.event_type}</span>
                            <span className="text-xs text-slate-400">{new Date(ev.created_at).toLocaleString()}</span>
                          </div>
                          {ev.event_message && <p className="text-xs text-slate-600 mt-0.5">{ev.event_message}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <div className={`mt-1 text-sm text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
