import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertCircle, RotateCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';
import { kioskposApi } from '../../lib/kioskposApi';

interface FailedOrder {
  id: string;
  order_number: string;
  kiosk_id: string | null;
  total: number;
  currency: string;
  error_message: string | null;
  created_at: string;
}

export default function KioskGatewayFailedOrders() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<FailedOrder[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('kp_orders')
      .select('id, order_number, kiosk_id, total, currency, error_message, created_at')
      .eq('sync_status', 'failed')
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data || []) as FailedOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleRetry = async (orderId: string) => {
    setRetrying(orderId);
    setError('');
    try {
      await kioskposApi.retryOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Failed Orders</h1>
            <p className="mt-2 text-sm text-ink-500">
              Orders that failed to sync with UltimatePOS. Retry to push them again.
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Order #</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Error</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Created</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-ink-50/30">
                    <td className="px-6 py-3 text-sm font-medium text-ink-900">{order.order_number}</td>
                    <td className="px-6 py-3 text-sm text-ink-700 tabular-nums">{formatCurrency(Number(order.total))}</td>
                    <td className="px-6 py-3 text-sm text-rose-600 max-w-xs truncate" title={order.error_message || ''}>
                      {order.error_message || 'Unknown error'}
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-500">
                      {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => handleRetry(order.id)}
                        disabled={retrying === order.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-ocean-900 transition-colors hover:bg-amber-300 disabled:opacity-50"
                      >
                        <RotateCw size={13} className={retrying === order.id ? 'animate-spin' : ''} />
                        {retrying === order.id ? 'Retrying...' : 'Retry'}
                      </button>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <CheckCircle2 size={32} className="mx-auto mb-3 text-emerald-300" />
                      <p className="text-sm text-ink-400">No failed orders. Everything is synced.</p>
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
