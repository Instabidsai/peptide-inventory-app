import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePartnerDownline } from '@/hooks/use-partner';
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
    DollarSign,
    TrendingUp,
    Users,
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
    draft: { label: 'Draft', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: <Clock className="h-3.5 w-3.5" /> },
    submitted: { label: 'Submitted', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

export default function PartnerOrders() {
    const { user } = useAuth();
    const { data: downline } = usePartnerDownline();

    const { data: profileData } = useQuery({
        queryKey: ['partner_profile_id', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('user_id', user.id)
                .single();
            return data;
        },
        enabled: !!user?.id,
    });

    // Build list of all rep IDs in the network (self + downline)
    const networkRepIds = [
        ...(profileData?.id ? [profileData.id] : []),
        ...(downline?.map(d => d.id) || []),
    ];

    const { data: orders, isLoading } = useQuery({
        queryKey: ['partner_network_orders', networkRepIds],
        queryFn: async () => {
            if (networkRepIds.length === 0) return [];

            const { data, error } = await (supabase as any)
                .from('sales_orders')
                .select(`
                    *,
                    contacts (id, name, email),
                    profiles (id, full_name),
                    sales_order_items (
                        *,
                        peptides (id, name)
                    )
                `)
                .in('rep_id', networkRepIds)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
        enabled: networkRepIds.length > 0,
    });

    // Fetch commissions for this partner to show per-order earnings
    const { data: commissions } = useQuery({
        queryKey: ['partner_order_commissions', profileData?.id],
        queryFn: async () => {
            if (!profileData?.id) return [];
            const { data, error } = await (supabase as any)
                .from('commissions')
                .select('id, sale_id, amount, type, status')
                .eq('partner_id', profileData.id);
            if (error) throw error;
            return data || [];
        },
        enabled: !!profileData?.id,
    });

    // Build commission lookup by sale_id
    const commissionBySale = new Map<string, number>();
    commissions?.forEach((c: any) => {
        const current = commissionBySale.get(c.sale_id) || 0;
        commissionBySale.set(c.sale_id, current + Number(c.amount || 0));
    });

    // Build rep name lookup
    const repNameMap = new Map<string, string>();
    if (profileData?.id) repNameMap.set(profileData.id, 'You');
    downline?.forEach(d => { if (d.full_name) repNameMap.set(d.id, d.full_name); });

    const selfOrders = orders?.filter((o: any) => o.rep_id === profileData?.id && o.notes?.includes('PARTNER SELF-ORDER')) || [];
    const networkOrders = orders?.filter((o: any) => !(o.rep_id === profileData?.id && o.notes?.includes('PARTNER SELF-ORDER'))) || [];

    const getStatus = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    const totalRevenue = orders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
    const totalCommission = orders?.reduce((s: number, o: any) => s + (commissionBySale.get(o.id) || 0), 0) || 0;
    const paidCount = orders?.filter((o: any) => o.payment_status === 'paid').length || 0;
    const pendingCount = orders?.filter((o: any) => o.status === 'submitted' || o.status === 'draft').length || 0;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">My Orders</h1>
                    <p className="text-muted-foreground mt-1">
                        Track your orders, client sales, and commissions
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
                    {/* Summary Stats */}
                    {orders && orders.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Card>
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-2xl font-bold">{orders.length}</p>
                                    <p className="text-xs text-muted-foreground">Total Orders</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-2xl font-bold text-primary">${totalRevenue.toFixed(0)}</p>
                                    <p className="text-xs text-muted-foreground">Sales Volume</p>
                                </CardContent>
                            </Card>
                            <Card className="border-green-200/50">
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-2xl font-bold text-green-600">${totalCommission.toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">Total Commissions</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="pt-4 pb-3 text-center">
                                    <p className="text-2xl font-bold text-amber-500">{pendingCount}</p>
                                    <p className="text-xs text-muted-foreground">Pending / {paidCount} Paid</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* Self Orders Section */}
                    {selfOrders.length > 0 && (
                        <div className="space-y-3">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <ShoppingBag className="h-5 w-5 text-primary" />
                                My Personal Orders
                                <Badge variant="secondary">{selfOrders.length}</Badge>
                            </h2>
                            {selfOrders.map((order: any) => (
                                <OrderCard key={order.id} order={order} getStatus={getStatus} commission={commissionBySale.get(order.id)} repName={null} />
                            ))}
                        </div>
                    )}

                    {/* Network Orders Section */}
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Users className="h-5 w-5 text-primary" />
                            Network Orders
                            <Badge variant="secondary">{networkOrders.length}</Badge>
                        </h2>
                        {networkOrders.length === 0 ? (
                            <Card className="bg-muted/30">
                                <CardContent className="flex flex-col items-center justify-center py-8">
                                    <Package className="h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-muted-foreground text-sm">No network orders yet</p>
                                    <p className="text-xs text-muted-foreground mt-1">Orders from your clients and downline will appear here.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            networkOrders.map((order: any) => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    getStatus={getStatus}
                                    commission={commissionBySale.get(order.id)}
                                    repName={order.rep_id !== profileData?.id ? (repNameMap.get(order.rep_id) || order.profiles?.full_name || null) : null}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function OrderCard({ order, getStatus, commission, repName }: { order: any; getStatus: (s: string) => any; commission?: number; repName?: string | null }) {
    const statusInfo = getStatus(order.status);
    const items = order.sales_order_items || [];
    const clientName = order.contacts?.name || (order.notes?.includes('PARTNER SELF-ORDER') ? 'Self Order' : 'Unknown');

    const getTrackingUrl = (carrier: string | null, tracking: string) => {
        switch (carrier) {
            case 'USPS': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`;
            case 'UPS': return `https://www.ups.com/track?tracknum=${tracking}`;
            case 'FedEx': return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;
            default: return `https://parcelsapp.com/en/tracking/${tracking}`;
        }
    };

    return (
        <Card className="bg-card border-border hover:border-primary/20 transition-colors">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        {/* Header row: client name + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium text-sm">{clientName}</span>
                            {repName && (
                                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                                    via {repName}
                                </Badge>
                            )}
                            <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                                <span className="mr-1">{statusInfo.icon}</span>
                                {statusInfo.label}
                            </Badge>
                            {order.payment_status === 'paid' && (
                                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                                    Paid
                                </Badge>
                            )}
                            {order.payment_status === 'partial' && (
                                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">
                                    Partial
                                </Badge>
                            )}
                            {order.shipping_status && order.shipping_status !== 'pending' && (
                                <Badge variant="outline" className={`text-xs ${getStatus(order.shipping_status === 'label_created' ? 'processing' : order.shipping_status === 'in_transit' ? 'shipped' : order.shipping_status).color}`}>
                                    <Truck className="h-3 w-3 mr-1" />
                                    {order.shipping_status === 'label_created' ? 'Label Created' : order.shipping_status === 'in_transit' ? 'In Transit' : order.shipping_status === 'delivered' ? 'Delivered' : order.shipping_status}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(order.created_at), 'MMM d, yyyy · h:mm a')}
                        </p>
                        {/* Items list */}
                        {items.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                                {items.map((i: any) => (
                                    <div key={i.id} className="flex justify-between text-xs text-muted-foreground">
                                        <span>{i.peptides?.name || 'Unknown'} x{i.quantity}</span>
                                        <span>${(Number(i.unit_price) * i.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {/* Tracking link */}
                        {order.tracking_number && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
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
                    </div>
                    {/* Right side: total + commission */}
                    <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-primary">${Number(order.total_amount || 0).toFixed(2)}</p>
                        {commission !== undefined && commission > 0 && (
                            <div className="flex items-center justify-end gap-1 mt-0.5">
                                <DollarSign className="h-3 w-3 text-green-500" />
                                <span className="text-sm font-medium text-green-600">
                                    +${commission.toFixed(2)}
                                </span>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {items.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0)} items
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
