import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from '@/data/protocol-knowledge';
import { toast } from 'sonner';

interface DbProtocolTemplate {
    id: string;
    org_id: string;
    name: string;
    description: string | null;
    category: string;
    icon: string;
    peptide_names: string[];
    default_tier_id: string | null;
    sort_order: number;
    is_active: boolean;
}

function toProtocolTemplate(row: DbProtocolTemplate): ProtocolTemplate & { id: string } {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        category: (row.category as ProtocolTemplate['category']) || 'full',
        icon: row.icon || 'Sparkles',
        peptideNames: row.peptide_names ?? [],
        defaultTierId: row.default_tier_id ?? undefined,
    };
}

export function useOrgProtocolTemplates() {
    const { profile } = useAuth();
    const [templates, setTemplates] = useState<(ProtocolTemplate & { id: string })[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const orgId = profile?.org_id;

    const fetchTemplates = useCallback(async () => {
        if (!orgId) {
            // Fallback to hardcoded when no org
            setTemplates(PROTOCOL_TEMPLATES.map((t, i) => ({ ...t, id: `static-${i}` })));
            setIsLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('protocol_templates')
            .select('id, org_id, name, description, category, icon, peptide_names, default_tier_id, sort_order, is_active')
            .eq('org_id', orgId)
            .eq('is_active', true)
            .order('sort_order');

        if (error) {
            console.error('[useOrgProtocolTemplates] fetch error:', error.message);
            // Fallback to hardcoded
            setTemplates(PROTOCOL_TEMPLATES.map((t, i) => ({ ...t, id: `static-${i}` })));
        } else if (data && data.length > 0) {
            setTemplates((data as DbProtocolTemplate[]).map(toProtocolTemplate));
        } else {
            // No org templates yet — use hardcoded as fallback
            setTemplates(PROTOCOL_TEMPLATES.map((t, i) => ({ ...t, id: `static-${i}` })));
        }
        setIsLoading(false);
    }, [orgId]);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    const createTemplate = useCallback(async (t: Omit<ProtocolTemplate, 'id'> & { sortOrder?: number }) => {
        if (!orgId) return;
        const { error } = await supabase.from('protocol_templates').insert({
            org_id: orgId,
            name: t.name,
            description: t.description,
            category: t.category,
            icon: t.icon,
            peptide_names: t.peptideNames,
            default_tier_id: t.defaultTierId ?? null,
            sort_order: t.sortOrder ?? 0,
        });
        if (error) {
            toast.error('Failed to create template: ' + error.message);
        } else {
            toast.success(`Template "${t.name}" created`);
            fetchTemplates();
        }
    }, [orgId, fetchTemplates]);

    const updateTemplate = useCallback(async (id: string, updates: Partial<ProtocolTemplate> & { sortOrder?: number; isActive?: boolean }) => {
        const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.icon !== undefined) payload.icon = updates.icon;
        if (updates.peptideNames !== undefined) payload.peptide_names = updates.peptideNames;
        if (updates.defaultTierId !== undefined) payload.default_tier_id = updates.defaultTierId;
        if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder;
        if (updates.isActive !== undefined) payload.is_active = updates.isActive;

        const { error } = await supabase.from('protocol_templates').update(payload).eq('id', id);
        if (error) {
            toast.error('Failed to update template: ' + error.message);
        } else {
            toast.success('Template updated');
            fetchTemplates();
        }
    }, [fetchTemplates]);

    const deleteTemplate = useCallback(async (id: string) => {
        const { error } = await supabase.from('protocol_templates').delete().eq('id', id);
        if (error) {
            toast.error('Failed to delete template: ' + error.message);
        } else {
            toast.success('Template deleted');
            fetchTemplates();
        }
    }, [fetchTemplates]);

    return { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, refetch: fetchTemplates };
}
