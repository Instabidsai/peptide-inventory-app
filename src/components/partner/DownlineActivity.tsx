import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, TrendingUp, Network } from 'lucide-react';
import type { PartnerNode } from './types';

interface DownlineActivityProps {
    downline: PartnerNode[];
}

export function DownlineActivity({ downline }: DownlineActivityProps) {
    const downlineIds = downline.map(d => d.id);

    const { data: downlineSales, isLoading } = useQuery({
        queryKey: ['downline_activity', downlineIds],
        queryFn: async () => {
            if (downlineIds.length === 0) return [];

            // Get recent orders from downline partners
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id,
                    total_amount,
                    status,
                    created_at,
                    notes,
                    rep_id,
                    contacts (name),
                    sales_order_items (quantity)
                `)
                .in('rep_id', downlineIds)
                .order('created_at', { ascending: false })
                .limit(15);

            if (error) throw error;
            return data || [];
        },
        enabled: downlineIds.length > 0,
    });

    // Build a name lookup from downline
    const nameMap = new Map(downline.map(d => [d.id, d.full_name || d.email || 'Unknown']));

    const getTimeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Downline Activity
                </CardTitle>
                <CardDescription>Recent sales from your team</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : downlineSales && downlineSales.length > 0 ? (
                    <div className="space-y-3">
                        {downlineSales.map((sale) => {
                            const repName = nameMap.get(sale.rep_id) || 'Unknown';
                            const contacts = sale.contacts as { name: string } | null;
                            const clientName = contacts?.name || (sale.notes?.includes('SELF-ORDER') ? 'Self' : '\u2014');
                            const saleItems = (sale.sales_order_items || []) as { quantity: number }[];
                            const itemCount = saleItems.reduce((s, i) => s + (i.quantity || 0), 0);

                            return (
                                <div key={sale.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/10 hover:bg-muted/20 hover:border-border transition-all duration-200">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary shrink-0">
                                            <DollarSign className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">{repName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {clientName !== 'Self' ? `Client: ${clientName}` : 'Self-order'} · {itemCount} items
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-sm text-primary">${Number(sale.total_amount).toFixed(2)}</p>
                                        <p className="text-xs text-muted-foreground">{getTimeAgo(sale.created_at)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Network className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No team sales yet.</p>
                        <p className="text-xs text-muted-foreground mt-1">When your downline makes sales, they'll appear here.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
