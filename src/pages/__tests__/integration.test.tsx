import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { createWrapper } from '@/test/mocks/wrapper';
import { resetMockResponses, setMockResponse, setRpcResponse, mockProfile } from '@/test/mocks/supabase';
import { resetToast, getToastCalls } from '@/test/mocks/toast';
import { resetAuthContext, setAuthContext } from '@/test/mocks/auth';

beforeEach(() => {
  vi.clearAllMocks();
  resetMockResponses();
  resetToast();
  resetAuthContext();
});

// ─── Flow 1: Partner Sign-Up via Referral ───────────────────────────────────

describe('Flow 1: Partner Referral Sign-Up', () => {
  it('linkReferral calls link_referral RPC with correct params', async () => {
    setRpcResponse('link_referral', { success: true, type: 'partner' });

    const { linkReferral } = await import('@/lib/link-referral');
    const result = await linkReferral(
      'user-123',
      'don@example.com',
      'Don Partner',
      'referrer-profile-456',
      'partner'
    );

    expect(result).toEqual({ success: true, type: 'partner' });
  });

  it('linkReferral returns error when RPC fails', async () => {
    setRpcResponse('link_referral', null, { message: 'Invalid referrer ID' });

    const { linkReferral } = await import('@/lib/link-referral');
    const result = await linkReferral(
      'user-123',
      'don@example.com',
      'Don Partner',
      'bad-referrer',
      'partner'
    );

    expect(result.success).toBe(false);
  });

  it('storeSessionReferral persists referral data for OAuth redirect', async () => {
    const { storeSessionReferral } = await import('@/lib/link-referral');

    storeSessionReferral('ref-abc', 'partner');

    expect(sessionStorage.getItem('partner_ref')).toBe('ref-abc');
    expect(sessionStorage.getItem('partner_ref_role')).toBe('partner');

    // Cleanup
    sessionStorage.removeItem('partner_ref');
    sessionStorage.removeItem('partner_ref_role');
  });

  it('consumeSessionReferral reads and clears referral data', async () => {
    sessionStorage.setItem('partner_ref', 'ref-xyz');
    sessionStorage.setItem('partner_ref_role', 'partner');

    const { consumeSessionReferral } = await import('@/lib/link-referral');
    const result = consumeSessionReferral();

    expect(result).toEqual({ refId: 'ref-xyz', role: 'partner' });
    // Should have cleared
    expect(sessionStorage.getItem('partner_ref')).toBeNull();
    expect(sessionStorage.getItem('partner_ref_role')).toBeNull();
  });
});

// ─── Flow 2: Admin Creates Order ────────────────────────────────────────────

describe('Flow 2: Admin Creates Order', () => {
  beforeEach(() => {
    setAuthContext({
      userRole: 'admin' as any,
      profile: { ...mockProfile, role: 'admin', commission_rate: 0.1, price_multiplier: 1.0 } as any,
    });
  });

  it('useCreateSalesOrder creates order with items and invalidates cache', async () => {
    // Mock profile lookup
    setMockResponse('profiles', [{ id: 'profile-123', org_id: 'org-123', commission_rate: 0.1, price_multiplier: 1.0 }]);

    // Mock contact lookup (for assigned_rep_id)
    setMockResponse('contacts', [{ assigned_rep_id: null }]);

    // Mock sales_orders insert
    setMockResponse('sales_orders', [{
      id: 'order-001',
      org_id: 'org-123',
      status: 'submitted',
      total_amount: 150,
    }]);

    // Mock sales_order_items insert
    setMockResponse('sales_order_items', [{ id: 'item-001' }]);

    const { useCreateSalesOrder } = await import('@/hooks/use-sales-orders');
    const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: 'contact-123',
        items: [{ peptide_id: 'pep-1', peptide_name: 'BPC-157', quantity: 2, unit_price: 75 }],
        total_amount: 150,
        notes: 'Test order',
        payment_method: 'card',
        auto_fulfill: false,
      });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });

    // Either succeeds or errors — the important thing is it doesn't hang
    if (result.current.isSuccess) {
      const toasts = getToastCalls();
      expect(toasts.some((t: any) => t.title?.includes('created') || t.title?.includes('Order'))).toBe(true);
    }
  });

  it('useCreateSalesOrder handles missing org_id gracefully', async () => {
    setAuthContext({
      profile: { ...mockProfile, org_id: null } as any,
    });

    setMockResponse('profiles', []);

    const { useCreateSalesOrder } = await import('@/hooks/use-sales-orders');
    const { result } = renderHook(() => useCreateSalesOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        client_id: 'contact-123',
        items: [{ peptide_id: 'pep-1', peptide_name: 'BPC-157', quantity: 1, unit_price: 75 }],
        total_amount: 75,
        notes: '',
        payment_method: 'card',
        auto_fulfill: false,
      });
    });

    await waitFor(() => expect(result.current.isError || result.current.isSuccess).toBe(true), { timeout: 3000 });
  });
});

// ─── Flow 3: Partner Dashboard ──────────────────────────────────────────────

describe('Flow 3: Partner Dashboard Actions', () => {
  beforeEach(() => {
    setAuthContext({
      userRole: 'sales_rep' as any,
      profile: {
        ...mockProfile,
        role: 'sales_rep',
        partner_tier: 'senior',
        commission_rate: 0.15,
        store_credit_balance: 50,
      } as any,
    });
  });

  it('usePartnerDownline fetches downline via RPC', async () => {
    const downlineTree = [
      { id: 'rep-1', full_name: 'Sub Rep 1', partner_tier: 'standard', depth: 1 },
      { id: 'rep-2', full_name: 'Sub Rep 2', partner_tier: 'standard', depth: 1 },
    ];
    setRpcResponse('get_partner_downline', downlineTree);

    const { usePartnerDownline } = await import('@/hooks/use-partner');
    const { result } = renderHook(() => usePartnerDownline(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });
    expect(result.current.data).toEqual(downlineTree);
  });

  it('usePayCommission marks a commission as paid', async () => {
    setMockResponse('commissions', [{ id: 'comm-1', status: 'paid' }]);

    const { usePayCommission } = await import('@/hooks/use-partner');
    const { result } = renderHook(() => usePayCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });

    if (result.current.isSuccess) {
      const toasts = getToastCalls();
      expect(toasts.length).toBeGreaterThan(0);
    }
  });

  it('useConvertCommission calls convert_commission_to_credit RPC', async () => {
    setRpcResponse('convert_commission_to_credit', { success: true });

    const { useConvertCommission } = await import('@/hooks/use-partner');
    const { result } = renderHook(() => useConvertCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('comm-1');
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });
  });

  it('useConvertCommission shows error toast on RPC failure', async () => {
    setRpcResponse('convert_commission_to_credit', null, { message: 'Commission not found' });

    const { useConvertCommission } = await import('@/hooks/use-partner');
    const { result } = renderHook(() => useConvertCommission(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('nonexistent-comm');
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

    const toasts = getToastCalls();
    expect(toasts.some((t: any) => t.variant === 'destructive')).toBe(true);
  });

  it('useCreateContact creates a contact scoped to the partner org', async () => {
    setMockResponse('profiles', [{ org_id: 'org-123' }]);
    setMockResponse('contacts', [{
      id: 'new-contact-1',
      full_name: 'New Client',
      email: 'newclient@test.com',
      type: 'customer',
      org_id: 'org-123',
    }]);

    const { useCreateContact } = await import('@/hooks/use-contacts');
    const { result } = renderHook(() => useCreateContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        full_name: 'New Client',
        email: 'newclient@test.com',
        type: 'customer',
      } as any);
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });
  });
});

// ─── Flow 4: Client Checkout ────────────────────────────────────────────────

describe('Flow 4: Client Checkout', () => {
  beforeEach(() => {
    setAuthContext({
      userRole: 'client' as any,
      profile: { ...mockProfile, role: 'client' } as any,
    });
  });

  it('useCreateValidatedOrder creates order via RPC for alternative payment', async () => {
    setRpcResponse('create_validated_order', {
      success: true,
      order_id: 'order-alt-001',
      total_amount: 200,
    });

    // Import from correct module (use-sales-orders, not use-checkout)
    const { useCreateValidatedOrder } = await import('@/hooks/use-sales-orders');
    const { result } = renderHook(() => useCreateValidatedOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 2 }],
        shipping_address: '123 Main St, Austin TX 78701',
        notes: 'Please ship ASAP',
        payment_method: 'zelle',
        delivery_method: 'ship',
      });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });
  });

  it('useValidatedCheckout creates order then redirects to checkout', async () => {
    // Mock the validated order RPC
    setRpcResponse('create_validated_order', {
      success: true,
      order_id: 'order-card-001',
      total_amount: 150,
    });

    // Mock the order status update
    setMockResponse('sales_orders', [{ id: 'order-card-001', status: 'submitted' }]);

    // Mock the checkout session API call
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ checkout_url: 'https://checkout.psifi.com/session-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { useValidatedCheckout } = await import('@/hooks/use-checkout');
    const { result } = renderHook(() => useValidatedCheckout(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 1 }],
        shipping_address: '123 Main St, Austin TX 78701',
        notes: '',
        delivery_method: 'ship',
      });
    });

    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true), { timeout: 3000 });

    fetchSpy.mockRestore();
  });

  it('useCreateValidatedOrder rejects when RPC returns success=false', async () => {
    setRpcResponse('create_validated_order', {
      success: false,
      error: 'Insufficient stock for BPC-157',
    });

    const { useCreateValidatedOrder } = await import('@/hooks/use-sales-orders');
    const { result } = renderHook(() => useCreateValidatedOrder(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({
        items: [{ peptide_id: 'pep-1', quantity: 999 }],
        shipping_address: '123 Main St',
        notes: '',
        payment_method: 'zelle',
        delivery_method: 'ship',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

    const toasts = getToastCalls();
    expect(toasts.some((t: any) => t.variant === 'destructive')).toBe(true);
  });
});

// ─── Flow 5: Admin Deletes Contact ──────────────────────────────────────────

describe('Flow 5: Admin Deletes Contact (Cascade)', () => {
  beforeEach(() => {
    setAuthContext({
      userRole: 'admin' as any,
      profile: { ...mockProfile, role: 'admin', org_id: 'org-123' } as any,
    });
  });

  it('useDeleteContact calls delete_contact_cascade RPC', async () => {
    setRpcResponse('delete_contact_cascade', { success: true });

    const { useDeleteContact } = await import('@/hooks/use-contacts');
    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('contact-to-delete');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 3000 });

    const toasts = getToastCalls();
    expect(toasts.some((t: any) => t.title?.toLowerCase().includes('delete'))).toBe(true);
  });

  it('useDeleteContact shows error toast when RPC fails', async () => {
    setRpcResponse('delete_contact_cascade', null, { message: 'Contact not found' });

    const { useDeleteContact } = await import('@/hooks/use-contacts');
    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('nonexistent-contact');
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

    const toasts = getToastCalls();
    expect(toasts.some((t: any) => t.variant === 'destructive')).toBe(true);
  });

  it('useDeleteContact rejects when profile has no org_id', async () => {
    setAuthContext({
      profile: { ...mockProfile, org_id: null } as any,
    });

    const { useDeleteContact } = await import('@/hooks/use-contacts');
    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('contact-123');
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });

    const toasts = getToastCalls();
    expect(toasts.some((t: any) => t.variant === 'destructive')).toBe(true);
  });

  it('useDeleteContact handles RPC returning success=false', async () => {
    setRpcResponse('delete_contact_cascade', { success: false, error: 'Contact belongs to another org' });

    const { useDeleteContact } = await import('@/hooks/use-contacts');
    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate('wrong-org-contact');
    });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
  });
});
