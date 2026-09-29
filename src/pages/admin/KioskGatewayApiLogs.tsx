import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Code, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ApiLogItem {
  id: string;
  kiosk_id: string | null;
  request_id: string;
  method: string;
  endpoint: string;
  status_code: number | null;
  duration_ms: number | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-ocean-700 bg-ocean-50',
  POST: 'text-emerald-700 bg-emerald-50',
  PUT: 'text-amber-700 bg-amber-50',
  DELETE: 'text-rose-700 bg-rose-50',
};

export default function KioskGatewayApiLogs() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ApiLogItem[]>([]);
  const [kioskMap, setKioskMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('kp_api_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter === 'success') query = query.eq('success', true);
    if (filter === 'error') query = query.eq('success', false);

    const { data } = await query;
    setLogs((data || []) as ApiLogItem[]);

    const kioskIds = [...new Set((data || []).map((l: any) => l.kiosk_id).filter(Boolean))];
    if (kioskIds.length > 0) {
      const { data: kiosks } = await supabase
        .from('kp_kiosks')
        .select('id, name')
        .in('id', kioskIds);
      const map: Record<string, string> = {};
      (kiosks || []).forEach((k: any) => { map[k.id] = k.name; });
      setKioskMap(map);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">API Logs</h1>
            <p className="mt-2 text-sm text-ink-500">
              Every kiosk API request is logged with request ID, duration, and status.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-full border border-ink-100 bg-white p-1 shadow-soft">
              {(['all', 'success', 'error'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-all ${
                    filter === f ? 'bg-ocean-800 text-ivory-50' : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'success' ? 'Success' : 'Errors'}
                </button>
              ))}
            </div>
            <button
              onClick={fetchLogs}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Request ID</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Method</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Endpoint</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Kiosk</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Duration</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-ink-50/30">
                    <td className="px-6 py-3">
                      <code className="text-xs text-ink-500 font-mono">{log.request_id}</code>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold ${METHOD_COLORS[log.method] || 'text-ink-500 bg-ink-50'}`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-700 font-mono max-w-xs truncate" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-700">
                      {log.kiosk_id ? (kioskMap[log.kiosk_id] || 'Unknown') : '-'}
                    </td>
                    <td className="px-6 py-3">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {log.status_code || 200}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-rose-600">
                          <AlertCircle size={12} />
                          {log.status_code || 500}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-500 tabular-nums">
                      {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-500">
                      {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <Code size={32} className="mx-auto mb-3 text-ink-200" />
                      <p className="text-sm text-ink-400">No API logs yet</p>
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
