import { useEffect, useState, useCallback } from 'react';
import {
  Plus, RefreshCw, Key, Monitor, Copy, Check, X,
  AlertCircle, Power, Ban,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { kioskposApi, type KioskRecord } from '../../lib/kioskposApi';

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  inactive: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  blocked: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

export default function KioskGatewayKiosks() {
  const [loading, setLoading] = useState(true);
  const [kiosks, setKiosks] = useState<KioskRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKiosk, setNewKiosk] = useState({ name: '', kiosk_code: '', location_id: '' });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchKiosks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('kp_kiosks')
      .select('*')
      .order('created_at', { ascending: false });
    setKiosks((data || []) as KioskRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKiosks(); }, [fetchKiosks]);

  const handleCreate = async () => {
    setError('');
    if (!newKiosk.name || !newKiosk.kiosk_code) {
      setError('Name and kiosk code are required');
      return;
    }
    setCreating(true);
    try {
      const result = await kioskposApi.createKiosk({
        name: newKiosk.name,
        kiosk_code: newKiosk.kiosk_code,
        location_id: newKiosk.location_id ? parseInt(newKiosk.location_id, 10) : undefined,
      });
      setCreatedKey(result.api_key);
      setNewKiosk({ name: '', kiosk_code: '', location_id: '' });
      setShowCreate(false);
      fetchKiosks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create kiosk');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (kiosk: KioskRecord, status: string) => {
    try {
      await kioskposApi.updateKiosk(kiosk.id, { status });
      fetchKiosks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update kiosk');
    }
  };

  const handleRegenerateKey = async (kiosk: KioskRecord) => {
    if (!confirm(`Regenerate API key for "${kiosk.name}"? The old key will stop working immediately.`)) return;
    try {
      const result = await kioskposApi.regenerateApiKey(kiosk.id);
      setCreatedKey(result.api_key);
      fetchKiosks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate key');
    }
  };

  const copyKey = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Kiosk Terminals</h1>
            <p className="mt-2 text-sm text-ink-500">
              Register kiosks, manage API keys, and monitor terminal status.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchKiosks}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Add Kiosk
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={16} />
            {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* Created key modal */}
        {createdKey && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Key size={18} />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-lg text-ink-900">API Key Created</h3>
                <p className="text-sm text-ink-500">
                  Copy this key now. For security, it will not be shown again.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <code className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-2.5 font-mono text-sm text-ink-800">
                    {createdKey}
                  </code>
                  <button
                    onClick={copyKey}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition-colors hover:text-ocean-700"
                    title="Copy"
                  >
                    {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                  <button
                    onClick={() => setCreatedKey(null)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition-colors hover:text-rose-600"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="mb-6 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ink-900">Register New Kiosk</h3>
              <button onClick={() => setShowCreate(false)}><X size={18} className="text-ink-400" /></button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Name</label>
                <input
                  type="text"
                  value={newKiosk.name}
                  onChange={(e) => setNewKiosk({ ...newKiosk, name: e.target.value })}
                  placeholder="Front Lobby Kiosk"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Kiosk Code</label>
                <input
                  type="text"
                  value={newKiosk.kiosk_code}
                  onChange={(e) => setNewKiosk({ ...newKiosk, kiosk_code: e.target.value.toUpperCase() })}
                  placeholder="KIOSK01"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Location ID</label>
                <input
                  type="number"
                  value={newKiosk.location_id}
                  onChange={(e) => setNewKiosk({ ...newKiosk, location_id: e.target.value })}
                  placeholder="1"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleCreate} disabled={creating} className="btn-primary">
                {creating ? 'Creating...' : 'Create Kiosk'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Kiosks table */}
        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Name</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Code</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Location</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Last Seen</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {kiosks.map((kiosk) => (
                  <tr key={kiosk.id} className="transition-colors hover:bg-ink-50/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                          <Monitor size={15} />
                        </div>
                        <span className="text-sm font-medium text-ink-900">{kiosk.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-700 font-mono">{kiosk.kiosk_code}</td>
                    <td className="px-6 py-4 text-sm text-ink-700">{kiosk.location_id || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[kiosk.status] || ''}`}>
                        {kiosk.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-ink-500">
                      {kiosk.last_seen_at
                        ? new Date(kiosk.last_seen_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {kiosk.status === 'active' && (
                          <button
                            onClick={() => handleStatusChange(kiosk, 'inactive')}
                            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                            title="Deactivate"
                          >
                            <Power size={14} />
                          </button>
                        )}
                        {kiosk.status === 'inactive' && (
                          <button
                            onClick={() => handleStatusChange(kiosk, 'active')}
                            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            title="Activate"
                          >
                            <Power size={14} />
                          </button>
                        )}
                        {kiosk.status !== 'blocked' && (
                          <button
                            onClick={() => handleStatusChange(kiosk, 'blocked')}
                            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            title="Block"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        {kiosk.status === 'blocked' && (
                          <button
                            onClick={() => handleStatusChange(kiosk, 'active')}
                            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                            title="Unblock"
                          >
                            <Power size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleRegenerateKey(kiosk)}
                          className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ocean-50 hover:text-ocean-600"
                          title="Regenerate API Key"
                        >
                          <Key size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {kiosks.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Monitor size={32} className="mx-auto mb-3 text-ink-200" />
                      <p className="text-sm text-ink-400">No kiosks registered yet</p>
                      <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-medium text-ocean-700 hover:text-ocean-800">
                        Register your first kiosk
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
