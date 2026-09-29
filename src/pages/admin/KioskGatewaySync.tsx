import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, RefreshCcw, CheckCircle2, XCircle, Clock, Layers, Package, Boxes } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SyncJob {
  id: string;
  job_type: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  records_processed: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
}

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  running: RefreshCw,
  completed: CheckCircle2,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-ink-400',
  running: 'text-ocean-600',
  completed: 'text-emerald-600',
  failed: 'text-rose-600',
};

const JOB_ICONS: Record<string, any> = {
  products: Package,
  categories: Layers,
  all: Boxes,
};

export default function KioskGatewaySync() {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('kp_sync_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    setJobs((data || []) as SyncJob[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const triggerSync = async (type: 'products' | 'categories' | 'all') => {
    setSyncing(type);
    setError('');
    setSuccess('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kioskpos-api/sync/${type}`,
        { method: 'POST', headers }
      );
      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result?.error?.message || 'Sync failed');
      }

      setSuccess(`${type === 'all' ? 'Full' : type.charAt(0).toUpperCase() + type.slice(1)} sync completed: ${result.data?.records_processed || 0} processed, ${result.data?.records_failed || 0} failed`);
      fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Synchronization</h1>
            <p className="mt-2 text-sm text-ink-500">
              Sync products and categories from UltimatePOS into the local cache.
            </p>
          </div>
          <button
            onClick={fetchJobs}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <XCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 size={16} /> {success}
          </div>
        )}

        {/* Sync action cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { type: 'products' as const, label: 'Sync Products', desc: 'Pull all products from UltimatePOS', icon: Package },
            { type: 'categories' as const, label: 'Sync Categories', desc: 'Pull category list from UltimatePOS', icon: Layers },
            { type: 'all' as const, label: 'Full Sync', desc: 'Sync both products and categories', icon: Boxes },
          ].map((action) => {
            const Icon = action.icon;
            const isSyncing = syncing === action.type;
            return (
              <button
                key={action.type}
                onClick={() => triggerSync(action.type)}
                disabled={isSyncing || syncing !== null}
                className="group relative overflow-hidden rounded-2xl border border-ink-100/70 bg-white p-6 text-left shadow-soft transition-all hover:shadow-lifted disabled:opacity-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700 transition-colors group-hover:bg-ocean-100">
                  <Icon size={22} />
                </div>
                <h3 className="mt-4 font-display text-lg text-ink-900">{action.label}</h3>
                <p className="text-sm text-ink-500">{action.desc}</p>
                {isSyncing && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-ocean-600">
                    <RefreshCw size={14} className="animate-spin" /> Syncing...
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Sync jobs history */}
        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="border-b border-ink-100 px-6 py-4">
            <h3 className="font-display text-lg text-ink-900">Sync History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Type</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Processed</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Failed</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Started</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {jobs.map((job) => {
                  const StatusIcon = STATUS_ICONS[job.status] || Clock;
                  const JobIcon = JOB_ICONS[job.job_type] || Package;
                  return (
                    <tr key={job.id} className="transition-colors hover:bg-ink-50/30">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <JobIcon size={14} className="text-ink-400" />
                          <span className="text-sm font-medium capitalize text-ink-900">{job.job_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className={`flex items-center gap-1.5 text-sm font-medium ${STATUS_COLORS[job.status] || 'text-ink-400'}`}>
                          <StatusIcon size={14} className={job.status === 'running' ? 'animate-spin' : ''} />
                          {job.status}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-ink-700 tabular-nums">{job.records_processed}</td>
                      <td className="px-6 py-3 text-sm tabular-nums">
                        {job.records_failed > 0 ? (
                          <span className="text-rose-600">{job.records_failed}</span>
                        ) : (
                          <span className="text-ink-400">0</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-ink-500">
                        {job.started_at ? new Date(job.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-sm text-ink-500">
                        {job.completed_at ? new Date(job.completed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  );
                })}
                {jobs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-ink-400">No sync jobs yet</td>
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
