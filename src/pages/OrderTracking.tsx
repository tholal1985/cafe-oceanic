import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, ChefHat, Package, AlertCircle, Home, ShoppingBag, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Order = Database['public']['Tables']['orders']['Row'];

export default function OrderTracking() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!orderId) {
      setError(true);
      setLoading(false);
      return;
    }

    fetchOrder();

    const subscription = supabase
      .channel(`order-tracking:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(timeInterval);
    };
  }, [orderId]);

  const fetchOrder = async () => {
    if (!orderId) return;

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !data) {
      setError(true);
    } else {
      setOrder(data);
    }
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={80} className="text-yellow-500" />;
      case 'preparing':
        return <ChefHat size={80} className="text-orange-500" />;
      case 'ready':
        return <Package size={80} className="text-green-500" />;
      case 'completed':
        return <CheckCircle size={80} className="text-green-600" />;
      default:
        return <Clock size={80} className="text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Order Received';
      case 'preparing':
        return 'Preparing Your Order';
      case 'ready':
        return 'Order Ready for Pickup!';
      case 'completed':
        return 'Order Completed';
      default:
        return 'Processing...';
    }
  };

  const getEstimatedTime = (status: string, createdAt: string) => {
    const orderTime = new Date(createdAt);
    const elapsed = Math.floor((currentTime.getTime() - orderTime.getTime()) / 60000);

    switch (status) {
      case 'pending':
        return '10-15 minutes';
      case 'preparing':
        const remaining = Math.max(0, 15 - elapsed);
        return remaining > 0 ? `${remaining} minutes` : 'Almost ready!';
      case 'ready':
        return 'Pick up now!';
      case 'completed':
        return 'Completed';
      default:
        return 'Calculating...';
    }
  };

  const getElapsedTime = (createdAt: string) => {
    const orderTime = new Date(createdAt);
    const diff = Math.floor((currentTime.getTime() - orderTime.getTime()) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;

    if (minutes > 0) {
      return `${minutes}m ${seconds}s ago`;
    }
    return `${seconds}s ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-12 text-center shadow-2xl">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-2xl text-gray-600">Loading order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-12 text-center max-w-md shadow-2xl">
          <AlertCircle size={80} className="text-red-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Order Not Found</h1>
          <p className="text-gray-600 text-lg">
            We couldn't find this order. Please check your order number or contact staff for assistance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 md:p-12 max-w-2xl w-full shadow-2xl">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <motion.div
            key={order.status}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
            className="mb-6"
          >
            {getStatusIcon(order.status)}
          </motion.div>

          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            {getStatusText(order.status)}
          </h1>

          <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 md:p-8 mb-6">
            <p className="text-gray-600 text-lg mb-2">Order Number</p>
            <p className="text-4xl md:text-5xl font-bold text-red-600 mb-4">
              {order.order_number.split('-').pop()}
            </p>

            <div className="flex items-center justify-center gap-2 mb-4">
              {order.order_type === 'takeaway' ? (
                <ShoppingBag size={24} className="text-red-600" />
              ) : (
                <Home size={24} className="text-red-600" />
              )}
              <p className="text-lg font-semibold text-gray-700">
                {order.order_type === 'takeaway' ? 'Takeaway Order' : 'Dine In'}
              </p>
            </div>

            {order.order_type === 'takeaway' && order.phone_number && (
              <div className="bg-white rounded-lg p-3 mb-4 flex items-center justify-center gap-2">
                <Phone size={20} className="text-red-600" />
                <p className="text-lg text-gray-700">{order.phone_number}</p>
              </div>
            )}

            <p className="text-sm text-gray-500 mb-4">
              Placed {getElapsedTime(order.created_at)}
            </p>
            <div className="text-xl md:text-2xl text-gray-700">
              <p className="mb-2">Estimated Time</p>
              <p className="font-bold text-2xl md:text-3xl text-red-600">
                {getEstimatedTime(order.status, order.created_at)}
              </p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between max-w-md mx-auto">
              {['pending', 'preparing', 'ready'].map((status, index) => (
                <div key={status} className="flex items-center">
                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-sm md:text-base font-bold ${
                      ['pending', 'preparing', 'ready'].indexOf(order.status) >= index
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {index + 1}
                  </div>
                  {index < 2 && (
                    <div
                      className={`w-16 md:w-24 h-1 ${
                        ['pending', 'preparing', 'ready'].indexOf(order.status) > index
                          ? 'bg-red-600'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs md:text-sm text-gray-600 max-w-md mx-auto px-2">
              <span>Received</span>
              <span>Preparing</span>
              <span>Ready</span>
            </div>
          </div>

          {order.status === 'ready' && (
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="bg-green-100 border-2 border-green-500 rounded-xl p-6 mb-6"
            >
              <p className="text-xl md:text-2xl font-bold text-green-700">
                {order.order_type === 'takeaway'
                  ? 'Your order is ready for pickup!'
                  : 'Your order is ready! Please proceed to the counter to collect it.'}
              </p>
            </motion.div>
          )}

          {order.status === 'completed' && (
            <div className="bg-gray-100 border-2 border-gray-300 rounded-xl p-6 mb-6">
              <p className="text-xl md:text-2xl font-bold text-gray-700">
                Thank you for your order!
              </p>
            </div>
          )}

          <div className="mt-8 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-600 mb-2">
              This page updates automatically. Keep it open to track your order in real-time.
            </p>
            <p className="text-xs text-gray-500">
              Order Total: ${parseFloat(order.total_price.toString()).toFixed(2)}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
