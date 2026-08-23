import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, Banknote, Check, CreditCard, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { sendOrderConfirmation } from '../lib/messagingService';
import { PaymentService } from '../lib/paymentService';
import { useCurrency } from '../hooks/useCurrency';
import { pushOrderToUltimatePos } from '../lib/ultimateposService';

export default function PaymentScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, getCartTotal, clearCart, setCurrentOrder } = useStore();
  const { currency } = useCurrency();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [orderNumber, setOrderNumber] = useState('');

  const paymentMethod = location.state?.paymentMethod as 'card' | 'cash';
  const orderType = (location.state?.orderType as 'dine-in' | 'takeaway') || 'dine-in';
  const phoneNumber = location.state?.phoneNumber as string | null;

  useEffect(() => {
    if (paymentMethod === 'cash' || paymentMethod === 'card') {
      processPayment(paymentMethod);
    }
  }, []);

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ORD-${timestamp}-${random}`;
  };

  const processPayment = async (method: 'card' | 'cash') => {
    try {
      setIsProcessing(true);
      const orderNum = generateOrderNumber();
      const total = getCartTotal();

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNum,
          total_price: total,
          status: 'pending',
          payment_method: method,
          payment_status: 'pending',
          order_type: orderType,
          phone_number: phoneNumber,
        })
        .select()
        .maybeSingle();

      if (orderError || !order) throw orderError || new Error('Failed to create order');

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        product_price: item.product.price,
        quantity: item.quantity,
        addons: item.selectedAddons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
        item_total: item.itemTotal,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      const result = await PaymentService.initiatePayment({
        orderId: order.id,
        amount: total,
        currency: currency?.code || 'MVR',
        paymentMethod: method,
        customerPhone: phoneNumber || undefined,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${order.id}`,
      });

      if (!result.success) throw new Error(result.error || 'Payment initialization failed');

      if (result.paymentMethod === 'qr' && result.qrCodeData) {
        navigate('/payment/qr', {
          state: {
            paymentData: {
              transactionId: result.transactionId,
              qrCodeData: result.qrCodeData,
              qrCodeUrl: result.qrCodeUrl,
              sessionToken: result.sessionToken,
              expiresAt: result.expiresAt,
              expiresIn: result.expiresIn,
              amount: total,
              currency: currency?.code || 'MVR',
              orderNumber: orderNum,
            },
          },
        });
        return;
      }

      if (method === 'card' && result.redirectUrl) {
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname.includes('local');
        const skipPayPal = sessionStorage.getItem('skipPayPal') === 'true';
        if (isLocalDev && skipPayPal) {
          window.location.href = `${window.location.origin}/payment/callback?orderId=${order.id}&status=success&txnId=${result.transactionId}`;
          return;
        }
        window.location.href = result.redirectUrl;
        return;
      }

      if (method === 'cash') {
        setOrderNumber(orderNum);
        setCurrentOrder(order.id);
        setIsSuccess(true);
        setIsProcessing(false);

        if (phoneNumber) {
          try {
            await sendOrderConfirmation(phoneNumber, orderNum, order.id, orderType, total);
          } catch (error) {
            console.error('Error sending order confirmation:', error);
          }
        }

        pushOrderToUltimatePos(order.id).catch((err) => console.error('UltimatePOS push failed:', err));

        setTimeout(() => {
          clearCart();
          navigate('/order-confirmation', { state: { orderId: order.id, orderNumber: orderNum } });
        }, 2000);
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      setIsProcessing(false);
      setHasError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Payment processing failed');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-ocean-950">
      <div className="absolute inset-0 bg-gradient-to-br from-ocean-900 via-ocean-950 to-ocean-950" />
      <div className="absolute inset-0 bg-grain opacity-30 mix-blend-overlay" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-ivory-50 shadow-lifted">
          <div className="border-b border-ink-100 px-8 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-ocean-700">
                <ShieldCheck className="h-4 w-4" />
                Secure payment
              </div>
              <span className="text-xs text-ink-400">Step 2 of 2</span>
            </div>
          </div>

          <div className="px-8 py-10">
            {isProcessing && !isSuccess && !hasError && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-ocean-50 text-ocean-800">
                  {paymentMethod === 'card' ? (
                    <CreditCard className="h-9 w-9" />
                  ) : (
                    <Banknote className="h-9 w-9" />
                  )}
                </div>
                <h1 className="font-display text-3xl text-ink-900">
                  {paymentMethod === 'card' ? 'Connecting to your bank…' : 'Finalising your order…'}
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-sm text-ink-500">
                  {paymentMethod === 'card'
                    ? 'Redirecting to a secure checkout. Please don&rsquo;t close this window.'
                    : 'Generating your kitchen ticket. This only takes a moment.'}
                </p>

                <div className="mt-10 flex items-center justify-center gap-2">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ocean-800 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ocean-800 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ocean-800" />
                </div>
              </motion.div>
            )}

            {hasError && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                  <AlertCircle className="h-9 w-9" />
                </div>
                <h1 className="font-display text-3xl text-ink-900">Payment didn&rsquo;t go through</h1>
                <p className="mx-auto mt-3 max-w-sm text-sm text-ink-500">
                  {errorMessage || 'We couldn&rsquo;t complete your payment. Your order was not placed.'}
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  <button
                    onClick={() => navigate('/checkout')}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3.5 text-sm font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => navigate('/menu')}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-ink-100 bg-white px-6 py-3 text-sm font-medium text-ink-700 transition hover:border-ink-200"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to menu
                  </button>
                </div>
              </motion.div>
            )}

            {isSuccess && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                  className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
                >
                  <Check className="h-10 w-10" />
                </motion.div>
                <h1 className="font-display text-3xl text-ink-900">Your order is in the queue</h1>
                <p className="mx-auto mt-3 max-w-sm text-sm text-ink-500">
                  Please pay at the counter when you pick up your food.
                </p>

                <div className="mt-8 rounded-2xl border border-ink-100 bg-ivory-100 px-6 py-5">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-400">Order number</p>
                  <p className="mt-1 font-display text-4xl text-ocean-800 tabular-nums">{orderNumber}</p>
                </div>

                <p className="mt-6 text-xs uppercase tracking-[0.22em] text-ink-400">
                  Taking you to tracking…
                </p>
              </motion.div>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 border-t border-ink-100 bg-ivory-100/70 px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-ink-400">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Encrypted</span>
            <span>·</span>
            <span>PCI compliant</span>
            <span>·</span>
            <span>Private</span>
          </div>
        </div>
      </div>
    </div>
  );
}
