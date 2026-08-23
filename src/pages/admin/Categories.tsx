import { useEffect, useState } from 'react';
import { CreditCard as Edit2, FolderOpen, Hash, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];

const EMPTY = { name: '', image_url: '', display_order: 0, is_active: true };

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('display_order', { ascending: true });
    if (data) setCategories(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      await supabase.from('categories').update(formData).eq('id', editingCategory.id);
    } else {
      await supabase.from('categories').insert(formData);
    }
    closeModal();
    fetchCategories();
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      image_url: category.image_url || '',
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category?')) return;
    await supabase.from('categories').delete().eq('id', id);
    fetchCategories();
  };

  const openAdd = () => { setEditingCategory(null); setFormData(EMPTY); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingCategory(null); setFormData(EMPTY); };

  const activeCount = categories.filter((c) => c.is_active).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Catalog</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Categories</h1>
            <p className="mt-1 text-sm text-ink-500">Organize the menu into browsable sections.</p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
          >
            <Plus className="h-4 w-4" /> Add category
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Total</p>
          <p className="mt-1 font-display text-2xl text-ink-900 tabular-nums">{categories.length}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-soft">
          <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Active</p>
          <p className="mt-1 font-display text-2xl text-ocean-800 tabular-nums">{activeCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-3xl border border-ink-100 bg-white" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
            <FolderOpen className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-ink-700">No categories yet</p>
          <p className="text-xs text-ink-400">Create one to start organizing your menu.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((category) => (
            <motion.div
              key={category.id}
              layout
              whileHover={{ y: -2 }}
              className="group overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft transition hover:shadow-lifted"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-ivory-100">
                {category.image_url ? (
                  <img
                    src={category.image_url}
                    alt={category.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-300">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute left-3 top-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
                    category.is_active ? 'bg-emerald-500/95 text-white' : 'bg-ink-900/80 text-ivory-50'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${category.is_active ? 'bg-white' : 'bg-ink-400'}`} />
                    {category.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="absolute right-3 top-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-semibold text-ink-700 backdrop-blur-sm">
                    <Hash className="h-2.5 w-2.5" />
                    {category.display_order}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-display text-xl text-ink-900">{category.name}</h3>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleEdit(category)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-ink-100 bg-white py-2 text-xs font-medium text-ink-700 transition hover:border-ocean-200 hover:text-ocean-800"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="inline-flex items-center justify-center rounded-full border border-ink-100 bg-white px-3 py-2 text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeModal}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Category</p>
                  <h2 className="font-display text-2xl text-ink-900">
                    {editingCategory ? 'Edit category' : 'New category'}
                  </h2>
                </div>
                <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-100">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Name</label>
                  <input
                    type="text" required value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Image URL</label>
                  <input
                    type="url" value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://images.pexels.com/…"
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                  {formData.image_url && (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-ink-100">
                      <img src={formData.image_url} alt="Preview" className="h-40 w-full object-cover" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Display order</label>
                  <input
                    type="number" value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                  />
                </div>

                <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-ink-100 bg-white px-4 py-2.5 hover:border-ink-200">
                  <div>
                    <p className="text-sm font-medium text-ink-900">Active</p>
                    <p className="text-xs text-ink-500">Visible to guests on the kiosk menu</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                    className={`relative flex h-5 w-9 items-center rounded-full transition ${formData.is_active ? 'bg-ocean-800' : 'bg-ink-200'}`}
                  >
                    <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${formData.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>

                <div className="flex gap-2 pt-2">
                  <button type="submit" className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900">
                    {editingCategory ? 'Update category' : 'Create category'}
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
