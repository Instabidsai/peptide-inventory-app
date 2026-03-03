import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

/**
 * Self-healing client profile hook.
 *
 * 1. Checks contacts by linked_user_id exactly once.
 * 2. If null, immediately fires ensure_customer_contact (fire and forget)
 * 3. Sets up a Supabase Realtime subscription that automatically
 *    invalidates and refetches the query the millisecond the contact is created.
 */
export function useClientProfile() {
    const { user, profile } = useAuth();
    const queryClient = useQueryClient();
    const healAttempted = useRef(false);

    // Setup Realtime subscription to detect auto-creation instantly
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`client_profile_${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'contacts',
                    filter: `linked_user_id=eq.${user.id}`,
                },
                (payload) => {
                    logger.info('[useClientProfile] Realtime contact detected!', payload);
                    // Instantly trigger a refetch
                    queryClient.invalidateQueries({ queryKey: ['client-profile', user.id] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, queryClient]);

    return useQuery({
        queryKey: ['client-profile', user?.id],
        queryFn: async () => {
            if (!user) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('linked_user_id', user.id)
                .maybeSingle();

            if (error) {
                console.warn('[useClientProfile] contacts query failed, treating as no contact:', error.message);
            }

            if (data) {
                healAttempted.current = false;
                return data;
            }

            // No contact found — instantly fire self-healing
            if (!healAttempted.current && profile?.org_id) {
                healAttempted.current = true;
                logger.warn('[useClientProfile] No contact found — calling ensure_customer_contact RPC explicitly');

                // Fire and forget — Realtime sub or the .then() block will pick it up
                supabase.rpc('ensure_customer_contact', { p_user_id: user.id })
                    .then(({ data: healResult, error: healError }) => {
                        if (healError) {
                            logger.error('[useClientProfile] ensure_customer_contact failed:', healError.message);
                        } else if (healResult?.created || healResult?.linked) {
                            logger.info('[useClientProfile] Self-healed contact manually:', healResult);
                            // Force invalidate if Realtime event hasn't already fired
                            queryClient.invalidateQueries({ queryKey: ['client-profile', user.id] });
                        }
                    })
                    .catch(e => logger.error('[useClientProfile] Self-heal exception:', e));
            }

            return null;
        },
        enabled: !!user,
        staleTime: 5 * 60 * 1000, // Keep cached for 5 mins to prevent heavy re-querying
    });
}
