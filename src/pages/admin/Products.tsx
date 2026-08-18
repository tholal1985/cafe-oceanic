import { useEffect, useState } from 'react';
import { Plus, CreditCard as Edit2, Trash2, X, Package, Download, Upload, AlertCircle, CheckCircle, Clock, FileDown, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];
type Addon = Database['public']['Tables']['addons']['Row'];

interface ProductPack {
  id: string;
  name: string;
  version: string;
  description: string | null;
  created_at: string;
  total_products: number;
  total_categories: number;
  total_addons: number;
  checksum: string;
}

interface PackHistory {
  id: string;
  operation_type: 'export' | 'import';
  operation_status: 'success' | 'failed' | 'partial';
  performed_at: string;
  details: any;
  error_log: string | null;
}

export default function Products() {
  const [activeTab, setActiveTab] = useState<'products' | 'packs'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: 0,
    cost: 0,
    image_url: '',
    recipe: '',
    display_order: 0,
    is_available: true,
  });

  const [packs, setPacks] = useState<ProductPack[]>([]);
  const [history, setHistory] = useState<PackHistory[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [exportForm, setExportForm] = useState({
    name: '',
    description: '',
    includeCategories: true,
    includeAddons: true,
    includeUpsells: true,
    includeGifts: true,
  });

  const [importForm, setImportForm] = useState({
    selectedPackId: '',
    conflictStrategy: 'skip' as 'skip' | 'overwrite' | 'rename',
    clearExisting: false,
    uploadedFile: null as File | null,
  });

  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchAddons();
    fetchPacks();
    fetchHistory();
  }, []);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('display_order', { ascending: true });

    if (data) setProducts(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (data) setCategories(data);
  };

  const fetchAddons = async () => {
    const { data } = await supabase
      .from('addons')
      .select('*')
      .eq('is_available', true)
      .order('name', { ascending: true });

    if (data) setAddons(data);
  };

  const fetchProductAddons = async (productId: string) => {
    const { data } = await supabase
      .from('product_addons')
      .select('addon_id')
      .eq('product_id', productId);

    if (data) {
      setSelectedAddons(data.map(pa => pa.addon_id));
    }
  };

  const fetchProductCategories = async (productId: string) => {
    const { data } = await supabase
      .from('product_categories')
      .select('category_id')
      .eq('product_id', productId);

    if (data) {
      setSelectedCategories(data.map(pc => pc.category_id));
    }
  };

  const saveProductAddons = async (productId: string) => {
    await supabase
      .from('product_addons')
      .delete()
      .eq('product_id', productId);

    if (selectedAddons.length > 0) {
      const productAddons = selectedAddons.map(addonId => ({
        product_id: productId,
        addon_id: addonId,
      }));

      await supabase
        .from('product_addons')
        .insert(productAddons);
    }
  };

  const saveProductCategories = async (productId: string) => {
    await supabase
      .from('product_categories')
      .delete()
      .eq('product_id', productId);

    if (selectedCategories.length > 0) {
      const productCategories = selectedCategories.map(categoryId => ({
        product_id: productId,
        category_id: categoryId,
      }));

      await supabase
        .from('product_categories')
        .insert(productCategories);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let productId: string;

    if (editingProduct) {
      await supabase
        .from('products')
        .update(formData)
        .eq('id', editingProduct.id);
      productId = editingProduct.id;
    } else {
      const { data } = await supabase.from('products').insert(formData).select().single();
      productId = data?.id;
    }

    if (productId) {
      await saveProductAddons(productId);
      await saveProductCategories(productId);
    }

    setShowModal(false);
    setEditingProduct(null);
    setSelectedAddons([]);
    setSelectedCategories([]);
    setFormData({
      name: '',
      description: '',
      price: 0,
      cost: 0,
      image_url: '',
      recipe: '',
      display_order: 0,
      is_available: true,
    });
    fetchProducts();
  };

  const handleEdit = async (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      price: product.price,
      cost: product.cost ?? 0,
      image_url: product.image_url || '',
      recipe: product.recipe || '',
      display_order: product.display_order,
      is_available: product.is_available,
    });
    await fetchProductAddons(product.id);
    await fetchProductCategories(product.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      await supabase.from('products').delete().eq('id', id);
      fetchProducts();
    }
  };

  const getProductCategories = async (productId: string) => {
    const { data } = await supabase
      .from('product_categories')
      .select('category_id')
      .eq('product_id', productId);

    return data?.map(pc => pc.category_id) || [];
  };

  const [productCategoriesMap, setProductCategoriesMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadProductCategories = async () => {
      const map: Record<string, string[]> = {};
      for (const product of products) {
        const categoryIds = await getProductCategories(product.id);
        map[product.id] = categoryIds;
      }
      setProductCategoriesMap(map);
    };

    if (products.length > 0) {
      loadProductCategories();
    }
  }, [products]);

  const getCategoryNames = (productId: string) => {
    const categoryIds = productCategoriesMap[productId] || [];
    if (categoryIds.length === 0) return 'Not Assigned';
    return categoryIds
      .map(id => categories.find((c) => c.id === id)?.name || 'Unknown')
      .join(', ');
  };

  const isVisibleToCustomers = (productId: string, isAvailable: boolean) => {
    if (!isAvailable) return false;
    const categoryIds = productCategoriesMap[productId] || [];
    if (categoryIds.length === 0) return false;
    return categoryIds.some(catId => {
      const category = categories.find((c) => c.id === catId);
      return category?.is_active || false;
    });
  };

  const fetchPacks = async () => {
    setPacksLoading(true);
    const { data, error } = await supabase
      .from('product_packs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPacks(data);
    }
    setPacksLoading(false);
  };

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('product_pack_history')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(20);

    if (data) {
      setHistory(data);
    }
  };

  const handleExport = async () => {
    if (!exportForm.name.trim()) {
      showNotification('error', 'Please enter a pack name');
      return;
    }

    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-product-pack`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(exportForm),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Export failed');
      }

      const blob = new Blob([JSON.stringify(result.downloadData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportForm.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('success', 'Product pack exported successfully');
      setShowExportModal(false);
      setExportForm({
        name: '',
        description: '',
        includeCategories: true,
        includeAddons: true,
        includeUpsells: true,
        includeGifts: true,
      });
      fetchPacks();
      fetchHistory();
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importForm.selectedPackId && !importForm.uploadedFile) {
      showNotification('error', 'Please select a pack or upload a file');
      return;
    }

    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      let packData = null;

      if (importForm.uploadedFile) {
        const fileContent = await importForm.uploadedFile.text();
        packData = JSON.parse(fileContent);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-product-pack`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packId: importForm.uploadedFile ? null : importForm.selectedPackId,
            packData: packData,
            conflictStrategy: importForm.conflictStrategy,
            clearExisting: importForm.clearExisting,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      showNotification('success', result.message || 'Products imported successfully');
      setShowImportModal(false);
      setImportForm({
        selectedPackId: '',
        conflictStrategy: 'skip',
        clearExisting: false,
        uploadedFile: null,
      });
      fetchHistory();
      fetchProducts();
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDeletePack = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product pack?')) return;

    const { error } = await supabase
      .from('product_packs')
      .delete()
      .eq('id', id);

    if (!error) {
      showNotification('success', 'Product pack deleted successfully');
      fetchPacks();
    } else {
      showNotification('error', 'Failed to delete product pack');
    }
  };

  const handleDownloadPack = async (pack: ProductPack) => {
    const { data } = await supabase
      .from('product_packs')
      .select('pack_data')
      .eq('id', pack.id)
      .single();

    if (data) {
      const blob = new Blob([JSON.stringify(data.pack_data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pack.name.replace(/\s+/g, '_')}_${pack.version}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  return (
    <div className="p-8">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
            notification.type === 'success'
              ? 'bg-green-500 text-white'
              : notification.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-blue-500 text-white'
          }`}
        >
          {notification.type === 'success' && <CheckCircle size={20} />}
          {notification.type === 'error' && <AlertCircle size={20} />}
          <span>{notification.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Products</h1>
          <p className="text-gray-600">Manage menu products and product packs</p>
        </div>
        {activeTab === 'products' && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Product
          </button>
        )}
        {activeTab === 'packs' && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Upload size={20} />
              Import
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Download size={20} />
              Export New Pack
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 ${
              activeTab === 'products'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('packs')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'packs'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Package size={18} />
            Product Packs
          </button>
        </div>
      </div>

      {activeTab === 'products' && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Image</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Cost</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Margin</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Visibility</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="px-6 py-4">
                  {product.image_url && (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-semibold text-gray-800">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.description}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {(productCategoriesMap[product.id] || []).length === 0 ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                        Not Assigned
                      </span>
                    ) : (
                      (productCategoriesMap[product.id] || []).map(catId => {
                        const category = categories.find(c => c.id === catId);
                        return (
                          <span
                            key={catId}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"
                          >
                            {category?.name || 'Unknown'}
                          </span>
                        );
                      })
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-700 font-semibold">
                  ${product.price.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  ${(product.cost ?? 0).toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  {product.price > 0 ? (
                    <span className={`text-sm font-semibold ${
                      ((product.price - (product.cost ?? 0)) / product.price) * 100 >= 50
                        ? 'text-green-600'
                        : ((product.price - (product.cost ?? 0)) / product.price) * 100 >= 25
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }`}>
                      {(((product.price - (product.cost ?? 0)) / product.price) * 100).toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        isVisibleToCustomers(product.id, product.is_available)
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {isVisibleToCustomers(product.id, product.is_available) ? 'Visible to Customers' : 'Hidden from Customers'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(product)}
                      className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="p-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
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

      {activeTab === 'packs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Package size={24} className="text-red-600" />
              Saved Product Packs
            </h2>
            {packsLoading ? (
              <p className="text-gray-500">Loading...</p>
            ) : packs.length === 0 ? (
              <p className="text-gray-500">No product packs created yet</p>
            ) : (
              <div className="space-y-3">
                {packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-red-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{pack.name}</h3>
                        <p className="text-sm text-gray-600">{pack.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {pack.total_products} products
                          </span>
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                            {pack.total_categories} categories
                          </span>
                          <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                            {pack.total_addons} addons
                          </span>
                          <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            v{pack.version}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(pack.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleDownloadPack(pack)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Download"
                        >
                          <FileDown size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setImportForm({ ...importForm, selectedPackId: pack.id });
                            setShowImportModal(true);
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded"
                          title="Import"
                        >
                          <Upload size={18} />
                        </button>
                        <button
                          onClick={() => handleDeletePack(pack.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Clock size={24} className="text-red-600" />
              Recent History
            </h2>
            {history.length === 0 ? (
              <p className="text-gray-500">No operations yet</p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="border-l-4 border-gray-200 pl-4 py-2"
                    style={{
                      borderLeftColor:
                        item.operation_status === 'success'
                          ? '#10b981'
                          : item.operation_status === 'failed'
                          ? '#ef4444'
                          : '#f59e0b',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {item.operation_type === 'export' ? (
                        <Download size={16} />
                      ) : (
                        <Upload size={16} />
                      )}
                      <span className="font-medium capitalize">
                        {item.operation_type}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          item.operation_status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : item.operation_status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {item.operation_status}
                      </span>
                    </div>
                    {item.details && (
                      <p className="text-xs text-gray-600 mt-1">
                        {item.details.products_imported || item.details.total_products || 0} products,{' '}
                        {item.details.categories_imported || item.details.total_categories || 0} categories
                      </p>
                    )}
                    {item.error_log && (
                      <p className="text-xs text-red-600 mt-1">{item.error_log}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(item.performed_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingProduct(null);
                    setSelectedCategories([]);
                    setSelectedAddons([]);
                    setFormData({
                      name: '',
                      description: '',
                      price: 0,
                      cost: 0,
                      image_url: '',
                      recipe: '',
                      display_order: 0,
                      is_available: true,
                    });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Categories
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                    {categories.length === 0 ? (
                      <p className="text-sm text-gray-500">No categories available</p>
                    ) : (
                      categories.map((category) => (
                        <label key={category.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(category.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCategories([...selectedCategories, category.id]);
                              } else {
                                setSelectedCategories(selectedCategories.filter(id => id !== category.id));
                              }
                            }}
                            className="w-4 h-4 text-red-600 rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {category.name}
                            {!category.is_active && (
                              <span className="ml-2 text-xs text-gray-500">(Inactive)</span>
                            )}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Select one or more categories. Products are visible to customers when assigned to at least one active category.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Available Add-ons
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                    {addons.length === 0 ? (
                      <p className="text-sm text-gray-500">No add-ons available</p>
                    ) : (
                      addons.map((addon) => (
                        <label key={addon.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAddons.includes(addon.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAddons([...selectedAddons, addon.id]);
                              } else {
                                setSelectedAddons(selectedAddons.filter(id => id !== addon.id));
                              }
                            }}
                            className="w-4 h-4 text-red-600 rounded"
                          />
                          <span className="text-sm text-gray-700">
                            {addon.name} (+${addon.price.toFixed(2)})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Select which add-ons customers can choose when ordering this product
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Recipe / Cooking Instructions
                  </label>
                  <textarea
                    value={formData.recipe}
                    onChange={(e) => setFormData({ ...formData, recipe: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={4}
                    placeholder="Enter cooking instructions for kitchen staff..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    These instructions will be visible to kitchen staff on the Kitchen Display
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Selling Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) =>
                        setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Cost Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.cost}
                      onChange={(e) =>
                        setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                {formData.price > 0 && (
                  <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Gross Margin</span>
                    <span className={`font-bold ${
                      ((formData.price - formData.cost) / formData.price) * 100 >= 50
                        ? 'text-green-600'
                        : ((formData.price - formData.cost) / formData.price) * 100 >= 25
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }`}>
                      {(((formData.price - formData.cost) / formData.price) * 100).toFixed(1)}%
                      &nbsp;(+${(formData.price - formData.cost).toFixed(2)})
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Image URL
                  </label>
                  <input
                    type="url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) =>
                      setFormData({ ...formData, display_order: parseInt(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_available"
                    checked={formData.is_available}
                    onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
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
                  {editingProduct ? 'Update' : 'Create'} Product
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-4">Export Product Pack</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pack Name *</label>
                <input
                  type="text"
                  value={exportForm.name}
                  onChange={(e) => setExportForm({ ...exportForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="My Product Pack"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={exportForm.description}
                  onChange={(e) =>
                    setExportForm({ ...exportForm, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  placeholder="Describe this product pack..."
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Include:</label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportForm.includeCategories}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, includeCategories: e.target.checked })
                    }
                  />
                  <span>Categories</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportForm.includeAddons}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, includeAddons: e.target.checked })
                    }
                  />
                  <span>Addons</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportForm.includeUpsells}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, includeUpsells: e.target.checked })
                    }
                  />
                  <span>Upsell Suggestions</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportForm.includeGifts}
                    onChange={(e) =>
                      setExportForm({ ...exportForm, includeGifts: e.target.checked })
                    }
                  />
                  <span>Promotional Gifts</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {exporting ? <RefreshCw size={20} className="animate-spin" /> : <Download size={20} />}
                {exporting ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                disabled={exporting}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-4">Import Product Pack</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Pack</label>
                <select
                  value={importForm.selectedPackId}
                  onChange={(e) =>
                    setImportForm({
                      ...importForm,
                      selectedPackId: e.target.value,
                      uploadedFile: null,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  disabled={!!importForm.uploadedFile}
                >
                  <option value="">-- Select a saved pack --</option>
                  {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} (v{pack.version})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-center text-gray-500">OR</div>

              <div>
                <label className="block text-sm font-medium mb-1">Upload File</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setImportForm({
                      ...importForm,
                      uploadedFile: file,
                      selectedPackId: '',
                    });
                  }}
                  disabled={!!importForm.selectedPackId}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Conflict Strategy</label>
                <select
                  value={importForm.conflictStrategy}
                  onChange={(e) =>
                    setImportForm({
                      ...importForm,
                      conflictStrategy: e.target.value as 'skip' | 'overwrite' | 'rename',
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="skip">Skip existing items</option>
                  <option value="overwrite">Overwrite existing items</option>
                  <option value="rename">Rename imported items</option>
                </select>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={importForm.clearExisting}
                  onChange={(e) =>
                    setImportForm({ ...importForm, clearExisting: e.target.checked })
                  }
                />
                <span className="text-sm">
                  Clear all existing products before import{' '}
                  <span className="text-red-600 font-semibold">(Destructive)</span>
                </span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? <RefreshCw size={20} className="animate-spin" /> : <Upload size={20} />}
                {importing ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => setShowImportModal(false)}
                disabled={importing}
                className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
