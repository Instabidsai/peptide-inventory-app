import { vi } from 'vitest';

// Chainable query builder mock
function createQueryBuilder(resolvedData: unknown = [], resolvedError: null | { message: string } = null) {
  const builder: Record<string, any> = {};
  const methods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in',
    'like', 'ilike', 'is', 'not', 'or', 'and',
    'order', 'limit', 'range', 'single', 'maybeSingle',
    'csv', 'returns',
  ];

  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods resolve the promise
  builder.then = vi.fn((resolve: any) =>
    resolve({ data: resolvedData, error: resolvedError })
  );

  // Make the builder thenable (awaitable)
  Object.defineProperty(builder, Symbol.toStringTag, { value: 'Promise' });

  // Override single() to return a single item
  builder.single = vi.fn().mockReturnValue({
    ...builder,
    then: vi.fn((resolve: any) => {
      const data = Array.isArray(resolvedData) ? resolvedData[0] ?? null : resolvedData;
      return resolve({ data, error: resolvedError });
    }),
  });

  return builder;
}

// Default mock user
export const mockUser = {
  id: 'auth-user-123',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2025-01-01T00:00:00Z',
};

// Default mock profile
export const mockProfile = {
  id: 'profile-123',
  user_id: 'auth-user-123',
  org_id: 'org-123',
  full_name: 'Test User',
  role: 'admin',
  commission_rate: 0.1,
  price_multiplier: 1.0,
  pricing_mode: 'percentage',
  cost_plus_markup: 0,
};

// Store for configuring mock responses per table/rpc
let mockResponses: Record<string, { data: unknown; error: null | { message: string } }> = {};
let rpcResponses: Record<string, { data: unknown; error: null | { message: string } }> = {};
let functionResponses: Record<string, { data: unknown; error: null | { message: string } }> = {};

export function setMockResponse(table: string, data: unknown, error: null | { message: string } = null) {
  mockResponses[table] = { data, error };
}

export function setRpcResponse(name: string, data: unknown, error: null | { message: string } = null) {
  rpcResponses[name] = { data, error };
}

export function setFunctionResponse(name: string, data: unknown, error: null | { message: string } = null) {
  functionResponses[name] = { data, error };
}

export function resetMockResponses() {
  mockResponses = {};
  rpcResponses = {};
  functionResponses = {};
}

// The mock supabase client
export const supabase = {
  from: vi.fn((table: string) => {
    const response = mockResponses[table] || { data: [], error: null };
    return createQueryBuilder(response.data, response.error);
  }),
  rpc: vi.fn((name: string, _params?: any) => {
    const response = rpcResponses[name] || { data: null, error: null };
    return Promise.resolve(response);
  }),
  functions: {
    invoke: vi.fn((name: string, _options?: any) => {
      const response = functionResponses[name] || { data: null, error: null };
      return Promise.resolve(response);
    }),
  },
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: { access_token: 'mock-token', user: mockUser } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
};

// Auto-mock the supabase client module
vi.mock('@/integrations/sb_client/client', () => ({
  supabase,
}));
