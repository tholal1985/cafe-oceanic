import { useEffect, useState } from 'react';
import { Plus, CreditCard as Edit2, Trash2, X, Tag, Gift, Sparkles, Image as ImageIcon, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];
type Addon = Database['public']['Tables']['addons']['Row'];
type Advertisement = Database['public']['Tables']['advertisements']['Row'];
type Product = Database['public']['Tables']['products']['Row'];
type SuggestedProduct = Database['public']['Tables']['suggested_products']['Row'];
type PromotionalGift = Database['public']['Tables']['promotional_gifts']['Row'];

interface SuggestionWithProduct extends SuggestedProduct {
  product: Product;
}

interface GiftWithProduct extends PromotionalGift {
  product: Product;
}

export default function Kiosk() {
  const [activeTab, setActiveTab] = useState<'categories' | 'addons' | 'upsells' | 'gifts' | 'ads'>('categories');

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    image_url: '',
    display_order: 0,
    is_active: true,
  });

  // Addons state
  const [addons, setAddons] = useState<Addon[]>([]);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [addonFormData, setAddonFormData] = useState({
    name: '',
    price: 0,
    is_available: true,
  });

  // Upsells state
  const [suggestions, setSuggestions] = useState<SuggestionWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showUpsellForm, setShowUpsellForm] = useState(false);
  const [editingUpsellId, setEditingUpsellId] = useState<string | null>(null);
  const [upsellFormData, setUpsellFormData] = useState({
    product_id: '',
    suggestion_type: 'popular' as const,
    display_text: '',
    display_order: 0,
    is_active: true,
  });

  // Gifts state
  const [gifts, setGifts] = useState<GiftWithProduct[]>([]);
  const [showGiftForm, setShowGiftForm] = useState(false);
  const [editingGiftId, setEditingGiftId] = useState<string | null>(null);
  const [giftFormData, setGiftFormData] = useState({
    product_id: '',
    minimum_order_value: 50,
    gift_title: 'FREE Gift with Your Order!',
    gift_description: '',
    is_active: true,
    priority: 0,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    max_redemptions: null as number | null,
  });

  // Ads state
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [showAdModal, setShowAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null);
  const [adFormData, setAdFormData] = useState({
    title: '',
    media_type: 'image' as 'image' | 'gif' | 'video',
    media_url: '',
    start_date: '',
    end_date: '',
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    fetchCategories();
    fetchAddons();
    fetchProducts();
    fetchSuggestions();
    fetchGifts();
    fetchAds();
  }, []);

  // Categories functions
  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setCategories(data);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      await supabase
        .from('categories')
        .update(categoryFormData)
        .eq('id', editingCategory.id);
    } else {
      await supabase.from('categories').insert(categoryFormData);
    }
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryFormData({ name: '', image_url: '', display_order: 0, is_active: true });
    fetchCategories();
  };

  const handleCategoryEdit = (category: Category) => {
    setEditingCategory(category);
    setCategoryFormData({
      name: category.name,
      image_url: category.image_url || '',
      display_order: category.display_order,
      is_active: category.is_active,
    });
    setShowCategoryModal(true);
  };

  const handleCategoryDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      await supabase.from('categories').delete().eq('id', id);
      fetchCategories();
    }
  };

  // Addons functions
  const fetchAddons = async () => {
    const { data } = await supabase
      .from('addons')
      .select('*')
      .order('name', { ascending: true });
    if (data) setAddons(data);
  };

  const handleAddonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAddon) {
      await supabase
        .from('addons')
        .update(addonFormData)
        .eq('id', editingAddon.id);
    } else {
      await supabase.from('addons').insert(addonFormData);
    }
    setShowAddonModal(false);
    setEditingAddon(null);
    setAddonFormData({ name: '', price: 0, is_available: true });
    fetchAddons();
  };

  const handleAddonEdit = (addon: Addon) => {
    setEditingAddon(addon);
    setAddonFormData({
      name: addon.name,
      price: addon.price,
      is_available: addon.is_available,
    });
    setShowAddonModal(true);
  };

  const handleAddonDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this add-on?')) {
      await supabase.from('addons').delete().eq('id', id);
      fetchAddons();
    }
  };

  // Upsells functions
  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_available', true)
      .order('name', { ascending: true });
    if (data) setProducts(data);
  };

  const fetchSuggestions = async () => {
    const { data } = await supabase
      .from('suggested_products')
      .select(`*, product:products(*)`)
      .order('display_order', { ascending: true });
    if (data) setSuggestions(data as any);
  };

  const handleUpsellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUpsellId) {
        await supabase
          .from('suggested_products')
          .update(upsellFormData)
          .eq('id', editingUpsellId);
      } else {
        await supabase.from('suggested_products').insert([upsellFormData]);
      }
      setShowUpsellForm(false);
      setEditingUpsellId(null);
      setUpsellFormData({
        product_id: '',
        suggestion_type: 'popular',
        display_text: '',
        display_order: 0,
        is_active: true,
      });
      fetchSuggestions();
    } catch (error) {
      console.error('Error saving suggestion:', error);
    }
  };

  const handleUpsellEdit = (suggestion: SuggestionWithProduct) => {
    setUpsellFormData({
      product_id: suggestion.product_id,
      suggestion_type: suggestion.suggestion_type,
      display_text: suggestion.display_text,
      display_order: suggestion.display_order,
      is_active: suggestion.is_active,
    });
    setEditingUpsellId(suggestion.id);
    setShowUpsellForm(true);
  };

  const handleUpsellDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this upsell suggestion?')) {
      await supabase.from('suggested_products').delete().eq('id', id);
      fetchSuggestions();
    }
  };

  // Gifts functions
  const fetchGifts = async () => {
    const { data } = await supabase
      .from('promotional_gifts')
      .select(`*, product:products(*)`)
      .order('priority', { ascending: false });
    if (data) setGifts(data as any);
  };

  const handleGiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData = {
        ...giftFormData,
        end_date: giftFormData.end_date || null,
        max_redemptions: giftFormData.max_redemptions || null,
      };

      if (editingGiftId) {
        await supabase
          .from('promotional_gifts')
          .update(submitData)
          .eq('id', editingGiftId);
      } else {
        await supabase.from('promotional_gifts').insert([submitData]);
      }
      setShowGiftForm(false);
      setEditingGiftId(null);
      setGiftFormData({
        product_id: '',
        minimum_order_value: 50,
        gift_title: 'FREE Gift with Your Order!',
        gift_description: '',
        is_active: true,
        priority: 0,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        max_redemptions: null,
      });
      fetchGifts();
    } catch (error) {
      console.error('Error saving gift:', error);
    }
  };

  const handleGiftEdit = (gift: GiftWithProduct) => {
    setGiftFormData({
      product_id: gift.product_id,
      minimum_order_value: gift.minimum_order_value,
      gift_title: gift.gift_title,
      gift_description: gift.gift_description || '',
      is_active: gift.is_active,
      priority: gift.priority,
      start_date: gift.start_date.split('T')[0],
      end_date: gift.end_date ? gift.end_date.split('T')[0] : '',
      max_redemptions: gift.max_redemptions,
    });
    setEditingGiftId(gift.id);
    setShowGiftForm(true);
  };

  const handleGiftDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this promotional gift?')) {
      await supabase.from('promotional_gifts').delete().eq('id', id);
      fetchGifts();
    }
  };

  // Ads functions
  const fetchAds = async () => {
    const { data } = await supabase
      .from('advertisements')
      .select('*')
      .order('display_order', { ascending: true });
    if (data) setAds(data);
  };

  const handleAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...adFormData,
      start_date: adFormData.start_date || new Date().toISOString(),
      end_date: adFormData.end_date || null,
    };

    if (editingAd) {
      await supabase
        .from('advertisements')
        .update(payload)
        .eq('id', editingAd.id);
    } else {
      await supabase.from('advertisements').insert(payload);
    }
    setShowAdModal(false);
    setEditingAd(null);
    setAdFormData({
      title: '',
      media_type: 'image',
      media_url: '',
      start_date: '',
      end_date: '',
      is_active: true,
      display_order: 0,
    });
    fetchAds();
  };

  const handleAdEdit = (ad: Advertisement) => {
    setEditingAd(ad);
    setAdFormData({
      title: ad.title,
      media_type: ad.media_type,
      media_url: ad.media_url,
      start_date: ad.start_date.split('T')[0],
      end_date: ad.end_date ? ad.end_date.split('T')[0] : '',
      is_active: ad.is_active,
      display_order: ad.display_order,
    });
    setShowAdModal(true);
  };

  const handleAdDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this advertisement?')) {
      await supabase.from('advertisements').delete().eq('id', id);
      fetchAds();
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Monitor className="text-red-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Kiosk Management</h1>
            <p className="text-gray-600">Manage kiosk display elements and customer-facing content</p>
          </div>
        </div>
        {activeTab === 'categories' && (
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Category
          </button>
        )}
        {activeTab === 'addons' && (
          <button
            onClick={() => setShowAddonModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Add-on
          </button>
        )}
        {activeTab === 'upsells' && (
          <button
            onClick={() => setShowUpsellForm(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Upsell
          </button>
        )}
        {activeTab === 'gifts' && (
          <button
            onClick={() => setShowGiftForm(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Gift
          </button>
        )}
        {activeTab === 'ads' && (
          <button
            onClick={() => setShowAdModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Advertisement
          </button>
        )}
      </div>

      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'categories'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Tag size={18} />
            Categories
          </button>
          <button
            onClick={() => setActiveTab('addons')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'addons'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Plus size={18} />
            Add-ons
          </button>
          <button
            onClick={() => setActiveTab('upsells')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'upsells'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Sparkles size={18} />
            Upsell Items
          </button>
          <button
            onClick={() => setActiveTab('gifts')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'gifts'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Gift size={18} />
            Gift Rewards
          </button>
          <button
            onClick={() => setActiveTab('ads')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'ads'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <ImageIcon size={18} />
            Ads
          </button>
        </div>
      </div>

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((category) => (
            <div key={category.id} className="bg-white rounded-xl shadow-md overflow-hidden">
              {category.image_url && (
                <img
                  src={category.image_url}
                  alt={category.name}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-800">{category.name}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      category.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {category.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-4">Order: {category.display_order}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCategoryEdit(category)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleCategoryDelete(category.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Addons Tab */}
      {activeTab === 'addons' && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {addons.map((addon) => (
                <tr key={addon.id}>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{addon.name}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-700 font-semibold">
                    ${addon.price.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        addon.is_available
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {addon.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddonEdit(addon)}
                        className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleAddonDelete(addon.id)}
                        className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upsells Tab */}
      {activeTab === 'upsells' && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Product</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Display Text</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suggestions.map((suggestion) => (
                <tr key={suggestion.id}>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{suggestion.product.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 capitalize">
                      {suggestion.suggestion_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{suggestion.display_text}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        suggestion.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {suggestion.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpsellEdit(suggestion)}
                        className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleUpsellDelete(suggestion.id)}
                        className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gifts Tab */}
      {activeTab === 'gifts' && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Gift Product</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Min Order</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Title</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {gifts.map((gift) => (
                <tr key={gift.id}>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-gray-800">{gift.product.name}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-700 font-semibold">
                    ${gift.minimum_order_value.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{gift.gift_title}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        gift.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {gift.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGiftEdit(gift)}
                        className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleGiftDelete(gift.id)}
                        className="p-2 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ads Tab */}
      {activeTab === 'ads' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ads.map((ad) => (
            <div key={ad.id} className="bg-white rounded-xl shadow-md overflow-hidden">
              {ad.media_type === 'image' || ad.media_type === 'gif' ? (
                <img src={ad.media_url} alt={ad.title} className="w-full h-48 object-cover" />
              ) : (
                <video src={ad.media_url} className="w-full h-48 object-cover" controls />
              )}
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-800">{ad.title}</h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      ad.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {ad.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Type: <span className="font-semibold capitalize">{ad.media_type}</span>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAdEdit(ad)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    <Edit2 size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleAdDelete(ad.id)}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingCategory ? 'Edit Category' : 'Add Category'}
                </h2>
                <button
                  onClick={() => {
                    setShowCategoryModal(false);
                    setEditingCategory(null);
                    setCategoryFormData({ name: '', image_url: '', display_order: 0, is_active: true });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCategorySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={categoryFormData.name}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Image URL</label>
                  <input
                    type="url"
                    value={categoryFormData.image_url}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, image_url: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={categoryFormData.display_order}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, display_order: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={categoryFormData.is_active}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, is_active: e.target.checked })}
                    className="w-5 h-5 text-red-600"
                  />
                  <label htmlFor="is_active" className="text-sm font-semibold text-gray-700">
                    Active
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingCategory ? 'Update' : 'Create'} Category
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Addon Modal */}
      <AnimatePresence>
        {showAddonModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingAddon ? 'Edit Add-on' : 'Add Add-on'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddonModal(false);
                    setEditingAddon(null);
                    setAddonFormData({ name: '', price: 0, is_available: true });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddonSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={addonFormData.name}
                    onChange={(e) => setAddonFormData({ ...addonFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={addonFormData.price}
                    onChange={(e) => setAddonFormData({ ...addonFormData, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_available"
                    checked={addonFormData.is_available}
                    onChange={(e) => setAddonFormData({ ...addonFormData, is_available: e.target.checked })}
                    className="w-5 h-5 text-red-600"
                  />
                  <label htmlFor="is_available" className="text-sm font-semibold text-gray-700">
                    Available
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingAddon ? 'Update' : 'Create'} Add-on
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upsell Form Modal */}
      <AnimatePresence>
        {showUpsellForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingUpsellId ? 'Edit Upsell' : 'Add Upsell'}
                </h2>
                <button
                  onClick={() => {
                    setShowUpsellForm(false);
                    setEditingUpsellId(null);
                    setUpsellFormData({
                      product_id: '',
                      suggestion_type: 'popular',
                      display_text: '',
                      display_order: 0,
                      is_active: true,
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleUpsellSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Product</label>
                  <select
                    value={upsellFormData.product_id}
                    onChange={(e) => setUpsellFormData({ ...upsellFormData, product_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} (${product.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                  <select
                    value={upsellFormData.suggestion_type}
                    onChange={(e) => setUpsellFormData({ ...upsellFormData, suggestion_type: e.target.value as 'popular' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="popular">Popular</option>
                    <option value="recommended">Recommended</option>
                    <option value="trending">Trending</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Display Text</label>
                  <input
                    type="text"
                    value={upsellFormData.display_text}
                    onChange={(e) => setUpsellFormData({ ...upsellFormData, display_text: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Try our best seller!"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={upsellFormData.display_order}
                    onChange={(e) => setUpsellFormData({ ...upsellFormData, display_order: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="upsell_active"
                    checked={upsellFormData.is_active}
                    onChange={(e) => setUpsellFormData({ ...upsellFormData, is_active: e.target.checked })}
                    className="w-5 h-5 text-red-600"
                  />
                  <label htmlFor="upsell_active" className="text-sm font-semibold text-gray-700">
                    Active
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingUpsellId ? 'Update' : 'Create'} Upsell
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Gift Form Modal */}
      <AnimatePresence>
        {showGiftForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingGiftId ? 'Edit Gift' : 'Add Gift'}
                </h2>
                <button
                  onClick={() => {
                    setShowGiftForm(false);
                    setEditingGiftId(null);
                    setGiftFormData({
                      product_id: '',
                      minimum_order_value: 50,
                      gift_title: 'FREE Gift with Your Order!',
                      gift_description: '',
                      is_active: true,
                      priority: 0,
                      start_date: new Date().toISOString().split('T')[0],
                      end_date: '',
                      max_redemptions: null,
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleGiftSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Gift Product</label>
                  <select
                    value={giftFormData.product_id}
                    onChange={(e) => setGiftFormData({ ...giftFormData, product_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} (${product.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Minimum Order Value</label>
                  <input
                    type="number"
                    step="0.01"
                    value={giftFormData.minimum_order_value}
                    onChange={(e) => setGiftFormData({ ...giftFormData, minimum_order_value: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Gift Title</label>
                  <input
                    type="text"
                    value={giftFormData.gift_title}
                    onChange={(e) => setGiftFormData({ ...giftFormData, gift_title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                  <textarea
                    value={giftFormData.gift_description}
                    onChange={(e) => setGiftFormData({ ...giftFormData, gift_description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={giftFormData.start_date}
                    onChange={(e) => setGiftFormData({ ...giftFormData, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Date (Optional)</label>
                  <input
                    type="date"
                    value={giftFormData.end_date}
                    onChange={(e) => setGiftFormData({ ...giftFormData, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="gift_active"
                    checked={giftFormData.is_active}
                    onChange={(e) => setGiftFormData({ ...giftFormData, is_active: e.target.checked })}
                    className="w-5 h-5 text-red-600"
                  />
                  <label htmlFor="gift_active" className="text-sm font-semibold text-gray-700">
                    Active
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingGiftId ? 'Update' : 'Create'} Gift
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ad Modal */}
      <AnimatePresence>
        {showAdModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingAd ? 'Edit Advertisement' : 'Add Advertisement'}
                </h2>
                <button
                  onClick={() => {
                    setShowAdModal(false);
                    setEditingAd(null);
                    setAdFormData({
                      title: '',
                      media_type: 'image',
                      media_url: '',
                      start_date: '',
                      end_date: '',
                      is_active: true,
                      display_order: 0,
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAdSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={adFormData.title}
                    onChange={(e) => setAdFormData({ ...adFormData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Media Type</label>
                  <select
                    value={adFormData.media_type}
                    onChange={(e) => setAdFormData({ ...adFormData, media_type: e.target.value as 'image' | 'gif' | 'video' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="image">Image</option>
                    <option value="gif">GIF</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Media URL</label>
                  <input
                    type="url"
                    value={adFormData.media_url}
                    onChange={(e) => setAdFormData({ ...adFormData, media_url: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={adFormData.start_date}
                    onChange={(e) => setAdFormData({ ...adFormData, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Date (Optional)</label>
                  <input
                    type="date"
                    value={adFormData.end_date}
                    onChange={(e) => setAdFormData({ ...adFormData, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={adFormData.display_order}
                    onChange={(e) => setAdFormData({ ...adFormData, display_order: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ad_active"
                    checked={adFormData.is_active}
                    onChange={(e) => setAdFormData({ ...adFormData, is_active: e.target.checked })}
                    className="w-5 h-5 text-red-600"
                  />
                  <label htmlFor="ad_active" className="text-sm font-semibold text-gray-700">
                    Active
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingAd ? 'Update' : 'Create'} Advertisement
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
