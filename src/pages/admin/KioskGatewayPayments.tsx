import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, CreditCard, Wallet, QrCode, Banknote } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

interface PaymentRecord {
  id: string;
  order_id: string;
  payment_reference: string | null;
  method: string;
  amount: number;
  currency: string;
  status: string;
  provider: string | null;
  provider_transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
}

const METHOD_ICONS: Record<string, any> = {
  cash: Banknote,
  card: CreditCard,
  qr: QrCode,
  online: Wallet,
};

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  refunded: 'bg-ink-50 text-ink-600 ring-1 ring-inset ring-ink-200',
};

export default function KioskGatewayPayments() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, string>>({});

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('kp_payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setPayments((data || []) as PaymentRecord[]);

    const orderIds = [...new Set((data || []).map((p: any) => p.order_id))];
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('kp_orders')
        .select('id, order_number')
        .in('id', orderIds);
      const map: Record<string, string> = {};
      (orders || []).forEach((o: any) => { map[o.id] = o.order_number; });
      setOrderMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Payments</h1>
            <p className="mt-2 text-sm text-ink-500">
              Payment records from kiosk orders. No card details are ever stored.
            </p>
          </div>
          <button
            onClick={fetchPayments}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="rounded-2xl border border-ink-100/70 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/50">
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Order</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Method</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Amount</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Status</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Provider</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Reference</th>
                  <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {payments.map((payment) => {
                  const MethodIcon = METHOD_ICONS[payment.method] || CreditCard;
                  return (
                    <tr key={payment.id} className="transition-colors hover:bg-ink-50/30">
                      <td className="px-6 py-3 text-sm font-medium text-ink-900">
                        {orderMap[payment.order_id] || payment.order_id.slice(0, 8)}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                            <MethodIcon size={13} />
                          </div>
                          <span className="text-sm capitalize text-ink-700">{payment.method}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-ink-900 tabular-nums">
                        {formatCurrency(Number(payment.amount))}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_BADGES[payment.status] || ''}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-ink-700">{payment.provider || '-'}</td>
                      <td className="px-6 py-3 text-sm text-ink-500 font-mono max-w-xs truncate">
                        {payment.payment_reference || payment.provider_transaction_id || '-'}
                      </td>
                      <td className="px-6 py-3 text-sm text-ink-500">
                        {payment.paid_at
                          ? new Date(payment.paid_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : new Date(payment.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
                {payments.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-ink-400">No payments yet</td>
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
