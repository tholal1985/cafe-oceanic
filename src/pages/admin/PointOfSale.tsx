import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Award, Banknote, Building2, Clock, CreditCard as Edit, DollarSign, Eye, Grid2x2 as Grid,
  List, Mail, Minus, Phone, Plus, Receipt, Search, ShoppingCart, Trash, Trash2, User,
  UserPlus, X, Power, Sparkles, CircleUser as UserCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

type Product = {
  id: string;
  name: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
};

type Category = { id: string; name: string; display_order: number };

type CartItem = { product: Product; quantity: number };

type POSSession = {
  id: string;
  session_number: string;
  opening_cash: number;
  total_sales: number;
  total_transactions: number;
  status: string;
};

type Customer = {
  id: string;
  customer_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  loyalty_points: number;
  total_visits: number;
  total_spent: number;
  loyalty_tier?: {
    tier_name: string;
    color_code: string;
    discount_percentage: number;
  };
};

type POSTransaction = {
  id: string;
  transaction_number: string;
  order_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  payment_method: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_tendered: number;
  change_given: number;
  transaction_type: string;
  status: string;
  created_at: string;
  order?: { order_number: string };
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'bank_transfer', label: 'Transfer', icon: Building2 },
  { value: 'credit', label: 'Staff credit', icon: UserCircle },
] as const;

export default function PointOfSale() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [session, setSession] = useState<POSSession | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [openingCash, setOpeningCash] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'credit'>('cash');
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ first_name: '', last_name: '', phone: '', email: '' });

  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [showTransactionsList, setShowTransactionsList] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<POSTransaction | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ customer_name: '', customer_phone: '', payment_method: 'cash', notes: '' });

  useEffect(() => {
    checkSession();
    fetchCategories();
    fetchProducts();
  }, []);

  useEffect(() => { if (session) fetchTransactions(); }, [session]);

  const checkSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/admin/login'); return; }

      const { data, error } = await supabase
        .from('pos_sessions').select('*')
        .eq('staff_id', user.id).eq('status', 'open')
        .order('opened_at', { ascending: false }).limit(1).maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) setSession(data);
      else setShowSessionModal(true);
    } catch (error) { console.error('Error checking session:', error); }
  };

  const searchCustomers = async (query: string) => {
    if (!query || query.length < 2) { setCustomerSearchResults([]); return; }
    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`*, loyalty_tier:customer_loyalty_tiers(tier_name, color_code, discount_percentage)`)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%,customer_number.ilike.%${query}%`)
        .eq('is_active', true).limit(10);
      if (error) throw error;
      setCustomerSearchResults(data || []);
    } catch (error) { console.error('Error searching customers:', error); }
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerName(`${customer.first_name} ${customer.last_name}`);
    setCustomerPhone(customer.phone);
    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerName('');
    setCustomerPhone('');
  };

  const fetchTransactions = async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('pos_transactions')
        .select(`*, order:orders(order_number)`)
        .eq('session_id', session.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) { console.error('Error fetching transactions:', error); }
  };

  const viewTransaction = (transaction: POSTransaction) => { setSelectedTransaction(transaction); setShowViewModal(true); };

  const editTransaction = (transaction: POSTransaction) => {
    setSelectedTransaction(transaction);
    setEditForm({
      customer_name: transaction.customer_name || '',
      customer_phone: transaction.customer_phone || '',
      payment_method: transaction.payment_method,
      notes: '',
    });
    setShowEditModal(true);
  };

  const saveTransactionEdit = async () => {
    if (!selectedTransaction) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('pos_transactions').update({
        customer_name: editForm.customer_name || null,
        customer_phone: editForm.customer_phone || null,
        payment_method: editForm.payment_method,
        updated_at: new Date().toISOString(),
      }).eq('id', selectedTransaction.id);
      if (error) throw error;
      setShowEditModal(false);
      setSelectedTransaction(null);
      fetchTransactions();
      checkSession();
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert(error instanceof Error ? error.message : 'Failed to update transaction');
    } finally { setLoading(false); }
  };

  const deleteTransaction = async (transaction: POSTransaction) => {
    if (!confirm(`Delete transaction ${transaction.transaction_number}? This can't be undone.`)) return;
    setLoading(true);
    try {
      const { error: transactionError } = await supabase.from('pos_transactions').delete().eq('id', transaction.id);
      if (transactionError) throw transactionError;
      const { error: orderError } = await supabase.from('orders')
        .update({ status: 'cancelled', payment_status: 'cancelled' }).eq('id', transaction.order_id);
      if (orderError) throw orderError;
      fetchTransactions();
      checkSession();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete transaction');
    } finally { setLoading(false); }
  };

  const quickAddCustomer = async () => {
    if (!quickAddForm.first_name || !quickAddForm.last_name || !quickAddForm.phone) {
      alert('Please fill in required fields (First Name, Last Name, Phone)');
      return;
    }
    setLoading(true);
    try {
      const { data: customerNumber } = await supabase.rpc('generate_customer_number');
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('customers').insert({
        customer_number: customerNumber,
        first_name: quickAddForm.first_name,
        last_name: quickAddForm.last_name,
        phone: quickAddForm.phone,
        email: quickAddForm.email || null,
        created_by: user?.id,
      }).select(`*, loyalty_tier:customer_loyalty_tiers(tier_name, color_code, discount_percentage)`).single();
      if (error) throw error;
      selectCustomer(data);
      setShowQuickAddCustomer(false);
      setQuickAddForm({ first_name: '', last_name: '', phone: '', email: '' });
    } catch (error) {
      console.error('Error adding customer:', error);
      alert(error instanceof Error ? error.message : 'Failed to add customer');
    } finally { setLoading(false); }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from('categories').select('*').order('display_order');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) { console.error('Error fetching categories:', error); }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase.from('products').select('*').eq('is_available', true).order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (error) { console.error('Error fetching products:', error); }
  };

  const openSession = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('pos_sessions').insert({
        staff_id: user.id,
        opening_cash: parseFloat(openingCash) || 0,
        status: 'open',
      }).select().single();
      if (error) throw error;
      setSession(data);
      setShowSessionModal(false);
    } catch (error) {
      console.error('Error opening session:', error);
      alert(error instanceof Error ? error.message : 'Failed to open session');
    } finally { setLoading(false); }
  };

  const closeSession = async () => {
    if (!session) return;
    if (!confirm('Close this session? Please count your cash drawer first.')) return;
    const closingCash = prompt('Enter the closing cash amount:');
    if (closingCash === null) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('pos_sessions').update({
        status: 'closed', closing_cash: parseFloat(closingCash) || 0,
      }).eq('id', session.id);
      if (error) throw error;
      navigate('/admin/dashboard');
    } catch (error) {
      console.error('Error closing session:', error);
      alert(error instanceof Error ? error.message : 'Failed to close session');
    } finally { setLoading(false); }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((i) => i.product.id === product.id);
    if (existing) setCart(cart.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    else setCart([...cart, { product, quantity: 1 }]);
  };

  const updateQuantity = (productId: string, change: number) => {
    setCart(cart.map((i) => i.product.id === productId ? { ...i, quantity: i.quantity + change } : i).filter((i) => i.quantity > 0));
  };

  const removeFromCart = (productId: string) => setCart(cart.filter((i) => i.product.id !== productId));
  const clearCart = () => { if (confirm('Clear all items from the ticket?')) setCart([]); };
  const getCartTotal = () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const discountPct = selectedCustomer?.loyalty_tier?.discount_percentage || 0;
  const subtotal = getCartTotal();
  const discountAmt = (subtotal * discountPct) / 100;
  const finalTotal = subtotal - discountAmt;
  const changeDue = paymentMethod === 'cash' && amountTendered ? Math.max(0, parseFloat(amountTendered) - finalTotal) : 0;

  const processCheckout = async () => {
    if (!session) { alert('No active POS session'); return; }
    if (cart.length === 0) { alert('Ticket is empty'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const tendered = parseFloat(amountTendered) || 0;
      if (paymentMethod === 'cash' && tendered < finalTotal) {
        alert('Amount tendered is less than total');
        setLoading(false);
        return;
      }

      const { data: order, error: orderError } = await supabase.from('orders').insert({
        order_type: 'pos',
        status: 'completed',
        total_price: finalTotal,
        payment_method: paymentMethod,
        payment_status: 'completed',
        phone_number: customerPhone || null,
      }).select().single();

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

      const orderItems = cart.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        product_price: item.product.price,
        quantity: item.quantity,
        item_total: item.product.price * item.quantity,
        addons: [],
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw new Error(`Failed to create order items: ${itemsError.message}`);

      const { error: transactionError } = await supabase.from('pos_transactions').insert({
        session_id: session.id,
        order_id: order.id,
        staff_id: user.id,
        customer_id: selectedCustomer?.id || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        payment_method: paymentMethod,
        subtotal,
        tax_amount: 0,
        discount_amount: discountAmt,
        total_amount: finalTotal,
        amount_tendered: paymentMethod === 'cash' ? tendered : finalTotal,
        change_given: paymentMethod === 'cash' ? tendered - finalTotal : 0,
        transaction_type: 'sale',
        status: 'completed',
      });
      if (transactionError) throw new Error(`Failed to create transaction: ${transactionError.message}`);

      if (selectedCustomer) {
        const pointsEarned = Math.floor(finalTotal);
        await supabase.from('customer_loyalty_transactions').insert({
          customer_id: selectedCustomer.id,
          transaction_type: 'earned',
          points: pointsEarned,
          balance_after: selectedCustomer.loyalty_points + pointsEarned,
          description: `Purchase - Order ${order.order_number}`,
          order_id: order.id,
          processed_by: user.id,
        });
        await supabase.from('customers').update({
          loyalty_points: selectedCustomer.loyalty_points + pointsEarned,
          lifetime_points: (selectedCustomer.loyalty_points || 0) + pointsEarned,
        }).eq('id', selectedCustomer.id);
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setAmountTendered('');
      setSelectedCustomer(null);
      setShowCheckoutModal(false);
      checkSession();
      fetchTransactions();
    } catch (error) {
      console.error('Error processing checkout:', error);
      alert(error instanceof Error ? error.message : 'Failed to process transaction');
    } finally { setLoading(false); }
  };

  const filteredProducts = useMemo(() => products.filter((p) => {
    const byCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    const bySearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return byCategory && bySearch;
  }), [products, selectedCategory, searchQuery]);

  if (showSessionModal) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ocean-950 p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-ocean-900 via-ocean-950 to-ocean-950" />
        <div className="absolute inset-0 bg-grain opacity-30 mix-blend-overlay" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-ivory-50 shadow-lifted"
        >
          <div className="border-b border-ink-100 px-8 py-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-ocean-700">
              <Power className="h-4 w-4" /> Start shift
            </div>
            <h2 className="mt-2 font-display text-3xl text-ink-900">Open POS session</h2>
            <p className="mt-1 text-sm text-ink-500">Count your float, then we'll unlock the register.</p>
          </div>
          <div className="px-8 py-7">
            <label className="block text-xs uppercase tracking-[0.22em] text-ink-400">Opening cash</label>
            <div className="relative mt-2">
              <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="number" step="0.01" value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-ink-100 bg-white py-3 pl-10 pr-4 font-display text-lg text-ink-900 tabular-nums outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
              />
            </div>
            <button
              onClick={openSession}
              disabled={loading}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3.5 text-sm font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900 disabled:opacity-60"
            >
              {loading ? 'Opening session…' : 'Open session'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory-50">
      <div className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ocean-800 text-ivory-50">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Register</p>
              <h1 className="font-display text-xl text-ink-900">Point of sale</h1>
            </div>
          </div>

          {session && (
            <div className="flex items-center gap-2 text-xs">
              <div className="rounded-full border border-ink-100 bg-ivory-100 px-3 py-1.5">
                <span className="text-ink-400">Session</span>{' '}
                <span className="font-medium text-ink-900 tabular-nums">{session.session_number}</span>
              </div>
              <div className="rounded-full border border-ink-100 bg-ivory-100 px-3 py-1.5">
                <span className="text-ink-400">Sales</span>{' '}
                <span className="font-medium text-ocean-800 tabular-nums">${session.total_sales.toFixed(2)}</span>
              </div>
              <div className="rounded-full border border-ink-100 bg-ivory-100 px-3 py-1.5">
                <span className="text-ink-400">Tx</span>{' '}
                <span className="font-medium text-ink-900 tabular-nums">{session.total_transactions}</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTransactionsList((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2 text-xs font-medium text-ink-700 transition hover:border-ink-200"
            >
              <Receipt className="h-4 w-4" />
              {showTransactionsList ? 'Hide sales' : 'View sales'}
              <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[10px] text-ivory-50 tabular-nums">{transactions.length}</span>
            </button>
            <button
              onClick={closeSession}
              className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
            >
              <Power className="h-4 w-4" />
              Close session
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1920px] px-4 py-5 lg:px-6">
        <AnimatePresence>
          {showTransactionsList && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-soft"
            >
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-ocean-700" />
                  <h2 className="font-display text-xl text-ink-900">Today's transactions</h2>
                </div>
                <span className="text-xs uppercase tracking-[0.22em] text-ink-400">{transactions.length} records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-[10px] uppercase tracking-[0.22em] text-ink-400">
                      <th className="py-2.5 px-4 text-left font-medium">Time</th>
                      <th className="py-2.5 px-4 text-left font-medium">Tx</th>
                      <th className="py-2.5 px-4 text-left font-medium">Order</th>
                      <th className="py-2.5 px-4 text-left font-medium">Customer</th>
                      <th className="py-2.5 px-4 text-left font-medium">Payment</th>
                      <th className="py-2.5 px-4 text-right font-medium">Subtotal</th>
                      <th className="py-2.5 px-4 text-right font-medium">Discount</th>
                      <th className="py-2.5 px-4 text-right font-medium">Total</th>
                      <th className="py-2.5 px-4 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-ink-400">No transactions yet</td>
                      </tr>
                    ) : transactions.map((t) => (
                      <tr key={t.id} className="border-b border-ink-100/70 hover:bg-ivory-100/60">
                        <td className="py-3 px-4 text-ink-700 tabular-nums">{new Date(t.created_at).toLocaleTimeString()}</td>
                        <td className="py-3 px-4 font-medium text-ink-900">{t.transaction_number}</td>
                        <td className="py-3 px-4 text-ink-700">{t.order?.order_number || 'N/A'}</td>
                        <td className="py-3 px-4 text-ink-700">
                          {t.customer_name || 'Walk-in'}
                          {t.customer_phone && <div className="text-xs text-ink-400">{t.customer_phone}</div>}
                        </td>
                        <td className="py-3 px-4 capitalize text-ink-700">{t.payment_method.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-right text-ink-700 tabular-nums">${t.subtotal.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-emerald-700 tabular-nums">
                          {t.discount_amount > 0 ? `-$${t.discount_amount.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-ink-900 tabular-nums">${t.total_amount.toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => viewTransaction(t)} className="rounded-lg p-1.5 text-ocean-700 hover:bg-ocean-50" title="View"><Eye className="h-4 w-4" /></button>
                            <button onClick={() => editTransaction(t)} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50" title="Edit"><Edit className="h-4 w-4" /></button>
                            <button onClick={() => deleteTransaction(t)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50" title="Delete"><Trash className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-ink-100 bg-white p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    placeholder="Search the menu…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-full border border-ink-100 bg-ivory-100/60 py-2.5 pl-10 pr-4 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:bg-white focus:ring-2 focus:ring-ocean-200"
                  />
                </div>
                <div className="flex items-center gap-1 rounded-full border border-ink-100 bg-ivory-100/60 p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${viewMode === 'grid' ? 'bg-ocean-800 text-ivory-50' : 'text-ink-500 hover:text-ink-900'}`}
                  >
                    <Grid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition ${viewMode === 'list' ? 'bg-ocean-800 text-ivory-50' : 'text-ink-500 hover:text-ink-900'}`}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="scroll-soft mt-4 flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
                    selectedCategory === 'all' ? 'bg-ocean-800 text-ivory-50' : 'border border-ink-100 bg-white text-ink-700 hover:border-ink-200'
                  }`}
                >
                  All items
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      selectedCategory === category.id ? 'bg-ocean-800 text-ivory-50' : 'border border-ink-100 bg-white text-ink-700 hover:border-ink-200'
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-ink-100 bg-white p-4 shadow-soft">
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center text-ink-400">
                  <Search className="h-8 w-8" />
                  <p className="mt-3 text-sm">No items match your filters</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {filteredProducts.map((product) => (
                    <motion.button
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="group relative overflow-hidden rounded-2xl border border-ink-100 bg-white text-left transition hover:border-ocean-700 hover:shadow-lifted"
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-ivory-100">
                        <img
                          src={product.image_url} alt={product.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-3">
                        <h3 className="truncate text-sm font-semibold text-ink-900">{product.name}</h3>
                        <p className="mt-1 font-display text-lg text-ocean-800 tabular-nums">${product.price.toFixed(2)}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3 text-left transition hover:border-ocean-700"
                    >
                      <img src={product.image_url} alt={product.name} className="h-16 w-16 rounded-xl object-cover" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-ink-900">{product.name}</h3>
                        </div>
                        <p className="font-display text-lg text-ocean-800 tabular-nums">${product.price.toFixed(2)}</p>
                      </div>
                      <Plus className="h-5 w-5 text-ocean-700" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-[92px] lg:h-[calc(100vh-110px)]">
            <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted">
              <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-ink-400">Running ticket</p>
                  <h2 className="font-display text-xl text-ink-900">{cartCount} item{cartCount === 1 ? '' : 's'}</h2>
                </div>
                {cart.length > 0 && (
                  <button onClick={clearCart} className="text-xs font-medium text-rose-600 hover:text-rose-700">
                    Clear all
                  </button>
                )}
              </div>

              <div className="scroll-soft flex-1 overflow-y-auto px-5 py-4">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ivory-100 text-ink-400">
                      <ShoppingCart className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm text-ink-400">No items yet</p>
                    <p className="mt-1 text-xs text-ink-400">Tap a product to start</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {cart.map((item) => (
                        <motion.div
                          key={item.product.id}
                          layout
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          className="rounded-2xl border border-ink-100 bg-ivory-100/50 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="flex-1 text-sm font-semibold text-ink-900">{item.product.name}</h4>
                            <button onClick={() => removeFromCart(item.product.id)} className="text-ink-400 hover:text-rose-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1 rounded-full border border-ink-100 bg-white p-0.5">
                              <button onClick={() => updateQuantity(item.product.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-ivory-100">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.product.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-ivory-100">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="font-display text-base text-ink-900 tabular-nums">
                              ${(item.product.price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              <div className="border-t border-ink-100 bg-ivory-100/50 px-5 py-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-ink-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  {discountPct > 0 && (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>Loyalty discount ({discountPct}%)</span>
                      <span className="tabular-nums">-${discountAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-ink-100 pt-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-400">Total</span>
                    <span className="font-display text-3xl text-ocean-800 tabular-nums">${finalTotal.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowCheckoutModal(true)}
                  disabled={cart.length === 0}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3.5 text-sm font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Receipt className="h-4 w-4" />
                  Checkout · ${finalTotal.toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showQuickAddCustomer && (
          <Modal onClose={() => { setShowQuickAddCustomer(false); setQuickAddForm({ first_name: '', last_name: '', phone: '', email: '' }); }}>
            <ModalHeader title="Quick add customer" subtitle="Walk-in guest to the loyalty program" onClose={() => setShowQuickAddCustomer(false)} />
            <div className="space-y-3 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name" required value={quickAddForm.first_name} onChange={(v) => setQuickAddForm({ ...quickAddForm, first_name: v })} />
                <Field label="Last name" required value={quickAddForm.last_name} onChange={(v) => setQuickAddForm({ ...quickAddForm, last_name: v })} />
              </div>
              <Field label="Phone" required type="tel" value={quickAddForm.phone} onChange={(v) => setQuickAddForm({ ...quickAddForm, phone: v })} />
              <Field label="Email" type="email" value={quickAddForm.email} onChange={(v) => setQuickAddForm({ ...quickAddForm, email: v })} />
              <div className="flex gap-2 pt-2">
                <button onClick={quickAddCustomer} disabled={loading} className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 transition hover:bg-ocean-900 disabled:opacity-60">
                  {loading ? 'Adding…' : 'Add customer'}
                </button>
                <button onClick={() => setShowQuickAddCustomer(false)} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCheckoutModal && (
          <Modal onClose={() => setShowCheckoutModal(false)} maxWidth="max-w-lg">
            <ModalHeader title="Checkout" subtitle={`${cartCount} items · $${finalTotal.toFixed(2)}`} onClose={() => setShowCheckoutModal(false)} />
            <div className="scroll-soft max-h-[calc(90vh-80px)] space-y-4 overflow-y-auto px-6 py-5">
              {selectedCustomer ? (
                <div className="rounded-2xl border border-ocean-200 bg-ocean-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg text-ink-900">{selectedCustomer.first_name} {selectedCustomer.last_name}</h3>
                        {selectedCustomer.loyalty_tier && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ backgroundColor: `${selectedCustomer.loyalty_tier.color_code}20`, color: selectedCustomer.loyalty_tier.color_code }}
                          >
                            {selectedCustomer.loyalty_tier.tier_name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedCustomer.phone}</span>
                        {selectedCustomer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {selectedCustomer.email}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-medium text-ocean-800"><Award className="h-3 w-3" /> {selectedCustomer.loyalty_points} pts</span>
                        <span className="text-ink-500">{selectedCustomer.total_visits} visits · ${selectedCustomer.total_spent.toFixed(2)}</span>
                      </div>
                      {discountPct > 0 && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                          <Sparkles className="h-3 w-3" />
                          {discountPct}% loyalty discount applied
                        </div>
                      )}
                    </div>
                    <button onClick={clearCustomer} className="text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setShowCustomerSearch(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-ocean-800 px-4 py-2 text-xs font-semibold text-ivory-50 hover:bg-ocean-900">
                      <Search className="h-4 w-4" /> Search customer
                    </button>
                    <button onClick={() => setShowQuickAddCustomer(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-amber-600">
                      <UserPlus className="h-4 w-4" /> Quick add
                    </button>
                  </div>

                  {showCustomerSearch && (
                    <div className="rounded-2xl border border-ocean-200 bg-ocean-50/50 p-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input
                          type="text"
                          value={customerSearchQuery}
                          onChange={(e) => { setCustomerSearchQuery(e.target.value); searchCustomers(e.target.value); }}
                          placeholder="Search by name, phone, email…"
                          className="w-full rounded-full border border-ink-100 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-ocean-700"
                          autoFocus
                        />
                      </div>
                      {customerSearchResults.length > 0 && (
                        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                          {customerSearchResults.map((c) => (
                            <button key={c.id} onClick={() => selectCustomer(c)} className="w-full rounded-xl border border-ink-100 bg-white p-2 text-left hover:border-ocean-700">
                              <div className="text-sm font-medium text-ink-900">{c.first_name} {c.last_name}</div>
                              <div className="text-xs text-ink-500">{c.phone}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => { setShowCustomerSearch(false); setCustomerSearchQuery(''); setCustomerSearchResults([]); }} className="mt-2 w-full text-xs text-ink-500 hover:text-ink-700">
                        Cancel search
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <hr className="border-ink-100" />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[10px] uppercase tracking-[0.22em] text-ink-400">Or</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <input
                        type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer name (optional)"
                        className="w-full rounded-full border border-ink-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ocean-700"
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <input
                        type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Phone (optional)"
                        className="w-full rounded-full border border-ink-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ocean-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.22em] text-ink-400">Payment method</p>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon;
                    const active = paymentMethod === pm.value;
                    return (
                      <button
                        key={pm.value}
                        onClick={() => setPaymentMethod(pm.value as typeof paymentMethod)}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition ${
                          active ? 'border-ocean-700 bg-ocean-50 text-ocean-800' : 'border-ink-100 bg-white text-ink-500 hover:border-ink-200'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-xs font-medium">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {paymentMethod === 'cash' && (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-ink-400">Amount tendered</p>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input
                      type="number" step="0.01"
                      value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-ink-100 bg-white py-3 pl-10 pr-4 font-display text-lg text-ink-900 tabular-nums outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
                    />
                  </div>
                  {amountTendered && parseFloat(amountTendered) >= finalTotal && (
                    <p className="mt-2 flex items-center justify-end gap-1 text-sm font-medium text-emerald-700">
                      Change: <span className="tabular-nums">${changeDue.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-ink-100 bg-ivory-100/50 p-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-ink-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  {discountPct > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Discount ({discountPct}%)</span>
                      <span className="tabular-nums">-${discountAmt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-ink-100 pt-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-400">Total due</span>
                    <span className="font-display text-2xl text-ocean-800 tabular-nums">${finalTotal.toFixed(2)}</span>
                  </div>
                  {selectedCustomer && (
                    <div className="flex items-center justify-end gap-1 text-xs text-ink-500">
                      <Award className="h-3 w-3" /> Earns {Math.floor(finalTotal)} loyalty points
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={processCheckout}
                disabled={loading || (paymentMethod === 'cash' && (!amountTendered || parseFloat(amountTendered) < finalTotal))}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ocean-800 px-6 py-3.5 text-sm font-semibold text-ivory-50 shadow-lifted transition hover:bg-ocean-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Receipt className="h-4 w-4" />
                {loading ? 'Processing…' : 'Complete transaction'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showViewModal && selectedTransaction && (
          <Modal onClose={() => { setShowViewModal(false); setSelectedTransaction(null); }} maxWidth="max-w-2xl">
            <ModalHeader title="Transaction details" subtitle={selectedTransaction.transaction_number} onClose={() => { setShowViewModal(false); setSelectedTransaction(null); }} />
            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <InfoCell label="Transaction" value={selectedTransaction.transaction_number} />
                <InfoCell label="Order" value={selectedTransaction.order?.order_number || 'N/A'} />
                <InfoCell label="Date & time" icon={Clock} value={new Date(selectedTransaction.created_at).toLocaleString()} />
                <InfoCell label="Payment" value={selectedTransaction.payment_method.replace('_', ' ')} capitalize />
              </div>

              {(selectedTransaction.customer_name || selectedTransaction.customer_phone) && (
                <div className="rounded-2xl border border-ink-100 bg-ivory-100/50 p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.22em] text-ink-400">Customer</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedTransaction.customer_name && <div><span className="text-ink-400">Name</span><p className="font-medium text-ink-900">{selectedTransaction.customer_name}</p></div>}
                    {selectedTransaction.customer_phone && <div><span className="text-ink-400">Phone</span><p className="font-medium text-ink-900">{selectedTransaction.customer_phone}</p></div>}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-ink-100 bg-ivory-100/50 p-4">
                <p className="mb-3 text-xs uppercase tracking-[0.22em] text-ink-400">Summary</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-ink-500"><span>Subtotal</span><span className="tabular-nums">${selectedTransaction.subtotal.toFixed(2)}</span></div>
                  {selectedTransaction.tax_amount > 0 && <div className="flex justify-between text-ink-500"><span>Tax</span><span className="tabular-nums">${selectedTransaction.tax_amount.toFixed(2)}</span></div>}
                  {selectedTransaction.discount_amount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span className="tabular-nums">-${selectedTransaction.discount_amount.toFixed(2)}</span></div>}
                  <div className="flex items-end justify-between border-t border-ink-100 pt-2">
                    <span className="text-xs uppercase tracking-[0.22em] text-ink-400">Total</span>
                    <span className="font-display text-2xl text-ocean-800 tabular-nums">${selectedTransaction.total_amount.toFixed(2)}</span>
                  </div>
                  {selectedTransaction.payment_method === 'cash' && (
                    <>
                      <div className="flex justify-between border-t border-ink-100 pt-2 text-ink-500"><span>Tendered</span><span className="tabular-nums">${selectedTransaction.amount_tendered.toFixed(2)}</span></div>
                      <div className="flex justify-between font-medium text-emerald-700"><span>Change</span><span className="tabular-nums">${selectedTransaction.change_given.toFixed(2)}</span></div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setShowViewModal(false); editTransaction(selectedTransaction); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ocean-900">
                  <Edit className="h-4 w-4" /> Edit
                </button>
                <button onClick={() => { setShowViewModal(false); setSelectedTransaction(null); }} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal && selectedTransaction && (
          <Modal onClose={() => { setShowEditModal(false); setSelectedTransaction(null); }}>
            <ModalHeader title="Edit transaction" subtitle={selectedTransaction.transaction_number} onClose={() => { setShowEditModal(false); setSelectedTransaction(null); }} />
            <div className="space-y-3 px-6 py-5">
              <Field label="Customer name" value={editForm.customer_name} onChange={(v) => setEditForm({ ...editForm, customer_name: v })} />
              <Field label="Customer phone" type="tel" value={editForm.customer_phone} onChange={(v) => setEditForm({ ...editForm, customer_phone: v })} />
              <div>
                <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">Payment method</label>
                <select
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                  className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="credit">Staff credit</option>
                </select>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-ivory-100/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-500">Total amount</span>
                  <span className="font-display text-lg text-ink-900 tabular-nums">${selectedTransaction.total_amount.toFixed(2)}</span>
                </div>
                <p className="mt-1 text-xs text-ink-400">Amount cannot be edited</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveTransactionEdit} disabled={loading} className="flex-1 rounded-full bg-ocean-800 py-2.5 text-sm font-semibold text-ivory-50 transition hover:bg-ocean-900 disabled:opacity-60">
                  {loading ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={() => { setShowEditModal(false); setSelectedTransaction(null); }} className="flex-1 rounded-full border border-ink-100 bg-white py-2.5 text-sm font-medium text-ink-700 hover:border-ink-200">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ children, onClose, maxWidth = 'max-w-md' }: { children: React.ReactNode; onClose: () => void; maxWidth?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: 'spring', damping: 26, stiffness: 220 }}
        className={`w-full ${maxWidth} overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-lifted`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function ModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
      <div>
        <h2 className="font-display text-xl text-ink-900">{title}</h2>
        {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-[0.22em] text-ink-400">
        {label}{required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full border border-ink-100 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-ocean-700 focus:ring-2 focus:ring-ocean-200"
      />
    </div>
  );
}

function InfoCell({ label, value, icon: Icon, capitalize }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }>; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.22em] text-ink-400">{label}</p>
      <p className={`mt-0.5 flex items-center gap-1 text-sm font-medium text-ink-900 ${capitalize ? 'capitalize' : ''}`}>
        {Icon && <Icon className="h-3.5 w-3.5 text-ocean-700" />}
        {value}
      </p>
    </div>
  );
}
