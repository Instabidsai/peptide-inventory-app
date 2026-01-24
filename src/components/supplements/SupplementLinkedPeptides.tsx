
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { usePeptides } from '@/hooks/use-peptides';

export function SupplementLinkedPeptides({ supplementId }: { supplementId: string }) {
    const queryClient = useQueryClient();
    const [selectedPeptide, setSelectedPeptide] = useState<string>('');
    const { data: peptides } = usePeptides();

    // Fetch linked peptides
    const { data: links, isLoading: loadingLinks } = useQuery({
        queryKey: ['supplement-links', supplementId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('peptide_suggested_supplements')
                .select('*, peptides(*)')
                .eq('supplement_id', supplementId);
            if (error) throw error;
            return data;
        },
    });

    // Add mutation
    const addLink = useMutation({
        mutationFn: async (peptideId: string) => {
            const { error } = await supabase
                .from('peptide_suggested_supplements')
                .insert({ peptide_id: peptideId, supplement_id: supplementId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplement-links', supplementId] });
            toast.success('Link created');
            setSelectedPeptide('');
        },
        onError: (err) => toast.error('Failed to link: ' + err.message),
    });

    // Remove mutation
    const removeLink = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('peptide_suggested_supplements').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplement-links', supplementId] });
            toast.success('Link removed');
        },
        onError: (err) => toast.error('Failed to remove link'),
    });

    // Filter available peptides
    const existingPeptideIds = new Set(links?.map(l => l.peptide_id));
    const availablePeptides = peptides?.filter(p => !existingPeptideIds.has(p.id)) || [];

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm text-blue-800">
                When this supplement is linked to a peptide, the system will prompt you to add it when assigning that peptide to a client.
            </div>

            <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                    <Label>Link a Peptide</Label>
                    <Select value={selectedPeptide} onValueChange={setSelectedPeptide}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a peptide..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availablePeptides.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    onClick={() => selectedPeptide && addLink.mutate(selectedPeptide)}
                    disabled={!selectedPeptide || addLink.isPending}
                >
                    {addLink.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Link
                </Button>
            </div>

            <div className="border rounded-md divide-y">
                {loadingLinks ? (
                    <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : links?.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                        Not linked to any peptides yet.
                    </div>
                ) : (
                    links?.map((item) => (
                        <div key={item.id} className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-muted p-2 rounded">
                                    <LinkIcon className="h-4 w-4" />
                                </div>
                                <span className="font-medium">{item.peptides.name}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeLink.mutate(item.id)}
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
