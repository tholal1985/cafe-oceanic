import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import type { Database } from '../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type SuggestedProduct = Database['public']['Tables']['suggested_products']['Row'];

interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
}

interface SuggestionWithProduct extends SuggestedProduct {
  product: Product;
}

export default function UpsellModal({ isOpen, onClose, onContinue }: UpsellModalProps) {
  const [suggestions, setSuggestions] = useState<SuggestionWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const { addToCart } = useStore();

  useEffect(() => {
    if (isOpen) {
      loadSuggestions();
    }
  }, [isOpen]);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suggested_products')
        .select(`
          *,
          product:products(*)
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(6);

      if (error) throw error;

      setSuggestions((data as any) || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = (suggestion: SuggestionWithProduct) => {
    if (!suggestion.product || !suggestion.product.is_available) return;

    addToCart(suggestion.product, 1, []);
    setAddedItems(prev => new Set(prev).add(suggestion.id));

    setTimeout(() => {
      setAddedItems(prev => {
        const updated = new Set(prev);
        updated.delete(suggestion.id);
        return updated;
      });
    }, 2000);
  };

  const handleContinue = () => {
    onContinue();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 sm:p-8 rounded-t-3xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
                Want to add something?
              </h2>
              <p className="text-base sm:text-lg text-orange-50">
                Complete your meal with these popular items
              </p>
            </div>
            <button
              onClick={handleContinue}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
            >
              <X size={32} />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 rounded-2xl h-48 mb-3"></div>
                  <div className="bg-gray-200 h-6 rounded mb-2"></div>
                  <div className="bg-gray-200 h-4 rounded w-2/3"></div>
                </div>
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-500">No suggestions available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
              {suggestions.map((suggestion) => {
                const isAdded = addedItems.has(suggestion.id);
                const product = suggestion.product;

                return (
                  <div
                    key={suggestion.id}
                    className="bg-white border-2 border-gray-200 rounded-2xl overflow-hidden hover:border-orange-500 hover:shadow-xl transition-all duration-300"
                  >
                    <div className="relative h-40 sm:h-48 overflow-hidden bg-gray-100">
                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {suggestion.suggestion_type && (
                        <div className="absolute top-3 left-3 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-semibold uppercase">
                          {suggestion.suggestion_type}
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <h3 className="font-bold text-lg sm:text-xl text-gray-800 mb-1">
                        {product.name}
                      </h3>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                        {suggestion.display_text}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-orange-600">
                          ${product.price.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleAddItem(suggestion)}
                          disabled={!product.is_available || isAdded}
                          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all ${
                            isAdded
                              ? 'bg-green-500 text-white'
                              : product.is_available
                              ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isAdded ? (
                            <>
                              <span className="text-sm sm:text-base">Added!</span>
                            </>
                          ) : (
                            <>
                              <Plus size={20} />
                              <span className="text-sm sm:text-base">Add</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="sticky bottom-0 bg-white pt-4 border-t-2 border-gray-200">
            <button
              onClick={handleContinue}
              className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-5 sm:py-6 rounded-2xl text-xl sm:text-2xl font-bold hover:from-orange-600 hover:to-red-700 transition-all shadow-lg active:scale-98"
            >
              No Thanks, Continue to Payment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
