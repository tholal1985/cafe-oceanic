import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, CircleDashed, Clock, CreditCard, Eye, RefreshCw, Wallet, X, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import DataTable, { Column } from '../../components/DataTable';

type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'];

interface TransactionWithDetails extends PaymentTransaction {
  orders?: { order_number: string };
  payment_gateways?: { name: string; gateway_type: string };
}

const STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  pending:    { label: 'Pending',    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',     dot: 'bg-amber-500' },
  processing: { label: 'Processing', chip: 'bg-ocean-50 text-ocean-800 ring-1 ring-inset ring-ocean-200',     dot: 'bg-ocean-700' },
  completed:  { label: 'Completed',  chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200', dot: 'bg-emerald-500' },
  failed:     { label: 'Failed',     chip: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',        dot: 'bg-rose-500' },
  refunded:   { label: 'Refunded',   chip: 'bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200',          dot: 'bg-ink-500' },
  cancelled:  { label: 'Cancelled',  chip: 'bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200',          dot: 'bg-ink-400' },
  expired:    { label: 'Expired',    chip: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',        dot: 'bg-rose-400' },
};

const FILTERS = ['all', 'pending', 'processing', 'completed', 'failed', 'refunded'] as const;

export default function PaymentTransactions() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithDetails | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<typeof FILTERS[number]>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
    const subscription = supabase
      .channel('payment_transactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, () => fetchTransactions())
      .subscribe();
    return () => { subscription.unsubscribe(); };
  }, [statusFilter]);

  const fetchTransactions = async () => {
    setLoading(true);
    let query = supabase
      .from('payment_transactions')
      .select(`*, orders(order_number), payment_gateways(name, gateway_type)`)
      .order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;
    if (data) setTransactions(data as TransactionWithDetails[]);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const acc = { total: 0, volume: 0, completed: 0, failed: 0 };
    for (const t of transactions) {
      acc.total += 1;
      if (t.status === 'completed') { acc.completed += 1; acc.volume += Number(t.amount); }
      if (t.status === 'failed' || t.status === 'expired') acc.failed += 1;
    }
    return acc;
  }, [transactions]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: transactions.length };
    transactions.forEach((t) => { base[t.status] = (base[t.status] || 0) + 1; });
    return base;
  }, [transactions]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'failed':
      case 'cancelled':
      case 'expired': return <XCircle className="h-4 w-4 text-rose-600" />;
      case 'processing': return <RefreshCw className="h-4 w-4 animate-spin text-ocean-700" />;
      default: return <Clock className="h-4 w-4 text-amber-600" />;
    }
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);

  const formatDate = (s: string) =>
    new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getDuration = (initiated: string, completed?: string | null) => {
    const start = new Date(initiated).getTime();
    const end = completed ? new Date(completed).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const columns: Column<TransactionWithDetails>[] = [
    {
      key: 'id', header: 'Transaction',
      cell: (t) => (
        <div className="flex items-center gap-2.5">
          {getStatusIcon(t.status)}
          <div>
            <div className="font-medium text-ink-900 tabular-nums">
              {t.local_transaction_id || t.id.substring(0, 8)}
            </div>
            {t.transaction_reference && (
              <div className="text-xs text-ink-400 tabular-nums">
                Ref: {t.transaction_reference.substring(0, 12)}…
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'order', header: 'Order',
      cell: (t) => <span className="font-medium text-ink-900 tabular-nums">{t.orders?.order_number || 'N/A'}</span>,
    },
    {
      key: 'gateway', header: 'Gateway',
      cell: (t) => (
        <div>
          <div className="text-ink-900">{t.payment_gateways?.name || 'N/A'}</div>
          <div className="text-xs uppercase tracking-wider text-ink-400">{t.payment_gateways?.gateway_type || ''}</div>
        </div>
      ),
    },
    {
      key: 'amount', header: 'Amount', align: 'right',
      cell: (t) => <span className="font-display text-base text-ocean-800 tabular-nums">{formatCurrency(t.amount, t.currency)}</span>,
    },
    {
      key: 'method', header: 'Method',
      cell: (t) => <span className="capitalize text-ink-700">{t.payment_method || 'N/A'}</span>,
    },
    {
      key: 'status', header: 'Status',
      cell: (t) => {
        const meta = STATUS_META[t.status] ?? STATUS_META.pending;
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'date', header: 'Date',
      cell: (t) => <span className="text-xs text-ink-500 tabular-nums">{formatDate(t.initiated_at)}</span>,
    },
    {
      key: 'duration', header: 'Duration', align: 'right',
      cell: (t) => <span className="text-xs text-ink-500 tabular-nums">{getDuration(t.initiated_at, t.completed_at)}</span>,
    },
    {
      key: 'actions', header: '', align: 'right', width: '80px',
      cell: (t) => (
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedTransaction(t); setShowModal(true); }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ocean-700 hover:bg-ocean-50"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Finance</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Payments</h1>
            <p className="mt-1 text-sm text-ink-500">Every gateway call, response, and receipt in one place.</p>
          </div>
          <button
            onClick={fetchTransactions}
            className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2 text-xs font-medium text-ink-700 transition hover:border-ink-200"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CircleDashed} label="Transactions" value={stats.total.toString()} />
        <StatCard icon={Wallet} label="Volume (done)" value={`$${stats.volume.toFixed(2)}`} accent="ocean" />
        <StatCard icon={CheckCircle} label="Completed" value={stats.completed.toString()} accent="emerald" />
        <StatCard icon={XCircle} label="Failed" value={stats.failed.toString()} accent="rose" />
      </div>

      <div className="mb-4 scroll-soft flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const active = statusFilter === f;
          const label = f === 'all' ? 'All' : (STATUS_META[f]?.label || f);
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                active ? 'bg-ocean-800 text-ivory-50' : 'border border-ink-100 bg-white text-ink-700 hover:border-ink-200'
              }`}
            >
              {label}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-white/15' : 'bg-ink-100 text-ink-500'}`}>
                {counts[f] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <DataTable
        columns={columns}
        rows={transactions}
        rowKey={(t) => t.id}
        loading={loading}
        emptyTitle="No transactions yet"
        emptyHint="Payments will appear here in real time."
        emptyIcon={<CreditCard className="h-6 w-6" />}
        onRowClick={(t) => { setSelectedTransaction(t); setShowModal(true); }}
      />

      <AnimatePresence>
        {showModal && selectedTransaction && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/60 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Transaction</p>
                  <h2 className="font-display text-2xl text-ink-900 tabular-nums">
                    {selectedTransaction.local_transaction_id || selectedTransaction.id}
                  </h2>
                </div>
                <button onClick={() => setShowModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="scroll-soft max-h-[calc(90vh-160px)] space-y-4 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailCell label="Status">
                    {(() => {
                      const m = STATUS_META[selectedTransaction.status] ?? STATUS_META.pending;
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                          {m.label}
                        </span>
                      );
                    })()}
                  </DetailCell>
                  <DetailCell label="Amount">
                    <p className="font-display text-xl text-ocean-800 tabular-nums">
                      {formatCurrency(selectedTransaction.amount, selectedTransaction.currency)}
                    </p>
                  </DetailCell>
                  <DetailCell label="Method">
                    <p className="text-sm capitalize text-ink-900">{selectedTransaction.payment_method || 'N/A'}</p>
                  </DetailCell>
                  <DetailCell label="Gateway">
                    <p className="text-sm text-ink-900">{selectedTransaction.payment_gateways?.name || 'N/A'}</p>
                  </DetailCell>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DetailCell label="Order">
                    <p className="text-sm text-ink-900 tabular-nums">{selectedTransaction.orders?.order_number || 'N/A'}</p>
                  </DetailCell>
                  <DetailCell label="Customer phone">
                    <p className="text-sm text-ink-900 tabular-nums">{selectedTransaction.customer_phone || 'N/A'}</p>
                  </DetailCell>
                  <DetailCell label="Initiated">
                    <p className="text-sm text-ink-900 tabular-nums">{formatDate(selectedTransaction.initiated_at)}</p>
                  </DetailCell>
                  <DetailCell label="Completed">
                    <p className="text-sm text-ink-900 tabular-nums">
                      {selectedTransaction.completed_at ? formatDate(selectedTransaction.completed_at) : 'Pending'}
                    </p>
                  </DetailCell>
                </div>

                {selectedTransaction.error_message && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-rose-600">Error</p>
                    <p className="mt-1 text-sm text-rose-800">{selectedTransaction.error_message}</p>
                    {selectedTransaction.error_code && (
                      <p className="mt-1 text-xs text-rose-600 tabular-nums">Code: {selectedTransaction.error_code}</p>
                    )}
                  </div>
                )}

                {selectedTransaction.gateway_response &&
                 Object.keys(selectedTransaction.gateway_response as object).length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-ink-400">Gateway response</p>
                    <pre className="scroll-soft max-h-64 overflow-auto rounded-2xl border border-ink-100 bg-ink-900 p-4 text-xs text-ivory-100">
                      {JSON.stringify(selectedTransaction.gateway_response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, accent = 'ink',
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; accent?: 'ink' | 'ocean' | 'emerald' | 'rose' }) {
  const tone =
    accent === 'ocean' ? 'bg-ocean-50 text-ocean-800' :
    accent === 'emerald' ? 'bg-emerald-50 text-emerald-700' :
    accent === 'rose' ? 'bg-rose-50 text-rose-700' :
    'bg-ivory-100 text-ink-700';
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl text-ink-900 tabular-nums">{value}</p>
    </div>
  );
}

function DetailCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-ivory-100/40 p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
