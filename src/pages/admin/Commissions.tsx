
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Check, DollarSign, Wallet } from 'lucide-react';
import { format } from 'date-fns';

export default function Commissions() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: commissions, isLoading } = useQuery({
        queryKey: ['admin_commissions'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
          id,
          created_at,
          total_amount,
          commission_amount,
          commission_status,
          rep_id,
          profiles:rep_id ( full_name, credit_balance )
        `)
                .gt('commission_amount', 0)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    const updateStatus = useMutation({
        mutationFn: async ({ id, status, amount, repName }: { id: string; status: string; amount: number; repName: string }) => {
            // 1. Update Order Status
            const { error } = await supabase
                .from('sales_orders')
                .update({ commission_status: status })
                .eq('id', id);
            if (error) throw error;

            // 2. If Paying Cash, Record Expense
            if (status === 'paid') {
                const { error: expenseError } = await supabase
                    .from('expenses')
                    .insert({
                        date: new Date().toISOString().split('T')[0],
                        category: 'commission',
                        amount: amount,
                        description: `Commission Payout for Order #${id.slice(0, 8)}`,
                        recipient: repName,
                        payment_method: 'wire', // Default or prompt
                        status: 'paid',
                        related_sales_order_id: id
                    });
                if (expenseError) throw expenseError;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_commissions'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] }); // Refresh financials
            toast({ title: 'Commission paid & expense recorded' });
        },
        onError: (err) => {
            toast({ title: 'Error updating commission', description: err.message, variant: 'destructive' });
        }
    });

    const grantCredit = useMutation({
        mutationFn: async ({ orderId, repId, amount }: { orderId: string; repId: string; amount: number }) => {
            // 1. Update Profile Balance (increment)
            // We need to fetch current first to be safe or use an RPC inc function, but let's do read-modify-write for MVP
            const { data: profile } = await supabase.from('profiles').select('credit_balance').eq('id', repId).single();
            const newBalance = (Number(profile?.credit_balance) || 0) + Number(amount);

            const { error: profileError } = await supabase
                .from('profiles')
                .update({ credit_balance: newBalance })
                .eq('id', repId);

            if (profileError) throw profileError;

            // 2. Mark Commission as Credited
            const { error: orderError } = await supabase
                .from('sales_orders')
                .update({ commission_status: 'credited' })
                .eq('id', orderId);

            if (orderError) throw orderError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_commissions'] });
            toast({ title: 'Credit granted successfully' });
        },
        onError: (err) => {
            toast({ title: 'Error granting credit', description: err.message, variant: 'destructive' });
        }
    });

    if (isLoading) return <div className="p-8">Loading commissions...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Commissions</h1>
                <p className="text-muted-foreground">Manage partner payouts and store credit.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pending Commissions</CardTitle>
                    <CardDescription>Review and payout commissions for sales orders.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Partner</TableHead>
                                <TableHead>Order Value</TableHead>
                                <TableHead>Commission (20% Profit)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {commissions?.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(new Date(item.created_at), 'MMM d, yyyy')}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{(item.profiles as any)?.full_name || 'Unknown'}</span>
                                            <span className="text-xs text-muted-foreground">Credit: ${(item.profiles as any)?.credit_balance || 0}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>${item.total_amount}</TableCell>
                                    <TableCell className="font-bold text-green-600">${item.commission_amount}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            item.commission_status === 'paid' ? 'default' :
                                                item.commission_status === 'credited' ? 'secondary' :
                                                    'outline'
                                        }>
                                            {item.commission_status || 'pending'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {(!item.commission_status || item.commission_status === 'pending') && (
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 gap-1"
                                                    onClick={() => updateStatus.mutate({
                                                        id: item.id,
                                                        status: 'paid',
                                                        amount: item.commission_amount,
                                                        repName: (item.profiles as any)?.full_name || 'Unknown'
                                                    })}
                                                >
                                                    <DollarSign className="h-3.5 w-3.5" />
                                                    Pay Cash
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                                                    onClick={() => grantCredit.mutate({ orderId: item.id, repId: item.rep_id, amount: item.commission_amount })}
                                                >
                                                    <Wallet className="h-3.5 w-3.5" />
                                                    Grant Credit
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {commissions?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                        No commissions found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
