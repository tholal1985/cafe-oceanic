import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Home, ShoppingBag, CreditCard, Banknote, QrCode, Phone, AlertCircle, X,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import UpsellModal from '../components/UpsellModal';
import GiftModal from '../components/GiftModal';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../hooks/useCurrency';

type PaymentMethodCode = 'card' | 'cash';

const GATEWAY_META: Record<string, { label: string; tagline: string; icon: typeof CreditCard }> = {
  paypal: { label: 'PayPal', tagline: 'Secure wallet checkout', icon: CreditCard },
  skrill: { label: 'Skrill', tagline: 'Fast digital wallet', icon: CreditCard },
  bml: { label: 'BML QR', tagline: 'Scan with the BML app', icon: QrCode },
  default: { label: 'Card', tagline: 'Debit or credit', icon: CreditCard },
};

export default function CheckoutScreen() {
  const navigate = useNavigate();
  const { cart, getCartTotal } = useStore();
  const { formatCurrency } = useCurrency();

  const [orderType, setOrderType] = useState<'dine-in' | 'takeaway'>('dine-in');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [validationError, setValidationError] = useState('');

  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [availableGateways, setAvailableGateways] = useState<any[]>([]);
  const [hasEligibleGift, setHasEligibleGift] = useState(false);

  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{
    method: PaymentMethodCode;
    orderType: 'dine-in' | 'takeaway';
    phoneNumber: string | null;
  } | null>(null);

  const cartTotal = getCartTotal();
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  useEffect(() => {
    if (cart.length === 0) navigate('/menu');
  }, [cart.length, navigate]);

  useEffect(() => {
    checkForEligibleGifts();
    loadPaymentGateways();
  }, [cartTotal]);

  const loadPaymentGateways = async () => {
    const { data } = await supabase
      .from('payment_gateways')
      .select('id, name, gateway_type, is_active, is_default, display_order')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true });
    if (data) setAvailableGateways(data);
  };

  const checkForEligibleGifts = async () => {
    const { data } = await supabase
      .from('promotional_gifts')
      .select('id')
      .eq('is_active', true)
      .lte('minimum_order_value', cartTotal)
      .limit(1);
    setHasEligibleGift(!!data && data.length > 0);
  };

  if (cart.length === 0) return null;

  const handleProceedToPayment = () => {
    if (orderType === 'takeaway' && !phoneNumber.trim()) {
      setValidationError('Please enter your phone number for takeaway orders');
      return;
    }
    setValidationError('');
    setShowPaymentMethods(true);
  };

  const handleSelectPaymentMethod = (method: PaymentMethodCode) => {
    setShowPaymentMethods(false);
    setPendingPayment({
      method,
      orderType,
      phoneNumber: orderType === 'takeaway' ? phoneNumber : null,
    });
    if (hasEligibleGift) setShowGiftModal(true);
    else setShowUpsellModal(true);
  };

  const handleAfterGiftModal = () => {
    setShowGiftModal(false);
    setShowUpsellModal(true);
  };

  const handleContinueToPayment = () => {
    if (pendingPayment) {
      navigate('/payment', {
        state: {
          paymentMethod: pendingPayment.method,
          orderType: pendingPayment.orderType,
          phoneNumber: pendingPayment.phoneNumber,
        },
      });
    }
  };

  return (
    <div className="min-h-screen bg-ivory-50">
      <header className="sticky top-0 z-20 border-b border-ink-100/70 bg-ivory-50/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4 lg:px-10">
          <button
            onClick={() => navigate('/menu')}
            className="group flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-sm text-ink-600 transition hover:border-ink-100 hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to menu</span>
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="uppercase tracking-[0.22em]">Review · Pay · Done</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 lg:px-10">
        <div className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">
            Step 1 of 2
          </p>
          <h1 className="font-display text-4xl text-ink-900 sm:text-5xl">Review your order</h1>
          <p className="mt-2 text-ink-500">{itemCount} items · Ready in about 8–12 minutes</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-ink-100/70 bg-white p-6 shadow-soft lg:p-8">
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-display text-2xl text-ink-900">How will you enjoy it?</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setOrderType('dine-in')}
                  className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
                    orderType === 'dine-in'
                      ? 'border-ocean-700 bg-ocean-50 shadow-soft'
                      : 'border-ink-100 bg-white hover:border-ink-200'
                  }`}
                >
                  <Home className={`mb-3 h-7 w-7 ${orderType === 'dine-in' ? 'text-ocean-700' : 'text-ink-400'}`} />
                  <p className="font-display text-xl text-ink-900">Dine in</p>
                  <p className="mt-1 text-sm text-ink-500">Find a seat — we&rsquo;ll call your number</p>
                </button>

                <button
                  onClick={() => setOrderType('takeaway')}
                  className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
                    orderType === 'takeaway'
                      ? 'border-ocean-700 bg-ocean-50 shadow-soft'
                      : 'border-ink-100 bg-white hover:border-ink-200'
                  }`}
                >
                  <ShoppingBag className={`mb-3 h-7 w-7 ${orderType === 'takeaway' ? 'text-ocean-700' : 'text-ink-400'}`} />
                  <p className="font-display text-xl text-ink-900">Takeaway</p>
                  <p className="mt-1 text-sm text-ink-500">We&rsquo;ll text you when it&rsquo;s ready</p>
                </button>
              </div>

              <AnimatePresence>
                {orderType === 'takeaway' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-5"
                  >
                    <label className="mb-2 block text-sm font-medium text-ink-700">
                      Phone number
                    </label>
                    <div className={`flex items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 transition-colors ${
                      validationError ? 'border-rose-400' : 'border-ink-100 focus-within:border-ocean-700'
                    }`}>
                      <Phone className="h-4 w-4 text-ink-400" />
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => { setPhoneNumber(e.target.value); setValidationError(''); }}
                        placeholder="+960 123 4567"
                        className="flex-1 bg-transparent text-base text-ink-900 placeholder:text-ink-400 focus:outline-none"
                      />
                    </div>
                    {validationError ? (
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {validationError}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-ink-400">
                        We&rsquo;ll only use this to let you know your order is ready.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className="rounded-3xl border border-ink-100/70 bg-white p-6 shadow-soft lg:p-8">
              <div className="mb-5 flex items-baseline justify-between">
                <h2 className="font-display text-2xl text-ink-900">Your items</h2>
                <span className="text-xs uppercase tracking-[0.18em] text-ink-400">{itemCount} total</span>
              </div>
              <ul className="divide-y divide-ink-100/70">
                {cart.map((item) => (
                  <li key={item.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    {item.product.image_url && (
                      <img
                        src={item.product.image_url}
                        alt=""
                        className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink-900">{item.product.name}</p>
                          <p className="mt-0.5 text-xs uppercase tracking-wide text-ink-400">
                            Qty {item.quantity}
                          </p>
                        </div>
                        <span className="whitespace-nowrap font-semibold text-ocean-800 tabular-nums">
                          {formatCurrency(item.itemTotal)}
                        </span>
                      </div>
                      {item.selectedAddons.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-500">
                          + {item.selectedAddons.map((a) => a.name).join(' · ')}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-ink-100/70 bg-white p-6 shadow-lifted">
              <p className="text-xs uppercase tracking-[0.22em] text-ink-400">Summary</p>
              <h3 className="mt-1 font-display text-2xl text-ink-900">Your order</h3>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-500">Subtotal</dt>
                  <dd className="font-medium text-ink-900 tabular-nums">{formatCurrency(cartTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Service</dt>
                  <dd className="font-medium text-emerald-700">Included</dd>
                </div>
                <div className="h-px bg-ink-100" />
                <div className="flex items-center justify-between">
                  <dt className="text-ink-700">Total</dt>
                  <dd className="font-display text-2xl text-ocean-800 tabular-nums">
                    {formatCurrency(cartTotal)}
                  </dd>
                </div>
              </dl>

              <button
                onClick={handleProceedToPayment}
                className="group mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-ocean-800 px-6 py-4 text-base font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900"
              >
                Continue to payment
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>

              <p className="mt-4 text-center text-[11px] uppercase tracking-[0.2em] text-ink-400">
                Card · Cash · QR · Wallet
              </p>
            </div>
          </aside>
        </div>
      </main>

      <GiftModal
        isOpen={showGiftModal}
        onClose={handleAfterGiftModal}
        cartTotal={cartTotal}
      />
      <UpsellModal
        isOpen={showUpsellModal}
        onClose={() => setShowUpsellModal(false)}
        onContinue={handleContinueToPayment}
      />

      <AnimatePresence>
        {showPaymentMethods && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/50 p-4 backdrop-blur-sm"
            onClick={() => setShowPaymentMethods(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-6 py-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-ink-400">Step 2 of 2</p>
                  <h2 className="font-display text-2xl text-ink-900">Choose how to pay</h2>
                </div>
                <button
                  onClick={() => setShowPaymentMethods(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:text-ink-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-3 overflow-y-auto p-6 scroll-soft">
                {availableGateways.map((gateway) => {
                  const meta = GATEWAY_META[gateway.gateway_type] ?? GATEWAY_META.default;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={gateway.id}
                      onClick={() => handleSelectPaymentMethod('card')}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4 text-left transition-all hover:border-ocean-700 hover:bg-ocean-50"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ocean-50 text-ocean-800 transition-colors group-hover:bg-ocean-800 group-hover:text-ivory-50">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-ink-900">{gateway.name || meta.label}</p>
                        <p className="text-sm text-ink-500">{meta.tagline}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-ink-400 transition-all group-hover:translate-x-0.5 group-hover:text-ocean-800" />
                    </button>
                  );
                })}

                <div className="relative py-2">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-ink-100" />
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[11px] uppercase tracking-[0.22em] text-ink-400">Or</span>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectPaymentMethod('cash')}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4 text-left transition-all hover:border-amber-500 hover:bg-amber-50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 transition-colors group-hover:bg-amber-500 group-hover:text-white">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-ink-900">Cash at the counter</p>
                    <p className="text-sm text-ink-500">Pay when you collect your order</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-400 transition-all group-hover:translate-x-0.5 group-hover:text-amber-700" />
                </button>
              </div>

              <div className="border-t border-ink-100 bg-ivory-100/60 px-6 py-4 text-center text-[11px] uppercase tracking-[0.2em] text-ink-400">
                Encrypted · PCI compliant · Your data stays private
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
