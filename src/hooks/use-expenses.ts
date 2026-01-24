
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';

export type ExpenseCategory = 'startup' | 'operating' | 'inventory' | 'commission' | 'other';

export interface Expense {
    id: string;
    created_at: string;
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
    return useQuery({
        queryKey: ['expenses'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('expenses')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            return data as Expense[];
        },
    });
}

export function useCreateExpense() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (expense: Partial<Expense>) => {
            const { error } = await supabase
                .from('expenses')
                .insert([expense]);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
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
            toast({ title: 'Expense deleted' });
        },
        onError: (err) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });
}
