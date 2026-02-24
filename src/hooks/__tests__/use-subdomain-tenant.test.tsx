import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';

// Mock subdomain module
vi.mock('@/lib/subdomain', () => ({
    getSubdomain: vi.fn(() => null),
}));

// Mock supabase client
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockThen = vi.fn();

vi.mock('@/integrations/sb_client/client', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: mockSelect.mockReturnThis(),
            eq: mockEq.mockReturnThis(),
            single: mockSingle.mockReturnThis(),
            then: mockThen,
        })),
    },
}));

import { useSubdomainTenant, SubdomainTenantProvider } from '../use-subdomain-tenant';
import { getSubdomain } from '@/lib/subdomain';

function wrapper({ children }: { children: ReactNode }) {
    return <SubdomainTenantProvider>{children}</SubdomainTenantProvider>;
}

describe('useSubdomainTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null tenant when no subdomain', () => {
        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const { result } = renderHook(() => useSubdomainTenant(), { wrapper });

        expect(result.current.tenant).toBeNull();
        expect(result.current.isLoading).toBe(false);
        expect(result.current.subdomain).toBeNull();
    });

    it('sets isLoading true when subdomain exists', () => {
        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue('acmepeptides');
        mockThen.mockImplementation(() => {}); // Don't resolve yet

        const { result } = renderHook(() => useSubdomainTenant(), { wrapper });

        expect(result.current.subdomain).toBe('acmepeptides');
        expect(result.current.isLoading).toBe(true);
    });

    it('resolves tenant data on successful query', async () => {
        const mockTenant = {
            org_id: 'org-123',
            brand_name: 'Acme Peptides',
            logo_url: 'https://example.com/logo.png',
            primary_color: '#10b981',
            secondary_color: '#6366f1',
            font_family: 'Inter',
            favicon_url: 'https://example.com/favicon.ico',
            subdomain: 'acmepeptides',
        };

        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue('acmepeptides');
        mockThen.mockImplementation((callback: any) => {
            callback({ data: mockTenant, error: null });
        });

        const { result } = renderHook(() => useSubdomainTenant(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.tenant).toEqual(mockTenant);
    });

    it('handles query error gracefully', async () => {
        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue('badstore');
        mockThen.mockImplementation((callback: any) => {
            callback({ data: null, error: { message: 'Not found' } });
        });

        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { result } = renderHook(() => useSubdomainTenant(), { wrapper });

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.tenant).toBeNull();
        expect(consoleWarn).toHaveBeenCalledWith(
            expect.stringContaining('No tenant found for subdomain: badstore')
        );

        consoleWarn.mockRestore();
    });
});

describe('applyBranding (via SubdomainTenantProvider)', () => {
    it('applies primary color as CSS variable', async () => {
        const mockTenant = {
            org_id: 'org-1',
            brand_name: 'TestCo',
            logo_url: '',
            primary_color: '#10b981',
            secondary_color: null,
            font_family: null,
            favicon_url: null,
            subdomain: 'testco',
        };

        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue('testco');
        mockThen.mockImplementation((callback: any) => {
            callback({ data: mockTenant, error: null });
        });

        renderHook(() => useSubdomainTenant(), { wrapper });

        await waitFor(() => {
            const primaryVar = document.documentElement.style.getPropertyValue('--primary');
            expect(primaryVar).toBeTruthy();
        });
    });

    it('sets document title to brand name', async () => {
        const mockTenant = {
            org_id: 'org-1',
            brand_name: 'My Peptide Shop',
            logo_url: '',
            primary_color: '#000000',
            secondary_color: null,
            font_family: null,
            favicon_url: null,
            subdomain: 'mypeptides',
        };

        (getSubdomain as ReturnType<typeof vi.fn>).mockReturnValue('mypeptides');
        mockThen.mockImplementation((callback: any) => {
            callback({ data: mockTenant, error: null });
        });

        renderHook(() => useSubdomainTenant(), { wrapper });

        await waitFor(() => {
            expect(document.title).toBe('My Peptide Shop');
        });
    });
});
