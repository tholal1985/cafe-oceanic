import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Leaf,
  Minus,
  Plus,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { useCurrency } from '../hooks/useCurrency';
import ProductModal from '../components/ProductModal';
import type { Database } from '../lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

const HIGHLIGHT_LABELS = ['Popular', "Chef's pick", 'New'];

function pickBadge(index: number): string | null {
  if (index === 0) return HIGHLIGHT_LABELS[0];
  if (index === 2) return HIGHLIGHT_LABELS[1];
  if (index === 5) return HIGHLIGHT_LABELS[2];
  return null;
}

export default function MenuScreen() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, getCartTotal } = useStore();
  const { formatCurrency } = useCurrency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productCategoriesMap, setProductCategoriesMap] = useState<Record<string, string[]>>({});
  const [lockedCategoryIds, setLockedCategoryIds] = useState<string[]>([]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => data && setCategories(data));

    supabase
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('display_order', { ascending: true })
      .then(({ data }) => data && setProducts(data));

    supabase.rpc('get_locked_category_ids').then(({ data, error }) => {
      if (!error) setLockedCategoryIds(data ?? []);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('product_categories')
      .select('product_id, category_id')
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string[]> = {};
        data.forEach((pc) => {
          if (!map[pc.product_id]) map[pc.product_id] = [];
          map[pc.product_id].push(pc.category_id);
        });
        setProductCategoriesMap(map);
      });
  }, [products]);

  const availableCategories = useMemo(
    () => categories.filter((c) => !lockedCategoryIds.includes(c.id)),
    [categories, lockedCategoryIds],
  );

  useEffect(() => {
    if (availableCategories.length === 0) return;
    if (!selectedCategory || lockedCategoryIds.includes(selectedCategory)) {
      setSelectedCategory(availableCategories[0].id);
    }
  }, [availableCategories, selectedCategory, lockedCategoryIds]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      const cats = productCategoriesMap[p.id] || [];
      const inCategory = !selectedCategory || cats.includes(selectedCategory);
      const matches = !query
        || p.name.toLowerCase().includes(query)
        || (p.description ?? '').toLowerCase().includes(query);
      return inCategory && matches;
    });
  }, [products, productCategoriesMap, selectedCategory, search]);

  const activeCategory = categories.find((c) => c.id === selectedCategory);
  const cartTotal = getCartTotal();
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleUpdate = (itemId: string, delta: number) => {
    const item = cart.find((i) => i.id === itemId);
    if (!item) return;
    const next = item.quantity + delta;
    if (next <= 0) {
      removeFromCart(itemId);
    } else {
      updateQuantity(itemId, next);
    }
  };

  return (
    <div className="min-h-screen bg-ivory-50">
      <header className="sticky top-0 z-30 border-b border-ink-100/70 bg-ivory-50/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4 lg:px-10">
          <button
            onClick={() => navigate('/')}
            className="group flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-sm text-ink-600 transition hover:border-ink-100 hover:bg-white"
            aria-label="Back to welcome"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean-800 text-ivory-50">
              <span className="font-display text-lg italic">O</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-xl text-ink-900">Cafe Oceanic</p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-400">Self-serve menu</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-2 text-sm shadow-soft">
              <Search className="h-4 w-4 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the menu"
                className="w-56 bg-transparent text-ink-800 placeholder:text-ink-400 focus:outline-none"
              />
            </div>

            <button
              onClick={() => navigate('/admin/login')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition hover:text-ocean-700"
              aria-label="Admin Login"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Cart</span>
              {cartCount > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-ocean-900">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-7xl overflow-x-auto px-6 pb-4 lg:px-10 scroll-soft">
          <div className="flex gap-2">
            {availableCategories.map((c) => {
              const isActive = c.id === selectedCategory;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'border-ocean-800 bg-ocean-800 text-ivory-50 shadow-soft'
                      : 'border-ink-100 bg-white text-ink-600 hover:border-ink-200 hover:text-ink-900'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
            {availableCategories.length === 0 && (
              <span className="text-sm text-ink-500">No categories available right now.</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.25em] text-ocean-700">
              {filteredProducts.length} items
            </p>
            <h1 className="font-display text-4xl text-ink-900 sm:text-5xl">
              {activeCategory?.name ?? 'Today&rsquo;s Menu'}
            </h1>
            {activeCategory?.description && (
              <p className="mt-3 max-w-2xl text-ink-500">{activeCategory.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 rounded-full border border-ink-100 bg-white px-4 py-2 text-sm text-ink-600 shadow-soft">
            <Clock className="h-4 w-4 text-ocean-600" />
            Average prep time
            <span className="font-semibold text-ink-900">8–12 min</span>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-ink-200 bg-white/60 py-24 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ocean-50 text-ocean-700">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-display text-2xl text-ink-900">Nothing matches just yet</h3>
            <p className="mt-2 text-ink-500">Try a different category or clear your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product, index) => {
              const badge = pickBadge(index);
              return (
                <motion.button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="group relative overflow-hidden rounded-3xl border border-ink-100/80 bg-white text-left shadow-soft transition-shadow hover:shadow-lifted"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-ivory-200">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-ink-300">
                        <Leaf className="h-10 w-10" />
                      </div>
                    )}
                    {badge && (
                      <span className="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ocean-800 shadow-soft">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        {badge}
                      </span>
                    )}
                  </div>

                  <div className="space-y-4 p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-xl text-ink-900">{product.name}</h3>
                      <span className="whitespace-nowrap text-lg font-semibold text-ocean-800">
                        {formatCurrency(product.price)}
                      </span>
                    </div>
                    {product.description && (
                      <p className="line-clamp-2 text-sm text-ink-500">{product.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-400">
                        Customize
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                      </span>
                      <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-medium text-ocean-700">
                        Add to order
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {showCart && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCart(false)}
            className="fixed inset-0 z-40 bg-ocean-950/40 backdrop-blur-sm"
          />
        )}
        {showCart && (
          <motion.aside
            key="cart"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-ink-100 bg-white shadow-lifted"
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Your basket</p>
                <h2 className="font-display text-2xl text-ink-900">
                  {cartCount > 0 ? `${cartCount} item${cartCount > 1 ? 's' : ''}` : 'Empty for now'}
                </h2>
              </div>
              <button
                onClick={() => setShowCart(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:text-ink-900"
                aria-label="Close cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 scroll-soft">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ivory-100 text-ocean-700">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <p className="mt-4 font-display text-xl text-ink-900">Nothing here yet</p>
                  <p className="mt-1 max-w-[220px] text-sm text-ink-500">
                    Pick a dish from the menu to start building your order.
                  </p>
                </div>
              ) : (
                <ul className="space-y-4">
                  {cart.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-ink-100 bg-ivory-50 p-4"
                    >
                      <div className="flex gap-3">
                        {item.product.image_url && (
                          <img
                            src={item.product.image_url}
                            alt=""
                            className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-semibold text-ink-900">{item.product.name}</p>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="text-ink-400 hover:text-ocean-800"
                              aria-label={`Remove ${item.product.name}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          {item.selectedAddons.length > 0 && (
                            <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                              {item.selectedAddons.map((a) => a.name).join(' · ')}
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-1 rounded-full border border-ink-100 bg-white px-1 py-1">
                              <button
                                onClick={() => handleUpdate(item.id, -1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-600 hover:bg-ocean-50 hover:text-ocean-800"
                                aria-label="Decrease"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <span className="w-6 text-center text-sm font-semibold text-ink-900">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => handleUpdate(item.id, 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-600 hover:bg-ocean-50 hover:text-ocean-800"
                                aria-label="Increase"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <span className="font-semibold text-ocean-800">
                              {formatCurrency(item.itemTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t border-ink-100 bg-ivory-50 px-6 py-5">
                <div className="mb-4 flex items-center justify-between text-sm text-ink-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-ink-900">{formatCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={() => navigate('/checkout')}
                  className="group flex w-full items-center justify-center gap-3 rounded-full bg-ocean-800 px-6 py-4 text-base font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900"
                >
                  Review & pay
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <p className="mt-3 text-center text-[11px] uppercase tracking-[0.2em] text-ink-400">
                  Dine-in · Takeaway · Card · Cash · QR
                </p>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
