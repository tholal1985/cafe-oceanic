import { useEffect, useState, useCallback } from 'react';
import {
  ShoppingBag, TrendingUp, AlertCircle, Package, Monitor,
  RefreshCw, Clock, CheckCircle2, XCircle, Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  todaySales: number;
  pendingOrders: number;
  failedOrders: number;
  syncedProducts: number;
  activeKiosks: number;
}

interface DailyOrderData {
  date: string;
  orders: number;
  sales: number;
}

interface KioskOrderData {
  kiosk_name: string;
  order_count: number;
}

interface PaymentMethodData {
  method: string;
  count: number;
  amount: number;
}

interface FailedApiData {
  date: string;
  count: number;
}

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  processing: 'bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

export default function KioskGatewayDashboard() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalOrders: 0, todayOrders: 0, todaySales: 0, pendingOrders: 0,
    failedOrders: 0, syncedProducts: 0, activeKiosks: 0,
  });
  const [dailyOrders, setDailyOrders] = useState<DailyOrderData[]>([]);
  const [kioskOrders, setKioskOrders] = useState<KioskOrderData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [failedApis, setFailedApis] = useState<FailedApiData[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [
      { count: totalOrders },
      { count: todayOrdersCount },
      { data: todayOrdersData },
      { count: pendingOrders },
      { count: failedOrders },
      { count: syncedProducts },
      { count: activeKiosks },
      { data: recentOrdersData },
      { data: failedLogsData },
    ] = await Promise.all([
      supabase.from('kp_orders').select('*', { count: 'exact', head: true }),
      supabase.from('kp_orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
      supabase.from('kp_orders').select('total').gte('created_at', todayISO),
      supabase.from('kp_orders').select('*', { count: 'exact', head: true }).in('order_status', ['pending', 'processing']),
      supabase.from('kp_orders').select('*', { count: 'exact', head: true }).eq('sync_status', 'failed'),
      supabase.from('kp_products_cache').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('kp_kiosks').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('kp_orders').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('kp_api_logs').select('created_at').eq('success', false).order('created_at', { ascending: false }).limit(100),
    ]);

    const todaySales = (todayOrdersData || []).reduce((s: number, o: any) => s + Number(o.total), 0);

    setStats({
      totalOrders: totalOrders || 0,
      todayOrders: todayOrdersCount || 0,
      todaySales,
      pendingOrders: pendingOrders || 0,
      failedOrders: failedOrders || 0,
      syncedProducts: syncedProducts || 0,
      activeKiosks: activeKiosks || 0,
    });

    setRecentOrders(recentOrdersData || []);

    // Daily orders chart (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: weekOrders } = await supabase
      .from('kp_orders')
      .select('total, created_at' as never)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const dayMap: Record<string, { orders: number; sales: number; ts: number }> = {};
    (weekOrders || []).forEach((o: any) => {
      const d = new Date(o.created_at);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dayMap[key]) dayMap[key] = { orders: 0, sales: 0, ts: d.getTime() };
      dayMap[key].orders += 1;
      dayMap[key].sales += Number(o.total);
    });
    setDailyOrders(Object.entries(dayMap).map(([date, d]) => ({ date, ...d })));

    // Orders by kiosk
    const { data: kioskOrderData } = await supabase
      .from('kp_orders')
      .select('kiosk_id')
      .not('kiosk_id', 'is', null);

    const kioskIds = [...new Set((kioskOrderData || []).map((o: any) => o.kiosk_id))];
    if (kioskIds.length > 0) {
      const { data: kiosks } = await supabase
        .from('kp_kiosks')
        .select('id, name')
        .in('id', kioskIds);
      const kioskMap: Record<string, string> = {};
      (kiosks || []).forEach((k: any) => { kioskMap[k.id] = k.name; });
      const kioskCountMap: Record<string, number> = {};
      (kioskOrderData || []).forEach((o: any) => {
        const name = kioskMap[o.kiosk_id] || 'Unknown';
        kioskCountMap[name] = (kioskCountMap[name] || 0) + 1;
      });
      setKioskOrders(Object.entries(kioskCountMap).map(([kiosk_name, order_count]) => ({ kiosk_name, order_count })));
    } else {
      setKioskOrders([]);
    }

    // Payment methods
    const { data: paymentsData } = await supabase
      .from('kp_payments')
      .select('method, amount')
      .eq('status', 'completed');
    const pmMap: Record<string, { count: number; amount: number }> = {};
    (paymentsData || []).forEach((p: any) => {
      if (!pmMap[p.method]) pmMap[p.method] = { count: 0, amount: 0 };
      pmMap[p.method].count += 1;
      pmMap[p.method].amount += Number(p.amount);
    });
    setPaymentMethods(Object.entries(pmMap).map(([method, d]) => ({ method, ...d })));

    // Failed API requests by day
    const failDayMap: Record<string, { count: number; ts: number }> = {};
    (failedLogsData || []).forEach((l: any) => {
      const d = new Date(l.created_at);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!failDayMap[key]) failDayMap[key] = { count: 0, ts: d.getTime() };
      failDayMap[key].count += 1;
    });
    setFailedApis(Object.entries(failDayMap).map(([date, d]) => ({ date, count: d.count })).slice(0, 7));

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const maxDailyOrders = Math.max(...dailyOrders.map(d => d.orders), 1);
  const maxDailySales = Math.max(...dailyOrders.map(d => d.sales), 1);
  const maxKioskOrders = Math.max(...kioskOrders.map(k => k.order_count), 1);
  const maxFailedApis = Math.max(...failedApis.map(f => f.count), 1);
  const totalPayments = paymentMethods.reduce((s, p) => s + p.count, 0);

  const KpiCard = ({ label, value, sub, icon: Icon, accent = 'ocean' }: {
    label: string; value: string; sub?: string; icon: any;
    accent?: 'ocean' | 'amber' | 'emerald' | 'rose' | 'ink';
  }) => {
    const tints: Record<string, string> = {
      ocean: 'bg-ocean-50 text-ocean-800',
      amber: 'bg-amber-50 text-amber-700',
      emerald: 'bg-emerald-50 text-emerald-700',
      rose: 'bg-rose-50 text-rose-700',
      ink: 'bg-ink-50 text-ink-700',
    };
    return (
      <div className="group relative overflow-hidden rounded-2xl border border-ink-100/70 bg-white p-5 shadow-soft transition-shadow hover:shadow-lifted">
        <div className="flex items-start justify-between">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tints[accent]}`}>
            <Icon size={18} />
          </div>
        </div>
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">{label}</p>
          <p className="mt-1 font-display text-3xl text-ink-900 tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">KioskPOS Gateway Dashboard</h1>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-ink-100/70 bg-white/60" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">KioskPOS Gateway</h1>
            <p className="mt-2 text-sm text-ink-500">
              Monitor kiosk orders, sync status, and API health at a glance.
            </p>
          </div>
          <button
            onClick={fetchAll}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Total Orders" value={String(stats.totalOrders)} icon={ShoppingBag} accent="ocean" />
          <KpiCard label="Today's Orders" value={String(stats.todayOrders)} icon={TrendingUp} accent="amber" />
          <KpiCard label="Today's Sales" value={formatCurrency(stats.todaySales)} icon={Zap} accent="emerald" />
          <KpiCard label="Pending Orders" value={String(stats.pendingOrders)} icon={Clock} accent="ink" />
          <KpiCard label="Failed Orders" value={String(stats.failedOrders)} icon={AlertCircle} accent="rose" />
          <KpiCard label="Synced Products" value={String(stats.syncedProducts)} icon={Package} accent="ocean" />
          <KpiCard label="Active Kiosks" value={String(stats.activeKiosks)} icon={Monitor} accent="emerald" />
          <KpiCard label="Failed API Calls" value={String(failedApis.reduce((s, f) => s + f.count, 0))} icon={XCircle} accent="rose" />
        </div>

        {/* Charts row */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Orders by day */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">Orders by Day</h3>
            <p className="text-xs text-ink-400">Last 7 days</p>
            <div className="mt-6 flex items-end gap-3" style={{ height: 180 }}>
              {dailyOrders.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-ocean-200 to-ocean-500 transition-all hover:from-ocean-300 hover:to-ocean-600"
                      style={{ height: `${(d.orders / maxDailyOrders) * 100}%`, minHeight: 4 }}
                      title={`${d.orders} orders`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-400">{d.date}</span>
                </div>
              ))}
              {dailyOrders.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-ink-400">No data yet</div>
              )}
            </div>
          </div>

          {/* Sales by day */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">Sales by Day</h3>
            <p className="text-xs text-ink-400">Last 7 days</p>
            <div className="mt-6 flex items-end gap-3" style={{ height: 180 }}>
              {dailyOrders.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-amber-200 to-amber-500 transition-all hover:from-amber-300 hover:to-amber-600"
                      style={{ height: `${(d.sales / maxDailySales) * 100}%`, minHeight: 4 }}
                      title={formatCurrency(d.sales)}
                    />
                  </div>
                  <span className="text-[10px] text-ink-400">{d.date}</span>
                </div>
              ))}
              {dailyOrders.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-ink-400">No data yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Second row */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Orders by kiosk */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">Orders by Kiosk</h3>
            <div className="mt-4 space-y-3">
              {kioskOrders.map((k, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-ink-700">{k.kiosk_name}</span>
                    <span className="text-ink-400">{k.order_count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-50">
                    <div
                      className="h-full rounded-full bg-ocean-500 transition-all"
                      style={{ width: `${(k.order_count / maxKioskOrders) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {kioskOrders.length === 0 && (
                <p className="text-sm text-ink-400">No kiosk orders yet</p>
              )}
            </div>
          </div>

          {/* Payment methods */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">Payment Methods</h3>
            <div className="mt-4 space-y-3">
              {paymentMethods.map((p, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-ink-700">{p.method}</span>
                    <span className="text-ink-400">{totalPayments > 0 ? Math.round((p.count / totalPayments) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-50">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{ width: `${totalPayments > 0 ? (p.count / totalPayments) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
              {paymentMethods.length === 0 && (
                <p className="text-sm text-ink-400">No payments yet</p>
              )}
            </div>
          </div>

          {/* Failed API requests */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <h3 className="font-display text-lg text-ink-900">Failed API Requests</h3>
            <div className="mt-4 flex items-end gap-2" style={{ height: 120 }}>
              {failedApis.map((f, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-rose-400 transition-all hover:bg-rose-500"
                      style={{ height: `${(f.count / maxFailedApis) * 100}%`, minHeight: 4 }}
                      title={`${f.count} failures`}
                    />
                  </div>
                  <span className="text-[10px] text-ink-400">{f.date}</span>
                </div>
              ))}
              {failedApis.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-ink-400">
                  <CheckCircle2 size={16} className="mr-1 text-emerald-500" /> No failures
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent orders table */}
        <div className="mt-6 rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
            <h3 className="font-display text-lg text-ink-900">Recent Orders</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Order #</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Total</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Sync</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {recentOrders.map((order: any) => (
                  <tr key={order.id} className="transition-colors hover:bg-ink-50/30">
                    <td className="px-6 py-3 text-sm font-medium text-ink-900">{order.order_number}</td>
                    <td className="px-6 py-3 text-sm text-ink-700 tabular-nums">{formatCurrency(Number(order.total))}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[order.order_status] || ''}`}>
                        {order.order_status}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[order.sync_status] || ''}`}>
                        {order.sync_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-ink-500">
                      {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-ink-400">No orders yet</td>
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
