import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

export type UserRole = 'admin' | 'sales_rep' | 'staff';

export interface UserProfile {
    id: string;
    user_id: string;
    full_name: string | null;
    email?: string | null;
    role: UserRole;
    commission_rate: number;
    price_multiplier?: number;
    partner_tier?: string;
    overhead_per_unit: number; // Defaults to 4.00
    credit_balance: number; // Partner's wallet balance
    org_id: string;
    parent_rep_id?: string | null;
}

export function useProfile() {
    return useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error) throw error;
            return data as UserProfile;
        },
    });
}

// Admin hook to see all reps
export function useReps() {
    return useQuery({
        queryKey: ['reps'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'sales_rep');

            if (error) throw error;
            return data as UserProfile[];
        },
    });
}

// Fetch a specific rep's profile (for Admin Preview)
export function useRepProfile(repId: string | null) {
    return useQuery({
        queryKey: ['profile', repId],
        queryFn: async () => {
            if (!repId) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', repId)
                .single();

            if (error) throw error;
            return data as UserProfile;
        },
        enabled: !!repId,
    });
}

// Fetch all profiles that are NOT sales reps (potential candidates)
export function useTeamMembers() {
    return useQuery({
        queryKey: ['team_candidates'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('role', 'sales_rep') // Exclude existing reps
                .neq('role', 'admin')     // Exclude super admins? Maybe optional. Let's keep admins out for now.
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as UserProfile[];
        },
    });
}

export function useUpdateProfile() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<UserProfile> & { id: string }) => {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reps'] });
            toast({ title: 'Profile updated' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Update failed', description: error.message });
        },
    });
}
