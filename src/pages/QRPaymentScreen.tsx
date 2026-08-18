import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../hooks/useCurrency';

interface QRPaymentData {
  transactionId: string;
  qrCodeData: string;
  qrCodeUrl?: string;
  sessionToken: string;
  expiresAt: string;
  expiresIn: number;
  amount: number;
  currency: string;
  orderNumber?: string;
}

type Status = 'pending' | 'scanned' | 'completed' | 'expired' | 'failed';

export default function QRPaymentScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const paymentData = location.state?.paymentData as QRPaymentData;
  const { formatCurrency } = useCurrency();

  const [status, setStatus] = useState<Status>('pending');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const checkPaymentStatus = useCallback(async () => {
    if (!paymentData?.transactionId || checking) return;
    try {
      setChecking(true);
      const { data: txn } = await supabase
        .from('payment_transactions')
        .select('status')
        .eq('id', paymentData.transactionId)
        .maybeSingle();

      if (txn?.status === 'completed') {
        setStatus('completed');
        setTimeout(() => navigate('/order-confirmation', { state: { transactionId: paymentData.transactionId, paymentMethod: 'qr' } }), 2000);
      } else if (txn?.status === 'failed') {
        setStatus('failed');
        setError('Payment was declined or failed.');
      } else if (txn?.status === 'expired') {
        setStatus('expired');
      }
    } catch (_) {
      // non-fatal — will retry
    } finally {
      setChecking(false);
    }
  }, [paymentData?.transactionId, checking, navigate]);

  useEffect(() => {
    if (!paymentData) { navigate('/menu'); return; }

    const remaining = Math.max(0, Math.floor((new Date(paymentData.expiresAt).getTime() - Date.now()) / 1000));
    setTimeRemaining(remaining);
    if (remaining === 0) { setStatus('expired'); return; }

    const countdown = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) { setStatus('expired'); clearInterval(countdown); return 0; }
        return prev - 1;
      });
    }, 1000);

    const poll = setInterval(checkPaymentStatus, 3000);
    return () => { clearInterval(countdown); clearInterval(poll); };
  }, [paymentData, navigate, checkPaymentStatus]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (!paymentData) return null;

  // BML Connect returns base64 PNG as qrCodeUrl (data:image/png;base64,...)
  // Fallback: render EMV string as SVG QR via qrcode.react
  const hasImageQR = !!paymentData.qrCodeUrl;

  return (
    <div className="relative min-h-screen overflow-hidden bg-ocean-950">
      <div className="absolute inset-0 bg-gradient-to-br from-ocean-900 via-ocean-950 to-ocean-950" />
      <div className="absolute inset-0 bg-grain opacity-30 mix-blend-overlay" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <button
            onClick={() => navigate('/menu')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Secure payment
          </div>
          <div className="w-9" />
        </div>

        {/* Main card */}
        <div className="flex flex-1 items-center justify-center px-6 pb-10">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-ivory-50 shadow-lifted">

            <AnimatePresence mode="wait">
              {status === 'pending' && (
                <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Amount header */}
                  <div className="bg-ocean-800 px-8 py-6 text-center">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-ocean-200">Amount due</p>
                    <p className="mt-1 font-display text-4xl text-white tabular-nums">
                      {formatCurrency(Number(paymentData.amount))}
                    </p>
                    {paymentData.orderNumber && (
                      <p className="mt-1 text-xs text-ocean-300">Order {paymentData.orderNumber}</p>
                    )}
                  </div>

                  {/* QR code */}
                  <div className="px-8 py-6">
                    <div className="flex justify-center">
                      <div className="rounded-2xl border-4 border-ocean-800 bg-white p-3 shadow-soft">
                        {hasImageQR ? (
                          <img
                            src={paymentData.qrCodeUrl}
                            alt="BML Payment QR Code"
                            className="h-56 w-56 sm:h-64 sm:w-64"
                          />
                        ) : (
                          <QRCodeSVG
                            value={paymentData.qrCodeData || paymentData.sessionToken}
                            size={224}
                            level="H"
                            includeMargin={false}
                          />
                        )}
                      </div>
                    </div>

                    {/* Timer */}
                    <div className={`mt-5 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 ${
                      timeRemaining < 60 ? 'bg-rose-50 text-rose-700' : 'bg-ivory-100 text-ink-700'
                    }`}>
                      <Clock className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-semibold tabular-nums">
                        QR expires in {formatTime(timeRemaining)}
                      </span>
                    </div>

                    {/* Status line */}
                    <div className="mt-3 flex items-center justify-center gap-2 text-ink-400">
                      <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin text-ocean-800' : ''}`} />
                      <p className="text-xs">
                        {checking ? 'Checking payment…' : 'Waiting for confirmation'}
                      </p>
                    </div>

                    {/* Steps */}
                    <ol className="mt-5 space-y-2 rounded-2xl bg-ocean-50 px-5 py-4 text-sm text-ocean-800">
                      {[
                        'Open BML Mobile Banking app',
                        'Tap "Scan QR" or "Pay"',
                        'Scan the QR code above',
                        'Confirm the payment amount',
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ocean-800 text-[9px] font-bold text-white">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </motion.div>
              )}

              {status === 'completed' && (
                <motion.div
                  key="completed"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="px-8 py-14 text-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
                  >
                    <CheckCircle2 className="h-10 w-10" />
                  </motion.div>
                  <h2 className="font-display text-3xl text-ink-900">Payment confirmed</h2>
                  <p className="mt-2 text-sm text-ink-500">Taking you to your order confirmation…</p>
                  <p className="mt-6 text-xs uppercase tracking-[0.22em] text-ink-400">Please wait</p>
                </motion.div>
              )}

              {status === 'expired' && (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-8 py-14 text-center"
                >
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Clock className="h-10 w-10" />
                  </div>
                  <h2 className="font-display text-3xl text-ink-900">QR code expired</h2>
                  <p className="mt-2 text-sm text-ink-500">The code timed out. Start a new payment to try again.</p>
                  <div className="mt-8 flex flex-col gap-3">
                    <button
                      onClick={() => navigate('/checkout')}
                      className="rounded-full bg-ocean-800 py-3 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
                    >
                      Try again
                    </button>
                    <button
                      onClick={() => navigate('/menu')}
                      className="flex items-center justify-center gap-2 rounded-full border border-ink-100 bg-white py-3 text-sm font-medium text-ink-700 transition hover:border-ink-200"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to menu
                    </button>
                  </div>
                </motion.div>
              )}

              {status === 'failed' && (
                <motion.div
                  key="failed"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-8 py-14 text-center"
                >
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                    <XCircle className="h-10 w-10" />
                  </div>
                  <h2 className="font-display text-3xl text-ink-900">Payment failed</h2>
                  <p className="mt-2 text-sm text-ink-500">{error || 'Something went wrong. Please try again.'}</p>
                  <div className="mt-8 flex flex-col gap-3">
                    <button
                      onClick={() => navigate('/checkout')}
                      className="rounded-full bg-ocean-800 py-3 text-sm font-semibold text-ivory-50 shadow-soft transition hover:bg-ocean-900"
                    >
                      Try again
                    </button>
                    <button
                      onClick={() => navigate('/menu')}
                      className="flex items-center justify-center gap-2 rounded-full border border-ink-100 bg-white py-3 text-sm font-medium text-ink-700 transition hover:border-ink-200"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to menu
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
