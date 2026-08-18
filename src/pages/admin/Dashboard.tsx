import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DollarSign, ShoppingBag, TrendingUp, TrendingDown, Package,
  BarChart2, ArrowUpRight, ArrowDownRight,
  Calendar, RefreshCw, Percent, Receipt, Target, Award,
  Activity, Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

type DateRange = 'today' | 'week' | 'month' | 'all';

interface DailySales { date: string; revenue: number; orders: number; cogs: number; }
interface ProductPerformance { name: string; quantity: number; revenue: number; cost: number; profit: number; margin: number; }
interface FinancialSummary {
  revenue: number; cogs: number; grossProfit: number; grossMargin: number;
  taxCollected: number; netProfit: number; totalOrders: number; avgOrderValue: number;
  completedOrders: number; cancelledOrders: number;
}
interface PaymentBreakdown { method: string; count: number; amount: number; }
interface HourlySales { hour: number; orders: number; revenue: number; }

const RANGE_LABELS: Record<DateRange, string> = {
  today: 'Today',
  week: '7 days',
  month: '30 days',
  all: 'All time',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  preparing: 'bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-200',
  ready: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300',
  cancelled: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

const EMPTY_FINANCIALS: FinancialSummary = {
  revenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0,
  taxCollected: 0, netProfit: 0, totalOrders: 0, avgOrderValue: 0,
  completedOrders: 0, cancelledOrders: 0,
};

export default function Dashboard() {
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [loading, setLoading] = useState(true);
  const [financials, setFinancials] = useState<FinancialSummary>(EMPTY_FINANCIALS);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [productPerformance, setProductPerformance] = useState<ProductPerformance[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);
  const [hourlySales, setHourlySales] = useState<HourlySales[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [taxRate, setTaxRate] = useState(0);

  const getStartDate = useCallback((): string | null => {
    if (dateRange === 'all') return null;
    const d = new Date();
    if (dateRange === 'today') d.setHours(0, 0, 0, 0);
    else if (dateRange === 'week') d.setDate(d.getDate() - 7);
    else if (dateRange === 'month') d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [dateRange]);

  const fetchTaxRate = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'tax_rate')
      .maybeSingle();
    if (data?.setting_value !== undefined && data?.setting_value !== null) {
      setTaxRate(Number(data.setting_value));
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const startDate = getStartDate();

    let ordersQuery = supabase
      .from('orders')
      .select('id, order_number, total_price, status, payment_method, created_at');
    if (startDate) ordersQuery = ordersQuery.gte('created_at', startDate);
    const { data: orders } = await ordersQuery;

    if (!orders) { setLoading(false); return; }

    const orderIds = orders.map(o => o.id);

    if (orderIds.length === 0) {
      setFinancials(EMPTY_FINANCIALS);
      setDailySales([]);
      setProductPerformance([]);
      setPaymentBreakdown([]);
      setHourlySales([]);
      const { data: recent } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);
      setRecentOrders(recent ?? []);
      setLoading(false);
      return;
    }

    const [{ data: items }, { data: products }] = await Promise.all([
      supabase
        .from('order_items')
        .select('order_id, product_name, quantity, item_total, product_id')
        .in('order_id', orderIds),
      supabase.from('products').select('id, name, cost, price'),
    ]);

    const costMap: Record<string, number> = {};
    products?.forEach(p => { costMap[p.id] = Number(p.cost ?? 0); });

    const revenue = orders.reduce((s, o) => s + Number(o.total_price), 0);
    const completedOrders = orders.filter(o => o.status === 'completed').length;
    const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

    let cogs = 0;
    const productMap: Record<string, { qty: number; rev: number; cost: number }> = {};
    items?.forEach(item => {
      const itemCost = costMap[item.product_id] ? costMap[item.product_id] * item.quantity : 0;
      cogs += itemCost;
      if (!productMap[item.product_name]) productMap[item.product_name] = { qty: 0, rev: 0, cost: 0 };
      productMap[item.product_name].qty += item.quantity;
      productMap[item.product_name].rev += Number(item.item_total);
      productMap[item.product_name].cost += itemCost;
    });

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const taxCollected = revenue * (taxRate / 100);
    const netProfit = grossProfit - taxCollected;
    const avgOrderValue = orders.length > 0 ? revenue / orders.length : 0;

    setFinancials({
      revenue, cogs, grossProfit, grossMargin, taxCollected, netProfit,
      totalOrders: orders.length, avgOrderValue, completedOrders, cancelledOrders,
    });

    const perf: ProductPerformance[] = Object.entries(productMap)
      .map(([name, d]) => ({
        name,
        quantity: d.qty,
        revenue: d.rev,
        cost: d.cost,
        profit: d.rev - d.cost,
        margin: d.rev > 0 ? ((d.rev - d.cost) / d.rev) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 8);
    setProductPerformance(perf);

    const dailyMap: Record<string, { revenue: number; orders: number; cogs: number; ts: number }> = {};
    orders.forEach(o => {
      const d = new Date(o.created_at);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!dailyMap[key]) dailyMap[key] = { revenue: 0, orders: 0, cogs: 0, ts: d.getTime() };
      dailyMap[key].revenue += Number(o.total_price);
      dailyMap[key].orders += 1;
    });
    items?.forEach(item => {
      const order = orders.find(o => o.id === item.order_id);
      if (!order) return;
      const key = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (dailyMap[key]) {
        dailyMap[key].cogs += costMap[item.product_id] ? costMap[item.product_id] * item.quantity : 0;
      }
    });
    const daily = Object.entries(dailyMap)
      .map(([date, d]) => ({ date, revenue: d.revenue, orders: d.orders, cogs: d.cogs, _ts: d.ts }))
      .sort((a, b) => a._ts - b._ts)
      .map(({ _ts, ...rest }) => rest);
    setDailySales(daily);

    const pmMap: Record<string, { count: number; amount: number }> = {};
    orders.forEach(o => {
      const pm = o.payment_method || 'Unknown';
      if (!pmMap[pm]) pmMap[pm] = { count: 0, amount: 0 };
      pmMap[pm].count += 1;
      pmMap[pm].amount += Number(o.total_price);
    });
    setPaymentBreakdown(Object.entries(pmMap).map(([method, d]) => ({ method, ...d })));

    const hourMap: Record<number, { orders: number; revenue: number }> = {};
    orders.forEach(o => {
      const h = new Date(o.created_at).getHours();
      if (!hourMap[h]) hourMap[h] = { orders: 0, revenue: 0 };
      hourMap[h].orders += 1;
      hourMap[h].revenue += Number(o.total_price);
    });
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      orders: hourMap[h]?.orders ?? 0,
      revenue: hourMap[h]?.revenue ?? 0,
    }));
    setHourlySales(hourly);

    const { data: recent } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);
    if (recent) setRecentOrders(recent);

    setLoading(false);
  }, [getStartDate, taxRate]);

  useEffect(() => { fetchTaxRate(); }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const maxDailyRevenue = useMemo(() => Math.max(...dailySales.map(d => d.revenue), 1), [dailySales]);
  const maxHourlyOrders = useMemo(() => Math.max(...hourlySales.map(h => h.orders), 1), [hourlySales]);
  const totalPayments = paymentBreakdown.reduce((s, p) => s + p.count, 0);

  const KpiCard = ({
    label, value, sub, icon: Icon, trend, trendVal, accent = 'ocean',
  }: {
    label: string; value: string; sub?: string; icon: any;
    trend?: 'up' | 'down' | 'neutral'; trendVal?: string;
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
          {trend && trendVal && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
              trend === 'up' ? 'bg-emerald-50 text-emerald-700' :
              trend === 'down' ? 'bg-rose-50 text-rose-700' :
              'bg-ink-50 text-ink-500'
            }`}>
              {trend === 'up' ? <ArrowUpRight size={11} /> : trend === 'down' ? <ArrowDownRight size={11} /> : null}
              {trendVal}
            </span>
          )}
        </div>
        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">{label}</p>
          <p className="mt-1 font-display text-3xl text-ink-900 tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">
              Overview · {RANGE_LABELS[dateRange]}
            </p>
            <h1 className="font-display text-4xl text-ink-900">Good to see you again</h1>
            <p className="mt-2 text-sm text-ink-500">
              A clean read on revenue, cost and what&rsquo;s moving today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-ink-100 bg-white p-1 shadow-soft">
              {(Object.keys(RANGE_LABELS) as DateRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                    dateRange === r
                      ? 'bg-ocean-800 text-ivory-50 shadow-soft'
                      : 'text-ink-500 hover:text-ink-800'
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            <button
              onClick={fetchAll}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
              title="Refresh"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-ink-100/70 bg-white" />
            ))}
          </div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Revenue"
                value={formatCurrency(financials.revenue)}
                sub={`${financials.totalOrders} orders in window`}
                icon={DollarSign}
                accent="ocean"
              />
              <KpiCard
                label="Gross profit"
                value={formatCurrency(financials.grossProfit)}
                sub={`${financials.grossMargin.toFixed(1)}% margin`}
                icon={TrendingUp}
                trend={financials.grossMargin >= 40 ? 'up' : 'down'}
                trendVal={`${financials.grossMargin.toFixed(1)}%`}
                accent="emerald"
              />
              <KpiCard
                label="Cost of goods"
                value={formatCurrency(financials.cogs)}
                sub={`${financials.revenue > 0 ? ((financials.cogs / financials.revenue) * 100).toFixed(1) : 0}% of revenue`}
                icon={Package}
                accent="amber"
              />
              <KpiCard
                label="Net profit"
                value={formatCurrency(financials.netProfit)}
                sub={taxRate > 0 ? `After ${taxRate}% tax` : 'Before tax'}
                icon={Target}
                trend={financials.netProfit >= 0 ? 'up' : 'down'}
                trendVal={financials.revenue > 0 ? `${((financials.netProfit / financials.revenue) * 100).toFixed(1)}%` : '0%'}
                accent={financials.netProfit >= 0 ? 'emerald' : 'rose'}
              />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard
                label="Orders"
                value={String(financials.totalOrders)}
                sub={`${financials.completedOrders} completed`}
                icon={ShoppingBag}
                accent="ink"
              />
              <KpiCard
                label="Avg order value"
                value={formatCurrency(financials.avgOrderValue)}
                icon={BarChart2}
                accent="ocean"
              />
              <KpiCard
                label="Tax collected"
                value={formatCurrency(financials.taxCollected)}
                sub={taxRate > 0 ? `${taxRate}% rate` : 'No tax configured'}
                icon={Percent}
                accent="rose"
              />
              <KpiCard
                label="Cancelled"
                value={String(financials.cancelledOrders)}
                sub={financials.totalOrders > 0 ? `${((financials.cancelledOrders / financials.totalOrders) * 100).toFixed(1)}% rate` : 'None'}
                icon={TrendingDown}
                trend={financials.cancelledOrders > 0 ? 'down' : 'neutral'}
                accent="rose"
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <section className="lg:col-span-2 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl text-ink-900">Revenue vs cost</h2>
                    <p className="mt-1 text-xs text-ink-500">{RANGE_LABELS[dateRange]} · stacked daily view</p>
                  </div>
                  <div className="hidden md:flex items-center gap-3 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ocean-700" />Revenue</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />COGS</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Profit</span>
                  </div>
                </div>

                {dailySales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Activity size={24} className="text-ink-300" />
                    <p className="mt-2 text-sm text-ink-400">No activity in this window</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto scroll-soft">
                    <div className="flex min-w-full items-end gap-3" style={{ height: 200 }}>
                      {dailySales.map(day => {
                        const revenueH = (day.revenue / maxDailyRevenue) * 170;
                        const cogsH = (day.cogs / maxDailyRevenue) * 170;
                        const profitH = ((day.revenue - day.cogs) / maxDailyRevenue) * 170;
                        return (
                          <div key={day.date} className="group flex min-w-[44px] flex-1 flex-col items-center gap-2">
                            <div className="relative flex w-full items-end justify-center gap-1" style={{ height: 170 }}>
                              <div
                                className="w-2.5 rounded-t-md bg-ocean-700 transition-all group-hover:bg-ocean-900"
                                style={{ height: Math.max(revenueH, 2) }}
                                title={`Revenue: ${formatCurrency(day.revenue)}`}
                              />
                              <div
                                className="w-2.5 rounded-t-md bg-amber-400 transition-all group-hover:bg-amber-500"
                                style={{ height: Math.max(cogsH, 2) }}
                                title={`COGS: ${formatCurrency(day.cogs)}`}
                              />
                              <div
                                className="w-2.5 rounded-t-md bg-emerald-500 transition-all group-hover:bg-emerald-600"
                                style={{ height: Math.max(profitH, 2) }}
                                title={`Profit: ${formatCurrency(day.revenue - day.cogs)}`}
                              />
                              <div className="pointer-events-none absolute -top-10 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ocean-950 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                                {formatCurrency(day.revenue)} · {day.orders} ord.
                              </div>
                            </div>
                            <span className="w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-ink-400">
                              {day.date}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
                <div className="mb-5">
                  <h2 className="font-display text-xl text-ink-900">Payment mix</h2>
                  <p className="mt-1 text-xs text-ink-500">How guests are paying</p>
                </div>
                {paymentBreakdown.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Receipt size={22} className="text-ink-300" />
                    <p className="mt-2 text-sm text-ink-400">No payments yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentBreakdown.map((pm, i) => {
                      const pct = totalPayments > 0 ? (pm.count / totalPayments) * 100 : 0;
                      const colors = ['bg-ocean-700', 'bg-emerald-500', 'bg-amber-400', 'bg-rose-400', 'bg-ink-400'];
                      return (
                        <div key={pm.method}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="font-medium capitalize text-ink-800">{pm.method}</span>
                            <span className="text-ink-400 tabular-nums">{pm.count} · {pct.toFixed(0)}%</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-500`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-20 text-right text-xs font-semibold text-ink-700 tabular-nums">
                              {formatCurrency(pm.amount)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4 text-sm">
                      <span className="text-ink-500">Total</span>
                      <span className="font-semibold text-ink-900 tabular-nums">{formatCurrency(financials.revenue)}</span>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="mb-6 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl text-ink-900">Hourly rhythm</h2>
                  <p className="mt-1 text-xs text-ink-500">Orders across the day</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-ocean-50 px-3 py-1 text-xs font-medium text-ocean-700">
                  <Calendar size={12} />
                  {RANGE_LABELS[dateRange]}
                </span>
              </div>
              <div className="flex items-end gap-1.5" style={{ height: 110 }}>
                {hourlySales.map(h => {
                  const barH = (h.orders / maxHourlyOrders) * 96;
                  const isPeak = h.orders === maxHourlyOrders && h.orders > 0;
                  return (
                    <div key={h.hour} className="group relative flex flex-1 flex-col items-center">
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          isPeak
                            ? 'bg-gradient-to-t from-ocean-800 to-ocean-600 shadow-soft'
                            : 'bg-ocean-100 hover:bg-ocean-400'
                        }`}
                        style={{ height: Math.max(barH, 3) }}
                      />
                      {h.hour % 3 === 0 && (
                        <span className="mt-1 text-[9px] text-ink-400">
                          {h.hour === 0 ? '12a' : h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`}
                        </span>
                      )}
                      {h.orders > 0 && (
                        <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-ocean-950 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {h.orders} orders
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award size={16} className="text-amber-500" />
                    <h2 className="font-display text-xl text-ink-900">Top earners</h2>
                  </div>
                  <span className="chip">By profit</span>
                </div>
                {productPerformance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Package size={22} className="text-ink-300" />
                    <p className="mt-2 text-sm text-ink-400">No product sales yet</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {productPerformance.map((p, i) => (
                      <li key={p.name} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-ivory-100">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-800' :
                          i === 1 ? 'bg-ink-100 text-ink-600' :
                          i === 2 ? 'bg-amber-50 text-amber-700' :
                          'bg-ink-50 text-ink-400'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
                                style={{ width: `${Math.min(p.margin, 100)}%` }}
                              />
                            </div>
                            <span className="shrink-0 text-[11px] text-ink-400 tabular-nums">{p.margin.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-emerald-700 tabular-nums">{formatCurrency(p.profit)}</p>
                          <p className="text-[11px] text-ink-400">{p.quantity} sold</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
                <div className="mb-5">
                  <h2 className="font-display text-xl text-ink-900">Financial breakdown</h2>
                  <p className="mt-1 text-xs text-ink-500">Every dollar, end to end</p>
                </div>
                {financials.revenue === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <BarChart2 size={22} className="text-ink-300" />
                    <p className="mt-2 text-sm text-ink-400">No data for this period</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      {[
                        { label: 'Revenue', value: financials.revenue, pct: 100, color: 'bg-ocean-700' },
                        { label: 'Cost of goods', value: financials.cogs, pct: financials.revenue > 0 ? (financials.cogs / financials.revenue) * 100 : 0, color: 'bg-amber-400' },
                        { label: 'Gross profit', value: financials.grossProfit, pct: financials.grossMargin, color: 'bg-emerald-500' },
                        { label: 'Tax', value: financials.taxCollected, pct: taxRate, color: 'bg-rose-400' },
                        { label: 'Net profit', value: financials.netProfit, pct: financials.revenue > 0 ? (financials.netProfit / financials.revenue) * 100 : 0, color: 'bg-emerald-700' },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-3 w-3 shrink-0 rounded-sm ${row.color}`} />
                            <span className="text-sm text-ink-700">{row.label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-1 w-28 overflow-hidden rounded-full bg-ink-100">
                              <div
                                className={`h-full rounded-full ${row.color}`}
                                style={{ width: `${Math.max(Math.min(Math.abs(row.pct), 100), 0)}%` }}
                              />
                            </div>
                            <span className="w-24 text-right text-sm font-semibold text-ink-900 tabular-nums">
                              {formatCurrency(row.value)}
                            </span>
                            <span className="w-12 text-right text-[11px] text-ink-400 tabular-nums">
                              {row.pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex items-center justify-between rounded-xl border border-ink-100 bg-ivory-100 p-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-ink-500">Effective margin</p>
                        <p className="text-[11px] text-ink-400">after tax and COGS</p>
                      </div>
                      <span className={`font-display text-2xl tabular-nums ${
                        financials.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}>
                        {financials.revenue > 0 ? ((financials.netProfit / financials.revenue) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  </>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
              <div className="flex items-center justify-between px-6 py-5">
                <div>
                  <h2 className="font-display text-xl text-ink-900">Recent orders</h2>
                  <p className="mt-1 text-xs text-ink-500">Latest transactions across all channels</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                  <Clock size={12} />
                  Live
                </span>
              </div>
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ShoppingBag size={22} className="text-ink-300" />
                  <p className="mt-2 text-sm text-ink-400">No orders yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-ink-100 bg-ivory-100/60">
                        <th className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Order</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Time</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Payment</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Status</th>
                        <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100/70">
                      {recentOrders.map(order => (
                        <tr key={order.id} className="transition-colors hover:bg-ivory-100/50">
                          <td className="px-6 py-3.5 font-medium text-ink-900">{order.order_number}</td>
                          <td className="px-4 py-3.5 text-ink-500">
                            {new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3.5 capitalize text-ink-600">{order.payment_method || '—'}</td>
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[order.status] || 'bg-ink-50 text-ink-600 ring-1 ring-inset ring-ink-200'}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right font-semibold text-ink-900 tabular-nums">
                            {formatCurrency(Number(order.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
