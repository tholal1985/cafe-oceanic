import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingBag, LogOut, ChefHat,
  MessageCircle, Receipt, Database, Monitor, CircleUser as UserCircle,
  Settings, Lock, Key, Menu, X, ChevronLeft, ChevronRight, KeyRound,
  ExternalLink, Search, Layers, ShieldCheck, Wallet
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUserRole } from '../hooks/useUserRole';

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/admin/pos', icon: Monitor, label: 'Point of Sale', permission: 'pos_access' },
      { path: '/admin/customers', icon: UserCircle, label: 'Customers' },
      { path: '/admin/customer-billing', icon: Wallet, label: 'Customer Billing' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { path: '/admin/products', icon: Package, label: 'Products' },
      { path: '/admin/pack-tiers', icon: Layers, label: 'Pack Tiers' },
      { path: '/admin/pack-licenses', icon: KeyRound, label: 'Pack Licenses' },
    ],
  },
  {
    label: 'Licensing',
    items: [
      { path: '/admin/activation-keys', icon: ShieldCheck, label: 'Activation Keys', adminOnly: true },
    ],
  },
  {
    label: 'Kiosk',
    items: [
      { path: '/admin/kiosk', icon: Monitor, label: 'Kiosk Settings' },
      { path: '/admin/orders', icon: ShoppingBag, label: 'Orders' },
      { path: '/admin/kiosk-lock', icon: Lock, label: 'Kiosk Lock' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { path: '/admin/payment-transactions', icon: Receipt, label: 'Transactions' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/admin/messaging', icon: MessageCircle, label: 'Messaging' },

      { path: '/admin/api-keys', icon: Key, label: 'API Keys' },
      { path: '/admin/settings', icon: Settings, label: 'Settings', requireSettingsEdit: true },
      { path: '/admin/backup', icon: Database, label: 'Backup & Restore', adminOnly: true },
    ],
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const { isAdmin, hasPermission, loading: rolesLoading } = useUserRole();

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate('/admin/login'); return; }

    const { data: adminData } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!adminData) {
      await supabase.auth.signOut();
      navigate('/admin/login');
      return;
    }
    setUserEmail(user.email ?? '');
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/admin/login');
  };

  if (loading || rolesLoading) {
    return (
      <div className="min-h-screen bg-ivory-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-full border-2 border-ocean-200 border-t-ocean-800 animate-spin" />
          <p className="text-ink-500 text-xs tracking-[0.2em] uppercase">Loading workspace</p>
        </div>
      </div>
    );
  }

  const isItemVisible = (item: any) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.requireSettingsEdit && !hasPermission('settings', 'edit')) return false;
    if (item.permission && !hasPermission(item.permission) && !isAdmin) return false;
    return true;
  };

  const currentPageLabel = NAV_GROUPS
    .flatMap(g => g.items)
    .find(item => item.path === location.pathname)?.label ?? 'Admin';

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : 'AD';

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div className="flex h-full flex-col bg-ocean-950 text-ivory-100">
      <div className={`flex items-center border-b border-white/5 ${collapsed && !isMobile ? 'justify-center px-3 py-5' : 'justify-between px-5 py-5'}`}>
        {(!collapsed || isMobile) && (
          <Link to="/admin/dashboard" className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-ocean-950 shadow-lifted">
              <span className="font-display text-lg italic">O</span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-base text-white">Cafe Oceanic</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ivory-100/50">Workspace</p>
            </div>
          </Link>
        )}
        {collapsed && !isMobile && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-ocean-950 shadow-lifted">
            <span className="font-display text-lg italic">O</span>
          </div>
        )}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`rounded-md p-1.5 text-ivory-100/50 transition-colors hover:bg-white/5 hover:text-white ${collapsed ? 'absolute top-20 -right-3 bg-ocean-950 border border-white/10 shadow-lifted' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-ivory-100/60 hover:bg-white/5 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 scroll-soft">
        {NAV_GROUPS.map(group => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-1">
              {(!collapsed || isMobile) && (
                <p className="mt-3 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-ivory-100/35">
                  {group.label}
                </p>
              )}
              {collapsed && !isMobile && <div className="my-2 border-t border-white/5" />}
              <ul className="space-y-0.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={`group relative flex items-center gap-3 rounded-lg transition-all duration-150
                          ${collapsed && !isMobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}
                          ${isActive
                            ? 'bg-gradient-to-r from-amber-400/15 to-transparent text-white shadow-[inset_2px_0_0_0_rgb(234,168,72)]'
                            : 'text-ivory-100/70 hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        <Icon size={17} className="shrink-0" />
                        {(!collapsed || isMobile) && (
                          <span className="text-[13px] font-medium leading-none">{item.label}</span>
                        )}
                        {collapsed && !isMobile && (
                          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-ocean-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {(!collapsed || isMobile) && (
          <p className="mt-4 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-ivory-100/35">Kitchen</p>
        )}
        {collapsed && !isMobile && <div className="my-2 border-t border-white/5" />}
        <Link
          to="/kitchen"
          target="_blank"
          title={collapsed && !isMobile ? 'Kitchen Display' : undefined}
          className={`group relative flex items-center gap-3 rounded-lg text-ivory-100/70 transition-all hover:bg-white/5 hover:text-white
            ${collapsed && !isMobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}`}
        >
          <ChefHat size={17} className="shrink-0" />
          {(!collapsed || isMobile) && (
            <>
              <span className="text-[13px] font-medium leading-none">Kitchen Display</span>
              <ExternalLink size={11} className="ml-auto text-ivory-100/35" />
            </>
          )}
          {collapsed && !isMobile && (
            <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-ocean-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              Kitchen Display
            </span>
          )}
        </Link>
      </nav>

      <div className="border-t border-white/5 p-3">
        {(!collapsed || isMobile) && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[11px] font-bold text-ocean-950">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-white">{userEmail || 'Admin'}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-ivory-100/50">
                {isAdmin ? 'Administrator' : 'Staff'}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed && !isMobile ? 'Logout' : undefined}
          className={`group relative flex w-full items-center gap-3 rounded-lg text-ivory-100/70 transition-all hover:bg-white/5 hover:text-amber-300
            ${collapsed && !isMobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2'}`}
        >
          <LogOut size={17} className="shrink-0" />
          {(!collapsed || isMobile) && (
            <span className="text-[13px] font-medium">Sign out</span>
          )}
          {collapsed && !isMobile && (
            <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md border border-white/10 bg-ocean-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
              Sign out
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-ivory-50">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-ocean-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform duration-300 lg:static lg:flex-shrink-0 lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${collapsed ? 'lg:w-[68px]' : 'lg:w-64'}`}
      >
        <SidebarContent isMobile={false} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-100 bg-ivory-50/85 px-5 backdrop-blur-xl">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-800 lg:hidden"
          >
            <Menu size={18} />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-ink-300 sm:block text-sm">Admin</span>
            <span className="hidden text-ink-300 sm:block text-sm">/</span>
            <h2 className="truncate text-sm font-semibold text-ink-900">{currentPageLabel}</h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="hidden md:flex w-56 items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-400 shadow-soft transition-colors hover:border-ink-200 hover:text-ink-600">
              <Search size={14} />
              <span>Search anything…</span>
              <kbd className="kbd ml-auto">⌘K</kbd>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
