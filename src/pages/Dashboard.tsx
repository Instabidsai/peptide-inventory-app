import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import PartnerDashboard from './partner/PartnerDashboard';
import AdminDashboard from './admin/AdminDashboard'; // Assuming we created this in the previous step

export default function Dashboard() {
  const { userRole } = useAuth();
  const [searchParams] = useSearchParams();
  const previewRole = searchParams.get('preview_role');

  if (userRole?.role === 'sales_rep' || previewRole === 'sales_rep') {
    return <PartnerDashboard />;
  }

  // Default to Admin Dashboard for admins and staff
  return <AdminDashboard />;
}
