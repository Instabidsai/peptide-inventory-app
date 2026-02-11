import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Package,
    Clock,
    CheckCircle2,
    Truck,
    XCircle,
    ShoppingBag,
    ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <Clock className="h-3.5 w-3.5" /> },
    confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    processing: { label: 'Processing', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: <Package className="h-3.5 w-3.5" /> },
    shipped: { label: 'Shipped', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: <Truck className="h-3.5 w-3.5" /> },
    delivered: { label: 'Delivered', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    fulfilled: { label: 'Fulfilled', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: <XCircle className="h-3.5 w-3.5" /> },
};

export default function PartnerOrders() {
    const { user } = useAuth();

    const { data: orders, isLoading } = useQuery({
        queryKey: ['partner_my_orders'],
        queryFn: async () => {
            if (!user?.id) return [];

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();

            if (!profile) return [];

            // Get orders where this partner is the rep
            const { data, error } = await (supabase as any)
                .from('sales_orders')
                .select(`
                    *,
                    contacts (id, name, email),
                    sales_order_items (
                        *,
                        peptides (id, name)
                    )
                `)
                .eq('rep_id', profile.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: !!user?.id,
    });

    const selfOrders = orders?.filter((o: any) => o.notes?.includes('PARTNER SELF-ORDER')) || [];
    const clientOrders = orders?.filter((o: any) => !o.notes?.includes('PARTNER SELF-ORDER')) || [];

    const getStatus = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">My Orders</h1>
                    <p className="text-muted-foreground mt-1">
                        Track your orders and client sales
                    </p>
                </div>
                <Link to="/partner/store">
                    <Button variant="outline" className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4" />
                        Partner Store
                    </Button>
                </Link>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
            ) : (
                <>
                    {/* Self Orders Section */}
                    {selfOrders.length > 0 && (
                        <div className="space-y-3">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <ShoppingBag className="h-5 w-5 text-primary" />
                                My Personal Orders
                                <Badge variant="secondary">{selfOrders.length}</Badge>
                            </h2>
                            {selfOrders.map((order: any) => (
                                <OrderCard key={order.id} order={order} getStatus={getStatus} />
                            ))}
                        </div>
                    )}

                    {/* Client Orders Section */}
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            Client Orders
                            <Badge variant="secondary">{clientOrders.length}</Badge>
                        </h2>
                        {clientOrders.length === 0 ? (
                            <Card className="bg-muted/30">
                                <CardContent className="flex flex-col items-center justify-center py-8">
                                    <Package className="h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-muted-foreground text-sm">No client orders yet</p>
                                </CardContent>
                            </Card>
                        ) : (
                            clientOrders.map((order: any) => (
                                <OrderCard key={order.id} order={order} getStatus={getStatus} />
                            ))
                        )}
                    </div>

                    {/* Summary */}
                    {orders && orders.length > 0 && (
                        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                            <CardContent className="pt-4">
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-2xl font-bold">{orders.length}</p>
                                        <p className="text-xs text-muted-foreground">Total Orders</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-primary">
                                            ${orders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0).toFixed(0)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Total Revenue</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-yellow-500">
                                            {orders.filter((o: any) => o.status === 'pending').length}
                                        </p>
                                        <p className="text-xs text-muted-foreground">Pending</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

function OrderCard({ order, getStatus }: { order: any; getStatus: (s: string) => any }) {
    const statusInfo = getStatus(order.status);
    const items = order.sales_order_items || [];
    const clientName = order.contacts?.name || (order.notes?.includes('PARTNER SELF-ORDER') ? 'Self Order' : 'Unknown');

    return (
        <Card className="bg-card border-border hover:border-primary/20 transition-colors">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{clientName}</span>
                            <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                                <span className="mr-1">{statusInfo.icon}</span>
                                {statusInfo.label}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(order.created_at), 'MMM d, yyyy · h:mm a')}
                        </p>
                        {items.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {items.map((i: any) => `${i.peptides?.name || 'Unknown'} ×${i.quantity}`).join(', ')}
                            </p>
                        )}
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">${Number(order.total_amount || 0).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                            {items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)} items
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
