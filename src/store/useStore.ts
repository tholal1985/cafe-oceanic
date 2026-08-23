import { create } from 'zustand';
import type { Database } from '../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Addon = Database['public']['Tables']['addons']['Row'];

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  selectedAddons: Addon[];
  itemTotal: number;
}

interface KioskStore {
  cart: CartItem[];
  currentOrder: string | null;
  addToCart: (product: Product, quantity: number, addons: Addon[]) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  setCurrentOrder: (orderId: string) => void;
}

export const useStore = create<KioskStore>((set, get) => ({
  cart: [],
  currentOrder: null,

  addToCart: (product, quantity, addons) => {
    const addonsTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
    const itemTotal = (product.price + addonsTotal) * quantity;

    const newItem: CartItem = {
      id: `${product.id}-${Date.now()}`,
      product,
      quantity,
      selectedAddons: addons,
      itemTotal,
    };

    set((state) => ({
      cart: [...state.cart, newItem],
    }));
  },

  removeFromCart: (itemId) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.id !== itemId),
    }));
  },

  updateQuantity: (itemId, quantity) => {
    if (quantity < 1) return;

    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.id === itemId) {
          const addonsTotal = item.selectedAddons.reduce((sum, addon) => sum + addon.price, 0);
          const itemTotal = (item.product.price + addonsTotal) * quantity;
          return { ...item, quantity, itemTotal };
        }
        return item;
      }),
    }));
  },

  clearCart: () => {
    set({ cart: [], currentOrder: null });
  },

  getCartTotal: () => {
    return get().cart.reduce((sum, item) => sum + item.itemTotal, 0);
  },

  setCurrentOrder: (orderId) => {
    set({ currentOrder: orderId });
  },
}));
