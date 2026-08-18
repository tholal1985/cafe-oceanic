import { useState, useEffect } from 'react';
import { Gift, Sparkles, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import type { Database } from '../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type PromotionalGift = Database['public']['Tables']['promotional_gifts']['Row'];

interface GiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartTotal: number;
}

interface GiftWithProduct extends PromotionalGift {
  product: Product;
}

export default function GiftModal({ isOpen, onClose, cartTotal }: GiftModalProps) {
  const [gifts, setGifts] = useState<GiftWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGift, setSelectedGift] = useState<string | null>(null);
  const { addToCart } = useStore();

  useEffect(() => {
    if (isOpen && cartTotal > 0) {
      loadEligibleGifts();
    }
  }, [isOpen, cartTotal]);

  const loadEligibleGifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promotional_gifts')
        .select(`
          *,
          product:products(*)
        `)
        .eq('is_active', true)
        .lte('minimum_order_value', cartTotal)
        .order('priority', { ascending: false });

      if (error) throw error;

      setGifts((data as any) || []);
    } catch (error) {
      console.error('Error loading gifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimGift = async (gift: GiftWithProduct) => {
    if (!gift.product || !gift.product.is_available) return;

    const giftProduct = { ...gift.product, price: 0 };
    addToCart(giftProduct, 1, []);
    setSelectedGift(gift.id);

    try {
      await supabase
        .from('promotional_gifts')
        .update({ redemptions_count: gift.redemptions_count + 1 })
        .eq('id', gift.id);
    } catch (error) {
      console.error('Error updating redemption count:', error);
    }

    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen || gifts.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 rounded-3xl opacity-10 pointer-events-none"></div>

        <div className="sticky top-0 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-600 text-white p-6 sm:p-8 rounded-t-3xl z-10 relative">
          <div className="absolute top-0 left-0 right-0 flex justify-center -mt-6">
            <div className="bg-yellow-400 rounded-full p-4 shadow-xl animate-bounce">
              <Gift size={48} className="text-red-600" />
            </div>
          </div>

          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="animate-pulse" size={28} />
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black">
                CONGRATULATIONS!
              </h2>
              <Sparkles className="animate-pulse" size={28} />
            </div>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-100 mt-2">
              You've earned a FREE gift!
            </p>
            <p className="text-base sm:text-lg text-orange-100 mt-1">
              Order total: ${cartTotal.toFixed(2)}
            </p>
          </div>

          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X size={28} />
          </button>
        </div>

        <div className="p-6 sm:p-8 relative">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading your gifts...</p>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                  Choose Your FREE Gift
                </h3>
                <p className="text-gray-600 text-sm sm:text-base">
                  Select one complimentary item below
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                {gifts.map((gift) => {
                  const isClaimed = selectedGift === gift.id;
                  const product = gift.product;

                  return (
                    <div
                      key={gift.id}
                      className={`relative bg-gradient-to-br from-yellow-50 to-orange-50 border-3 rounded-2xl overflow-hidden transition-all duration-300 ${
                        isClaimed
                          ? 'border-green-500 shadow-2xl scale-105'
                          : 'border-orange-300 hover:border-orange-500 hover:shadow-xl'
                      }`}
                    >
                      {isClaimed && (
                        <div className="absolute top-0 left-0 right-0 bg-green-500 text-white text-center py-2 font-bold text-sm z-10">
                          CLAIMED!
                        </div>
                      )}

                      <div className="absolute top-3 right-3 z-10">
                        <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full font-black text-sm shadow-lg transform rotate-12">
                          FREE!
                        </div>
                      </div>

                      <div className={`relative h-48 sm:h-56 overflow-hidden bg-gray-100 ${isClaimed ? 'mt-10' : ''}`}>
                        {product.image_url && (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      <div className="p-4 sm:p-6">
                        <h4 className="font-bold text-xl sm:text-2xl text-gray-800 mb-2">
                          {product.name}
                        </h4>
                        <p className="text-sm sm:text-base text-gray-700 mb-4 line-clamp-2">
                          {gift.gift_description}
                        </p>

                        <div className="flex items-center justify-between mb-3">
                          <div className="text-lg text-gray-500 line-through">
                            ${product.price.toFixed(2)}
                          </div>
                          <div className="text-3xl font-black text-green-600">
                            $0.00
                          </div>
                        </div>

                        {gift.minimum_order_value > 0 && (
                          <p className="text-xs text-orange-600 mb-3 font-semibold">
                            Min. order: ${gift.minimum_order_value.toFixed(2)}
                          </p>
                        )}

                        <button
                          onClick={() => handleClaimGift(gift)}
                          disabled={!product.is_available || isClaimed}
                          className={`w-full py-3 sm:py-4 rounded-xl font-bold text-lg transition-all ${
                            isClaimed
                              ? 'bg-green-500 text-white'
                              : product.is_available
                              ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-600 hover:to-red-700 active:scale-95 shadow-lg'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isClaimed ? (
                            <span className="flex items-center justify-center gap-2">
                              <Gift size={20} />
                              Added to Cart!
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <Gift size={20} />
                              Claim This Gift
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sticky bottom-0 bg-white pt-4 border-t-2 border-gray-200">
                <button
                  onClick={handleSkip}
                  className="w-full bg-gray-600 text-white py-4 sm:py-5 rounded-2xl text-lg sm:text-xl font-bold hover:bg-gray-700 transition-all shadow-lg"
                >
                  No Thanks, Continue Without Gift
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
