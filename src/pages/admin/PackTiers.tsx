import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Pencil, Trash2, X, DollarSign } from 'lucide-react';

interface PackTier {
  id: string;
  name: string;
  display_name: string;
  max_products: number;
  max_categories: number;
  max_addons: number;
  price: number;
  description: string;
  display_order: number;
  is_active: boolean;
}

const emptyForm: Omit<PackTier, 'id'> = {
  name: '',
  display_name: '',
  max_products: 10,
  max_categories: 3,
  max_addons: 5,
  price: 0,
  description: '',
  display_order: 0,
  is_active: true,
};

export default function PackTiers() {
  const [tiers, setTiers] = useState<PackTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PackTier | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('product_pack_tiers').select('*').order('display_order');
    setTiers(data || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, display_order: tiers.length + 1 });
    setShowForm(true);
  }

  function openEdit(t: PackTier) {
    setEditing(t);
    setForm({
      name: t.name,
      display_name: t.display_name,
      max_products: t.max_products,
      max_categories: t.max_categories,
      max_addons: t.max_addons,
      price: t.price,
      description: t.description,
      display_order: t.display_order,
      is_active: t.is_active,
    });
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim() || !form.display_name.trim()) {
      alert('Name and display name are required');
      return;
    }
    const payload = {
      ...form,
      name: form.name.trim().toLowerCase().replace(/\s+/g, '_'),
      display_name: form.display_name.trim(),
    };
    const { error } = editing
      ? await supabase.from('product_pack_tiers').update(payload).eq('id', editing.id)
      : await supabase.from('product_pack_tiers').insert(payload);
    if (error) return alert(error.message);
    setShowForm(false);
    load();
  }

  async function remove(t: PackTier) {
    if (!confirm(`Delete tier "${t.display_name}"?`)) return;
    const { error } = await supabase.from('product_pack_tiers').delete().eq('id', t.id);
    if (error) return alert(error.message);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Layers className="w-8 h-8 text-emerald-600" />
            Product Pack Tiers
          </h1>
          <p className="text-slate-600 mt-1">
            Define bundles like Nano, Starter, Pro, Super with product limits and pricing.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Tier
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-10 text-slate-500">Loading...</div>
        ) : tiers.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
            No tiers yet. Create your first tier to start packaging your catalog.
          </div>
        ) : (
          tiers.map((t) => (
            <div
              key={t.id}
              className={`bg-white rounded-xl shadow-sm border ${
                t.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'
              } overflow-hidden flex flex-col`}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">{t.name}</div>
                    <div className="text-2xl font-bold text-slate-900">{t.display_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end text-emerald-700 font-bold text-xl">
                      <DollarSign className="w-5 h-5" />
                      {t.price}
                    </div>
                  </div>
                </div>
                {t.description && (
                  <p className="text-sm text-slate-600 mb-3 line-clamp-2">{t.description}</p>
                )}
                <ul className="space-y-1 text-sm text-slate-700">
                  <li className="flex justify-between">
                    <span>Products</span>
                    <span className="font-semibold">{t.max_products >= 99999 ? 'Unlimited' : t.max_products}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Categories</span>
                    <span className="font-semibold">{t.max_categories >= 999 ? 'Unlimited' : t.max_categories}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Add-ons</span>
                    <span className="font-semibold">{t.max_addons >= 999 ? 'Unlimited' : t.max_addons}</span>
                  </li>
                </ul>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    t.is_active
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {t.is_active ? 'Active' : 'Inactive'}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(t)}
                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? 'Edit Pack Tier' : 'New Pack Tier'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Key (slug)</span>
                  <input
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="nano"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Display Name</span>
                  <input
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Nano"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Max Products</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.max_products}
                    onChange={(e) => setForm({ ...form, max_products: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Max Categories</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.max_categories}
                    onChange={(e) => setForm({ ...form, max_categories: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Max Add-ons</span>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.max_addons}
                    onChange={(e) => setForm({ ...form, max_addons: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Price</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700 mb-1 block">Display Order</span>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    value={form.display_order}
                    onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Description</span>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                >
                  Save Tier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
