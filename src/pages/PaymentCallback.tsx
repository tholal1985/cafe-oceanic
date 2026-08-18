import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { PaymentService } from '../lib/paymentService';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';

export default function PaymentCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useStore();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [orderNumber, setOrderNumber] = useState('');

  useEffect(() => {
    verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifyPayment = async () => {
    try {
      const orderId = searchParams.get('orderId');
      const transactionId = searchParams.get('transactionId');
      const paymentStatus = searchParams.get('status');
      const txnId = searchParams.get('txnId');
      const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname.includes('local');

      if (!orderId) {
        setStatus('failed');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      const { data: order } = await supabase
        .from('orders')
        .select('*, payment_transactions(*)')
        .eq('id', orderId)
        .maybeSingle();

      if (!order) {
        setStatus('failed');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (isLocalDev && paymentStatus === 'success' && txnId) {
        const transaction = order.payment_transactions?.[0];
        if (transaction) {
          await supabase
            .from('payment_transactions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', transaction.id);

          await supabase
            .from('orders')
            .update({
              payment_status: 'completed'
            })
            .eq('id', orderId);

          setStatus('success');
          setOrderNumber(order.order_number);
          clearCart();

          setTimeout(() => {
            navigate('/order-confirmation', {
              state: { orderId: order.id, orderNumber: order.order_number }
            });
          }, 2000);
          return;
        }
      }

      let transaction = order.payment_transactions?.[0];

      if (!transaction && transactionId) {
        const txn = await PaymentService.getTransactionStatus(transactionId);
        transaction = txn;
      }

      if (transaction) {
        const verifiedTxn = await PaymentService.verifyPayment(transaction.id);

        if (verifiedTxn && verifiedTxn.status === 'completed') {
          setStatus('success');
          setOrderNumber(order.order_number);
          clearCart();

          setTimeout(() => {
            navigate('/order-confirmation', {
              state: { orderId: order.id, orderNumber: order.order_number }
            });
          }, 2000);
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const { data: updatedOrder } = await supabase
        .from('orders')
        .select('payment_status')
        .eq('id', orderId)
        .maybeSingle();

      if (updatedOrder?.payment_status === 'completed') {
        setStatus('success');
        setOrderNumber(order.order_number);
        clearCart();

        setTimeout(() => {
          navigate('/order-confirmation', {
            state: { orderId: order.id, orderNumber: order.order_number }
          });
        }, 2000);
      } else {
        setStatus('failed');
        setTimeout(() => navigate('/checkout'), 3000);
      }

    } catch (error) {
      setStatus('failed');
      setTimeout(() => navigate('/checkout'), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12 max-w-2xl w-full shadow-2xl">
        {status === 'verifying' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <Loader2 size={80} className="sm:w-24 sm:h-24 mx-auto text-red-600 animate-spin mb-6 sm:mb-8" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-3 sm:mb-4">
              Verifying Payment
            </h2>
            <p className="text-gray-600 text-base sm:text-lg md:text-xl">
              Please wait while we confirm your payment...
            </p>
          </motion.div>
        )}

        {status === 'success' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="mb-6 sm:mb-8"
            >
              <CheckCircle size={80} className="sm:w-24 sm:h-24 md:w-28 md:h-28 mx-auto text-green-500" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-3 sm:mb-4">
              Payment Successful!
            </h2>
            <p className="text-gray-600 text-base sm:text-lg md:text-xl mb-4 sm:mb-6">
              Your order has been confirmed
            </p>
            {orderNumber && (
              <div className="bg-gray-100 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                <p className="text-gray-600 mb-2 text-sm sm:text-base">Order Number</p>
                <p className="text-2xl sm:text-3xl font-bold text-red-600">{orderNumber}</p>
              </div>
            )}
            <p className="text-gray-600 text-sm sm:text-base">
              Redirecting to order tracking...
            </p>
          </motion.div>
        )}

        {status === 'failed' && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
              className="mb-6 sm:mb-8"
            >
              <XCircle size={80} className="sm:w-24 sm:h-24 md:w-28 md:h-28 mx-auto text-red-600" />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-3 sm:mb-4">
              Payment Verification Failed
            </h2>
            <p className="text-gray-600 text-base sm:text-lg md:text-xl mb-6 sm:mb-8">
              We couldn't verify your payment. Redirecting...
            </p>
            <div className="flex justify-center">
              <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
