import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { toast } from 'sonner';

export interface HouseholdMember {
    id: string;
    name: string;
    email: string | null;
    household_role: 'owner' | 'member';
    is_linked: boolean;
}

/** Returns all household members for a given contact. Empty array if no household. */
export function useHouseholdMembers(contactId?: string) {
    return useQuery({
        queryKey: ['household-members', contactId],
        queryFn: async () => {
            if (!contactId) return [];
            const { data, error } = await supabase
                .rpc('get_household_members', { p_contact_id: contactId });
            if (error) throw error;
            return (data ?? []) as HouseholdMember[];
        },
        enabled: !!contactId,
    });
}

/** Admin action: creates household + adds a member contact. Returns new contact UUID. */
export function useAddHouseholdMember(ownerContactId?: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ name, email }: { name: string; email?: string }) => {
            if (!ownerContactId) throw new Error('Owner contact ID required');
            const { data, error } = await supabase
                .rpc('add_household_member', {
                    p_owner_contact_id: ownerContactId,
                    p_member_name: name,
                    p_member_email: email || null,
                });
            if (error) throw error;
            return data as string;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['household-members', ownerContactId] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['contact', ownerContactId] });
            toast.success('Household member added');
        },
        onError: (e: Error) => toast.error(`Failed to add member: ${e.message}`),
    });
}

/** Admin action: removes a member from the household (cannot remove owner). */
export function useRemoveHouseholdMember() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (memberContactId: string) => {
            const { data, error } = await supabase
                .rpc('remove_household_member', { p_member_contact_id: memberContactId });
            if (error) throw error;
            const result = data as { success: boolean; error?: string };
            if (!result.success) throw new Error(result.error || 'Remove failed');
            return result;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['household-members'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            toast.success('Member removed from household');
        },
        onError: (e: Error) => toast.error(`Failed to remove member: ${e.message}`),
    });
}

/** Admin action: sends invite to a household member contact via existing invite-user Edge Function. */
export function useInviteHouseholdMember() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ contactId, email }: { contactId: string; email: string }) => {
            const { data, error } = await supabase.functions.invoke('invite-user', {
                body: {
                    email,
                    contact_id: contactId,
                    tier: 'family',
                    redirect_origin: window.location.origin,
                },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Invite failed');
            return data as { action_link: string; success: boolean };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['household-members'] });
            try {
                navigator.clipboard.writeText(data.action_link);
                toast.success('Invite link copied to clipboard');
            } catch {
                toast.success('Invite link generated');
            }
        },
        onError: (e: Error) => toast.error(`Invite failed: ${e.message}`),
    });
}
