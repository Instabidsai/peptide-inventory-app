import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateSalesOrder } from '@/hooks/use-sales-orders';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
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
    ChevronRight,
    Wand2,
    Plus,
    Minus,
    Pencil,
    Save,
    Loader2,
    MapPin,
    FileText,
    Copy,
    Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { getTrackingUrl } from '@/lib/tracking';
import { QueryError } from '@/components/ui/query-error';

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
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    // Single self-contained query: fetches profile, downline, then orders
    const { data: orderData, isLoading, isError, refetch } = useQuery({
        queryKey: ['partner_network_orders', user?.id],
        queryFn: async () => {
            if (!user?.id) return { orders: [], myProfileId: null, myName: null, repNames: new Map<string, string>() };

            // 1. Get my profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, full_name')
                .eq('user_id', user.id)
                .single();

            if (!profile?.id) return { orders: [], myProfileId: null, myName: null, repNames: new Map<string, string>() };

            // 2. Get downline via RPC
            const { data: downline } = await supabase.rpc('get_partner_downline', { root_id: user.id });
            const downlineIds = (downline || []).map((d: { id: string }) => d.id);

            // 3. Build network rep IDs
            const networkRepIds = [profile.id, ...downlineIds];

            // 4. Build name map
            const repNames = new Map<string, string>();
            repNames.set(profile.id, 'You');
            (downline || []).forEach((d: { id: string; full_name?: string }) => { if (d.full_name) repNames.set(d.id, d.full_name); });

            // 5. Fetch all orders for the network
            const { data: orders, error } = await supabase
                .from('sales_orders')
                .select(`
                    *,
                    contacts (id, name, email),
                    sales_order_items (
                        *,
                        peptides (id, name)
                    )
                `)
                .in('rep_id', networkRepIds)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Partner orders query error:', error);
                throw error;
            }

            // 6. Fetch rep profile names for orders (batch)
            const repIds = [...new Set((orders || []).map((o) => o.rep_id).filter(Boolean))] as string[];
            if (repIds.length > 0) {
                const { data: repProfiles } = await supabase
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', repIds);
                (repProfiles || []).forEach((p) => {
                    if (p.full_name && !repNames.has(p.id)) repNames.set(p.id, p.full_name);
                });
            }

            return {
                orders: orders || [],
                myProfileId: profile.id,
                myName: profile.full_name,
                repNames,
            };
        },
        enabled: !!user?.id,
    });

    const orders = orderData?.orders || [];
    const myProfileId = orderData?.myProfileId;
    const myName = orderData?.myName;
    const repNames = orderData?.repNames || new Map<string, string>();

    // Fetch commissions for this partner to show per-order earnings
    const { data: commissions } = useQuery({
        queryKey: ['partner_order_commissions', myProfileId],
        queryFn: async () => {
            if (!myProfileId) return [];
            const { data, error } = await supabase
                .from('commissions')
                .select('id, sale_id, amount, type, status')
                .eq('partner_id', myProfileId);
            if (error) throw error;
            return data || [];
        },
        enabled: !!myProfileId,
    });

    // Build commission lookup by sale_id
    const commissionBySale = new Map<string, number>();
    commissions?.forEach((c) => {
        const current = commissionBySale.get(c.sale_id) || 0;
        commissionBySale.set(c.sale_id, current + Number(c.amount || 0));
    });

    const selfOrders = orders.filter((o) => o.rep_id === myProfileId && o.notes?.includes('PARTNER SELF-ORDER'));
    const networkOrders = orders.filter((o) => !(o.rep_id === myProfileId && o.notes?.includes('PARTNER SELF-ORDER')));

    const getStatus = (status: string) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

    const totalRevenue = orders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;
    const totalCommission = orders?.reduce((s, o) => s + (commissionBySale.get(o.id) || 0), 0) || 0;
    const paidCount = orders?.filter((o) => o.payment_status === 'paid').length || 0;
    const pendingCount = orders?.filter((o) => o.status === 'submitted' || o.status === 'draft').length || 0;

    return (
        <div className="space-y-6">
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
            ) : isError ? (
                <QueryError message="Failed to load orders." onRetry={refetch} />
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
                            {selfOrders.map((order) => (
                                <OrderCard key={order.id} order={order} getStatus={getStatus} commission={commissionBySale.get(order.id)} repName={null} myName={myName || undefined} onClick={() => setSelectedOrder(order)} />
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
                            networkOrders.map((order) => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    getStatus={getStatus}
                                    commission={commissionBySale.get(order.id)}
                                    repName={order.rep_id !== myProfileId ? (repNames.get(order.rep_id) || null) : null}
                                    myName={myName || undefined}
                                    onClick={() => setSelectedOrder(order)}
                                />
                            ))
                        )}
                    </div>
                </>
            )}

            {/* Order Detail / Edit Sheet */}
            <OrderDetailSheet
                order={selectedOrder}
                onClose={() => setSelectedOrder(null)}
                onUpdated={() => {
                    refetch();
                    setSelectedOrder(null);
                }}
            />
        </div>
    );
}

/* ── Order Detail / Edit Sheet ─────────────────────────────── */

function OrderDetailSheet({ order, onClose, onUpdated }: { order: any; onClose: () => void; onUpdated: () => void }) {
    const updateOrder = useUpdateSalesOrder();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [editing, setEditing] = useState(false);
    const [editShipping, setEditShipping] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editItems, setEditItems] = useState<Array<{ id: string; peptide_name: string; quantity: number; unit_price: number }>>([]);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const canEdit = !!order; // Partners can edit orders in any status

    const startEditing = () => {
        if (!order) return;
        setEditShipping(order.shipping_address || '');
        setEditNotes(order.notes || '');
        setEditItems((order.sales_order_items || []).map((i: any) => ({
            id: i.id,
            peptide_name: i.peptides?.name || 'Unknown',
            quantity: i.quantity,
            unit_price: Number(i.unit_price || 0),
        })));
        setEditing(true);
    };

    const handleSave = async () => {
        if (!order) return;
        setSaving(true);
        try {
            // Update order fields (total_amount recalculated by DB trigger)
            await updateOrder.mutateAsync({
                id: order.id,
                shipping_address: editShipping || null,
                notes: editNotes || null,
            } as any);

            // Update individual item quantities
            for (const item of editItems) {
                if (item.quantity <= 0) {
                    await supabase.from('sales_order_items').delete().eq('id', item.id);
                } else {
                    await supabase.from('sales_order_items').update({ quantity: item.quantity }).eq('id', item.id);
                }
            }

            queryClient.invalidateQueries({ queryKey: ['partner_network_orders'] });
            toast({ title: 'Order updated' });
            setEditing(false);
            onUpdated();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setSaving(false);
        }
    };

    const copyOrderId = () => {
        if (order?.id) {
            navigator.clipboard.writeText(order.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const updateItemQty = (itemId: string, delta: number) => {
        setEditItems(prev => prev.map(i =>
            i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        ));
    };

    if (!order) return null;

    const items = order.sales_order_items || [];
    const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
    const editTotal = editing ? editItems.reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;

    return (
        <Sheet open={!!order} onOpenChange={(open) => { if (!open) { setEditing(false); onClose(); } }}>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
                <SheetHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-lg font-bold text-left">Order Details</SheetTitle>
                        <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                            <span className="mr-1">{statusInfo.icon}</span>
                            {statusInfo.label}
                        </Badge>
                    </div>
                </SheetHeader>

                <div className="space-y-4 pb-6">
                    {/* EDIT BUTTON — first thing, big and obvious */}
                    {canEdit && !editing && (
                        <Button className="w-full h-14 text-base font-semibold" size="lg" onClick={startEditing}>
                            <Pencil className="h-5 w-5 mr-2" /> Edit This Order
                        </Button>
                    )}

                    {/* Order ID */}
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border">
                        <span className="text-xs text-muted-foreground">Order ID:</span>
                        <code className="text-xs font-mono flex-1 truncate">{order.id}</code>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyOrderId}>
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        </Button>
                    </div>

                    {/* Date + Client */}
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{format(new Date(order.created_at), 'MMM d, yyyy · h:mm a')}</span>
                        <span className="font-medium">{order.contacts?.name || 'Self Order'}</span>
                    </div>

                    {/* Payment + Shipping Status */}
                    <div className="flex gap-2 flex-wrap">
                        {order.payment_status && (
                            <Badge variant="outline" className={`text-xs ${order.payment_status === 'paid' ? 'bg-green-500/10 text-green-500 border-green-500/20' : order.payment_status === 'partial' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-gray-500/10 text-gray-500'}`}>
                                Payment: {order.payment_status}
                            </Badge>
                        )}
                        {order.shipping_status && order.shipping_status !== 'pending' && (
                            <Badge variant="outline" className="text-xs">
                                <Truck className="h-3 w-3 mr-1" />
                                {order.shipping_status === 'label_created' ? 'Label Created' : order.shipping_status === 'in_transit' ? 'In Transit' : order.shipping_status === 'delivered' ? 'Delivered' : order.shipping_status}
                            </Badge>
                        )}
                    </div>

                    {/* Tracking */}
                    {order.tracking_number && (
                        <div className="flex items-center gap-2 text-sm p-2.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/15">
                            <Truck className="h-4 w-4 text-emerald-500" />
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

                    {/* Items — read-only or editable */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold">Items</h3>

                        {editing ? (
                            <div className="space-y-2">
                                {editItems.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{item.peptide_name}</p>
                                            <p className="text-xs text-muted-foreground">${item.unit_price.toFixed(2)} each</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateItemQty(item.id, -1)}>
                                                <Minus className="h-3.5 w-3.5" />
                                            </Button>
                                            <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateItemQty(item.id, 1)}>
                                                <Plus className="h-3.5 w-3.5" />
                                            </Button>
                                            <span className="w-16 text-right text-sm font-semibold">${(item.quantity * item.unit_price).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                                {editItems.some(i => i.quantity <= 0) && (
                                    <p className="text-xs text-red-400">Items with 0 quantity will be removed.</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {items.map((i: any) => (
                                    <div key={i.id} className="flex justify-between text-sm p-2 rounded-lg bg-muted/20">
                                        <span>{i.peptides?.name || 'Unknown'} × {i.quantity}</span>
                                        <span className="font-medium">${(Number(i.unit_price) * i.quantity).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Total */}
                    <div className="border-t pt-3 flex justify-between items-center">
                        <span className="font-medium">Total</span>
                        <span className="text-xl font-bold text-primary">
                            ${editing ? editTotal.toFixed(2) : Number(order.total_amount || 0).toFixed(2)}
                        </span>
                    </div>

                    {/* Shipping Address — editable */}
                    {editing ? (
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5" /> Shipping Address
                            </label>
                            <Textarea
                                value={editShipping}
                                onChange={e => setEditShipping(e.target.value)}
                                rows={2}
                                placeholder="Enter shipping address..."
                            />
                        </div>
                    ) : order.shipping_address ? (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <MapPin className="h-3 w-3" /> Shipping Address
                            </p>
                            <p className="text-sm">{order.shipping_address}</p>
                        </div>
                    ) : null}

                    {/* Notes — editable */}
                    {editing ? (
                        <div className="space-y-2">
                            <label className="text-sm font-semibold flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5" /> Notes
                            </label>
                            <Textarea
                                value={editNotes}
                                onChange={e => setEditNotes(e.target.value)}
                                rows={2}
                                placeholder="Order notes..."
                            />
                        </div>
                    ) : order.notes ? (
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <FileText className="h-3 w-3" /> Notes
                            </p>
                            <p className="text-sm text-muted-foreground">{order.notes}</p>
                        </div>
                    ) : null}

                    {/* Save / Cancel buttons when editing */}
                    {editing && (
                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button className="flex-1" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                Save Changes
                            </Button>
                        </div>
                    )}

                    {/* Generate Protocol button */}
                    {!editing && order.contacts?.id && (
                        <Link to={`/protocol-builder?order=${order.id}&contact=${order.contacts.id}`}>
                            <Button variant="outline" className="w-full">
                                <Wand2 className="h-4 w-4 mr-2" /> Generate Protocol
                            </Button>
                        </Link>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

interface OrderCardOrder {
    id: string;
    status: string;
    rep_id: string | null;
    total_amount: number | null;
    payment_status: string | null;
    shipping_status: string | null;
    tracking_number: string | null;
    carrier: string | null;
    notes: string | null;
    created_at: string;
    contacts?: { id: string; name: string | null; email?: string | null } | null;
    profiles?: { full_name: string | null } | null;
    sales_order_items?: Array<{
        id: string;
        quantity: number;
        unit_price: number | null;
        peptides?: { name: string } | null;
    }>;
}

function OrderCard({ order, getStatus, commission, repName, myName, onClick }: { order: OrderCardOrder; getStatus: (s: string) => { label: string; color: string; icon: React.ReactNode }; commission?: number; repName?: string | null; myName?: string; onClick?: () => void }) {
    const statusInfo = getStatus(order.status);
    const items = order.sales_order_items || [];
    const clientName = order.contacts?.name || (order.notes?.includes('PARTNER SELF-ORDER') ? 'Self Order' : 'Unknown');
    const isSelfOrder = order.notes?.includes('PARTNER SELF-ORDER');
    const repFullName = repName || order.profiles?.full_name || 'Unknown';
    const isDownlineOrder = repName !== null && repName !== undefined;

    return (
        <Card className="bg-card border-border hover:border-primary/20 transition-colors cursor-pointer" onClick={onClick}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        {/* Attribution chain: Customer → Rep → Upline */}
                        {isDownlineOrder && !isSelfOrder && (
                            <div className="flex items-center gap-1 mb-1.5 text-xs text-muted-foreground flex-wrap">
                                <span className="font-medium text-foreground">{clientName}</span>
                                <ChevronRight className="h-3 w-3" />
                                <span className="text-blue-500 font-medium">{repFullName}</span>
                                {myName && (
                                    <>
                                        <ChevronRight className="h-3 w-3" />
                                        <span className="text-primary font-medium">{myName}</span>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Header row: client name + badges */}
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {!isDownlineOrder && <span className="font-medium text-sm">{clientName}</span>}
                            {isSelfOrder && (
                                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                    Personal Order
                                </Badge>
                            )}
                            {isDownlineOrder && !isSelfOrder && (
                                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                                    via {repFullName}
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
                                {items.map((i) => (
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
                            {items.reduce((s, i) => s + Number(i.quantity || 0), 0)} items
                        </p>
                    </div>
                </div>
                {/* Action buttons — big and visible */}
                <div className="flex gap-2 mt-3 pt-3 border-t">
                    <Button className="flex-1 h-11" onClick={onClick}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Order
                    </Button>
                    {order.contacts?.id && (
                        <Link to={`/protocol-builder?order=${order.id}&contact=${order.contacts.id}`} className="flex-1" onClick={e => e.stopPropagation()}>
                            <Button variant="outline" className="w-full h-11">
                                <Wand2 className="h-4 w-4 mr-2" /> Protocol
                            </Button>
                        </Link>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
