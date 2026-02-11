import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import {
    Package,
    Clock,
    CheckCircle2,
    Truck,
    XCircle,
    ShoppingBag,
    Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <Clock className="h-3.5 w-3.5" /> },
    confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    processing: { label: 'Processing', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: <Package className="h-3.5 w-3.5" /> },
    shipped: { label: 'Shipped', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: <Truck className="h-3.5 w-3.5" /> },
    delivered: { label: 'Delivered', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    fulfilled: { label: 'Fulfilled', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: <XCircle className="h-3.5 w-3.5" /> },
};

export default function ClientOrders() {
    const { user } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const navigate = useNavigate();

    const { data: orders, isLoading } = useQuery({
        queryKey: ['client_my_orders', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return [];

            // Get orders where this contact is the client
            const { data, error } = await (supabase as any)
                .from('sales_orders')
                .select(`
                    *,
                    sales_order_items (
                        *,
                        peptides (id, name)
                    )
                `)
                .eq('client_id', contact.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: !!contact?.id,
    });

    const getStatus = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    if (isLoadingContact || isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">My Orders</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Track your peptide orders
                    </p>
                </div>
                <Button size="sm" onClick={() => navigate('/store')} className="flex items-center gap-1">
                    <ShoppingBag className="h-4 w-4" />
                    Order More
                </Button>
            </div>

            {/* Orders List */}
            {!orders || orders.length === 0 ? (
                <GlassCard>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Package className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="font-medium">No orders yet</p>
                        <p className="text-sm text-muted-foreground mt-1 text-center">
                            Visit the store to place your first order
                        </p>
                        <Button className="mt-4" onClick={() => navigate('/store')}>
                            <ShoppingBag className="h-4 w-4 mr-2" />
                            Browse Store
                        </Button>
                    </CardContent>
                </GlassCard>
            ) : (
                <div className="space-y-3">
                    {orders.map((order: any) => {
                        const statusInfo = getStatus(order.status);
                        const items = order.sales_order_items || [];

                        return (
                            <GlassCard key={order.id} className="hover:border-primary/20 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* Status + Date */}
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                                                    <span className="mr-1">{statusInfo.icon}</span>
                                                    {statusInfo.label}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {format(new Date(order.created_at), 'MMM d, yyyy')}
                                                </span>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-1">
                                                {items.map((item: any) => (
                                                    <div key={item.id} className="flex justify-between text-sm">
                                                        <span className="truncate">
                                                            {item.peptides?.name || 'Unknown'} × {item.quantity}
                                                        </span>
                                                        <span className="font-medium shrink-0 ml-2">
                                                            ${(Number(item.unit_price) * item.quantity).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Total */}
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-bold text-primary">
                                                ${Number(order.total_amount || 0).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Shipping info if present */}
                                    {order.shipping_address && (
                                        <div className="mt-2 pt-2 border-t">
                                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Truck className="h-3 w-3" />
                                                {order.shipping_address}
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </GlassCard>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
