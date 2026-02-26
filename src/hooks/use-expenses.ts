
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ExpenseCategory = 'startup' | 'operating' | 'inventory' | 'commission' | 'other';

export interface Expense {
    id: string;
    created_at: string;
    org_id: string;
    date: string;
    category: ExpenseCategory;
    amount: number;
    description: string | null;
    recipient: string | null;
    payment_method: string | null;
    status: 'paid' | 'pending';
    related_order_id?: string;
    related_sales_order_id?: string;
}

export function useExpenses() {
    const { profile } = useAuth();
    const orgId = profile?.org_id;
    return useQuery({
        queryKey: ['expenses', orgId],
        queryFn: async () => {
            const query = supabase
                .from('expenses')
                .select('*')
                .eq('org_id', orgId!)
                .order('date', { ascending: false });

            const { data, error } = await query;
            if (error) throw error;
            return data as Expense[];
        },
        enabled: !!orgId,
    });
}

export function useCreateExpense() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile } = useAuth();

    return useMutation({
        mutationFn: async (expense: Partial<Expense>) => {
            if (!profile?.org_id) throw new Error('No organization found');

            const { error } = await supabase
                .from('expenses')
                .insert([{ ...expense, org_id: profile.org_id }]);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            toast({ title: 'Expense recorded' });
        },
        onError: (err) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });
}

export function useDeleteExpense() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
            toast({ title: 'Expense deleted' });
        },
        onError: (err) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });
}
