import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, addDays, format, isBefore } from 'date-fns';

export interface TenantInvoice {
    id: string;
    org_id: string;
    invoice_number: string;
    period_start: string;
    period_end: string;
    amount_cents: number;
    status: 'pending' | 'paid' | 'overdue' | 'waived';
    payment_method: string | null;
    payment_reference: string | null;
    paid_at: string | null;
    due_date: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    org?: { name: string } | null;
}

export interface InvoiceStats {
    outstanding_cents: number;
    collected_this_month_cents: number;
    overdue_count: number;
    pending_count: number;
    total_invoices: number;
}

// ── Fetch all invoices (vendor view) ──────────────────────────────────────
export function useAllInvoices(statusFilter?: string) {
    const { userRole } = useAuth();

    return useQuery({
        queryKey: ['all-invoices', statusFilter],
        enabled: userRole?.role === 'super_admin' || userRole?.role === 'vendor',
        queryFn: async (): Promise<TenantInvoice[]> => {
            let query = supabase
                .from('tenant_invoices')
                .select('*, org:organizations(name)')
                .order('due_date', { ascending: false });

            if (statusFilter && statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as TenantInvoice[];
        },
        staleTime: 15_000,
    });
}

// ── Fetch invoices for a single org ───────────────────────────────────────
export function useOrgInvoices(orgId?: string, limit = 12) {
    return useQuery({
        queryKey: ['org-invoices', orgId],
        enabled: !!orgId,
        queryFn: async (): Promise<TenantInvoice[]> => {
            const { data, error } = await supabase
                .from('tenant_invoices')
                .select('*')
                .eq('org_id', orgId!)
                .order('period_start', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return (data || []) as TenantInvoice[];
        },
        staleTime: 15_000,
    });
}

// ── Compute invoice stats ─────────────────────────────────────────────────
export function computeInvoiceStats(invoices: TenantInvoice[]): InvoiceStats {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    let outstanding_cents = 0;
    let collected_this_month_cents = 0;
    let overdue_count = 0;
    let pending_count = 0;

    for (const inv of invoices) {
        if (inv.status === 'pending' || inv.status === 'overdue') {
            outstanding_cents += inv.amount_cents;
        }
        if (inv.status === 'overdue') {
            overdue_count++;
        }
        if (inv.status === 'pending') {
            pending_count++;
        }
        if (inv.status === 'paid' && inv.paid_at) {
            const paidDate = new Date(inv.paid_at);
            if (paidDate >= monthStart && paidDate <= monthEnd) {
                collected_this_month_cents += inv.amount_cents;
            }
        }
    }

    return {
        outstanding_cents,
        collected_this_month_cents,
        overdue_count,
        pending_count,
        total_invoices: invoices.length,
    };
}

// ── Mark invoice as paid ──────────────────────────────────────────────────
export function useMarkInvoicePaid() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            invoiceId,
            payment_method,
            payment_reference,
        }: {
            invoiceId: string;
            payment_method: string;
            payment_reference?: string;
        }) => {
            const { error } = await supabase
                .from('tenant_invoices')
                .update({
                    status: 'paid',
                    payment_method,
                    payment_reference: payment_reference || null,
                    paid_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['org-invoices'] });
        },
    });
}

// ── Waive an invoice ──────────────────────────────────────────────────────
export function useWaiveInvoice() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ invoiceId, notes }: { invoiceId: string; notes?: string }) => {
            const { error } = await supabase
                .from('tenant_invoices')
                .update({
                    status: 'waived',
                    notes: notes || 'Waived by vendor',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', invoiceId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['org-invoices'] });
        },
    });
}

// ── Update monthly rate on tenant_subscriptions ───────────────────────────
export function useUpdateMonthlyRate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ orgId, rateCents }: { orgId: string; rateCents: number }) => {
            const { error } = await supabase
                .from('tenant_subscriptions')
                .update({
                    monthly_rate_cents: rateCents,
                    updated_at: new Date().toISOString(),
                })
                .eq('org_id', orgId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tenant-detail'] });
            queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
        },
    });
}

// ── Generate monthly invoices for all active tenants ──────────────────────
export function useGenerateMonthlyInvoices() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ month }: { month?: Date } = {}) => {
            const targetMonth = month || new Date();
            const periodStart = startOfMonth(targetMonth);
            const periodEnd = endOfMonth(targetMonth);
            const dueDate = addDays(periodStart, 5); // Due on the 5th
            const monthLabel = format(periodStart, 'yyyy-MM');

            // Fetch all active subscriptions with a monthly rate set
            const { data: subs, error: subErr } = await supabase
                .from('tenant_subscriptions')
                .select('org_id, monthly_rate_cents, org:organizations(name)')
                .gt('monthly_rate_cents', 0)
                .in('status', ['active', 'trialing']);

            if (subErr) throw subErr;
            if (!subs?.length) return { created: 0, skipped: 0 };

            // Check which orgs already have an invoice for this period
            const orgIds = subs.map(s => s.org_id);
            const { data: existing } = await supabase
                .from('tenant_invoices')
                .select('org_id')
                .in('org_id', orgIds)
                .eq('period_start', format(periodStart, 'yyyy-MM-dd'));

            const existingSet = new Set((existing || []).map(e => e.org_id));

            // Build invoices for orgs that don't have one yet
            const toCreate = subs
                .filter(s => !existingSet.has(s.org_id))
                .map((s, i) => ({
                    org_id: s.org_id,
                    invoice_number: `INV-${monthLabel}-${String(i + 1).padStart(3, '0')}`,
                    period_start: format(periodStart, 'yyyy-MM-dd'),
                    period_end: format(periodEnd, 'yyyy-MM-dd'),
                    amount_cents: s.monthly_rate_cents,
                    status: 'pending' as const,
                    due_date: format(dueDate, 'yyyy-MM-dd'),
                }));

            if (toCreate.length > 0) {
                const { error: insertErr } = await supabase
                    .from('tenant_invoices')
                    .insert(toCreate);
                if (insertErr) throw insertErr;
            }

            return { created: toCreate.length, skipped: existingSet.size };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['org-invoices'] });
        },
    });
}

// ── Auto-mark overdue invoices ────────────────────────────────────────────
export function useAutoMarkOverdue() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const today = format(new Date(), 'yyyy-MM-dd');
            const { data, error } = await supabase
                .from('tenant_invoices')
                .update({
                    status: 'overdue',
                    updated_at: new Date().toISOString(),
                })
                .eq('status', 'pending')
                .lt('due_date', today)
                .select('id');
            if (error) throw error;
            return { updated: data?.length || 0 };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
            queryClient.invalidateQueries({ queryKey: ['org-invoices'] });
        },
    });
}
