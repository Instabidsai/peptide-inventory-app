import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const PartnerDashboard = lazy(() => import('./partner/PartnerDashboard'));
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'));

export default function Dashboard() {
  const { userRole, profile } = useAuth();
  const [searchParams] = useSearchParams();
  const previewRole = searchParams.get('preview_role');

  if (userRole?.role === 'sales_rep' || profile?.role === 'sales_rep' || previewRole === 'sales_rep') {
    return <Suspense fallback={null}><PartnerDashboard /></Suspense>;
  }

  return <Suspense fallback={null}><AdminDashboard /></Suspense>;
}
