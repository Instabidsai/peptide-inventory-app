
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function PeptideSuggestions({ peptideId }: { peptideId: string }) {
    const queryClient = useQueryClient();
    const [selectedSupplement, setSelectedSupplement] = useState<string>('');

    // Fetch linked suggestions
    const { data: suggestions, isLoading: loadingSuggestions } = useQuery({
        queryKey: ['peptide-suggestions', peptideId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('peptide_suggested_supplements')
                .select('*, supplements(*)')
                .eq('peptide_id', peptideId);
            if (error) throw error;
            return data;
        },
    });

    // Fetch all supplements for dropdown
    const { data: allSupplements } = useQuery({
        queryKey: ['admin-supplements'],
        queryFn: async () => {
            const { data, error } = await supabase.from('supplements').select('*').order('name');
            if (error) throw error;
            return data;
        },
    });

    // Add mutation
    const addSuggestion = useMutation({
        mutationFn: async (supplementId: string) => {
            const { error } = await supabase
                .from('peptide_suggested_supplements')
                .insert({ peptide_id: peptideId, supplement_id: supplementId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['peptide-suggestions', peptideId] });
            toast.success('Suggestion added');
            setSelectedSupplement('');
        },
        onError: (err) => toast.error('Failed to add suggestion: ' + err.message),
    });

    // Remove mutation
    const removeSuggestion = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('peptide_suggested_supplements').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['peptide-suggestions', peptideId] });
            toast.success('Suggestion removed');
        },
        onError: (err) => toast.error('Failed to remove suggestion'),
    });

    // Filter available supplements (exclude already added)
    const existingSpecializedIds = new Set(suggestions?.map(s => s.supplement_id));
    const availableSupplements = allSupplements?.filter(s => !existingSpecializedIds.has(s.id)) || [];

    return (
        <div className="space-y-6">
            <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                    <Label>Add Supplement Suggestion</Label>
                    <Select value={selectedSupplement} onValueChange={setSelectedSupplement}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a supplement..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableSupplements.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    onClick={() => selectedSupplement && addSuggestion.mutate(selectedSupplement)}
                    disabled={!selectedSupplement || addSuggestion.isPending}
                >
                    {addSuggestion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Add
                </Button>
            </div>

            <div className="border rounded-md divide-y">
                {loadingSuggestions ? (
                    <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : suggestions?.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                        No suggestions linked yet.
                    </div>
                ) : (
                    suggestions?.map((item) => (
                        <div key={item.id} className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {item.supplements.image_url && (
                                    <img src={item.supplements.image_url} alt={item.supplements.name} className="w-8 h-8 rounded object-cover bg-muted" loading="lazy" />
                                )}
                                <span className="font-medium">{item.supplements.name}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remove suggestion"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeSuggestion.mutate(item.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
