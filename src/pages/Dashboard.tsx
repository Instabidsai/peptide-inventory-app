import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

function lazyRetry(fn: () => Promise<{ default: React.ComponentType }>) {
    return lazy(() => fn().catch(() => {
        window.location.reload();
        return new Promise(() => {});
    }));
}

const PartnerDashboard = lazyRetry(() => import('./partner/PartnerDashboard'));
const AdminDashboard = lazyRetry(() => import('./admin/AdminDashboard'));

const DashboardFallback = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

export default function Dashboard() {
  const { userRole, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const previewRole = searchParams.get('preview_role');

  if (userRole?.role === 'sales_rep' || profile?.role === 'sales_rep' || previewRole === 'sales_rep') {
    return <Suspense fallback={<DashboardFallback />}><PartnerDashboard /></Suspense>;
  }

  return <Suspense fallback={<DashboardFallback />}><AdminDashboard /></Suspense>;
}
