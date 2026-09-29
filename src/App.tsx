import { BrowserRouter, Routes, Route } from 'react-router-dom';
import IdleTimer from './components/IdleTimer';
import AdminLayout from './components/AdminLayout';

import WelcomeScreen from './pages/WelcomeScreen';
import MenuScreen from './pages/MenuScreen';
import CheckoutScreen from './pages/CheckoutScreen';
import PaymentScreen from './pages/PaymentScreen';
import QRPaymentScreen from './pages/QRPaymentScreen';
import PaymentCallback from './pages/PaymentCallback';
import OrderConfirmation from './pages/OrderConfirmation';
import OrderTracking from './pages/OrderTracking';
import KitchenDisplay from './pages/KitchenDisplay';

import AdminLogin from './pages/admin/AdminLogin';
import AdminRegister from './pages/admin/AdminRegister';
import Dashboard from './pages/admin/Dashboard';
import Kiosk from './pages/admin/Kiosk';
import KioskLock from './pages/admin/KioskLock';
import Products from './pages/admin/Products';
import Orders from './pages/admin/Orders';
import PaymentTransactions from './pages/admin/PaymentTransactions';
import MessagingSettings from './pages/admin/MessagingSettings';
import BackupRestore from './pages/admin/BackupRestore';
import PointOfSale from './pages/admin/PointOfSale';
import Customers from './pages/admin/Customers';
import SystemSettings from './pages/admin/SystemSettings';
import ApiKeys from './pages/admin/ApiKeys';
import ProductPackLicenses from './pages/admin/ProductPackLicenses';
import ActivationKeys from './pages/admin/ActivationKeys';
import PackTiers from './pages/admin/PackTiers';
import CustomerBilling from './pages/admin/CustomerBilling';


import CustomerLogin from './pages/customer/CustomerLogin';
import CustomerRegister from './pages/customer/CustomerRegister';
import CustomerDashboard from './pages/customer/CustomerDashboard';

function App() {
  return (
    <BrowserRouter>
      <IdleTimer>
        <Routes>
          <Route path="/" element={<WelcomeScreen />} />
          <Route path="/menu" element={<MenuScreen />} />
          <Route path="/checkout" element={<CheckoutScreen />} />
          <Route path="/payment" element={<PaymentScreen />} />
          <Route path="/payment/qr" element={<QRPaymentScreen />} />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/order-confirmation" element={<OrderConfirmation />} />
          <Route path="/track/:orderId" element={<OrderTracking />} />
          <Route path="/kitchen" element={<KitchenDisplay />} />

          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/customer/register" element={<CustomerRegister />} />
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />

          <Route path="/admin/register" element={<AdminRegister />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pos" element={<PointOfSale />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customer-billing" element={<CustomerBilling />} />
            <Route path="kiosk" element={<Kiosk />} />
            <Route path="kiosk-lock" element={<KioskLock />} />
            <Route path="products" element={<Products />} />
            <Route path="orders" element={<Orders />} />
            <Route path="payment-transactions" element={<PaymentTransactions />} />
            <Route path="messaging" element={<MessagingSettings />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="backup" element={<BackupRestore />} />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route path="pack-licenses" element={<ProductPackLicenses />} />
            <Route path="pack-tiers" element={<PackTiers />} />
            <Route path="activation-keys" element={<ActivationKeys />} />

          </Route>
        </Routes>
      </IdleTimer>
    </BrowserRouter>
  );
}

export default App;
