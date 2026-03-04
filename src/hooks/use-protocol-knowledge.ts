import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { PROTOCOL_KNOWLEDGE, PROTOCOL_TEMPLATES, type PeptideKnowledge, type ProtocolTemplate } from '@/data/protocol-knowledge';

export const PROTOCOL_KNOWLEDGE_KEYS = {
    all: ['protocol-knowledge'] as const,
    list: (orgId: string | undefined) => [...PROTOCOL_KNOWLEDGE_KEYS.all, 'list', orgId] as const,
    templates: (orgId: string | undefined) => ['protocol-templates', 'list', orgId] as const,
};

export async function fetchProtocolKnowledgeMap(orgId: string | undefined): Promise<Record<string, PeptideKnowledge>> {
    if (!orgId) return PROTOCOL_KNOWLEDGE;

    try {
        const { data, error } = await (supabase as any)
            .from('protocol_knowledge')
            .select('*')
            .eq('organization_id', orgId)
            .eq('is_active', true);

        if (error) {
            console.warn('Failed to fetch protocol knowledge from DB, using fallback:', error);
            return PROTOCOL_KNOWLEDGE;
        }

        if (!data || data.length === 0) {
            // Safe fallback before migration is fully seeded
            return PROTOCOL_KNOWLEDGE;
        }

        // Transform DB rows into the expected Record<string, PeptideKnowledge> shape
        const knowledgeMap: Record<string, PeptideKnowledge> = {};
        for (const row of data) {
            knowledgeMap[row.product_id] = {
                category: row.category,
                description: row.description,
                reconstitutionMl: row.reconstitution,
                warningText: row.warning,
                cyclePattern: row.cycle_pattern?.pattern,
                cyclePatternOptions: row.cycle_pattern?.options || [],
                supplementNotes: row.supplements || [],
                dosingTiers: row.dosing_tiers || [],
                dosageSchedule: row.dosage_schedule,
            } as any;
        }

        return knowledgeMap;
    } catch (err) {
        console.warn('Exception fetching protocol knowledge, using fallback:', err);
        return PROTOCOL_KNOWLEDGE;
    }
}

/**
 * Fetches protocol knowledge from the database, falling back to the static 
 * file if the database table is empty or the query fails (e.g. before migration is applied).
 */
export function useProtocolKnowledge() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;

    return useQuery({
        queryKey: PROTOCOL_KNOWLEDGE_KEYS.list(orgId ?? undefined),
        queryFn: () => fetchProtocolKnowledgeMap(orgId ?? undefined),
        // Cache indefinitely for this session unless explicitly invalidated
        staleTime: Infinity,
    });
}

/**
 * Hook to fetch protocol templates from the database, with static fallback.
 */
export function useDatabaseProtocolTemplates() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;

    return useQuery({
        queryKey: PROTOCOL_KNOWLEDGE_KEYS.templates(orgId ?? undefined),
        queryFn: async () => {
            if (!orgId) return PROTOCOL_TEMPLATES;

            try {
                // Try fetching from the custom protocol templates table first if it exists
                const { data, error } = await (supabase as any)
                    .from('protocol_templates')
                    .select('*')
                    .eq('organization_id', orgId)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.warn('Failed to fetch templates from DB, using fallback:', error);
                    return Object.values(PROTOCOL_TEMPLATES);
                }

                if (!data || data.length === 0) {
                    return Object.values(PROTOCOL_TEMPLATES);
                }

                return data as unknown as ProtocolTemplate[];
            } catch (err) {
                console.warn('Exception fetching protocol templates, using fallback:', err);
                return Object.values(PROTOCOL_TEMPLATES);
            }
        },
        staleTime: Infinity,
    });
}
