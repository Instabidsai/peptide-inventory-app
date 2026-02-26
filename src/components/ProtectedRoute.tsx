import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/crm" state={{ from: location }} replace />;
  }

  // User exists but no org — check for pending referral or merchant signup first
  if (!profile?.org_id && location.pathname !== '/onboarding' && location.pathname !== '/merchant-onboarding') {
    // If there's a referral waiting, send to /auth to process it (not onboarding)
    const pendingRef = sessionStorage.getItem('partner_ref');
    if (pendingRef) {
      const role = sessionStorage.getItem('partner_ref_role') || 'customer';
      return <Navigate to={`/auth?ref=${encodeURIComponent(pendingRef)}&role=${encodeURIComponent(role)}`} replace />;
    }
    // Merchant self-signup → create org then AI Setup Assistant
    if (sessionStorage.getItem('merchant_signup') === 'true') {
      sessionStorage.removeItem('merchant_signup');
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
