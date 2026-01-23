
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Plus, ExternalLink, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function SuggestedStack({ activePeptideIds, existingSupplementIds }: { activePeptideIds: string[], existingSupplementIds: string[] }) {
    const queryClient = useQueryClient();

    const { data: suggestions, isLoading } = useQuery({
        queryKey: ['client-suggestions', activePeptideIds],
        queryFn: async () => {
            if (activePeptideIds.length === 0) return [];
            const { data, error } = await supabase
                .from('peptide_suggested_supplements')
                .select('*, supplements(*, peptide_suggested_supplements!inner(peptide_id))') // inner join logic? No, simple select
                // Supabase doesn't support complex "in" on joined column easily with JS SDK without filter chaining.
                // Simple approach: select * where peptide_id in list
                .in('peptide_id', activePeptideIds);

            if (error) throw error;

            // We also need to know WHICH peptide triggered it.
            // The query returns rows of { peptide_id, supplement_id, supplements: {...} }
            return data;
        },
        enabled: activePeptideIds.length > 0
    });

    // Filter out already added supplements
    const validSuggestions = suggestions?.filter(s => !existingSupplementIds.includes(s.supplement_id)) || [];

    // Deduplicate by supplement_id (pick first occurrence)
    const uniqueSuggestions = validSuggestions.filter((s, index, self) =>
        index === self.findIndex((t) => t.supplement_id === s.supplement_id)
    );

    if (!uniqueSuggestions || uniqueSuggestions.length === 0) return null;

    return (
        <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-700 delay-300">
            <div className="flex items-center gap-2 px-1">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Suggested For You</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {uniqueSuggestions.map((item) => (
                    <div key={item.id} className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-amber-500/10 via-background to-background p-4 transition-all hover:border-amber-500/50">
                        <div className="flex gap-4">
                            {item.supplements.image_url ? (
                                <img src={item.supplements.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                            ) : (
                                <div className="h-12 w-12 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                                    <Sparkles className="h-6 w-6" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold truncate">{item.supplements.name}</h4>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                    {item.reasoning || "Recommended pairing for your protocol."}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 flex gap-2">
                            {item.supplements.purchase_link && (
                                <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => window.open(item.supplements.purchase_link, '_blank')}>
                                    Buy Now <ExternalLink className="ml-1 h-3 w-3" />
                                </Button>
                            )}
                            {/* 
                                "Add to Daily" implies adding to protocol.
                                Since client can't edit protocol easily without "Create Supplement Stack" logic...
                                We rely on the User to Buy it first?
                                Or we create a self-assigned protocol item?
                                "Suggested suppliments then the can click and add tem to there daily once the bought them"
                                
                                So "Buy" is the primary action.
                                "Add to Daily" comes after they buy?
                                
                                Maybe we just show "Buy". 
                                The user said "click and add tem to there daily".
                                I'll add a button "Add to Stack".
                             */}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
