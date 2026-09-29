import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Search, AlertCircle, RotateCw, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';
import { kioskposApi } from '../../lib/kioskposApi';

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  processing: 'bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

const SYNC_BADGES: Record<string, string> = {
  pending: 'bg-ink-50 text-ink-500 ring-1 ring-inset ring-ink-200',
  processing: 'bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-200',
  synced: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

interface OrderWithItems {
  id: string;
  order_number: string;
  kiosk_id: string | null;
  ultimatepos_sale_id: string | null;
  ultimatepos_invoice_number: string | null;
  location_id: number | null;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  payment_method: string | null;
  payment_status: string;
  order_status: string;
  sync_status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export default function KioskGatewayOrders() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncFilter, setSyncFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [kioskMap, setKioskMap] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('kp_orders').select('*').order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('order_status', statusFilter);
    if (syncFilter !== 'all') query = query.eq('sync_status', syncFilter);
    if (search) query = query.or(`order_number.ilike.%${search}%,ultimatepos_invoice_number.ilike.%${search}%`);

    const { data } = await query.limit(100);
    setOrders((data || []) as OrderWithItems[]);

    // Fetch kiosk names
    const kioskIds = [...new Set((data || []).map((o: any) => o.kiosk_id).filter(Boolean))];
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
  }, [statusFilter, syncFilter, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const viewOrder = async (order: OrderWithItems) => {
    setSelectedOrder(order);
    const [{ data: items }, { data: pays }] = await Promise.all([
      supabase.from('kp_order_items').select('*').eq('order_id', order.id),
      supabase.from('kp_payments').select('*').eq('order_id', order.id),
    ]);
    setOrderItems(items || []);
    setPayments(pays || []);
  };

  const handleRetry = async (orderId: string) => {
    setRetrying(true);
    setError('');
    try {
      await kioskposApi.retryOrder(orderId);
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Gateway Orders</h1>
            <p className="mt-2 text-sm text-ink-500">
              All orders created through the KioskPOS API, with sync status and retry controls.
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

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5 shadow-soft">
            <Search size={14} className="text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order # or invoice..."
              className="bg-transparent text-sm text-ink-700 focus:outline-none w-48"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-full border border-ink-100 bg-white px-4 py-1.5 text-sm text-ink-700 shadow-soft focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={syncFilter}
            onChange={(e) => setSyncFilter(e.target.value)}
            className="rounded-full border border-ink-100 bg-white px-4 py-1.5 text-sm text-ink-700 shadow-soft focus:outline-none"
          >
            <option value="all">All Sync</option>
            <option value="pending">Sync Pending</option>
            <option value="processing">Syncing</option>
            <option value="synced">Synced</option>
            <option value="failed">Sync Failed</option>
          </select>
        </div>

        {/* Orders table */}
        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Order #</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Kiosk</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Invoice</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Order</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Sync</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Created</th>
                  <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-ink-50/30">
                    <td className="px-6 py-3 text-sm font-medium text-ink-900">{order.order_number}</td>
                    <td className="px-6 py-3 text-sm text-ink-700">{order.kiosk_id ? (kioskMap[order.kiosk_id] || 'Unknown') : '-'}</td>
                    <td className="px-6 py-3 text-sm text-ink-700">{order.ultimatepos_invoice_number || '-'}</td>
                    <td className="px-6 py-3 text-sm text-ink-700 tabular-nums">{formatCurrency(Number(order.total))}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[order.order_status] || ''}`}>
                        {order.order_status}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${SYNC_BADGES[order.sync_status] || ''}`}>
                        {order.sync_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-500">
                      {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewOrder(order)}
                          className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ocean-50 hover:text-ocean-600"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        {order.sync_status === 'failed' && (
                          <button
                            onClick={() => handleRetry(order.id)}
                            disabled={retrying}
                            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                            title="Retry sync"
                          >
                            <RotateCw size={14} className={retrying ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-sm text-ink-400">No orders found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order detail modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}>
            <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-ink-100 bg-white p-6 shadow-lifted" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl text-ink-900">{selectedOrder.order_number}</h3>
                  <p className="text-sm text-ink-500">
                    {new Date(selectedOrder.created_at).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => setSelectedOrder(null)} className="text-ink-400 hover:text-ink-700">
                  ✕
                </button>
              </div>

              {selectedOrder.error_message && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  <strong>Error:</strong> {selectedOrder.error_message}
                </div>
              )}

              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Status</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[selectedOrder.order_status] || ''}`}>
                    {selectedOrder.order_status}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Sync</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${SYNC_BADGES[selectedOrder.sync_status] || ''}`}>
                    {selectedOrder.sync_status}
                  </span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Payment</p>
                  <p className="text-sm font-medium text-ink-700">{selectedOrder.payment_status}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Method</p>
                  <p className="text-sm font-medium text-ink-700">{selectedOrder.payment_method || '-'}</p>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Subtotal</p>
                  <p className="text-sm font-medium text-ink-700 tabular-nums">{formatCurrency(Number(selectedOrder.subtotal))}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Tax</p>
                  <p className="text-sm font-medium text-ink-700 tabular-nums">{formatCurrency(Number(selectedOrder.tax))}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Discount</p>
                  <p className="text-sm font-medium text-ink-700 tabular-nums">{formatCurrency(Number(selectedOrder.discount))}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Total</p>
                  <p className="text-sm font-bold text-ink-900 tabular-nums">{formatCurrency(Number(selectedOrder.total))}</p>
                </div>
              </div>

              {selectedOrder.ultimatepos_sale_id && (
                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">UltimatePOS Sale ID</p>
                  <p className="text-sm font-mono text-ink-700">{selectedOrder.ultimatepos_sale_id}</p>
                  {selectedOrder.ultimatepos_invoice_number && (
                    <p className="text-sm text-ink-500">Invoice: {selectedOrder.ultimatepos_invoice_number}</p>
                  )}
                </div>
              )}

              {/* Order items */}
              <div className="mb-4">
                <h4 className="mb-2 font-display text-lg text-ink-900">Items</h4>
                <div className="rounded-xl border border-ink-100">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink-100 bg-ink-50/50">
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-ink-400">Product</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-ink-400">Qty</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-ink-400">Price</th>
                        <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase text-ink-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {orderItems.map((item: any) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-sm text-ink-700">{item.product_name}</td>
                          <td className="px-4 py-2 text-right text-sm text-ink-700">{item.quantity}</td>
                          <td className="px-4 py-2 text-right text-sm text-ink-700 tabular-nums">{formatCurrency(Number(item.unit_price))}</td>
                          <td className="px-4 py-2 text-right text-sm font-medium text-ink-900 tabular-nums">{formatCurrency(Number(item.line_total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments */}
              {payments.length > 0 && (
                <div>
                  <h4 className="mb-2 font-display text-lg text-ink-900">Payments</h4>
                  <div className="space-y-2">
                    {payments.map((pay: any) => (
                      <div key={pay.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-4 py-2">
                        <div>
                          <span className="text-sm font-medium capitalize text-ink-700">{pay.method}</span>
                          <span className="ml-2 text-xs text-ink-400">{pay.status}</span>
                        </div>
                        <span className="text-sm font-medium text-ink-900 tabular-nums">{formatCurrency(Number(pay.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedOrder.sync_status === 'failed' && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => handleRetry(selectedOrder.id)}
                    disabled={retrying}
                    className="btn-accent"
                  >
                    <RotateCw size={16} className={retrying ? 'animate-spin' : ''} />
                    {retrying ? 'Retrying...' : 'Retry Sync'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
