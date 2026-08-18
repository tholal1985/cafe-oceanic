import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';
import {
  CheckCircle2, XCircle, Plus, Receipt, DollarSign, Loader2,
  AlertTriangle, Users, Search, X,
} from 'lucide-react';

type Customer = {
  id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  approval_status: string;
  current_balance: number;
  credit_limit: number;
};

type Bill = {
  id: string;
  bill_number: string;
  customer_id: string;
  description: string;
  amount: number;
  amount_paid: number;
  balance_due: number;
  due_date: string | null;
  status: string;
  created_at: string;
};

export default function CustomerBilling() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'pending' | 'approved' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<Bill | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: b }] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_bills').select('*').order('created_at', { ascending: false }),
    ]);
    setCustomers((c ?? []) as Customer[]);
    setBills((b ?? []) as Bill[]);
    setLoading(false);
  };

  const updateApproval = async (id: string, status: 'approved' | 'rejected') => {
    const { data: auth } = await supabase.auth.getUser();
    await supabase
      .from('customers')
      .update({
        approval_status: status,
        approved_at: new Date().toISOString(),
        approved_by: auth.user?.id ?? null,
      })
      .eq('id', id);
    await load();
  };

  const filtered = customers.filter((c) => {
    if (tab === 'pending' && c.approval_status !== 'pending') return false;
    if (tab === 'approved' && c.approval_status !== 'approved') return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.customer_number.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const customerBills = selected ? bills.filter((b) => b.customer_id === selected.id) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Customer Billing</h1>
        <p className="text-sm text-slate-600 mt-1">
          Approve customer accounts and manage their bills
        </p>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {(['pending', 'approved', 'all'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded capitalize transition ${
                    tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No customers</p>
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3 hover:bg-slate-50 transition ${
                  selected?.id === c.id ? 'bg-teal-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="font-semibold text-slate-900 truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  <StatusBadge status={c.approval_status} />
                </div>
                <p className="text-xs text-slate-500 truncate">{c.email || c.phone}</p>
                {Number(c.current_balance) > 0 && (
                  <p className="text-xs text-rose-600 font-medium mt-1">
                    Balance: {formatCurrency(Number(c.current_balance))}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {!selected ? (
            <div className="p-12 text-center text-slate-500">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Select a customer to manage bills</p>
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-bold text-slate-900">
                      {selected.first_name} {selected.last_name}
                    </h2>
                    <StatusBadge status={selected.approval_status} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {selected.customer_number} · {selected.email || selected.phone}
                  </p>
                  <div className="flex gap-4 mt-3 text-sm">
                    <div>
                      <span className="text-slate-500">Outstanding: </span>
                      <span className="font-semibold text-rose-600">
                        {formatCurrency(Number(selected.current_balance))}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Credit limit: </span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(Number(selected.credit_limit))}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {selected.approval_status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateApproval(selected.id, 'approved')}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => updateApproval(selected.id, 'rejected')}
                        className="flex items-center gap-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </>
                  )}
                  {selected.approval_status === 'approved' && (
                    <button
                      onClick={() => setShowBillModal(true)}
                      className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      New Bill
                    </button>
                  )}
                </div>
              </div>

              <div className="p-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">
                  Bills ({customerBills.length})
                </h3>
                {customerBills.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-lg text-sm text-slate-500">
                    No bills on file
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerBills.map((b) => (
                      <div
                        key={b.id}
                        className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900 truncate">{b.bill_number}</p>
                            <BillStatusBadge status={b.status} />
                          </div>
                          <p className="text-xs text-slate-500 truncate">{b.description || 'Bill'}</p>
                          {b.due_date && (
                            <p className="text-xs text-slate-500">
                              Due: {new Date(b.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {formatCurrency(Number(b.amount))}
                          </p>
                          {Number(b.balance_due) > 0 && (
                            <p className="text-xs text-rose-600 font-medium">
                              Due {formatCurrency(Number(b.balance_due))}
                            </p>
                          )}
                        </div>
                        {Number(b.balance_due) > 0 && b.status !== 'cancelled' && (
                          <button
                            onClick={() => setShowPayModal(b)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
                          >
                            <DollarSign className="w-3 h-3" />
                            Pay
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showBillModal && selected && (
        <BillFormModal
          customer={selected}
          onClose={() => setShowBillModal(false)}
          onSaved={() => {
            setShowBillModal(false);
            load();
          }}
        />
      )}

      {showPayModal && (
        <PaymentModal
          bill={showPayModal}
          onClose={() => setShowPayModal(null)}
          onSaved={() => {
            setShowPayModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function BillStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    partial: 'bg-sky-100 text-sky-700',
    overdue: 'bg-rose-100 text-rose-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function BillFormModal({
  customer, onClose, onSaved,
}: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('customer_bills').insert({
      customer_id: customer.id,
      description,
      amount: Number(amount),
      due_date: dueDate || null,
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    onSaved();
  };

  return (
    <ModalShell title="Create Bill" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Description">
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </Field>
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </Field>
        <Field label="Due date (optional)">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </Field>
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white rounded-lg font-medium flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Bill
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function PaymentModal({
  bill, onClose, onSaved,
}: { bill: Bill; onClose: () => void; onSaved: () => void }) {
  const { formatCurrency } = useCurrency();
  const [amount, setAmount] = useState(String(bill.balance_due));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('customer_bill_payments').insert({
      bill_id: bill.id,
      customer_id: bill.customer_id,
      amount: Number(amount),
      payment_method: method,
      reference,
      recorded_by: auth.user?.id ?? null,
    });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    onSaved();
  };

  return (
    <ModalShell title={`Pay ${bill.bill_number}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Balance due</span>
            <span className="font-semibold text-rose-600">
              {formatCurrency(Number(bill.balance_due))}
            </span>
          </div>
        </div>
        <Field label="Payment amount">
          <input
            type="number"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </Field>
        <Field label="Payment method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="credit">Store Credit</option>
          </select>
        </Field>
        <Field label="Reference (optional)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </Field>
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg font-medium">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg font-medium flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Record Payment
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
