import { vi } from 'vitest';
import { mockUser, mockProfile } from './supabase';

// Default auth context value
export const defaultAuthContext = {
  user: mockUser as any,
  profile: mockProfile as any,
  userRole: 'admin' as const,
  organization: { id: 'org-123', name: 'Test Org', slug: 'test-org' } as any,
  session: { access_token: 'mock-token' } as any,
  isLoading: false,
  signOut: vi.fn().mockResolvedValue(undefined),
};

let authOverrides: Partial<typeof defaultAuthContext> = {};

export function setAuthContext(overrides: Partial<typeof defaultAuthContext>) {
  authOverrides = overrides;
}

export function resetAuthContext() {
  authOverrides = {};
}

export function getAuthContext() {
  return { ...defaultAuthContext, ...authOverrides };
}

// Auto-mock the AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => getAuthContext(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
