import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

export function useVialActions(contactId?: string) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['client-inventory', contactId] });
    };

    const reconstitute = useMutation({
        mutationFn: async ({ vialId, waterMl, vialSizeMg }: {
            vialId: string; waterMl: number; vialSizeMg: number;
        }) => {
            const concentration = vialSizeMg / waterMl;
            const { error } = await supabase
                .from('client_inventory')
                .update({
                    water_added_ml: waterMl,
                    concentration_mg_ml: concentration,
                    reconstituted_at: new Date().toISOString(),
                })
                .eq('id', vialId);
            if (error) throw error;
            return { concentration };
        },
        onSuccess: (data) => {
            invalidate();
            toast({ title: 'Vial Mixed', description: `Concentration: ${data.concentration.toFixed(2)} mg/ml` });
        },
        onError: (e: Error) => toast({ variant: 'destructive', title: 'Error mixing vial', description: e.message }),
    });

    const setSchedule = useMutation({
        mutationFn: async ({ vialId, doseAmountMg, doseDays }: {
            vialId: string; doseAmountMg: number; doseDays: string[];
        }) => {
            const { error } = await supabase
                .from('client_inventory')
                .update({ dose_amount_mg: doseAmountMg, dose_days: doseDays })
                .eq('id', vialId);
            if (error) throw error;
        },
        onSuccess: () => {
            invalidate();
            toast({ title: 'Schedule Saved' });
        },
        onError: (e: Error) => toast({ variant: 'destructive', title: 'Error saving schedule', description: e.message }),
    });

    const logDose = useMutation({
        mutationFn: async ({ vialId, currentQty, doseMg }: {
            vialId: string; currentQty: number; doseMg: number;
        }) => {
            const newQty = Math.max(0, currentQty - doseMg);
            const { error } = await supabase
                .from('client_inventory')
                .update({
                    current_quantity_mg: newQty,
                    status: newQty <= 0 ? 'depleted' : 'active',
                })
                .eq('id', vialId);
            if (error) throw error;
            return { newQty };
        },
        onSuccess: (data) => {
            invalidate();
            toast({ title: 'Dose Logged', description: `${data.newQty.toFixed(1)}mg remaining` });
        },
        onError: (e: Error) => toast({ variant: 'destructive', title: 'Error logging dose', description: e.message }),
    });

    const markEmpty = useMutation({
        mutationFn: async (vialId: string) => {
            const { error } = await supabase
                .from('client_inventory')
                .update({ current_quantity_mg: 0, status: 'depleted' })
                .eq('id', vialId);
            if (error) throw error;
        },
        onSuccess: () => {
            invalidate();
            toast({ title: 'Vial Marked Empty' });
        },
        onError: (e: Error) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
    });

    return { reconstitute, setSchedule, logDose, markEmpty };
}
