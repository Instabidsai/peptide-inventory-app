import { vi } from 'vitest';

export const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

export function resetToast() {
  mockToast.mockClear();
}

/** Return all toast call arguments (first arg of each call) for assertion. */
export function getToastCalls(): any[] {
  return mockToast.mock.calls.map((c: any[]) => c[0]);
}
