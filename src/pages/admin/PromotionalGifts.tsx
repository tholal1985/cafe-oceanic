import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, CreditCard as Edit2, Gift, Package, Plus, Trash2, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import DataTable, { Column } from '../../components/DataTable';

type Product = Database['public']['Tables']['products']['Row'];
type PromotionalGift = Database['public']['Tables']['promotional_gifts']['Row'];

interface GiftWithProduct extends PromotionalGift {
  product: Product;
}

const EMPTY = {
  product_id: '',
  minimum_order_value: 50,
  gift_title: 'FREE gift with your order!',
  gift_description: '',
  is_active: true,
  priority: 0,
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  max_redemptions: null as number | null,
};

export default function PromotionalGifts() {
  const [gifts, setGifts] = useState<GiftWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [giftsRes, productsRes] = await Promise.all([
        supabase.from('promotional_gifts').select(`*, product:products(*)`).order('priority', { ascending: false }),
        supabase.from('products').select('*').eq('is_available', true).order('name', { ascending: true }),
      ]);
      if (giftsRes.error) throw giftsRes.error;
      if (productsRes.error) throw productsRes.error;
      setGifts((giftsRes.data as GiftWithProduct[]) || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData = {
        ...formData,
        end_date: formData.end_date || null,
        max_redemptions: formData.max_redemptions || null,
      };
      if (editingId) {
        const { error } = await supabase.from('promotional_gifts').update(submitData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('promotional_gifts').insert([submitData]);
        if (error) throw error;
      }
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving gift:', error);
      alert('Failed to save gift');
    }
  };

  const handleEdit = (gift: GiftWithProduct) => {
    setFormData({
      product_id: gift.product_id,
      minimum_order_value: gift.minimum_order_value,
      gift_title: gift.gift_title,
      gift_description: gift.gift_description,
      is_active: gift.is_active,
      priority: gift.priority,
      start_date: gift.start_date.split('T')[0],
      end_date: gift.end_date ? gift.end_date.split('T')[0] : '',
      max_redemptions: gift.max_redemptions,
    });
    setEditingId(gift.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this gift promotion?')) return;
    try {
      const { error } = await supabase.from('promotional_gifts').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting gift:', error);
      alert('Failed to delete gift');
    }
  };

  const resetForm = () => {
    setFormData(EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const stats = useMemo(() => {
    const live = gifts.filter((g) => g.is_active).length;
    const redemptions = gifts.reduce((s, g) => s + (g.redemptions_count || 0), 0);
    return { total: gifts.length, live, redemptions };
  }, [gifts]);

  const columns: Column<GiftWithProduct>[] = [
    {
      key: 'gift', header: 'Gift',
      cell: (g) => (
        <div className="flex items-center gap-3">
          {g.product?.image_url ? (
            <img src={g.product.image_url} alt={g.product.name} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Gift className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="font-medium text-ink-900">{g.product?.name}</div>
            <div className="text-xs text-ink-500 tabular-nums">Value ${Number(g.product?.price).toFixed(2)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'threshold', header: 'Threshold', align: 'right',
      cell: (g) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 tabular-nums ring-1 ring-inset ring-emerald-200">
          Min ${g.minimum_order_value.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'title', header: 'Message',
      cell: (g) => (
        <div className="max-w-sm">
          <div className="font-medium text-ink-900">{g.gift_title}</div>
          <div className="line-clamp-2 text-xs text-ink-500">{g.gift_description}</div>
        </div>
      ),
    },
    {
      key: 'schedule', header: 'Schedule',
      cell: (g) => (
        <div className="flex items-center gap-1.5 text-xs text-ink-500 tabular-nums">
          <Calendar className="h-3 w-3 text-ink-400" />
          {new Date(g.start_date).toLocaleDateString()}
          {g.end_date && <> → {new Date(g.end_date).toLocaleDateString()}</>}
        </div>
      ),
    },
    {
      key: 'redemptions', header: 'Redeemed', align: 'right',
      cell: (g) => (
        <div className="text-sm tabular-nums">
          <span className="font-semibold text-ink-900">{g.redemptions_count}</span>
          {g.max_redemptions && <span className="text-ink-400"> / {g.max_redemptions}</span>}
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      cell: (g) => (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
          g.is_active ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-ink-100 text-ink-600 ring-ink-200'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${g.is_active ? 'bg-emerald-500' : 'bg-ink-400'}`} />
          {g.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', header: '', align: 'right', width: '100px',
      cell: (g) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleEdit(g); }} className="rounded-lg p-1.5 text-ocean-700 hover:bg-ocean-50">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Loyalty</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Promotional gifts</h1>
            <p className="mt-1 text-sm text-ink-500">Reward guests with a surprise when they cross a spend.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Close form' : 'Add gift'}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Total</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Live</p>
          <p className="mt-1 font-display text-2xl text-emerald-700 tabular-nums">{stats.live}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Redeemed</p>
          <p className="mt-1 font-display text-2xl text-ocean-800 tabular-nums">{stats.redemptions}</p>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft"
          >
            <div className="border-b border-ink-100 px-6 py-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">{editingId ? 'Editing' : 'New promotion'}</p>
              <h2 className="font-display text-xl text-ink-900">
                {editingId ? 'Edit promotional gift' : 'Set up a promotional gift'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Gift product</label>
                  <select
                    required value={formData.product_id}
                    onChange={(e) => {
                      const product = products.find((p) => p.id === e.target.value);
                      setFormData({
                        ...formData,
                        product_id: e.target.value,
                        gift_description: product
                          ? `Congratulations! Your order qualifies for a FREE ${product.name}!`
                          : '',
                      });
                    }}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                  >
                    <option value="">Select a product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — ${Number(p.price).toFixed(2)}</option>
                    ))}
                  </select>
                </div>

                <NumField
                  label="Minimum order ($)" required step="0.01" min="0"
                  value={formData.minimum_order_value}
                  onChange={(v) => setFormData({ ...formData, minimum_order_value: v })}
                />

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Gift title</label>
                  <input
                    type="text" required value={formData.gift_title}
                    onChange={(e) => setFormData({ ...formData, gift_title: e.target.value })}
                    placeholder="FREE gift with your order!"
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Description</label>
                  <textarea
                    required value={formData.gift_description} rows={3}
                    onChange={(e) => setFormData({ ...formData, gift_description: e.target.value })}
                    placeholder="Congratulations! Your order qualifies for…"
                    className="w-full rounded-2xl border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <NumField
                  label="Priority" required
                  value={formData.priority}
                  onChange={(v) => setFormData({ ...formData, priority: v })}
                  hint="Higher runs first"
                />

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Max redemptions</label>
                  <input
                    type="number" min={1}
                    value={formData.max_redemptions ?? ''}
                    onChange={(e) => setFormData({ ...formData, max_redemptions: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="Unlimited"
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Start date</label>
                  <input
                    type="date" required value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">End date</label>
                  <input
                    type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium text-ink-900">Active</p>
                    <p className="text-xs text-ink-500">Eligible orders will surface the gift</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                    className={`relative flex h-5 w-9 items-center rounded-full transition ${formData.is_active ? 'bg-ocean-800' : 'bg-ink-200'}`}
                  >
                    <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900">
                  {editingId ? 'Update gift' : 'Create gift'}
                </button>
                <button type="button" onClick={resetForm} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                  Cancel
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <DataTable
        columns={columns}
        rows={gifts}
        rowKey={(g) => g.id}
        loading={loading}
        emptyTitle="No gift promotions yet"
        emptyHint="Offer a small treat to celebrate bigger orders."
        emptyIcon={<Package className="h-6 w-6" />}
      />
    </div>
  );
}

function NumField({
  label, value, onChange, required, step, min, hint,
}: { label: string; value: number; onChange: (v: number) => void; required?: boolean; step?: string; min?: string; hint?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">{label}</label>
      <input
        type="number" required={required} step={step} min={min} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 tabular-nums outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
      />
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}
