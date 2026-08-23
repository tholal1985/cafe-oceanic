import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Download, Upload, Trash2, Eye, Plus, AlertCircle, CheckCircle, Clock, FileDown, RefreshCw } from 'lucide-react';

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
  author: string | null;
  tags: string[] | null;
  file_size: number | null;
  download_count: number | null;
  is_downloadable: boolean | null;
  thumbnail_url: string | null;
}

interface PackHistory {
  id: string;
  operation_type: 'export' | 'import';
  operation_status: 'success' | 'failed' | 'partial';
  performed_at: string;
  details: any;
  error_log: string | null;
}

export default function ProductPacks() {
  const [packs, setPacks] = useState<ProductPack[]>([]);
  const [history, setHistory] = useState<PackHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPack, setSelectedPack] = useState<ProductPack | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [exportForm, setExportForm] = useState({
    name: '',
    description: '',
    author: '',
    tags: '',
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
    fetchPacks();
    fetchHistory();
  }, []);

  const fetchPacks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('product_packs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPacks(data);
    }
    setLoading(false);
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

      console.log('Exporting with form data:', exportForm);

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

      console.log('Export response status:', response.status);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = 'Export failed';

        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            const raw = errorData.error ?? errorData.details ?? errorData.message;
            if (typeof raw === 'string') {
              errorMessage = raw;
            } else if (raw && typeof raw === 'object') {
              errorMessage = (raw as { message?: string }).message ||
                             (raw as { hint?: string }).hint ||
                             JSON.stringify(raw);
            } else {
              errorMessage = `Export failed with status ${response.status}`;
            }
          } else {
            const text = await response.text();
            errorMessage = text || `Export failed with status ${response.status}`;
          }
        } catch (e) {
          errorMessage = `Export failed with status ${response.status}`;
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportForm.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showNotification('success', 'Product pack exported successfully with images');
      setShowExportModal(false);
      setExportForm({
        name: '',
        description: '',
        author: '',
        tags: '',
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
      let zipFile = null;

      if (importForm.uploadedFile) {
        const fileName = importForm.uploadedFile.name.toLowerCase();

        if (fileName.endsWith('.zip')) {
          const arrayBuffer = await importForm.uploadedFile.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
          zipFile = btoa(binaryString);
        } else if (fileName.endsWith('.json')) {
          const fileContent = await importForm.uploadedFile.text();
          packData = JSON.parse(fileContent);
        } else {
          throw new Error('Invalid file format. Please upload a ZIP or JSON file.');
        }
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
            zipFile: zipFile,
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
    } catch (error) {
      showNotification('error', error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
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
    <div className="p-6">
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
        <div className="flex items-center gap-3">
          <Package className="text-red-600" size={32} />
          <h1 className="text-3xl font-bold text-gray-800">Product Packs</h1>
        </div>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Package size={24} className="text-red-600" />
            Saved Product Packs
          </h2>
          {loading ? (
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
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{pack.name}</h3>
                        <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">
                          v{pack.version}
                        </span>
                      </div>
                      {pack.author && (
                        <p className="text-xs text-gray-500 mb-1">
                          by {pack.author}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mb-2">{pack.description}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                          {pack.total_products} products
                        </span>
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
                          {pack.total_categories} categories
                        </span>
                        <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">
                          {pack.total_addons} addons
                        </span>
                        {pack.file_size && (
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                            {(pack.file_size / 1024).toFixed(1)} KB
                          </span>
                        )}
                        {pack.download_count !== null && pack.download_count > 0 && (
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-medium">
                            {pack.download_count} downloads
                          </span>
                        )}
                      </div>
                      {pack.tags && pack.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {pack.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-gray-50 text-gray-600 px-2 py-0.5 rounded border border-gray-200"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Created {new Date(pack.created_at).toLocaleString()}
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
                        onClick={() => handleDelete(pack.id)}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Author</label>
                  <input
                    type="text"
                    value={exportForm.author}
                    onChange={(e) => setExportForm({ ...exportForm, author: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Your Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tags</label>
                  <input
                    type="text"
                    value={exportForm.tags}
                    onChange={(e) => setExportForm({ ...exportForm, tags: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="restaurant, menu, premium"
                  />
                  <p className="text-xs text-gray-500 mt-1">Comma-separated</p>
                </div>
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
                  accept=".json,.zip"
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
                <p className="text-xs text-gray-500 mt-1">
                  Accepts ZIP files (with images) or JSON files
                </p>
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
