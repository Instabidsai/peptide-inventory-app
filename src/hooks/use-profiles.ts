import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

export type UserRole = 'admin' | 'sales_rep' | 'staff' | 'super_admin';

export interface UserProfile {
    id: string;
    user_id: string;
    full_name: string | null;
    email?: string | null;
    role: UserRole;
    commission_rate: number;
    price_multiplier?: number;
    pricing_mode?: string;
    cost_plus_markup?: number;
    partner_tier?: string;
    overhead_per_unit: number; // Defaults to 4.00
    credit_balance: number; // Partner's wallet balance
    org_id: string;
    parent_rep_id?: string | null;
}

export function useProfile() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ['profile', user?.id],
        queryFn: async () => {
            if (!user) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('Profile not found');
            return data as UserProfile;
        },
        enabled: !!user,
    });
}

// Admin hook to see all reps
export function useReps() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['reps', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'sales_rep')
                .eq('org_id', profile!.org_id!);

            if (error) throw error;
            return data as UserProfile[];
        },
        enabled: !!user && !!profile?.org_id,
    });
}

// Fetch a specific rep's profile (for Admin Preview)
export function useRepProfile(repId: string | null) {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['profile', repId, profile?.org_id],
        queryFn: async () => {
            if (!repId) return null;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', repId)
                .eq('org_id', profile!.org_id!)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('Rep profile not found');
            return data as UserProfile;
        },
        enabled: !!repId && !!user && !!profile?.org_id,
    });
}

// Fetch all profiles that are NOT already sales reps (potential partner candidates)
export function useTeamMembers() {
    const { user, profile } = useAuth();

    return useQuery({
        queryKey: ['team_candidates', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .neq('role', 'sales_rep') // Only exclude users who are already partners
                .eq('org_id', profile!.org_id!)
                .order('full_name', { ascending: true });

            if (error) throw error;
            return data as UserProfile[];
        },
        enabled: !!user && !!profile?.org_id,
    });
}

export function useUpdateProfile() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<UserProfile> & { id: string }) => {
            const { data, error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', id)
                .select();

            if (error) {
                logger.error('[useUpdateProfile] Error:', error);
                throw error;
            }

            // If no rows returned, RLS silently blocked the update
            if (!data || data.length === 0) {
                throw new Error('Update blocked — check RLS policies on profiles table');
            }

            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reps'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            toast({ title: 'Profile updated' });
        },
        onError: (error: Error) => {
            logger.error('[useUpdateProfile] Mutation error:', error);
            toast({ variant: 'destructive', title: 'Update failed', description: error.message });
        },
    });
}
