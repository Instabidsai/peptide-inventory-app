import { vi } from 'vitest';

export const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: mockToast,
}));

export function resetToast() {
  mockToast.mockClear();
}
