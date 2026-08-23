import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface UserRole {
  role_id: string;
  role_name: string;
  display_name: string;
  permissions: any;
}

export function useUserRole() {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isKitchenStaff, setIsKitchenStaff] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [isWaiter, setIsWaiter] = useState(false);

  useEffect(() => {
    loadUserRoles();
  }, []);

  const loadUserRoles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: userRoles }, { data: adminUser }] = await Promise.all([
        supabase.rpc('get_user_roles', { user_uuid: user.id }),
        supabase.from('admin_users').select('id').eq('id', user.id).eq('is_active', true).maybeSingle()
      ]);

      if (userRoles) {
        setRoles(userRoles);
        const hasAdminRole = userRoles.some((r: UserRole) => r.role_name === 'admin');
        setIsAdmin(hasAdminRole || !!adminUser);
        setIsKitchenStaff(userRoles.some((r: UserRole) => r.role_name === 'kitchen_staff'));
        setIsCashier(userRoles.some((r: UserRole) => r.role_name === 'cashier'));
        setIsWaiter(userRoles.some((r: UserRole) => r.role_name === 'waiter'));
      } else {
        setIsAdmin(!!adminUser);
      }
    } catch (error) {
      console.error('Error loading user roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (resource: string, action?: string): boolean => {
    return roles.some(role => {
      const permissions = role.permissions;
      if (action) {
        return permissions?.[resource]?.[action] === true;
      }
      return permissions?.[resource] === true;
    });
  };

  const hasAnyRole = (...roleNames: string[]): boolean => {
    return roles.some(role => roleNames.includes(role.role_name));
  };

  return {
    roles,
    loading,
    isAdmin,
    isKitchenStaff,
    isCashier,
    isWaiter,
    hasPermission,
    hasAnyRole,
    reload: loadUserRoles
  };
}
