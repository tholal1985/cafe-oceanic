import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coffee, CreditCard as Edit2, IceCream, Package, Plus, Sparkles, Trash2,
  TrendingUp, UtensilsCrossed, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import DataTable, { Column } from '../../components/DataTable';

type Product = Database['public']['Tables']['products']['Row'];
type SuggestedProduct = Database['public']['Tables']['suggested_products']['Row'];

interface SuggestionWithProduct extends SuggestedProduct {
  product: Product;
}

const TYPES = [
  { value: 'drink',    label: 'Drink',    icon: Coffee },
  { value: 'side',     label: 'Side',     icon: UtensilsCrossed },
  { value: 'dessert',  label: 'Dessert',  icon: IceCream },
  { value: 'combo',    label: 'Combo',    icon: Package },
  { value: 'popular',  label: 'Popular',  icon: TrendingUp },
] as const;

const TYPE_COLOR: Record<string, string> = {
  drink:   'bg-ocean-50 text-ocean-800 ring-ocean-200',
  side:    'bg-amber-50 text-amber-800 ring-amber-200',
  dessert: 'bg-rose-50 text-rose-700 ring-rose-200',
  combo:   'bg-emerald-50 text-emerald-800 ring-emerald-200',
  popular: 'bg-ink-100 text-ink-800 ring-ink-200',
};

const EMPTY = {
  product_id: '',
  suggestion_type: 'popular' as const,
  display_text: '',
  display_order: 0,
  is_active: true,
};

export default function UpsellSuggestions() {
  const [suggestions, setSuggestions] = useState<SuggestionWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<typeof EMPTY>(EMPTY);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [suggestionsRes, productsRes] = await Promise.all([
        supabase.from('suggested_products').select(`*, product:products(*)`).order('display_order', { ascending: true }),
        supabase.from('products').select('*').eq('is_available', true).order('name', { ascending: true }),
      ]);
      if (suggestionsRes.error) throw suggestionsRes.error;
      if (productsRes.error) throw productsRes.error;
      setSuggestions((suggestionsRes.data as SuggestionWithProduct[]) || []);
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
      if (editingId) {
        const { error } = await supabase.from('suggested_products').update(formData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suggested_products').insert([formData]);
        if (error) throw error;
      }
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving suggestion:', error);
      alert('Failed to save suggestion');
    }
  };

  const handleEdit = (s: SuggestionWithProduct) => {
    setFormData({
      product_id: s.product_id,
      suggestion_type: s.suggestion_type as typeof EMPTY.suggestion_type,
      display_text: s.display_text,
      display_order: s.display_order,
      is_active: s.is_active,
    });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this suggestion?')) return;
    try {
      const { error } = await supabase.from('suggested_products').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting suggestion:', error);
      alert('Failed to delete suggestion');
    }
  };

  const resetForm = () => { setFormData(EMPTY); setEditingId(null); setShowForm(false); };

  const activeCount = suggestions.filter((s) => s.is_active).length;

  const columns: Column<SuggestionWithProduct>[] = [
    {
      key: 'order', header: 'Order', width: '64px',
      cell: (s) => (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ivory-100 text-xs font-semibold text-ink-700 tabular-nums">
          {s.display_order}
        </span>
      ),
    },
    {
      key: 'product', header: 'Product',
      cell: (s) => (
        <div className="flex items-center gap-3">
          {s.product?.image_url ? (
            <img src={s.product.image_url} alt={s.product.name} className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ivory-100 text-ink-300">
              <Package className="h-4 w-4" />
            </div>
          )}
          <div>
            <div className="font-medium text-ink-900">{s.product?.name}</div>
            <div className="font-display text-sm text-ocean-800 tabular-nums">${Number(s.product?.price).toFixed(2)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'type', header: 'Type',
      cell: (s) => {
        const t = TYPES.find((x) => x.value === s.suggestion_type);
        const Icon = t?.icon || Sparkles;
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${TYPE_COLOR[s.suggestion_type] || TYPE_COLOR.popular}`}>
            <Icon className="h-3 w-3" />
            {t?.label || s.suggestion_type}
          </span>
        );
      },
    },
    {
      key: 'text', header: 'Display text',
      cell: (s) => <span className="italic text-ink-700">"{s.display_text}"</span>,
    },
    {
      key: 'status', header: 'Status',
      cell: (s) => (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
          s.is_active ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-ink-100 text-ink-600 ring-ink-200'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.is_active ? 'bg-emerald-500' : 'bg-ink-400'}`} />
          {s.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions', header: '', align: 'right', width: '100px',
      cell: (s) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleEdit(s); }} className="rounded-lg p-1.5 text-ocean-700 hover:bg-ocean-50">
            <Edit2 className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Merchandising</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Upsell suggestions</h1>
            <p className="mt-1 text-sm text-ink-500">The friendly nudge shown just before checkout.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Close form' : 'Add suggestion'}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Total</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{suggestions.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Live</p>
          <p className="mt-1 font-display text-2xl text-ocean-800 tabular-nums">{activeCount}</p>
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
              <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">{editingId ? 'Editing' : 'New suggestion'}</p>
              <h2 className="font-display text-xl text-ink-900">
                {editingId ? 'Edit suggestion' : 'Add a suggestion'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Product</label>
                  <select
                    required value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                  >
                    <option value="">Select a product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — ${Number(p.price).toFixed(2)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Suggestion type</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {TYPES.map((t) => {
                      const Icon = t.icon;
                      const active = formData.suggestion_type === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, suggestion_type: t.value })}
                          className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2.5 transition ${
                            active ? 'border-ocean-700 bg-ocean-50 text-ocean-800' : 'border-ink-100 bg-white text-ink-500 hover:border-ink-200'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-[10px] font-medium">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Display text</label>
                  <input
                    type="text" required value={formData.display_text}
                    onChange={(e) => setFormData({ ...formData, display_text: e.target.value })}
                    placeholder="e.g. Perfect with your meal!"
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Display order</label>
                  <input
                    type="number" required value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
                  <div>
                    <p className="text-sm font-medium text-ink-900">Active</p>
                    <p className="text-xs text-ink-500">Show this suggestion at checkout</p>
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
                  {editingId ? 'Update suggestion' : 'Create suggestion'}
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
        rows={suggestions}
        rowKey={(s) => s.id}
        loading={loading}
        emptyTitle="No suggestions yet"
        emptyHint="Create your first upsell to nudge guests toward extras."
        emptyIcon={<Sparkles className="h-6 w-6" />}
      />
    </div>
  );
}
