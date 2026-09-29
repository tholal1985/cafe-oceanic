import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Search, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useCurrency } from '../../hooks/useCurrency';

interface ProductCacheItem {
  id: string;
  ultimatepos_product_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  selling_price: number;
  image_url: string | null;
  stock_quantity: number;
  location_id: number | null;
  is_active: boolean;
  synced_at: string;
}

export default function KioskGatewayProducts() {
  const { formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductCacheItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('kp_products_cache').select('*').order('name');

    if (search) query = query.ilike('name', `%${search}%`);
    if (categoryFilter !== 'all') query = query.eq('category_id', categoryFilter);

    const { data } = await query.limit(200);
    setProducts((data || []) as ProductCacheItem[]);
    setLoading(false);
  }, [search, categoryFilter]);

  useEffect(() => {
    supabase
      .from('kp_categories_cache')
      .select('ultimatepos_category_id, name')
      .order('name')
      .then(({ data }) => {
        setCategories((data || []).map((c: any) => ({ id: c.ultimatepos_category_id, name: c.name })));
      });
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Product Cache</h1>
            <p className="mt-2 text-sm text-ink-500">
              Products synced from UltimatePOS. UltimatePOS remains the source of truth.
            </p>
          </div>
          <button
            onClick={fetchProducts}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5 shadow-soft">
            <Search size={14} className="text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="bg-transparent text-sm text-ink-700 focus:outline-none w-48"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-full border border-ink-100 bg-white px-4 py-1.5 text-sm text-ink-700 shadow-soft focus:outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Products grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="group relative overflow-hidden rounded-2xl border border-ink-100/70 bg-white p-5 shadow-soft transition-shadow hover:shadow-lifted"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                  <Package size={18} />
                </div>
                {product.is_active ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Active</span>
                ) : (
                  <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-200">Inactive</span>
                )}
              </div>
              <div className="mt-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
                  {product.category_name || 'Uncategorized'}
                </p>
                <p className="mt-1 font-display text-lg text-ink-900">{product.name}</p>
                {product.sku && <p className="text-xs text-ink-400 font-mono">{product.sku}</p>}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="font-display text-2xl text-ink-900 tabular-nums">{formatCurrency(Number(product.selling_price))}</p>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-ink-400">Stock</p>
                  <p className={`text-sm font-medium tabular-nums ${Number(product.stock_quantity) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {Number(product.stock_quantity)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-ink-300">
                Synced: {new Date(product.synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>

        {products.length === 0 && !loading && (
          <div className="rounded-2xl border border-ink-100/70 bg-white p-12 text-center shadow-soft">
            <Package size={32} className="mx-auto mb-3 text-ink-200" />
            <p className="text-sm text-ink-400">No products in cache. Run a sync to populate.</p>
          </div>
        )}
      </div>
    </div>
  );
}
