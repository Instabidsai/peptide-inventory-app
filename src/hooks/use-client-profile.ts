import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

/**
 * Self-healing client profile hook.
 *
 * 1. Checks contacts by linked_user_id.
 * 2. If null, fires ensure_customer_contact RPC (awaited, not fire-and-forget).
 * 3. Polls every 3s while contact is null (auto-stops once found).
 * 4. Realtime subscription as a backup instant-detect.
 * 5. Exposes resetHeal() so retry buttons can force a fresh heal attempt.
 */
export function useClientProfile() {
    const { user, profile } = useAuth();
    const queryClient = useQueryClient();
    const healAttempted = useRef(false);
    const healCount = useRef(0);
    const MAX_HEAL_ATTEMPTS = 3;
    // JWT swap handles impersonation — user.id IS the target user when impersonating
    const targetUserId = user?.id;

    // Allow external callers (e.g. retry button) to reset heal state
    const resetHeal = useCallback(() => {
        healAttempted.current = false;
        healCount.current = 0;
        queryClient.invalidateQueries({ queryKey: ['client-profile', targetUserId] });
    }, [queryClient, targetUserId]);

    // Setup Realtime subscription to detect auto-creation instantly
    useEffect(() => {
        if (!targetUserId) return;

        const channel = supabase
            .channel(`client_profile_${targetUserId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'contacts',
                    filter: `linked_user_id=eq.${targetUserId}`,
                },
                (payload) => {
                    logger.info('[useClientProfile] Realtime contact event!', payload.eventType);
                    queryClient.invalidateQueries({ queryKey: ['client-profile', targetUserId] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [targetUserId, queryClient]);

    const query = useQuery({
        queryKey: ['client-profile', targetUserId],
        queryFn: async () => {
            if (!targetUserId) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('linked_user_id', targetUserId)
                .maybeSingle();

            if (error) {
                logger.warn('[useClientProfile] contacts query failed:', error.message);
            }

            if (data) {
                healAttempted.current = false;
                healCount.current = 0;
                return data;
            }

            // No contact found — fire self-healing RPC (awaited, with retries)
            // Only self-heal for the real user, not when impersonating
            const isImpersonating = targetUserId !== user?.id;
            if (!isImpersonating && healCount.current < MAX_HEAL_ATTEMPTS && profile?.org_id) {
                healCount.current++;
                healAttempted.current = true;
                logger.warn(`[useClientProfile] No contact found — heal attempt ${healCount.current}/${MAX_HEAL_ATTEMPTS}`);

                try {
                    const { data: healResult, error: healError } = await supabase
                        .rpc('ensure_customer_contact', { p_user_id: targetUserId });

                    if (healError) {
                        logger.error('[useClientProfile] ensure_customer_contact failed:', healError.message);
                    } else if (healResult?.created || healResult?.linked) {
                        logger.info('[useClientProfile] Self-healed contact:', healResult);
                        const { data: freshContact } = await supabase
                            .from('contacts')
                            .select('*')
                            .eq('linked_user_id', targetUserId)
                            .maybeSingle();
                        if (freshContact) return freshContact;
                    }
                } catch (e) {
                    logger.error('[useClientProfile] Self-heal exception:', e);
                }
            }

            return null;
        },
        enabled: !!targetUserId,
        staleTime: 30_000, // 30s stale time (was 5min — too long for missing contacts)
        // Poll every 3s while contact is null, stop once found
        refetchInterval: (q) => {
            return q.state.data === null ? 3000 : false;
        },
    });

    return { ...query, resetHeal };
}
