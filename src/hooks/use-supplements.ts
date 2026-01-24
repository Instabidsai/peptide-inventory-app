
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { toast } from "sonner";

export type Supplement = {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    purchase_link: string | null;
    default_dosage: string | null;
    created_at: string;
};

export function useSupplements() {
    const queryClient = useQueryClient();

    const { data: supplements, isLoading, error } = useQuery({
        queryKey: ['supplements'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('supplements')
                .select('*')
                .order('name');

            if (error) {
                // If table doesn't exist yet, return empty to prevent crash during migration gap
                if (error.code === '42P01') return [];
                throw error;
            }
            return data as Supplement[];
        }
    });

    const createSupplement = useMutation({
        mutationFn: async (newSupplement: Omit<Supplement, 'id' | 'created_at'>) => {
            const { data, error } = await supabase
                .from('supplements')
                .insert(newSupplement)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements'] });
            toast.success("Supplement added");
        },
        onError: (err) => {
            toast.error(`Failed to add: ${err.message}`);
        }
    });

    const updateSupplement = useMutation({
        mutationFn: async (supplement: Partial<Supplement> & { id: string }) => {
            const { id, ...updates } = supplement;
            const { data, error } = await supabase
                .from('supplements')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements'] });
            toast.success("Supplement updated");
        },
        onError: (err) => {
            toast.error(`Failed to update: ${err.message}`);
        }
    });

    const deleteSupplement = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('supplements')
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplements'] });
            toast.success("Supplement deleted");
        },
        onError: (err) => {
            toast.error(`Failed to delete: ${err.message}`);
        }
    });

    return {
        supplements,
        isLoading,
        error,
        createSupplement,
        updateSupplement,
        deleteSupplement
    };
}
