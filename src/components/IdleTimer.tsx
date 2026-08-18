import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function IdleTimer({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearCart } = useStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isWelcomeScreen = location.pathname === '/';

  useEffect(() => {
    if (isAdminRoute || isWelcomeScreen) {
      return;
    }

    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        clearCart();
        navigate('/');
      }, 60000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    events.forEach((event) => {
      document.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer);
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [location.pathname, navigate, clearCart, isAdminRoute, isWelcomeScreen]);

  return <>{children}</>;
}
