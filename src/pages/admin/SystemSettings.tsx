import { useEffect, useState } from 'react';
import { Save, DollarSign, TrendingUp, Settings as SettingsIcon, Users, Shield, UserPlus, Trash2, Eye, EyeOff, Plus, CreditCard as Edit2, X, CreditCard, Power, PowerOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getSystemCurrency, updateSystemCurrency, SUPPORTED_CURRENCIES, CurrencyConfig, formatCurrency } from '../../lib/currencyService';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type PaymentGateway = Database['public']['Tables']['payment_gateways']['Row'];

interface User {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  last_login_at?: string;
  roles: {
    id: string;
    name: string;
    display_name: string;
  }[];
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_active: boolean;
}

const GATEWAY_TYPES = [
  { value: 'bml', label: 'BML QPOS (QR Payment)' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'skrill', label: 'Skrill' },
];

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'payments'>('general');

  // Currency state
  const [currency, setCurrency] = useState<CurrencyConfig | null>(null);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState('MVR');
  const [currencyLoading, setCurrencyLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tax rate state
  const [taxRate, setTaxRate] = useState<number>(0);
  const [savingTax, setSavingTax] = useState(false);
  const [taxMessage, setTaxMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User Management state
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', roleIds: [] as string[] });

  // Payment Gateway state
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGateway | null>(null);
  const [gatewayFormData, setGatewayFormData] = useState({
    name: '',
    gateway_type: 'bml',
    is_active: false,
    is_default: false,
    display_order: 0,
  });
  const [configFields, setConfigFields] = useState<Record<string, string>>({
    environment: 'production',
    currency: 'MVR',
    merchant_id: '',
    access_key: '',
  });
  const [gatewayFields, setGatewayFields] = useState({
    client_id: '',
    client_secret: '',
    sandbox_client_id: '',
    sandbox_client_secret: '',
    use_sandbox: false,
    merchant_email: '',
    api_password: '',
    webhook_secret: '',
  });

  useEffect(() => {
    loadCurrencySettings();
    loadTaxRate();
    loadUsers();
    loadRoles();
    fetchGateways();
  }, []);

  // Tax rate functions
  const loadTaxRate = async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'tax_rate')
      .maybeSingle();
    if (data?.setting_value !== undefined && data?.setting_value !== null) {
      setTaxRate(Number(data.setting_value));
    }
  };

  const handleSaveTaxRate = async () => {
    setSavingTax(true);
    setTaxMessage(null);
    const { error } = await supabase
      .from('system_settings')
      .upsert({ setting_key: 'tax_rate', setting_value: taxRate as any, setting_type: 'number', description: 'Sales tax rate percentage' }, { onConflict: 'setting_key' });
    if (error) {
      setTaxMessage({ type: 'error', text: 'Failed to save tax rate' });
    } else {
      setTaxMessage({ type: 'success', text: `Tax rate saved as ${taxRate}%` });
    }
    setSavingTax(false);
  };

  // Currency functions
  const loadCurrencySettings = async () => {
    try {
      setCurrencyLoading(true);
      const currencyConfig = await getSystemCurrency();
      setCurrency(currencyConfig);
      setSelectedCurrencyCode(currencyConfig.code);
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setCurrencyLoading(false);
    }
  };

  const handleSaveCurrency = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const success = await updateSystemCurrency(selectedCurrencyCode);

      if (success) {
        const newCurrency = SUPPORTED_CURRENCIES[selectedCurrencyCode];
        setCurrency(newCurrency);
        setMessage({ type: 'success', text: 'Currency settings saved successfully! All sections will now display prices in ' + newCurrency.name });

        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setMessage({ type: 'error', text: 'Failed to save currency settings' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'An error occurred while saving settings' });
    } finally {
      setSaving(false);
    }
  };

  // User Management functions
  const loadUsers = async () => {
    try {
      const { data: adminUsers, error: usersError } = await supabase
        .from('admin_users')
        .select('id, email, created_at, is_active, last_login_at')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      const usersWithRoles = await Promise.all(
        (adminUsers || []).map(async (user) => {
          const { data: roleData } = await supabase.rpc('get_user_roles', {
            user_uuid: user.id
          });

          return {
            ...user,
            roles: roleData || []
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('is_active', true)
        .order('display_name');

      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            is_admin: true
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      if (newUser.roleIds.length > 0) {
        const roleAssignments = newUser.roleIds.map(roleId => ({
          user_id: authData.user.id,
          role_id: roleId
        }));

        await supabase.from('user_role_assignments').insert(roleAssignments);
      }

      setMessage({ type: 'success', text: 'User created successfully' });
      setShowCreateUserModal(false);
      setNewUser({ email: '', password: '', roleIds: [] });
      loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to create user' });
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      loadUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      setMessage({ type: 'success', text: 'User deleted successfully' });
      loadUsers();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to delete user' });
    }
  };

  // Payment Gateway functions
  const fetchGateways = async () => {
    const { data } = await supabase
      .from('payment_gateways')
      .select('*')
      .order('display_order', { ascending: true });

    if (data) setGateways(data);
  };

  const handleGatewaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanConfig = Object.fromEntries(
      Object.entries(configFields).filter(([_, value]) => value !== '')
    );

    const cleanGatewayFields = Object.fromEntries(
      Object.entries(gatewayFields).filter(([_, value]) => value !== '')
    );

    if (editingGateway) {
      await supabase
        .from('payment_gateways')
        .update({
          ...gatewayFormData,
          ...cleanGatewayFields,
          config: cleanConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingGateway.id);
    } else {
      await supabase.from('payment_gateways').insert({
        ...gatewayFormData,
        ...cleanGatewayFields,
        config: cleanConfig,
      });
    }

    resetGatewayForm();
    fetchGateways();
  };

  const handleEditGateway = (gateway: PaymentGateway) => {
    setEditingGateway(gateway);
    setGatewayFormData({
      name: gateway.name,
      gateway_type: gateway.gateway_type,
      is_active: gateway.is_active,
      is_default: gateway.is_default,
      display_order: gateway.display_order,
    });

    const config = gateway.config as Record<string, string>;
    setConfigFields({
      environment: config?.environment || 'production',
      currency: config?.currency || 'MVR',
      merchant_id: config?.merchant_id || '',
      access_key: config?.access_key || '',
    });

    setGatewayFields({
      client_id: gateway.client_id || '',
      client_secret: gateway.client_secret || '',
      sandbox_client_id: gateway.sandbox_client_id || '',
      sandbox_client_secret: gateway.sandbox_client_secret || '',
      use_sandbox: gateway.use_sandbox || false,
      merchant_email: gateway.merchant_email || '',
      api_password: gateway.api_password || '',
      webhook_secret: gateway.webhook_secret || '',
    });

    setShowGatewayModal(true);
  };

  const handleDeleteGateway = async (id: string) => {
    if (confirm('Are you sure you want to delete this payment gateway?')) {
      await supabase.from('payment_gateways').delete().eq('id', id);
      fetchGateways();
    }
  };

  const handleToggleGateway = async (id: string, currentStatus: boolean) => {
    await supabase
      .from('payment_gateways')
      .update({ is_active: !currentStatus })
      .eq('id', id);
    fetchGateways();
  };

  const resetGatewayForm = () => {
    setShowGatewayModal(false);
    setEditingGateway(null);
    setGatewayFormData({
      name: '',
      gateway_type: 'bml',
      is_active: false,
      is_default: false,
      display_order: 0,
    });
    setConfigFields({
      environment: 'production',
      currency: 'MVR',
      merchant_id: '',
      access_key: '',
    });
    setGatewayFields({
      client_id: '',
      client_secret: '',
      sandbox_client_id: '',
      sandbox_client_secret: '',
      use_sandbox: false,
      merchant_email: '',
      api_password: '',
      webhook_secret: '',
    });
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">System Settings</h1>
          <p className="text-gray-600">Configure system preferences and settings</p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'general'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <DollarSign size={18} />
            Currency
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'users'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Users size={18} />
            User Management
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-3 font-semibold transition-colors border-b-2 flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <CreditCard size={18} />
            Payment Gateways
          </button>
        </div>
      </div>

      {activeTab === 'general' && (
        <div className="space-y-6">
          {currencyLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <DollarSign className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Currency Settings</h2>
                      <p className="text-sm text-gray-600">Select the default currency for your restaurant</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Currency
                    </label>
                    <select
                      value={selectedCurrencyCode}
                      onChange={(e) => setSelectedCurrencyCode(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    >
                      {Object.entries(SUPPORTED_CURRENCIES).map(([code, config]) => (
                        <option key={code} value={code}>
                          {config.symbol} - {config.name} ({config.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedCurrencyCode && SUPPORTED_CURRENCIES[selectedCurrencyCode] && (
                    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                      <h3 className="font-semibold text-gray-900">Currency Preview</h3>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Symbol</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {SUPPORTED_CURRENCIES[selectedCurrencyCode].symbol}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">Code</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {SUPPORTED_CURRENCIES[selectedCurrencyCode].code}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">Decimal Places</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {SUPPORTED_CURRENCIES[selectedCurrencyCode].decimal_places}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-600">Symbol Position</p>
                          <p className="text-lg font-semibold text-gray-900 capitalize">
                            {SUPPORTED_CURRENCIES[selectedCurrencyCode].symbol_position}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600 mb-2">Formatting Examples</p>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Small amount:</span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(25.50, SUPPORTED_CURRENCIES[selectedCurrencyCode])}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Medium amount:</span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(1234.56, SUPPORTED_CURRENCIES[selectedCurrencyCode])}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Large amount:</span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(98765.43, SUPPORTED_CURRENCIES[selectedCurrencyCode])}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <SettingsIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900">Currency Change Impact</p>
                      <p className="text-sm text-blue-700 mt-1">
                        Changing the currency will affect all sections of the system including:
                      </p>
                      <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                        <li>Product prices display</li>
                        <li>Order totals and receipts</li>
                        <li>Payment screens</li>
                        <li>Reports and analytics</li>
                        <li>Point of Sale (POS) system</li>
                      </ul>
                      <p className="text-sm text-blue-700 mt-2 font-medium">
                        Note: This only changes how prices are displayed. Product prices in the database remain unchanged.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={loadCurrencySettings}
                      className="px-6 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      disabled={saving}
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSaveCurrency}
                      disabled={saving || selectedCurrencyCode === currency?.code}
                      className="px-6 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save className="w-5 h-5" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Tax Settings</h2>
                    <p className="text-sm text-gray-600">Configure sales tax for profit calculations</p>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {taxMessage && (
                    <div className={`p-3 rounded-lg text-sm ${taxMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                      {taxMessage.text}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sales Tax Rate (%)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={taxRate}
                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        className="w-40 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                        placeholder="0"
                      />
                      <span className="text-gray-500 text-sm">% of order total</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      This rate is used in the dashboard to calculate tax collected and net profit. Set to 0 for no tax.
                    </p>
                  </div>
                  {taxRate > 0 && (
                    <div className="bg-emerald-50 rounded-lg p-4 text-sm text-emerald-800 border border-emerald-200">
                      <p>On a <strong>{taxRate}%</strong> tax rate, a {formatCurrency(100, SUPPORTED_CURRENCIES[selectedCurrencyCode])} order would generate {formatCurrency(taxRate, SUPPORTED_CURRENCIES[selectedCurrencyCode])} in tax.</p>
                    </div>
                  )}
                  <div className="flex justify-end pt-2 border-t border-gray-200">
                    <button
                      onClick={handleSaveTaxRate}
                      disabled={savingTax}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      {savingTax ? 'Saving...' : 'Save Tax Rate'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-sm border border-orange-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white rounded-lg shadow-sm">
                    <TrendingUp className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-2">Multi-Currency Support</h3>
                    <p className="text-sm text-gray-700 mb-3">
                      The system supports multiple international currencies following ISO 4217 standards.
                      All currency formatting follows regional conventions for number formatting, decimal separators, and symbol placement.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.values(SUPPORTED_CURRENCIES).slice(0, 8).map((curr) => (
                        <div key={curr.code} className="bg-white rounded-lg p-3 shadow-sm">
                          <div className="text-lg font-bold text-gray-900">{curr.symbol}</div>
                          <div className="text-xs text-gray-600">{curr.code}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Users className="text-red-600" size={32} />
              <div>
                <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
                <p className="text-gray-600">Manage system users and their roles</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateUserModal(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              <UserPlus size={20} />
              Create User
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Roles</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Created</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Shield className="text-blue-500" size={16} />
                        <span className="font-medium text-gray-800">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span
                              key={role.id}
                              className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded"
                            >
                              {role.display_name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm">No roles</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          user.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleUserStatus(user.id, user.is_active)}
                          className={`p-2 rounded hover:bg-gray-100 ${
                            user.is_active ? 'text-orange-600' : 'text-green-600'
                          }`}
                          title={user.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {user.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
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
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <CreditCard className="text-red-600" size={32} />
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Payment Gateways</h2>
                <p className="text-gray-600">Configure payment processing methods</p>
              </div>
            </div>
            <button
              onClick={() => setShowGatewayModal(true)}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus size={20} />
              Add Gateway
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Default</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gateways.map((gateway) => (
                  <tr key={gateway.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <CreditCard size={20} className="text-blue-500" />
                        <span className="font-semibold text-gray-800">{gateway.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 uppercase">
                        {gateway.gateway_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          gateway.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {gateway.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {gateway.is_default && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleGateway(gateway.id, gateway.is_active)}
                          className={`p-2 rounded transition-colors ${
                            gateway.is_active
                              ? 'text-orange-600 hover:bg-orange-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={gateway.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {gateway.is_active ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <button
                          onClick={() => handleEditGateway(gateway)}
                          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteGateway(gateway.id)}
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
        </div>
      )}

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreateUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Create New User</h2>
                <button
                  onClick={() => {
                    setShowCreateUserModal(false);
                    setNewUser({ email: '', password: '', roleIds: [] });
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                    minLength={6}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Assign Roles
                  </label>
                  <div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                    {roles.map((role) => (
                      <label key={role.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newUser.roleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUser({ ...newUser, roleIds: [...newUser.roleIds, role.id] });
                            } else {
                              setNewUser({
                                ...newUser,
                                roleIds: newUser.roleIds.filter((id) => id !== role.id),
                              });
                            }
                          }}
                          className="w-4 h-4 text-red-600 rounded"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-700">{role.display_name}</p>
                          <p className="text-xs text-gray-500">{role.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  Create User
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Gateway Modal */}
      <AnimatePresence>
        {showGatewayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingGateway ? 'Edit Gateway' : 'Add Gateway'}
                </h2>
                <button
                  onClick={resetGatewayForm}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleGatewaySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={gatewayFormData.name}
                    onChange={(e) => setGatewayFormData({ ...gatewayFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Gateway Type</label>
                  <select
                    value={gatewayFormData.gateway_type}
                    onChange={(e) => setGatewayFormData({ ...gatewayFormData, gateway_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    {GATEWAY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={gatewayFormData.is_active}
                      onChange={(e) => setGatewayFormData({ ...gatewayFormData, is_active: e.target.checked })}
                      className="w-5 h-5 text-red-600"
                    />
                    <label htmlFor="is_active" className="text-sm font-semibold text-gray-700">
                      Active
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_default"
                      checked={gatewayFormData.is_default}
                      onChange={(e) => setGatewayFormData({ ...gatewayFormData, is_default: e.target.checked })}
                      className="w-5 h-5 text-red-600"
                    />
                    <label htmlFor="is_default" className="text-sm font-semibold text-gray-700">
                      Set as Default
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={gatewayFormData.display_order}
                    onChange={(e) => setGatewayFormData({ ...gatewayFormData, display_order: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                {gatewayFormData.gateway_type === 'bml' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Merchant ID</label>
                      <input
                        type="text"
                        value={configFields.merchant_id}
                        onChange={(e) => setConfigFields({ ...configFields, merchant_id: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Access Key</label>
                      <input
                        type="text"
                        value={configFields.access_key}
                        onChange={(e) => setConfigFields({ ...configFields, access_key: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}

                {gatewayFormData.gateway_type === 'paypal' && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="use_sandbox"
                        checked={gatewayFields.use_sandbox}
                        onChange={(e) => setGatewayFields({ ...gatewayFields, use_sandbox: e.target.checked })}
                        className="w-5 h-5 text-red-600"
                      />
                      <label htmlFor="use_sandbox" className="text-sm font-semibold text-gray-700">
                        Use Sandbox Mode
                      </label>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        {gatewayFields.use_sandbox ? 'Sandbox Client ID' : 'Client ID'}
                      </label>
                      <input
                        type="text"
                        value={gatewayFields.use_sandbox ? gatewayFields.sandbox_client_id : gatewayFields.client_id}
                        onChange={(e) =>
                          setGatewayFields({
                            ...gatewayFields,
                            [gatewayFields.use_sandbox ? 'sandbox_client_id' : 'client_id']: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        {gatewayFields.use_sandbox ? 'Sandbox Client Secret' : 'Client Secret'}
                      </label>
                      <input
                        type="password"
                        value={gatewayFields.use_sandbox ? gatewayFields.sandbox_client_secret : gatewayFields.client_secret}
                        onChange={(e) =>
                          setGatewayFields({
                            ...gatewayFields,
                            [gatewayFields.use_sandbox ? 'sandbox_client_secret' : 'client_secret']: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}

                {gatewayFormData.gateway_type === 'skrill' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Merchant Email</label>
                      <input
                        type="email"
                        value={gatewayFields.merchant_email}
                        onChange={(e) => setGatewayFields({ ...gatewayFields, merchant_email: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">API Password</label>
                      <input
                        type="password"
                        value={gatewayFields.api_password}
                        onChange={(e) => setGatewayFields({ ...gatewayFields, api_password: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  {editingGateway ? 'Update' : 'Create'} Gateway
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
