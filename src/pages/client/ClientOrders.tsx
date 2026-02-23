import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { motion } from 'framer-motion';
import {
    Package,
    Clock,
    CheckCircle2,
    Truck,
    XCircle,
    ShoppingBag,
    Loader2,
    RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getTrackingUrl } from '@/lib/tracking';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: <Clock className="h-3.5 w-3.5" /> },
    confirmed: { label: 'Confirmed', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    processing: { label: 'Processing', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', icon: <Package className="h-3.5 w-3.5" /> },
    shipped: { label: 'Shipped', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: <Truck className="h-3.5 w-3.5" /> },
    delivered: { label: 'Delivered', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    fulfilled: { label: 'Fulfilled', color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    cancelled: { label: 'Cancelled', color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: <XCircle className="h-3.5 w-3.5" /> },
};

const PAGE_SIZE = 20;

export default function ClientOrders() {
    const { user } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const navigate = useNavigate();
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

    const { data: orders, isLoading, isError, refetch } = useQuery({
        queryKey: ['client_my_orders', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return [];

            // Get orders where this contact is the client
            const { data, error } = await supabase
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
            <div className="space-y-6 pb-20">
                <div>
                    <Skeleton className="h-7 w-32 mb-2" />
                    <Skeleton className="h-4 w-48" />
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <GlassCard key={i}>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex gap-2">
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                </div>
                                <div className="space-y-1.5">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            </CardContent>
                        </GlassCard>
                    ))}
                </div>
            </div>
        );
    }

    if (isError) {
        return <QueryError message="Failed to load your orders." onRetry={() => refetch()} />;
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
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <GlassCard>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <motion.div
                            className="p-4 rounded-full bg-secondary/50 mb-4"
                            animate={{ y: [0, -6, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                        >
                            <Package className="h-8 w-8 text-muted-foreground/60" />
                        </motion.div>
                        <p className="font-medium">No orders yet</p>
                        <p className="text-sm text-muted-foreground mt-1 text-center max-w-[240px]">
                            Your orders will appear here once you place your first one
                        </p>
                        <Button className="mt-4" onClick={() => navigate('/store')}>
                            <ShoppingBag className="h-4 w-4 mr-2" />
                            Browse Store
                        </Button>
                    </CardContent>
                </GlassCard>
                </motion.div>
            ) : (
                <motion.div
                    className="space-y-3"
                    initial="hidden"
                    animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
                >
                    {orders.slice(0, displayCount).map((order) => {
                        const statusInfo = getStatus(order.status);
                        const items = order.sales_order_items || [];

                        return (
                            <motion.div key={order.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} whileTap={{ scale: 0.98 }}>
                            <GlassCard className="hover:border-primary/20 transition-all duration-200">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            {/* Status + Shipping + Date */}
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                                                    <span className="mr-1">{statusInfo.icon}</span>
                                                    {statusInfo.label}
                                                </Badge>
                                                {order.shipping_status && order.shipping_status !== 'pending' && (
                                                    <Badge variant="outline" className={`text-xs ${getStatus(order.shipping_status === 'label_created' ? 'processing' : order.shipping_status === 'in_transit' ? 'shipped' : order.shipping_status).color}`}>
                                                        <Truck className="h-3 w-3 mr-1" />
                                                        {order.shipping_status === 'label_created' ? 'Label Created' : order.shipping_status === 'in_transit' ? 'In Transit' : order.shipping_status === 'delivered' ? 'Delivered' : order.shipping_status}
                                                    </Badge>
                                                )}
                                                {order.payment_status === 'paid' && (
                                                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                                                        Paid
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {format(new Date(order.created_at), 'MMM d, yyyy')}
                                                </span>
                                            </div>

                                            {/* Items */}
                                            <div className="space-y-1">
                                                {items.map((item) => (
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

                                    {/* Tracking + Shipping info */}
                                    {(order.tracking_number || order.shipping_address) && (
                                        <div className="mt-2 pt-2 border-t space-y-1">
                                            {order.tracking_number && (
                                                <div className="flex items-center gap-2 text-xs">
                                                    <Truck className="h-3 w-3 text-emerald-500" />
                                                    <span className="text-muted-foreground">{order.carrier || 'Carrier'}:</span>
                                                    <a
                                                        href={getTrackingUrl(order.carrier, order.tracking_number)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-mono text-primary hover:underline"
                                                    >
                                                        {order.tracking_number}
                                                    </a>
                                                </div>
                                            )}
                                            {order.shipping_address && !order.tracking_number && (
                                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Truck className="h-3 w-3" />
                                                    {order.shipping_address}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Reorder button for completed orders */}
                                    {(order.status === 'fulfilled' || order.status === 'delivered' || order.shipping_status === 'delivered') && (
                                        <div className="mt-2 pt-2 border-t">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full text-xs"
                                                onClick={() => navigate('/store')}
                                            >
                                                <RotateCcw className="h-3 w-3 mr-1" />
                                                Reorder
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </GlassCard>
                            </motion.div>
                        );
                    })}
                    {orders.length > displayCount && (
                        <Button
                            variant="outline"
                            className="w-full mt-2"
                            onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
                        >
                            Show more ({orders.length - displayCount} remaining)
                        </Button>
                    )}
                </motion.div>
            )}
        </div>
    );
}
