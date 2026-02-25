import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Hoist mock variables so vi.mock factories can reference them
const { mockUser, mockProfile, mockInvoke, mockFrom, mockRpc } = vi.hoisted(() => ({
    mockUser: { id: 'user-1', email: 'test@example.com' },
    mockProfile: { org_id: null as any, role: 'user' },
    mockInvoke: vi.fn(),
    mockFrom: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    mockRpc: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('@/contexts/AuthContext', () => ({
    useAuth: () => ({
        user: mockUser,
        profile: mockProfile,
        refreshProfile: vi.fn(),
        signOut: vi.fn(),
    }),
}));

vi.mock('@/integrations/sb_client/client', () => ({
    supabase: {
        functions: { invoke: mockInvoke },
        from: mockFrom,
        rpc: mockRpc,
    },
}));

vi.mock('@/hooks/use-wholesale-pricing', () => ({
    useSubdomainCheck: vi.fn(() => ({ data: { available: true }, isLoading: false })),
}));

vi.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

import MerchantOnboarding from '../MerchantOnboarding';

function renderOnboarding() {
    return render(
        <MemoryRouter>
            <MerchantOnboarding />
        </MemoryRouter>
    );
}

describe('MerchantOnboarding', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProfile.org_id = null as any;
    });

    it('renders the choose path screen initially', () => {
        renderOnboarding();
        expect(screen.getByText('Welcome to ThePeptideAI')).toBeInTheDocument();
        expect(screen.getByText('I Have a Business')).toBeInTheDocument();
        expect(screen.getByText('Start a Business')).toBeInTheDocument();
    });

    it('navigates to website step when "I Have a Business" is clicked', () => {
        renderOnboarding();
        fireEvent.click(screen.getByText('I Have a Business'));
        expect(screen.getByText('Enter Your Website')).toBeInTheDocument();
    });

    it('navigates to name step when "Start a Business" is clicked', () => {
        renderOnboarding();
        fireEvent.click(screen.getByText('Start a Business'));
        expect(screen.getByText('Name Your Company')).toBeInTheDocument();
    });

    describe('"existing" path', () => {
        it('shows website URL input with scrape button', () => {
            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));

            expect(screen.getByPlaceholderText('https://yourpeptideshop.com')).toBeInTheDocument();
            expect(screen.getByText('Extract My Brand')).toBeInTheDocument();
        });

        it('calls scrape-brand edge function on submit', async () => {
            mockInvoke.mockResolvedValue({
                data: {
                    brand: {
                        company_name: 'Test Peptides',
                        primary_color: '#10b981',
                        secondary_color: '#6366f1',
                        font_family: 'Inter',
                        logo_url: '',
                        favicon_url: '',
                        tagline: 'Best peptides ever',
                    },
                    peptides: [
                        { name: 'BPC-157', price: 49.99, description: 'Healing', image_url: '', confidence: 0.9 },
                    ],
                },
                error: null,
            });

            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));

            const input = screen.getByPlaceholderText('https://yourpeptideshop.com');
            fireEvent.change(input, { target: { value: 'https://testpeptides.com' } });
            fireEvent.click(screen.getByText('Extract My Brand'));

            await waitFor(() => {
                expect(mockInvoke).toHaveBeenCalledWith('scrape-brand', {
                    body: { url: 'https://testpeptides.com', persist: false },
                });
            });
        });

        it('shows scraped preview after successful scrape', async () => {
            mockInvoke.mockResolvedValue({
                data: {
                    brand: {
                        company_name: 'ScrapedCo',
                        primary_color: '#ff0000',
                        secondary_color: '#0000ff',
                        font_family: 'Montserrat',
                        logo_url: '',
                        favicon_url: '',
                        tagline: 'A tagline',
                    },
                    peptides: [
                        { name: 'TB-500', price: 59.99, description: 'Recovery', image_url: '', confidence: 0.85 },
                        { name: 'BPC-157', price: 49.99, description: 'Healing', image_url: '', confidence: 0.95 },
                    ],
                },
                error: null,
            });

            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));
            fireEvent.change(screen.getByPlaceholderText('https://yourpeptideshop.com'), {
                target: { value: 'https://scrapedco.com' },
            });
            fireEvent.click(screen.getByText('Extract My Brand'));

            await waitFor(() => {
                expect(screen.getByText('We Found Your Brand')).toBeInTheDocument();
            });

            expect(screen.getByText('ScrapedCo')).toBeInTheDocument();
            expect(screen.getByText('TB-500')).toBeInTheDocument();
            expect(screen.getByText('BPC-157')).toBeInTheDocument();
            expect(screen.getByText('$59.99')).toBeInTheDocument();
            expect(screen.getByText('Use This Brand')).toBeInTheDocument();
        });

        it('allows skipping the website step', () => {
            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));
            fireEvent.click(screen.getByText(/Skip.*set up branding manually/));
            expect(screen.getByText('Name Your Company')).toBeInTheDocument();
        });

        it('shows scrape error on failure', async () => {
            mockInvoke.mockResolvedValue({
                data: { error: 'Firecrawl timeout' },
                error: null,
            });

            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));
            fireEvent.change(screen.getByPlaceholderText('https://yourpeptideshop.com'), {
                target: { value: 'https://bad-site.com' },
            });
            fireEvent.click(screen.getByText('Extract My Brand'));

            await waitFor(() => {
                expect(screen.getByText('Firecrawl timeout')).toBeInTheDocument();
            });
        });
    });

    describe('"new" path flow', () => {
        it('goes through name → subdomain → confirm', () => {
            renderOnboarding();
            // Choose path
            fireEvent.click(screen.getByText('Start a Business'));

            // Name step
            expect(screen.getByText('Name Your Company')).toBeInTheDocument();
            fireEvent.change(screen.getByPlaceholderText('Acme Peptides'), {
                target: { value: 'New Peptides Inc' },
            });
            fireEvent.click(screen.getByText(/Continue/));

            // Subdomain step (no branding step in "new" path)
            expect(screen.getByText('Choose Your Subdomain')).toBeInTheDocument();
        });
    });

    describe('back navigation', () => {
        it('goes back from website step to path selection', () => {
            renderOnboarding();
            fireEvent.click(screen.getByText('I Have a Business'));
            expect(screen.getByText('Enter Your Website')).toBeInTheDocument();

            fireEvent.click(screen.getByText(/Back/));
            expect(screen.getByText('Welcome to ThePeptideAI')).toBeInTheDocument();
        });

        it('goes back from name step to path selection in new path', () => {
            renderOnboarding();
            fireEvent.click(screen.getByText('Start a Business'));
            expect(screen.getByText('Name Your Company')).toBeInTheDocument();

            fireEvent.click(screen.getByText(/Back/));
            expect(screen.getByText('Welcome to ThePeptideAI')).toBeInTheDocument();
        });
    });
});
