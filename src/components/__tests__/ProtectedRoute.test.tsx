import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock AuthContext
const mockAuth = {
  user: null as { id: string } | null,
  session: null,
  profile: null as { org_id: string | null; role: string } | null,
  userRole: null,
  organization: null,
  loading: false,
  authError: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

import { ProtectedRoute } from '../ProtectedRoute';

function renderWithRoutes(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <div>Protected content</div>
          </ProtectedRoute>
        } />
        <Route path="/crm" element={<div>CRM Landing</div>} />
        <Route path="/onboarding" element={<div>Onboarding</div>} />
        <Route path="/auth" element={<div>Auth Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    mockAuth.user = null;
    mockAuth.profile = null;
    mockAuth.loading = false;
    sessionStorage.clear();
  });

  it('shows loader while auth is loading', () => {
    mockAuth.loading = true;
    renderWithRoutes();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects to /crm when not authenticated', () => {
    mockAuth.user = null;
    renderWithRoutes();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('CRM Landing')).toBeInTheDocument();
  });

  it('renders children when authenticated with org', () => {
    mockAuth.user = { id: 'u1' };
    mockAuth.profile = { org_id: 'org1', role: 'admin' };
    renderWithRoutes();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to /onboarding when no org_id', () => {
    mockAuth.user = { id: 'u1' };
    mockAuth.profile = { org_id: null, role: 'admin' };
    renderWithRoutes();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('redirects to /auth when pending partner referral', () => {
    mockAuth.user = { id: 'u1' };
    mockAuth.profile = { org_id: null, role: 'admin' };
    sessionStorage.setItem('partner_ref', 'abc123');
    sessionStorage.setItem('partner_ref_role', 'sales_rep');
    renderWithRoutes();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Auth Page')).toBeInTheDocument();
  });
});
