import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const PartnerDashboard = lazy(() => import('./partner/PartnerDashboard'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));

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
