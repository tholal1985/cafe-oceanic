import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { useCurrency } from '../hooks/useCurrency';
import type { Database } from '../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Addon = Database['public']['Tables']['addons']['Row'];

interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

export default function ProductModal({ product, onClose }: ProductModalProps) {
  const { addToCart } = useStore();
  const { formatCurrency } = useCurrency();
  const [addons, setAddons] = useState<Addon[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    fetchAddons();
  }, [product.id]);

  const fetchAddons = async () => {
    const { data: productAddonLinks } = await supabase
      .from('product_addons')
      .select('addon_id')
      .eq('product_id', product.id);

    if (!productAddonLinks || productAddonLinks.length === 0) {
      setAddons([]);
      return;
    }

    const addonIds = productAddonLinks.map(link => link.addon_id);

    const { data } = await supabase
      .from('addons')
      .select('*')
      .in('id', addonIds)
      .eq('is_available', true);

    if (data) setAddons(data);
  };

  const toggleAddon = (addonId: string) => {
    const newSelected = new Set(selectedAddons);
    if (newSelected.has(addonId)) {
      newSelected.delete(addonId);
    } else {
      newSelected.add(addonId);
    }
    setSelectedAddons(newSelected);
  };

  const calculateTotal = () => {
    const addonsTotal = Array.from(selectedAddons).reduce((sum, addonId) => {
      const addon = addons.find((a) => a.id === addonId);
      return sum + (addon?.price || 0);
    }, 0);
    return (product.price + addonsTotal) * quantity;
  };

  const handleAddToCart = () => {
    const selectedAddonObjects = addons.filter((a) => selectedAddons.has(a.id));
    addToCart(product, quantity, selectedAddonObjects);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        <div className="relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100"
          >
            <X size={24} />
          </button>
          {product.image_url && (
            <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-64 object-cover rounded-t-3xl"
            />
          )}
        </div>

        <div className="p-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            {product.name}
          </h2>
          <p className="text-gray-600 mb-6">{product.description}</p>

          {addons.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                Customize Your Order
              </h3>
              <div className="space-y-2">
                {addons.map((addon) => (
                  <button
                    key={addon.id}
                    onClick={() => toggleAddon(addon.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      selectedAddons.has(addon.id)
                        ? 'border-red-600 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-semibold text-gray-800">
                      {addon.name}
                    </span>
                    <span className="text-red-600 font-bold">
                      +{formatCurrency(addon.price)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Quantity</h3>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="bg-gray-200 p-4 rounded-full hover:bg-gray-300 transition-colors"
              >
                <Minus size={24} />
              </button>
              <span className="text-3xl font-bold text-gray-800 w-16 text-center">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="bg-gray-200 p-4 rounded-full hover:bg-gray-300 transition-colors"
              >
                <Plus size={24} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
            <span className="text-xl font-bold text-gray-800">Total:</span>
            <span className="text-3xl font-bold text-red-600">
              {formatCurrency(calculateTotal())}
            </span>
          </div>

          <button
            onClick={handleAddToCart}
            className="w-full bg-red-600 text-white py-4 rounded-full text-xl font-bold hover:bg-red-700 transition-colors"
          >
            Add to Cart
          </button>
        </div>
      </motion.div>
    </div>
  );
}
