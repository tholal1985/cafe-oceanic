import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, BookOpen, ChefHat, Check, Clock, Home, LogOut, Phone,
  RefreshCw, ShoppingBag, Trash2, Wifi, WifiOff, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../hooks/useUserRole';
import type { Database } from '../lib/database.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Order = Database['public']['Tables']['orders']['Row'];
type OrderItem = Database['public']['Tables']['order_items']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

interface OrderItemWithRecipe extends OrderItem { product?: Product; }
interface OrderWithItems extends Order { order_items: OrderItemWithRecipe[]; }
interface RecipeModalData { productName: string; recipe: string; }

export default function KitchenDisplay() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recipeModal, setRecipeModal] = useState<RecipeModalData | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const authCheckedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      if (authCheckedRef.current) return;
      authCheckedRef.current = true;
      await checkAuth();
      if (isMounted) { await fetchOrders(); setupRealtimeSubscription(); }
    };
    initialize();

    const timeInterval = setInterval(() => { if (isMounted) setCurrentTime(new Date()); }, 1000);
    const healthCheckInterval = setInterval(() => { if (isMounted) checkConnectionHealth(); }, 30000);

    return () => {
      isMounted = false;
      clearInterval(timeInterval);
      clearInterval(healthCheckInterval);
      if (channelRef.current) { channelRef.current.unsubscribe(); channelRef.current = null; }
    };
  }, []);

  const checkConnectionHealth = () => {
    if (Date.now() - lastUpdate.getTime() > 60000) setIsConnected(false);
  };

  const setupRealtimeSubscription = () => {
    if (channelRef.current) channelRef.current.unsubscribe();

    const channel = supabase
      .channel('kitchen-orders-realtime', {
        config: { broadcast: { self: true }, presence: { key: 'kitchen-display' } },
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => { setIsConnected(true); setLastUpdate(new Date()); fetchOrders(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => { setIsConnected(true); setLastUpdate(new Date()); fetchOrders(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, () => { setIsConnected(true); setLastUpdate(new Date()); fetchOrders(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => { setIsConnected(true); setLastUpdate(new Date()); fetchOrders(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { setIsConnected(true); setLastUpdate(new Date()); }
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setIsConnected(false);
          setTimeout(() => setupRealtimeSubscription(), 5000);
        }
      });

    channelRef.current = channel;
  };

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || '');
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    if (channelRef.current) { await channelRef.current.unsubscribe(); channelRef.current = null; }
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`*, order_items ( *, product:products (*) )`)
        .in('status', ['pending', 'preparing'])
        .order('created_at', { ascending: true });
      if (error) { setIsConnected(false); return; }
      if (data) {
        setOrders(data as OrderWithItems[]);
        setIsConnected(true);
        setLastUpdate(new Date());
      }
    } catch { setIsConnected(false); }
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) { alert('Failed to update order status. Please try again.'); return; }
    setIsConnected(true); setLastUpdate(new Date()); await fetchOrders();
  };

  const handleManualRefresh = async () => {
    setIsConnected(false);
    await fetchOrders();
    if (channelRef.current) await channelRef.current.unsubscribe();
    setupRealtimeSubscription();
  };

  const clearAllOrders = async () => {
    setIsClearing(true);
    try {
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length === 0) { setShowClearConfirm(false); setIsClearing(false); return; }
      const { error } = await supabase.from('orders').update({ status: 'ready' }).in('id', orderIds);
      if (error) alert('Failed to clear orders. Please try again.');
      else await fetchOrders();
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  const getAgeMinutes = (timestamp: string) =>
    Math.floor((currentTime.getTime() - new Date(timestamp).getTime()) / 1000 / 60);

  const getTimeAgo = (timestamp: string) => {
    const diff = Math.floor((currentTime.getTime() - new Date(timestamp).getTime()) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const getUrgency = (timestamp: string) => {
    const mins = getAgeMinutes(timestamp);
    if (mins > 10) return { ring: 'ring-rose-500/80', badge: 'bg-rose-500', label: 'URGENT', pulse: true };
    if (mins > 5) return { ring: 'ring-amber-400/70', badge: 'bg-amber-500', label: 'WATCH', pulse: false };
    return { ring: 'ring-white/10', badge: 'bg-emerald-500', label: 'FRESH', pulse: false };
  };

  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;

  return (
    <div className="min-h-screen bg-ocean-950 p-6 text-ivory-50">
      <header className="mb-6 rounded-2xl border border-white/5 bg-ocean-900/70 p-5 shadow-lifted backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-ocean-950 shadow-lifted">
              <ChefHat className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-baseline gap-3">
                <h1 className="font-display text-3xl text-white">Kitchen display</h1>
                <span className="text-xs uppercase tracking-[0.22em] text-ivory-100/60">KOT · live</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ivory-100/60">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {pendingCount} new
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {preparingCount} preparing
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1">
                  {isConnected ? <Wifi className="h-3 w-3 text-emerald-300" /> : <WifiOff className="h-3 w-3 text-rose-300" />}
                  {isConnected ? 'Connected' : 'Reconnecting'}
                </span>
                <button
                  onClick={handleManualRefresh}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-ivory-100/60 hover:bg-white/10 hover:text-white"
                  title="Refresh"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-display text-3xl tabular-nums text-white">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
              <p className="text-xs text-ivory-100/50">
                {currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>
            {isAdmin && orders.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/20"
              >
                <Trash2 className="h-4 w-4" />
                Clear all
              </button>
            )}
            {userEmail && (
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-ivory-100/80 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {!isConnected && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-200">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5" />
            <div>
              <p className="font-semibold">Connection lost</p>
              <p className="text-xs text-rose-200/70">Reconnecting automatically in the background.</p>
            </div>
          </div>
          <button
            onClick={handleManualRefresh}
            className="inline-flex items-center gap-2 rounded-full bg-white text-rose-600 px-4 py-2 text-sm font-semibold transition hover:bg-rose-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh now
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="flex min-h-[480px] flex-col items-center justify-center rounded-3xl border border-white/5 bg-ocean-900/40">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <Check className="h-10 w-10" />
          </div>
          <p className="mt-5 font-display text-3xl text-white">All caught up</p>
          <p className="mt-1 text-sm text-ivory-100/60">No pending orders right now.</p>
          <p className="mt-6 text-[11px] uppercase tracking-[0.24em] text-ivory-100/40">
            Listening for new orders in real time
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence>
            {orders.map((order) => {
              const urgency = getUrgency(order.created_at);
              const isPending = order.status === 'pending';
              return (
                <motion.article
                  key={order.id}
                  layout
                  initial={{ scale: 0.95, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className={`relative flex flex-col overflow-hidden rounded-2xl bg-white text-ink-900 shadow-lifted ring-2 transition-all ${urgency.ring}`}
                >
                  {urgency.pulse && (
                    <motion.div
                      className="absolute inset-0 -z-0 rounded-2xl bg-rose-500/10"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}

                  <div className="relative flex items-start justify-between border-b border-ink-100/70 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400">Order</p>
                      <p className="font-display text-3xl text-ink-900 tabular-nums">
                        #{order.order_number.split('-').pop()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${urgency.badge}`}>
                        <Clock className="h-3 w-3" />
                        {urgency.label}
                      </span>
                      <p className="mt-1 font-mono text-sm font-semibold text-ink-700 tabular-nums">
                        {getTimeAgo(order.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="relative flex items-center justify-between gap-3 border-b border-ink-100/70 bg-ivory-100/60 px-5 py-2.5 text-xs">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${
                      isPending ? 'bg-amber-100 text-amber-800' : 'bg-ocean-100 text-ocean-800'
                    }`}>
                      {isPending ? 'New ticket' : 'In progress'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-ink-600">
                      {order.order_type === 'takeaway' ? <ShoppingBag className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
                      <span className="font-medium uppercase tracking-wide">
                        {order.order_type === 'takeaway' ? 'Takeaway' : 'Dine in'}
                      </span>
                    </span>
                  </div>

                  {order.order_type === 'takeaway' && order.phone_number && (
                    <div className="relative flex items-center gap-2 border-b border-ink-100/70 bg-white px-5 py-2 text-xs text-ink-600">
                      <Phone className="h-3.5 w-3.5 text-ocean-700" />
                      <span className="tabular-nums">{order.phone_number}</span>
                    </div>
                  )}

                  <div className="relative flex-1 space-y-2 overflow-y-auto px-5 py-4 scroll-soft" style={{ maxHeight: 360 }}>
                    {order.order_items.map((item, index) => (
                      <div
                        key={item.id}
                        onClick={() => item.product?.recipe && setRecipeModal({ productName: item.product_name, recipe: item.product.recipe })}
                        className={`rounded-xl border-l-4 border-ocean-700 bg-ivory-50 p-3 shadow-soft ${
                          item.product?.recipe ? 'cursor-pointer transition hover:border-amber-500 hover:bg-amber-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ocean-900 text-[11px] font-bold text-white">
                                {item.quantity}
                              </span>
                              <p className="truncate font-semibold text-ink-900">{item.product_name}</p>
                              {item.product?.recipe && (
                                <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
                              )}
                            </div>
                            {item.addons && Array.isArray(item.addons) && item.addons.length > 0 && (
                              <div className="mt-2 border-l-2 border-amber-300 pl-3">
                                {item.addons.map((addon: any, i: number) => (
                                  <p key={i} className="text-xs text-ink-600">+ {addon.name}</p>
                                ))}
                              </div>
                            )}
                            {item.product?.recipe && (
                              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                Tap for recipe
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">
                            #{index + 1}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="relative border-t border-ink-100/70 bg-white px-5 py-3">
                    {isPending ? (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-ocean-800 px-4 py-3 text-sm font-semibold text-ivory-50 transition hover:bg-ocean-900"
                      >
                        <ChefHat className="h-4 w-4" />
                        Start preparing
                      </button>
                    ) : (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <Check className="h-4 w-4" />
                        Mark as ready
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-lifted"
            >
              <div className="px-7 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl text-ink-900">Clear all tickets?</h2>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink-400">This action cannot be undone</p>
                  </div>
                </div>
                <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink-700">
                  You&rsquo;re about to mark <strong>{orders.length}</strong> active order{orders.length !== 1 ? 's' : ''} as ready and clear them from the display.
                </p>
              </div>
              <div className="flex gap-3 border-t border-ink-100 bg-ivory-100/50 px-7 py-4">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  disabled={isClearing}
                  className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-2.5 text-sm font-medium text-ink-700 transition hover:border-ink-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllOrders}
                  disabled={isClearing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-amber-600 disabled:opacity-60"
                >
                  {isClearing ? <><RefreshCw className="h-4 w-4 animate-spin" />Clearing…</> : <><Trash2 className="h-4 w-4" />Clear all</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {recipeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/80 p-4 backdrop-blur-sm"
            onClick={() => setRecipeModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-lifted"
            >
              <div className="flex items-start justify-between border-b border-ink-100 px-7 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-ink-400">Recipe</p>
                    <h2 className="font-display text-2xl text-ink-900">{recipeModal.productName}</h2>
                  </div>
                </div>
                <button
                  onClick={() => setRecipeModal(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:text-ink-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-y-auto px-7 py-6 scroll-soft">
                <div className="rounded-2xl border border-ink-100 bg-ivory-50 px-5 py-4">
                  <p className="whitespace-pre-line text-base leading-relaxed text-ink-700">
                    {recipeModal.recipe}
                  </p>
                </div>
              </div>
              <div className="border-t border-ink-100 bg-ivory-100/50 px-7 py-4">
                <button
                  onClick={() => setRecipeModal(null)}
                  className="w-full rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition hover:bg-ocean-900"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
