import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award, CreditCard as Edit2, Mail, Phone, Plus, Search, Trash2, Users, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DataTable, { Column } from '../../components/DataTable';

interface Customer {
  id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  date_of_birth: string | null;
  loyalty_points: number;
  total_visits: number;
  total_spent: number;
  average_order_value: number;
  last_visit_date: string | null;
  is_vip: boolean;
  is_active: boolean;
  loyalty_tier?: {
    tier_name: string;
    color_code: string;
    discount_percentage: number;
  };
}

interface CustomerFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  marketing_opt_in: boolean;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  is_vip: boolean;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = {
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
  gender: '', marketing_opt_in: false, sms_opt_in: false, email_opt_in: false,
  is_vip: false, notes: '',
};

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<CustomerFormData>(EMPTY_FORM);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select(`*, loyalty_tier:customer_loyalty_tiers(tier_name, color_code, discount_percentage)`)
      .order('created_at', { ascending: false });
    if (error) console.error('Error fetching customers:', error);
    else setCustomers(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customerData = {
      ...formData,
      customer_number: editingCustomer?.customer_number,
      email: formData.email || null,
      date_of_birth: formData.date_of_birth || null,
      gender: formData.gender || null,
    };

    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(customerData).eq('id', editingCustomer.id);
      if (error) { console.error('Error updating customer:', error); alert('Failed to update customer'); return; }
    } else {
      const { data: customerNumberData } = await supabase.rpc('generate_customer_number');
      const { error } = await supabase.from('customers').insert([{
        ...customerData,
        customer_number: customerNumberData,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      }]);
      if (error) { console.error('Error creating customer:', error); alert('Failed to create customer'); return; }
    }

    setIsModalOpen(false);
    setEditingCustomer(null);
    setFormData(EMPTY_FORM);
    fetchCustomers();
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email || '',
      phone: customer.phone,
      date_of_birth: customer.date_of_birth || '',
      gender: '',
      marketing_opt_in: false,
      sms_opt_in: false,
      email_opt_in: false,
      is_vip: customer.is_vip,
      notes: '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer? This action cannot be undone.')) return;
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) { console.error('Error deleting customer:', error); alert('Failed to delete customer'); return; }
    fetchCustomers();
  };

  const openAdd = () => {
    setEditingCustomer(null);
    setFormData(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setFormData(EMPTY_FORM);
  };

  const filtered = useMemo(() => customers.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.phone.includes(searchTerm) ||
      c.customer_number.toLowerCase().includes(q) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  }), [customers, searchTerm]);

  const stats = useMemo(() => {
    const vip = customers.filter((c) => c.is_vip).length;
    const totalSpend = customers.reduce((s, c) => s + Number(c.total_spent || 0), 0);
    return { total: customers.length, vip, totalSpend };
  }, [customers]);

  const columns: Column<Customer>[] = [
    {
      key: 'customer', header: 'Customer', width: '24%',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean-800 font-display text-sm text-ivory-50">
            {c.first_name[0]}{c.last_name[0]}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-ink-900">{c.first_name} {c.last_name}</span>
              {c.is_vip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  <Award className="h-2.5 w-2.5" /> VIP
                </span>
              )}
            </div>
            <div className="text-xs text-ink-400 tabular-nums">{c.customer_number}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'contact', header: 'Contact',
      cell: (c) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-ink-700"><Phone className="h-3.5 w-3.5 text-ink-400" />{c.phone}</div>
          {c.email && <div className="flex items-center gap-1.5 text-xs text-ink-500"><Mail className="h-3 w-3 text-ink-400" />{c.email}</div>}
        </div>
      ),
    },
    {
      key: 'loyalty', header: 'Loyalty',
      cell: (c) => c.loyalty_tier ? (
        <div className="flex flex-col gap-1">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${c.loyalty_tier.color_code}20`, color: c.loyalty_tier.color_code }}
          >
            {c.loyalty_tier.tier_name}
          </span>
          <span className="font-display text-sm text-ocean-800 tabular-nums">{c.loyalty_points} pts</span>
        </div>
      ) : <span className="text-xs text-ink-400">—</span>,
    },
    {
      key: 'stats', header: 'Activity',
      cell: (c) => (
        <div className="text-xs">
          <div className="text-ink-900 tabular-nums">{c.total_visits} visits · ${Number(c.total_spent).toFixed(2)}</div>
          <div className="text-ink-500 tabular-nums">Avg ${Number(c.average_order_value).toFixed(2)}</div>
          {c.last_visit_date && <div className="text-ink-400 tabular-nums">Last {new Date(c.last_visit_date).toLocaleDateString()}</div>}
        </div>
      ),
    },
    {
      key: 'actions', header: '', align: 'right', width: '120px',
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleEdit(c); }} className="rounded-lg p-1.5 text-ocean-700 hover:bg-ocean-50" title="Edit">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">CRM</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Customers</h1>
            <p className="mt-1 text-sm text-ink-500">Profiles, loyalty, and visit history.</p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            <Plus className="h-4 w-4" /> Add customer
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatPill label="Total" value={stats.total.toString()} />
        <StatPill label="VIP" value={stats.vip.toString()} accent="amber" />
        <StatPill label="Lifetime spend" value={`$${stats.totalSpend.toFixed(2)}`} accent="ocean" />
      </div>

      <div className="mb-4 rounded-3xl border border-ink-100 bg-white p-3 shadow-soft">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search by name, phone, email, or customer number…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-full border border-ink-100 bg-ivory-100/50 py-2.5 pl-10 pr-4 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:bg-white focus:ring-2 focus:ring-ocean-200"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        loading={loading}
        emptyTitle="No customers yet"
        emptyHint="Add a customer or adjust your search."
        emptyIcon={<Users className="h-6 w-6" />}
        onRowClick={handleEdit}
      />

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/60 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">
                    {editingCustomer ? 'Edit profile' : 'New profile'}
                  </p>
                  <h2 className="font-display text-2xl text-ink-900">
                    {editingCustomer ? `${editingCustomer.first_name} ${editingCustomer.last_name}` : 'Add customer'}
                  </h2>
                </div>
                <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="scroll-soft max-h-[calc(90vh-140px)] overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name" required value={formData.first_name} onChange={(v) => setFormData({ ...formData, first_name: v })} />
                  <Field label="Last name" required value={formData.last_name} onChange={(v) => setFormData({ ...formData, last_name: v })} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Phone" required type="tel" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
                  <Field label="Email" type="email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Date of birth" type="date" value={formData.date_of_birth} onChange={(v) => setFormData({ ...formData, date_of_birth: v })} />
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Preferences, allergies, etc."
                    className="w-full rounded-2xl border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <Toggle label="VIP customer" checked={formData.is_vip} onChange={(v) => setFormData({ ...formData, is_vip: v })} />
                  <Toggle label="Marketing opt-in" checked={formData.marketing_opt_in} onChange={(v) => setFormData({ ...formData, marketing_opt_in: v })} />
                  <Toggle label="SMS notifications" checked={formData.sms_opt_in} onChange={(v) => setFormData({ ...formData, sms_opt_in: v })} />
                  <Toggle label="Email notifications" checked={formData.email_opt_in} onChange={(v) => setFormData({ ...formData, email_opt_in: v })} />
                </div>

                <div className="mt-6 flex gap-2">
                  <button type="submit" className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900">
                    {editingCustomer ? 'Update customer' : 'Add customer'}
                  </button>
                  <button type="button" onClick={closeModal} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatPill({ label, value, accent = 'ink' }: { label: string; value: string; accent?: 'ink' | 'ocean' | 'amber' }) {
  const tone =
    accent === 'ocean' ? 'text-ocean-800' :
    accent === 'amber' ? 'text-amber-700' :
    'text-ink-900';
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
      <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">{label}</p>
      <p className={`mt-1 font-display text-2xl tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">
        {label}{required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <input
        type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
      <span className="text-sm text-ink-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-ocean-800' : 'bg-ink-200'}`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
