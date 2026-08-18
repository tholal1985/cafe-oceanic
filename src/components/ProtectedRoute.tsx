import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRoles?: string[];
  requirePermission?: { resource: string; action: string };
}

export default function ProtectedRoute({
  children,
  requireRoles,
  requirePermission
}: ProtectedRouteProps) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      const { data: adminData } = await supabase
        .from('admin_users')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (!adminData || !adminData.is_active) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      if (!requireRoles && !requirePermission) {
        setAuthorized(true);
        setLoading(false);
        return;
      }

      const { data: userRoles } = await supabase.rpc('get_user_roles', {
        user_uuid: user.id
      });

      if (!userRoles || userRoles.length === 0) {
        setAuthorized(false);
        setLoading(false);
        return;
      }

      if (requireRoles && requireRoles.length > 0) {
        const hasRequiredRole = userRoles.some((role: any) =>
          requireRoles.includes(role.role_name)
        );

        if (!hasRequiredRole) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
      }

      if (requirePermission) {
        const hasPermission = userRoles.some((role: any) => {
          const permissions = role.permissions;
          return permissions?.[requirePermission.resource]?.[requirePermission.action] === true;
        });

        if (!hasPermission) {
          setAuthorized(false);
          setLoading(false);
          return;
        }
      }

      setAuthorized(true);
    } catch (error) {
      console.error('Authorization check error:', error);
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (authorized === false) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
