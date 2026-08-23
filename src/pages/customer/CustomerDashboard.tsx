import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';
import {
  LogOut, ShoppingBag, Receipt, Wallet, Clock, CheckCircle2,
  AlertTriangle, User, Loader2, TrendingUp, DollarSign,
} from 'lucide-react';

type CustomerRow = {
  id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  loyalty_points: number | null;
  total_spent: number | null;
  total_visits: number | null;
  current_balance: number;
  credit_limit: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  total_price: number;
  status: string;
  payment_status: string | null;
  order_type: string | null;
  created_at: string;
};

type BillRow = {
  id: string;
  bill_number: string;
  description: string;
  amount: number;
  amount_paid: number;
  balance_due: number;
  due_date: string | null;
  status: string;
  created_at: string;
};

const TABS = [
  { key: 'overview', label: 'Overview', icon: TrendingUp },
  { key: 'orders', label: 'My Orders', icon: ShoppingBag },
  { key: 'bills', label: 'Bills', icon: Receipt },
];

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [tab, setTab] = useState<'overview' | 'orders' | 'bills'>('overview');

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        navigate('/customer/login');
        return;
      }

      const { data: c } = await supabase
        .from('customers')
        .select('*')
        .eq('auth_user_id', session.session.user.id)
        .maybeSingle();

      if (!c) {
        await supabase.auth.signOut();
        navigate('/customer/login');
        return;
      }

      if (c.approval_status !== 'approved') {
        await supabase.auth.signOut();
        navigate('/customer/login');
        return;
      }

      setCustomer(c as CustomerRow);

      const [{ data: o }, { data: b }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, total_price, status, payment_status, order_type, created_at')
          .eq('customer_id', c.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('customer_bills')
          .select('*')
          .eq('customer_id', c.id)
          .order('created_at', { ascending: false }),
      ]);

      setOrders((o ?? []) as OrderRow[]);
      setBills((b ?? []) as BillRow[]);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate('/customer/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!customer) return null;

  const totalDue = bills
    .filter((b) => ['pending', 'partial', 'overdue'].includes(b.status))
    .reduce((s, b) => s + Number(b.balance_due), 0);
  const totalPaid = bills
    .filter((b) => b.status === 'paid')
    .reduce((s, b) => s + Number(b.amount), 0);
  const overdueCount = bills.filter((b) => b.status === 'overdue').length;
  const pendingOrders = orders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {customer.first_name} {customer.last_name}
              </h1>
              <p className="text-xs text-slate-500">{customer.customer_number}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/menu"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition"
            >
              <ShoppingBag className="w-4 h-4" />
              Place Order
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Outstanding Balance"
            value={formatCurrency(totalDue)}
            icon={Wallet}
            tone="amber"
            hint={overdueCount > 0 ? `${overdueCount} overdue` : 'All current'}
          />
          <StatCard
            label="Total Paid"
            value={formatCurrency(totalPaid)}
            icon={CheckCircle2}
            tone="emerald"
          />
          <StatCard
            label="Pending Orders"
            value={String(pendingOrders)}
            icon={Clock}
            tone="sky"
          />
          <StatCard
            label="Loyalty Points"
            value={String(customer.loyalty_points ?? 0)}
            icon={TrendingUp}
            tone="teal"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-200 flex overflow-x-auto">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as typeof tab)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                    tab === t.key
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 sm:p-6">
            {tab === 'overview' && (
              <OverviewTab customer={customer} recentOrders={orders.slice(0, 5)} recentBills={bills.slice(0, 5)} formatCurrency={formatCurrency} />
            )}
            {tab === 'orders' && <OrdersTab orders={orders} formatCurrency={formatCurrency} />}
            {tab === 'bills' && <BillsTab bills={bills} formatCurrency={formatCurrency} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, tone, hint,
}: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>;
  tone: 'amber' | 'emerald' | 'sky' | 'teal'; hint?: string;
}) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    teal: 'bg-teal-50 text-teal-700',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function OverviewTab({
  customer, recentOrders, recentBills, formatCurrency,
}: {
  customer: CustomerRow;
  recentOrders: OrderRow[];
  recentBills: BillRow[];
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <InfoRow label="Email" value={customer.email || '-'} />
        <InfoRow label="Phone" value={customer.phone} />
        <InfoRow label="Credit Limit" value={formatCurrency(Number(customer.credit_limit))} />
        <InfoRow label="Lifetime Spend" value={formatCurrency(Number(customer.total_spent ?? 0))} />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Orders</h3>
        {recentOrders.length === 0 ? (
          <EmptyHint text="No orders yet" />
        ) : (
          <div className="space-y-2">
            {recentOrders.map((o) => (
              <OrderItem key={o.id} order={o} formatCurrency={formatCurrency} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Bills</h3>
        {recentBills.length === 0 ? (
          <EmptyHint text="No bills on file" />
        ) : (
          <div className="space-y-2">
            {recentBills.map((b) => (
              <BillItem key={b.id} bill={b} formatCurrency={formatCurrency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTab({ orders, formatCurrency }: { orders: OrderRow[]; formatCurrency: (n: number) => string }) {
  if (orders.length === 0) return <EmptyHint text="You haven't placed any orders yet" />;
  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <OrderItem key={o.id} order={o} formatCurrency={formatCurrency} />
      ))}
    </div>
  );
}

function BillsTab({ bills, formatCurrency }: { bills: BillRow[]; formatCurrency: (n: number) => string }) {
  const groups = {
    overdue: bills.filter((b) => b.status === 'overdue'),
    pending: bills.filter((b) => b.status === 'pending' || b.status === 'partial'),
    paid: bills.filter((b) => b.status === 'paid'),
    cancelled: bills.filter((b) => b.status === 'cancelled'),
  };

  if (bills.length === 0) return <EmptyHint text="No bills on file" />;

  return (
    <div className="space-y-6">
      {groups.overdue.length > 0 && (
        <BillGroup title="Overdue" tone="rose" bills={groups.overdue} formatCurrency={formatCurrency} />
      )}
      {groups.pending.length > 0 && (
        <BillGroup title="Pending & Due" tone="amber" bills={groups.pending} formatCurrency={formatCurrency} />
      )}
      {groups.paid.length > 0 && (
        <BillGroup title="Paid" tone="emerald" bills={groups.paid} formatCurrency={formatCurrency} />
      )}
      {groups.cancelled.length > 0 && (
        <BillGroup title="Cancelled" tone="slate" bills={groups.cancelled} formatCurrency={formatCurrency} />
      )}
    </div>
  );
}

function BillGroup({
  title, bills, tone, formatCurrency,
}: {
  title: string; bills: BillRow[]; tone: 'rose' | 'amber' | 'emerald' | 'slate';
  formatCurrency: (n: number) => string;
}) {
  const toneMap = {
    rose: 'text-rose-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
    slate: 'text-slate-600',
  };
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 ${toneMap[tone]}`}>{title} ({bills.length})</h3>
      <div className="space-y-2">
        {bills.map((b) => (
          <BillItem key={b.id} bill={b} formatCurrency={formatCurrency} />
        ))}
      </div>
    </div>
  );
}

function OrderItem({ order, formatCurrency }: { order: OrderRow; formatCurrency: (n: number) => string }) {
  const statusColor: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    preparing: 'bg-sky-100 text-sky-700',
    ready: 'bg-teal-100 text-teal-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3 hover:border-slate-300 transition">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 truncate">{order.order_number}</p>
        <p className="text-xs text-slate-500">
          {new Date(order.created_at).toLocaleString()} · {order.order_type || 'dine-in'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor[order.status] || 'bg-slate-100 text-slate-700'}`}>
          {order.status}
        </span>
        <p className="font-bold text-slate-900">{formatCurrency(Number(order.total_price))}</p>
      </div>
    </div>
  );
}

function BillItem({ bill, formatCurrency }: { bill: BillRow; formatCurrency: (n: number) => string }) {
  const statusIcon = {
    paid: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    overdue: <AlertTriangle className="w-4 h-4 text-rose-600" />,
    pending: <Clock className="w-4 h-4 text-amber-600" />,
    partial: <DollarSign className="w-4 h-4 text-amber-600" />,
    cancelled: <AlertTriangle className="w-4 h-4 text-slate-400" />,
  }[bill.status] || <Clock className="w-4 h-4 text-slate-400" />;

  return (
    <div className="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3 hover:border-slate-300 transition">
      <div className="flex items-start gap-3 min-w-0">
        <div className="pt-0.5">{statusIcon}</div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{bill.bill_number}</p>
          <p className="text-xs text-slate-500 truncate">{bill.description || 'Bill'}</p>
          {bill.due_date && (
            <p className="text-xs text-slate-500 mt-0.5">
              Due: {new Date(bill.due_date).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-slate-900">{formatCurrency(Number(bill.amount))}</p>
        {bill.status !== 'paid' && bill.status !== 'cancelled' && (
          <p className="text-xs text-rose-600 font-medium">
            Due {formatCurrency(Number(bill.balance_due))}
          </p>
        )}
        {bill.status === 'paid' && <p className="text-xs text-emerald-600 font-medium">Paid in full</p>}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-slate-500 text-sm bg-slate-50 rounded-lg">
      {text}
    </div>
  );
}
