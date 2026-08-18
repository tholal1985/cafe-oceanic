import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, ChefHat, Check, Clock, CreditCard as Edit2, Home, Minus,
  Package, Phone, Plus, RefreshCw, Search, ShoppingBag, Trash2, X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { pushOrderToUltimatePos } from '../../lib/ultimateposService';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

type Addon = { id?: string; name: string; price?: number };

const STATUS_META: Record<string, { label: string; chip: string; dot: string }> = {
  pending:    { label: 'Pending',    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',    dot: 'bg-amber-500' },
  preparing:  { label: 'Preparing',  chip: 'bg-ocean-50 text-ocean-800 ring-1 ring-inset ring-ocean-200',    dot: 'bg-ocean-700' },
  ready:      { label: 'Ready',      chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200', dot: 'bg-emerald-500' },
  completed:  { label: 'Completed',  chip: 'bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200',        dot: 'bg-ink-400' },
  cancelled:  { label: 'Cancelled',  chip: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',      dot: 'bg-rose-500' },
};

const FILTERS = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready',     label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const NEXT_ACTION: Record<string, { label: string; next: Order['status']; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: 'Start preparing', next: 'preparing', icon: ChefHat },
  preparing: { label: 'Mark as ready',   next: 'ready',     icon: Package },
  ready:     { label: 'Complete',        next: 'completed', icon: Check },
};

export default function Orders() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingItems, setEditingItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<OrderWithItems | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]['value']>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    const subscription = supabase
      .channel('orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrders(); })
      .subscribe();
    return () => { subscription.unsubscribe(); };
  }, []);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items (*)`)
      .order('created_at', { ascending: false });
    if (data) setOrders(data as OrderWithItems[]);
  };

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products').select('*').eq('is_available', true).order('name');
    if (data) setProducts(data);
  };

  const startEditing = () => {
    if (selectedOrder) {
      setEditingItems([...selectedOrder.order_items]);
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditingItems([]);
    setShowAddProduct(false);
  };

  const removeItem = (itemId: string) => setEditingItems(editingItems.filter((i) => i.id !== itemId));

  const updateItemQuantity = (itemId: string, delta: number) => {
    setEditingItems(editingItems.map((item) => {
      if (item.id === itemId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        const unitPrice = Number(item.item_total) / item.quantity;
        return { ...item, quantity: newQuantity, item_total: unitPrice * newQuantity };
      }
      return item;
    }));
  };

  const addProduct = (product: Product) => {
    const newItem: OrderItem = {
      id: `temp-${Date.now()}`,
      order_id: selectedOrder!.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit_price: Number(product.price),
      item_total: Number(product.price),
      addons: null,
      created_at: new Date().toISOString(),
    } as OrderItem;
    setEditingItems([...editingItems, newItem]);
    setShowAddProduct(false);
  };

  const saveChanges = async () => {
    if (!selectedOrder) return;

    const itemsToDelete = selectedOrder.order_items.filter(
      (original) => !editingItems.find((item) => item.id === original.id),
    );

    for (const item of itemsToDelete) {
      await supabase.from('order_items').delete().eq('id', item.id);
    }

    for (const item of editingItems) {
      if (item.id.startsWith('temp-')) {
        const { id, ...itemData } = item as OrderItem & { id: string };
        await supabase.from('order_items').insert({ ...itemData, id: undefined });
      } else {
        const originalItem = selectedOrder.order_items.find((i) => i.id === item.id);
        if (originalItem && (originalItem.quantity !== item.quantity || originalItem.item_total !== item.item_total)) {
          await supabase.from('order_items').update({
            quantity: item.quantity, item_total: item.item_total,
          }).eq('id', item.id);
        }
      }
    }

    const newTotal = editingItems.reduce((sum, item) => sum + Number(item.item_total), 0);
    await supabase.from('orders').update({ total_price: newTotal }).eq('id', selectedOrder.id);

    await fetchOrders();
    const { data } = await supabase
      .from('orders').select(`*, order_items (*)`).eq('id', selectedOrder.id).maybeSingle();
    if (data) setSelectedOrder(data as OrderWithItems);
    cancelEditing();
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    await supabase.from('orders').update({ status }).eq('id', orderId);
    fetchOrders();
  };

  const confirmDeleteOrder = (order: OrderWithItems) => {
    setOrderToDelete(order);
    setShowDeleteConfirm(true);
    setDeleteError('');
  };

  const cancelDelete = () => {
    setOrderToDelete(null);
    setShowDeleteConfirm(false);
    setDeleteError('');
  };

  const deleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      setDeleteError('');
      const { error: itemsError } = await supabase.from('order_items').delete().eq('order_id', orderToDelete.id);
      if (itemsError) throw itemsError;
      const { error: orderError } = await supabase.from('orders').delete().eq('id', orderToDelete.id);
      if (orderError) throw orderError;
      if (selectedOrder?.id === orderToDelete.id) setSelectedOrder(null);
      fetchOrders();
      setShowDeleteConfirm(false);
      setOrderToDelete(null);
    } catch (error) {
      console.error('Error deleting order:', error);
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete order');
    }
  };

  const filtered = useMemo(() => orders.filter((o) => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return o.order_number.toLowerCase().includes(q) || (o.phone_number?.toLowerCase().includes(q) ?? false);
  }), [orders, filter, search]);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: orders.length };
    for (const o of orders) acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, [orders]);

  const editingTotal = editingItems.reduce((sum, item) => sum + Number(item.item_total), 0);
  const currentItems = isEditing ? editingItems : selectedOrder?.order_items ?? [];

  const [pushingPos, setPushingPos] = useState(false);
  const [pushResult, setPushResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handlePushToPos = async () => {
    if (!selectedOrder) return;
    setPushingPos(true);
    setPushResult(null);
    try {
      const result = await pushOrderToUltimatePos(selectedOrder.id);
      setPushResult({ type: 'success', message: result.message || 'Pushed to UltimatePOS' });
    } catch (e: any) {
      setPushResult({ type: 'error', message: e.message || 'Push failed' });
    } finally {
      setPushingPos(false);
      setTimeout(() => setPushResult(null), 5000);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-700">Operations</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-900 sm:text-4xl">Orders</h1>
            <p className="mt-1 text-sm text-ink-500">Live ticket flow — updates as the kitchen works.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-ink-500">Realtime</span>
              <span className="font-medium text-ink-900 tabular-nums">{orders.length}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # or phone"
            className="w-full rounded-full border border-ink-100 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
          />
        </div>
        <div className="scroll-soft flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  active ? 'bg-ocean-800 text-ivory-50' : 'border border-ink-100 bg-white text-ink-700 hover:border-ink-200'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-white/15' : 'bg-ink-100 text-ink-500'}`}>
                  {counts[f.value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_440px]">
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                <Package className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-ink-700">No orders match</p>
              <p className="text-xs text-ink-400">Adjust your filters or wait for the next ticket.</p>
            </div>
          ) : (
            filtered.map((order) => {
              const meta = STATUS_META[order.status] ?? STATUS_META.pending;
              const active = selectedOrder?.id === order.id;
              const action = NEXT_ACTION[order.status];
              const Icon = action?.icon;
              const itemCount = order.order_items.reduce((s, i) => s + (i.quantity || 0), 0);
              return (
                <motion.div
                  key={order.id}
                  layout
                  onClick={() => setSelectedOrder(order)}
                  whileHover={{ y: -1 }}
                  className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-soft transition sm:p-5 ${
                    active ? 'border-ocean-700 ring-2 ring-ocean-200' : 'border-ink-100 hover:border-ink-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg text-ink-900 tabular-nums">{order.order_number}</h3>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.chip}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-400 tabular-nums">
                        {new Date(order.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="font-display text-2xl text-ocean-800 tabular-nums">${Number(order.total_price).toFixed(2)}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1.5 text-ink-700">
                      {order.order_type === 'takeaway' ? <ShoppingBag className="h-3.5 w-3.5 text-amber-600" /> : <Home className="h-3.5 w-3.5 text-ocean-700" />}
                      <span className="font-medium">{order.order_type === 'takeaway' ? 'Takeaway' : 'Dine in'}</span>
                    </span>
                    {order.phone_number && (
                      <>
                        <span className="text-ink-200">·</span>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {order.phone_number}</span>
                      </>
                    )}
                    <span className="text-ink-200">·</span>
                    <span>{itemCount} item{itemCount === 1 ? '' : 's'}</span>
                    <span className="text-ink-200">·</span>
                    <span className="capitalize">{order.payment_method || 'n/a'}</span>
                  </div>

                  {action && order.status !== 'completed' && order.status !== 'cancelled' && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, action.next); }}
                        className="group inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ocean-800 px-4 py-2 text-xs font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        {action.label}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDeleteOrder(order); }}
                        className="rounded-full border border-ink-100 bg-white p-2 text-rose-600 transition hover:border-rose-200 hover:bg-rose-50"
                        title="Delete order"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>

        <div className="lg:sticky lg:top-24 lg:h-fit">
          {selectedOrder ? (
            <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Order details</p>
                  <h2 className="font-display text-xl text-ink-900 tabular-nums">{selectedOrder.order_number}</h2>
                </div>
                {!isEditing && (
                  <button
                    onClick={startEditing}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:border-ink-200"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
              </div>

              <div className="border-b border-ink-100 bg-ivory-100/50 px-5 py-4">
                <div className="flex items-center gap-2">
                  {selectedOrder.order_type === 'takeaway' ? (
                    <ShoppingBag className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Home className="h-4 w-4 text-ocean-700" />
                  )}
                  <p className="text-sm font-semibold text-ink-900">
                    {selectedOrder.order_type === 'takeaway' ? 'Takeaway order' : 'Dine in order'}
                  </p>
                  <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_META[selectedOrder.status]?.chip}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[selectedOrder.status]?.dot}`} />
                    {STATUS_META[selectedOrder.status]?.label}
                  </span>
                </div>
                {selectedOrder.phone_number && (
                  <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500">
                    <Phone className="h-3.5 w-3.5 text-ocean-700" /> {selectedOrder.phone_number}
                  </div>
                )}
              </div>

              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-ink-400">Items</p>
                  {isEditing && (
                    <button
                      onClick={() => setShowAddProduct((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ocean-700 hover:text-ocean-800"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {isEditing && showAddProduct && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-3 overflow-hidden rounded-2xl border border-ink-100 bg-ivory-100/50"
                    >
                      <div className="scroll-soft max-h-56 space-y-1 overflow-y-auto p-2">
                        {products.map((product) => (
                          <button
                            key={product.id}
                            onClick={() => addProduct(product)}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white"
                          >
                            <span className="font-medium text-ink-900">{product.name}</span>
                            <span className="font-display text-sm text-ocean-800 tabular-nums">${Number(product.price).toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  {currentItems.map((item) => {
                    const addons = Array.isArray(item.addons) ? item.addons as Addon[] : [];
                    return (
                      <div key={item.id} className="rounded-xl border border-ink-100 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex-1 text-sm font-semibold text-ink-900">{item.product_name}</p>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateItemQuantity(item.id, -1)}
                                disabled={item.quantity <= 1}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-100 text-ink-700 transition hover:border-ink-200 disabled:opacity-40"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium tabular-nums">{item.quantity}</span>
                              <button
                                onClick={() => updateItemQuantity(item.id, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-100 text-ink-700 transition hover:border-ink-200"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="ml-1 rounded-full p-1 text-rose-600 transition hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="rounded-full bg-ivory-100 px-2 py-0.5 text-xs font-semibold text-ink-700 tabular-nums">
                              × {item.quantity}
                            </span>
                          )}
                        </div>
                        {addons.length > 0 && (
                          <p className="mt-1 text-xs text-ink-500">+ {addons.map((a) => a.name).join(', ')}</p>
                        )}
                        <p className="mt-1 font-display text-sm text-ocean-800 tabular-nums">
                          ${Number(item.item_total).toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-end justify-between border-t border-ink-100 px-5 py-4">
                <span className="text-xs uppercase tracking-[0.22em] text-ink-400">Total</span>
                <span className="font-display text-3xl text-ocean-800 tabular-nums">
                  ${(isEditing ? editingTotal : Number(selectedOrder.total_price)).toFixed(2)}
                </span>
              </div>

              <div className="border-t border-ink-100 bg-ivory-100/50 px-5 py-4">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={saveChanges}
                      className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
                    >
                      Save changes
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition hover:border-ink-200"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Transitions</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(['pending','preparing','ready','completed'] as const).map((s) => {
                        const m = STATUS_META[s];
                        const isCurrent = selectedOrder.status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => updateOrderStatus(selectedOrder.id, s)}
                            disabled={isCurrent}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
                              isCurrent
                                ? 'cursor-default border-ocean-200 bg-ocean-50 text-ocean-800'
                                : 'border-ink-100 bg-white text-ink-700 hover:border-ink-200'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => confirmDeleteOrder(selectedOrder)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-rose-200 bg-white py-2.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete order
                    </button>
                    <button
                      onClick={handlePushToPos}
                      disabled={pushingPos}
                      className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full border border-ocean-200 bg-white py-2.5 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${pushingPos ? 'animate-spin' : ''}`} /> {pushingPos ? 'Pushing...' : 'Re-push to UltimatePOS'}
                    </button>
                    {pushResult && (
                      <p className={`mt-1 text-xs ${pushResult.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {pushResult.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-ink-200 bg-white py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                <Clock className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-ink-700">Select an order</p>
              <p className="text-xs text-ink-400">Tap a ticket on the left to view details.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDeleteConfirm && orderToDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={cancelDelete}
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
              <div className="flex items-start gap-3 border-b border-ink-100 px-6 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-xl text-ink-900">Delete order?</h3>
                  <p className="mt-1 text-sm text-ink-500">
                    Removing <strong className="text-ink-900 tabular-nums">{orderToDelete.order_number}</strong> deletes
                    its items permanently.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-2 px-6 py-4">
                <button
                  onClick={cancelDelete}
                  className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteOrder}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
                >
                  <Trash2 className="h-4 w-4" /> Delete order
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
