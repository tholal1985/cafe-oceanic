import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChefHat, Check, Clock, Home, Package, Phone, ShoppingBag, Smartphone, ArrowRight,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Order = Database['public']['Tables']['orders']['Row'];

const STEPS = [
  { key: 'pending', label: 'Received', icon: Clock },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
];

export default function OrderConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orderId, orderNumber } = location.state || {};
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlOrderId = urlParams.get('orderId');
    const finalOrderId = orderId || urlOrderId;

    if (!finalOrderId) { navigate('/'); return; }

    if (urlOrderId && !orderId) fetchOrderById(urlOrderId);
    else fetchOrder();

    const subscription = supabase
      .channel(`order:${finalOrderId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${finalOrderId}` },
        (payload) => setOrder(payload.new as Order),
      )
      .subscribe();

    const timeout = setTimeout(() => navigate('/'), 60000);

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, [orderId, navigate]);

  const fetchOrder = async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (data) setOrder(data);
  };

  const fetchOrderById = async (id: string) => {
    const { data } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (data) setOrder(data);
  };

  const currentStepIndex = order ? STEPS.findIndex((s) => s.key === order.status) : -1;
  const effectiveIndex = currentStepIndex === -1 && order?.status === 'completed' ? STEPS.length - 1 : currentStepIndex;

  const getStatusCopy = (status: string) => {
    switch (status) {
      case 'pending': return { title: 'Order received', sub: 'Kitchen has your ticket', eta: '10–15 min' };
      case 'preparing': return { title: 'We&rsquo;re on it', sub: 'The team is cooking now', eta: '5–10 min' };
      case 'ready': return { title: 'Your order is ready', sub: 'Please collect it', eta: 'Now' };
      case 'completed': return { title: 'Enjoy your meal', sub: 'Thank you for visiting', eta: 'Served' };
      default: return { title: 'Processing…', sub: 'Just a moment', eta: '—' };
    }
  };

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ocean-950 text-ivory-100">
        <div className="flex items-center gap-3 text-sm uppercase tracking-[0.2em]">
          <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
          Loading your order…
        </div>
      </div>
    );
  }

  const copy = getStatusCopy(order.status);

  return (
    <div className="relative min-h-screen overflow-hidden bg-ivory-50">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-ocean-50 to-transparent" />
      <div className="relative mx-auto max-w-4xl px-6 py-10 lg:px-10 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-ink-100/70 bg-white shadow-lifted"
        >
          <div className="flex flex-col items-center border-b border-ink-100/70 px-6 py-10 text-center sm:px-12 sm:py-12">
            <motion.div
              key={order.status}
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-8 ring-emerald-50/40"
            >
              {order.status === 'ready' || order.status === 'completed' ? (
                <Check className="h-10 w-10" />
              ) : order.status === 'preparing' ? (
                <ChefHat className="h-10 w-10" />
              ) : (
                <Clock className="h-10 w-10" />
              )}
            </motion.div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-ocean-700">
              {copy.sub}
            </p>
            <h1 className="mt-2 font-display text-4xl text-ink-900 sm:text-5xl">{copy.title}</h1>

            <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-ink-100 bg-ivory-100/70 px-4 py-4 text-left">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Order</p>
                <p className="mt-1 font-display text-xl text-ink-900 tabular-nums truncate">
                  {orderNumber || order.order_number}
                </p>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-ivory-100/70 px-4 py-4 text-left">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Type</p>
                <p className="mt-1 flex items-center gap-2 font-display text-xl text-ink-900">
                  {order.order_type === 'takeaway' ? (
                    <><ShoppingBag className="h-4 w-4 text-ocean-700" /> Takeaway</>
                  ) : (
                    <><Home className="h-4 w-4 text-ocean-700" /> Dine in</>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-ivory-100/70 px-4 py-4 text-left">
                <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">ETA</p>
                <p className="mt-1 font-display text-xl text-ink-900">{copy.eta}</p>
              </div>
            </div>

            {order.order_type === 'takeaway' && order.phone_number && (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-500">
                <Phone className="h-4 w-4 text-ocean-700" />
                We&rsquo;ll text {order.phone_number} when it&rsquo;s ready
              </p>
            )}
          </div>

          <div className="px-6 py-10 sm:px-12">
            <p className="mb-5 text-xs uppercase tracking-[0.22em] text-ink-400">Progress</p>
            <ol className="relative flex items-center justify-between">
              <div className="absolute left-0 right-0 top-5 -z-0 h-1 rounded-full bg-ink-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-ocean-700 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: effectiveIndex >= 0 ? `${(effectiveIndex / (STEPS.length - 1)) * 100}%` : '0%' }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isDone = idx <= effectiveIndex;
                const isActive = idx === effectiveIndex;
                return (
                  <li key={step.key} className="relative z-10 flex flex-col items-center gap-2">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                        isDone
                          ? 'border-ocean-700 bg-ocean-800 text-ivory-50'
                          : 'border-ink-200 bg-white text-ink-400'
                      } ${isActive ? 'ring-4 ring-amber-200' : ''}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`text-xs font-medium ${isDone ? 'text-ink-900' : 'text-ink-400'}`}>
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-ink-100/70 bg-ivory-100/50 p-6 sm:grid-cols-[1fr_auto] sm:p-10">
            <div>
              <div className="flex items-center gap-2 text-ocean-700">
                <Smartphone className="h-4 w-4" />
                <span className="text-xs uppercase tracking-[0.22em]">Keep tracking on your phone</span>
              </div>
              <h3 className="mt-2 font-display text-2xl text-ink-900">Leave the kiosk if you like</h3>
              <p className="mt-2 max-w-md text-sm text-ink-500">
                Scan the code and we&rsquo;ll keep your order status live on your own screen.
                Your seat is safe.
              </p>
              <button
                onClick={() => navigate('/')}
                className="group mt-5 inline-flex items-center gap-2 rounded-full bg-ocean-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition hover:bg-ocean-900"
              >
                Start a new order
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <div className="flex items-center justify-center">
              <div className="rounded-2xl border border-ink-100 bg-white p-3 shadow-soft">
                <QRCodeSVG
                  value={`${window.location.origin}/track/${orderId}`}
                  size={140}
                  level="H"
                  includeMargin={false}
                  fgColor="#0f2a30"
                  bgColor="#ffffff"
                />
              </div>
            </div>
          </div>

          {order.status === 'ready' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-ink-100/70 bg-emerald-50 px-6 py-5 text-center sm:px-12"
            >
              <p className="font-display text-xl text-emerald-800">
                {order.order_type === 'takeaway'
                  ? 'Your order is ready for pickup!'
                  : 'Please head to the counter to collect your order.'}
              </p>
            </motion.div>
          )}
        </motion.div>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.22em] text-ink-400">
          This screen returns home automatically after 60 seconds
        </p>
      </div>
    </div>
  );
}
