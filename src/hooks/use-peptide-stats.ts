
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePeptideStats() {
    return useQuery({
        queryKey: ['peptide-stats'],
        queryFn: async () => {
            // Fetch all in-stock bottles and their related peptide_id via lots
            const { data, error } = await supabase
                .from('bottles')
                .select('id, status, lots!inner(peptide_id)')
                .eq('status', 'in_stock');

            if (error) throw error;

            // Aggregate counts by peptide_id
            const stats: Record<string, number> = {};

            data.forEach((bottle) => {
                const peptideId = bottle.lots.peptide_id;
                stats[peptideId] = (stats[peptideId] || 0) + 1;
            });

            return stats;
        },
    });
}
