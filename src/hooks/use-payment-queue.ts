
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────

export interface PaymentQueueItem {
    id: string;
    org_id: string;
    gmail_message_id: string;
    sender_name: string | null;
    amount: number;
    payment_method: string;
    email_subject: string | null;
    email_snippet: string | null;
    email_date: string | null;
    matched_contact_id: string | null;
    matched_movement_id: string | null;
    status: 'pending' | 'auto_posted' | 'approved' | 'rejected' | 'skipped';
    confidence: 'high' | 'medium' | 'low';
    auto_posted_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    notes: string | null;
    created_at: string;
    ai_suggested_contact_id: string | null;
    ai_reasoning: string | null;
    contacts?: { id: string; name: string } | null;
    movements?: { id: string; movement_date: string; contact_id: string | null } | null;
    ai_contact?: { id: string; name: string } | null;
}

export interface AutomationModule {
    id: string;
    org_id: string;
    module_type: string;
    enabled: boolean;
    config: Record<string, any>;
    last_run_at: string | null;
    run_count: number;
    created_at: string;
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useAutomationModules() {
    const { organization } = useAuth();
    const orgId = organization?.id;

    return useQuery({
        queryKey: ['automation_modules', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('automation_modules')
                .select('*')
                .eq('org_id', orgId!)
                .order('created_at');

            if (error) throw error;
            return data as AutomationModule[];
        },
        enabled: !!orgId,
    });
}

export function usePaymentQueue(statusFilter?: string) {
    const { organization } = useAuth();
    const orgId = organization?.id;

    return useQuery({
        queryKey: ['payment_queue', orgId, statusFilter],
        queryFn: async () => {
            let query = supabase
                .from('payment_email_queue')
                .select('*, contacts:matched_contact_id(id, name), movements:matched_movement_id(id, movement_date, contact_id), ai_contact:ai_suggested_contact_id(id, name)')
                .eq('org_id', orgId!)
                .order('created_at', { ascending: false })
                .limit(100);

            if (statusFilter && statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as PaymentQueueItem[];
        },
        enabled: !!orgId,
    });
}

export function usePendingPaymentCount() {
    const { organization } = useAuth();
    const orgId = organization?.id;

    return useQuery({
        queryKey: ['payment_queue_pending_count', orgId],
        queryFn: async () => {
            const { count, error } = await supabase
                .from('payment_email_queue')
                .select('id', { count: 'exact', head: true })
                .eq('org_id', orgId!)
                .eq('status', 'pending');

            if (error) throw error;
            return count || 0;
        },
        enabled: !!orgId,
        refetchInterval: 60000,
    });
}

// ── Mutations ──────────────────────────────────────────────────────

export function useApprovePayment() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({
            queueItemId,
            movementId,
            amount,
            paymentMethod,
            paymentDate,
        }: {
            queueItemId: string;
            movementId: string;
            amount: number;
            paymentMethod: string;
            paymentDate: string;
        }) => {
            // 1. Update the movement as paid
            const { error: movErr } = await supabase
                .from('movements')
                .update({
                    payment_status: 'paid',
                    payment_method: paymentMethod,
                    amount_paid: amount,
                    payment_date: paymentDate,
                })
                .eq('id', movementId);

            if (movErr) throw movErr;

            // 2. Mark the queue item as approved
            const { error: queueErr } = await supabase
                .from('payment_email_queue')
                .update({
                    status: 'approved',
                    reviewed_by: user?.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', queueItemId);

            if (queueErr) throw queueErr;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            queryClient.invalidateQueries({ queryKey: ['payment_queue_pending_count'] });
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            toast({ title: 'Payment approved', description: 'Movement marked as paid.' });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to approve', description: err.message });
        },
    });
}

export function useRejectPayment() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ queueItemId, notes }: { queueItemId: string; notes?: string }) => {
            const { error } = await supabase
                .from('payment_email_queue')
                .update({
                    status: 'rejected',
                    reviewed_by: user?.id,
                    reviewed_at: new Date().toISOString(),
                    notes: notes || null,
                })
                .eq('id', queueItemId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            queryClient.invalidateQueries({ queryKey: ['payment_queue_pending_count'] });
            toast({ title: 'Payment rejected' });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to reject', description: err.message });
        },
    });
}

export function useTriggerScan() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke('check-payment-emails', {
                body: {},
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            queryClient.invalidateQueries({ queryKey: ['payment_queue_pending_count'] });
            queryClient.invalidateQueries({ queryKey: ['automation_modules'] });
            toast({ title: 'Scan complete', description: `Processed ${data?.results?.[0]?.processed ?? 0} emails.` });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Scan failed', description: err.message });
        },
    });
}

export function useToggleAutomation() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { organization } = useAuth();

    return useMutation({
        mutationFn: async ({ moduleType, enabled }: { moduleType: string; enabled: boolean }) => {
            const orgId = organization?.id;
            if (!orgId) throw new Error('No organization');

            // Upsert: insert if not exists, update if exists
            const { error } = await supabase
                .from('automation_modules')
                .upsert(
                    { org_id: orgId, module_type: moduleType, enabled },
                    { onConflict: 'org_id,module_type' }
                );

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['automation_modules'] });
            toast({ title: 'Automation updated' });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to update', description: err.message });
        },
    });
}

export function useSkipPayment() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async ({ queueItemId }: { queueItemId: string }) => {
            const { error } = await supabase
                .from('payment_email_queue')
                .update({
                    status: 'skipped',
                    reviewed_by: user?.id,
                    reviewed_at: new Date().toISOString(),
                })
                .eq('id', queueItemId);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            queryClient.invalidateQueries({ queryKey: ['payment_queue_pending_count'] });
            toast({ title: 'Payment skipped' });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to skip', description: err.message });
        },
    });
}

export function useReassignContact() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user, organization } = useAuth();

    return useMutation({
        mutationFn: async ({
            queueItemId,
            contactId,
            senderName,
        }: {
            queueItemId: string;
            contactId: string;
            senderName: string;
        }) => {
            const orgId = organization?.id;
            if (!orgId) throw new Error('No organization');

            // 1. Update queue item with new contact
            const { error: queueErr } = await supabase
                .from('payment_email_queue')
                .update({ matched_contact_id: contactId })
                .eq('id', queueItemId);

            if (queueErr) throw queueErr;

            // 2. Save sender alias so future scans auto-match
            const { error: aliasErr } = await supabase
                .from('sender_aliases')
                .upsert(
                    {
                        org_id: orgId,
                        sender_name: senderName.toUpperCase().trim(),
                        contact_id: contactId,
                        created_by: user?.id,
                    },
                    { onConflict: 'org_id,sender_name' }
                );

            if (aliasErr) throw aliasErr;

            // 3. Find an unpaid movement for this contact
            const { data: movements } = await supabase
                .from('movements')
                .select('id, movement_date')
                .eq('contact_id', contactId)
                .neq('payment_status', 'paid')
                .order('movement_date', { ascending: false })
                .limit(1);

            const movementId = movements?.[0]?.id || null;

            if (movementId) {
                await supabase
                    .from('payment_email_queue')
                    .update({ matched_movement_id: movementId })
                    .eq('id', queueItemId);
            }

            return { movementId };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            toast({
                title: 'Contact reassigned',
                description: data.movementId
                    ? 'Matching movement found — ready to approve.'
                    : 'No unpaid movement found for this contact.',
            });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to reassign', description: err.message });
        },
    });
}

export function useAcceptAiSuggestion() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { user, organization } = useAuth();

    return useMutation({
        mutationFn: async ({
            queueItemId,
            aiContactId,
            senderName,
        }: {
            queueItemId: string;
            aiContactId: string;
            senderName: string;
        }) => {
            const orgId = organization?.id;
            if (!orgId) throw new Error('No organization');

            // 1. Accept the AI suggestion — set matched_contact_id
            const { error: queueErr } = await supabase
                .from('payment_email_queue')
                .update({ matched_contact_id: aiContactId })
                .eq('id', queueItemId);

            if (queueErr) throw queueErr;

            // 2. Save alias for future auto-matching
            const { error: aliasErr } = await supabase
                .from('sender_aliases')
                .upsert(
                    {
                        org_id: orgId,
                        sender_name: senderName.toUpperCase().trim(),
                        contact_id: aiContactId,
                        created_by: user?.id,
                    },
                    { onConflict: 'org_id,sender_name' }
                );

            if (aliasErr) throw aliasErr;

            // 3. Find unpaid movement for this contact
            const { data: movements } = await supabase
                .from('movements')
                .select('id, movement_date')
                .eq('contact_id', aiContactId)
                .neq('payment_status', 'paid')
                .order('movement_date', { ascending: false })
                .limit(1);

            const movementId = movements?.[0]?.id || null;

            if (movementId) {
                await supabase
                    .from('payment_email_queue')
                    .update({ matched_movement_id: movementId })
                    .eq('id', queueItemId);
            }

            return { movementId };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['payment_queue'] });
            toast({
                title: 'AI suggestion accepted',
                description: data.movementId
                    ? 'Movement matched — ready to approve.'
                    : 'No unpaid movement found for this contact.',
            });
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Failed to accept suggestion', description: err.message });
        },
    });
}
