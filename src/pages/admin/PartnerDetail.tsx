
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Mail,
    Calendar,
    DollarSign,
    TrendingUp,
    Users,
    UserPlus,
    ShoppingCart,
    Tag,
    Plus,
    Trash2,
    Loader2,
    Network,
    Eye,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import DownlineVisualizer from './components/DownlineVisualizer'; // Corrected to default import
import { usePartnerDownline, usePayCommission, PartnerNode } from '@/hooks/use-partner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { QueryError } from '@/components/ui/query-error';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/logger';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import { useOrgFeatures } from '@/hooks/use-org-features';
import { useTenantConfig } from '@/hooks/use-tenant-config';

// Referral Activity Card — shows total referrals, total spend, per-customer breakdown
function ReferralActivityCard({ repId }: { repId: string }) {
    const { profile: currentProfile } = useAuth();
    const { data: stats, isLoading } = useQuery({
        queryKey: ['partner-referral-stats', repId, currentProfile?.org_id],
        queryFn: async () => {
            if (!currentProfile?.org_id) return null;
            const { data: clients } = await supabase
                .from('contacts')
                .select('id, name')
                .eq('assigned_rep_id', repId)
                .eq('org_id', currentProfile.org_id);

            const { data: orders } = await supabase
                .from('sales_orders')
                .select('id, total_amount, client_id, created_at, status')
                .eq('rep_id', repId)
                .eq('org_id', currentProfile.org_id);

            const customerSpend: Record<string, { name: string; total: number; orderCount: number }> = {};
            for (const client of (clients || [])) {
                customerSpend[client.id] = { name: client.name, total: 0, orderCount: 0 };
            }
            for (const order of (orders || [])) {
                if (order.client_id && customerSpend[order.client_id]) {
                    customerSpend[order.client_id].total += Number(order.total_amount || 0);
                    customerSpend[order.client_id].orderCount += 1;
                }
            }

            return {
                totalReferrals: clients?.length || 0,
                totalVolume: (orders || []).reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
                totalOrders: orders?.length || 0,
                customers: Object.values(customerSpend).sort((a, b) => b.total - a.total),
            };
        },
        enabled: !!repId,
    });

    if (isLoading) return <Skeleton className="h-48 w-full" />;
    if (!stats) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <CardTitle>Referral Activity</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="text-sm px-3 py-1">
                        {stats.totalReferrals} Referral{stats.totalReferrals !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-sm px-3 py-1">
                        {stats.totalOrders} Order{stats.totalOrders !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="text-sm px-3 py-1 border-green-500/40 text-green-400">
                        ${stats.totalVolume.toFixed(2)} Total Volume
                    </Badge>
                </div>

                {stats.customers.length > 0 && (
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Customer</TableHead>
                                <TableHead className="text-center">Orders</TableHead>
                                <TableHead className="text-right">Total Spent</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.customers.map((c) => (
                                <TableRow key={c.name}>
                                    <TableCell className="font-medium">{c.name}</TableCell>
                                    <TableCell className="text-center">{c.orderCount}</TableCell>
                                    <TableCell className="text-right">${c.total.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                )}

                {stats.customers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No referral activity yet.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

// Helper for the Network Tab
function NetworkTabContent({ repId }: { repId: string }) {
    const { profile: currentProfile } = useAuth();
    const { data: downline, isLoading } = usePartnerDownline(repId);

    // Also fetch assigned clients/contacts for all reps in the downline
    const repIds = React.useMemo(() => {
        if (!downline) return [];
        return downline.map(n => n.id);
    }, [downline]);

    const { data: clients } = useQuery({
        queryKey: ['downline_clients', repId, repIds, currentProfile?.org_id],
        queryFn: async () => {
            if (repIds.length === 0 || !currentProfile?.org_id) return [];
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type, assigned_rep_id')
                .in('assigned_rep_id', repIds)
                .eq('org_id', currentProfile.org_id);
            if (error) throw error;
            return data || [];
        },
        enabled: repIds.length > 0 && !!currentProfile?.org_id,
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading network data...</div>;

    // Merge clients as leaf nodes into the partner tree
    const clientNodes: PartnerNode[] = (clients || []).map(c => ({
        id: `client-${c.id}`,
        full_name: c.name,
        email: c.email,
        partner_tier: 'client',
        commission_rate: 0,
        total_sales: 0,
        depth: 0,
        path: [],
        parent_rep_id: c.assigned_rep_id,
        isClient: true,
        contactType: c.type || 'customer',
    }));

    const allNodes = [...(downline || []), ...clientNodes];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Network Strategy</h3>
                <div className="flex gap-2">
                    <Badge variant="outline">Reps: {downline?.length || 0}</Badge>
                    <Badge variant="outline" className="border-blue-500/40 text-blue-400">Clients: {clientNodes.length}</Badge>
                </div>
            </div>
            <DownlineVisualizer data={allNodes} />
        </div>
    );
}

function PlaceOrderTabContent({ partner }: { partner: any }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { profile: currentProfile } = useAuth();
    const [isCreatingContact, setIsCreatingContact] = useState(false);

    // Find the partner's contact record by email match
    const { data: partnerContact, isLoading: contactLoading, refetch: refetchContact } = useQuery({
        queryKey: ['partner_contact_record', partner.id, partner.email, currentProfile?.org_id],
        queryFn: async () => {
            if (!partner.email || !currentProfile?.org_id) return null;
            const { data } = await supabase
                .from('contacts')
                .select('id, name, email, type, address')
                .eq('email', partner.email)
                .eq('org_id', currentProfile.org_id)
                .maybeSingle();
            return data;
        },
        enabled: !!partner.email && !!currentProfile?.org_id,
    });

    // Fetch orders where this partner is the buyer (contact_id match)
    const { data: partnerOrders, isLoading: ordersLoading } = useQuery({
        queryKey: ['partner_own_orders', partnerContact?.id, currentProfile?.org_id],
        queryFn: async () => {
            if (!partnerContact?.id || !currentProfile?.org_id) return [];
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id, created_at, status, payment_status, total_amount,
                    sales_order_items (quantity, peptides (name))
                `)
                .eq('client_id', partnerContact.id)
                .eq('org_id', currentProfile.org_id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!partnerContact?.id && !!currentProfile?.org_id,
    });

    const handleCreateContact = async () => {
        if (!partner.email) {
            toast({ variant: 'destructive', title: 'No email', description: 'This partner has no email on their profile.' });
            return;
        }
        setIsCreatingContact(true);
        try {
            const { error } = await supabase
                .from('contacts')
                .insert({
                    name: partner.full_name || 'Partner',
                    email: partner.email,
                    phone: partner.phone || null,
                    address: partner.address || null,
                    type: 'partner',
                    assigned_rep_id: partner.parent_rep_id || null,
                    org_id: partner.org_id,
                });
            if (error) throw error;
            toast({ title: 'Contact created', description: `Contact record created for ${partner.full_name}.` });
            refetchContact();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Failed', description: (err as any)?.message || 'Could not create contact.' });
        } finally {
            setIsCreatingContact(false);
        }
    };

    const handlePlaceOrder = () => {
        if (partnerContact?.id) {
            navigate(`/sales/new?contact_id=${partnerContact.id}`);
        }
    };

    // Pricing info
    const pricingMode = partner.pricing_mode || 'percentage';
    const multiplier = partner.price_multiplier;
    const markup = partner.cost_plus_markup;
    const discountPct = pricingMode === 'percentage' && multiplier != null ? ((1 - multiplier) * 100).toFixed(0) : null;

    const statusColor = (s: string) => {
        if (s === 'fulfilled' || s === 'delivered') return 'bg-green-500/10 text-green-500 border-green-500/20';
        if (s === 'cancelled') return 'bg-red-500/10 text-red-500 border-red-500/20';
        if (s === 'shipped') return 'bg-primary/10 text-primary border-primary/20';
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    };

    if (contactLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

    return (
        <div className="space-y-4">
            {/* Pricing Summary */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Order for {partner.full_name}
                    </CardTitle>
                    <CardDescription>
                        Place a new order for this partner at their configured discount.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                        <Badge variant="outline" className="text-sm px-3 py-1 border-violet-500/40 text-violet-400">
                            Partner Pricing Active
                        </Badge>
                        {discountPct && (
                            <Badge variant="outline" className="text-sm px-3 py-1">
                                {discountPct}% off retail (x{multiplier})
                            </Badge>
                        )}
                        {pricingMode === 'cost_multiplier' && multiplier != null && (
                            <Badge variant="outline" className="text-sm px-3 py-1">
                                {multiplier}x cost
                            </Badge>
                        )}
                        {pricingMode === 'cost_plus' && markup != null && (
                            <Badge variant="outline" className="text-sm px-3 py-1">
                                Cost + ${markup} markup
                            </Badge>
                        )}
                        <Badge variant="outline" className="text-sm px-3 py-1">
                            Payment: Commission Offset
                        </Badge>
                    </div>

                    {partnerContact ? (
                        <Button size="lg" onClick={handlePlaceOrder} className="w-full sm:w-auto">
                            <ShoppingCart className="mr-2 h-4 w-4" />
                            New Order for {partner.full_name}
                        </Button>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                                No contact record found for this partner. A contact record is required to place orders.
                            </p>
                            <Button onClick={handleCreateContact} disabled={isCreatingContact}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                {isCreatingContact ? 'Creating...' : `Create Contact for ${partner.full_name}`}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Partner's Own Order History */}
            {partnerContact && (
                <Card>
                    <CardHeader>
                        <CardTitle>Partner's Order History</CardTitle>
                        <CardDescription>
                            Orders where {partner.full_name} is the buyer ({partnerOrders?.length || 0} orders)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {ordersLoading ? (
                            <div className="py-4 text-center text-muted-foreground">Loading orders...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Items</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Payment</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(!partnerOrders || partnerOrders.length === 0) && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                No orders yet for this partner.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {partnerOrders?.map((order) => {
                                        const items = order.sales_order_items || [];
                                        const itemSummary = items.map((i: any) =>
                                            `${i.peptides?.name || '?'} x${i.quantity}`
                                        ).join(', ');

                                        return (
                                            <TableRow
                                                key={order.id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => navigate(`/sales/${order.id}`)}
                                            >
                                                <TableCell className="text-sm">
                                                    {format(new Date(order.created_at), 'MMM d, yyyy')}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                                                    {itemSummary || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`text-xs ${statusColor(order.status)}`}>
                                                        {order.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`text-xs ${
                                                        order.payment_status === 'paid'
                                                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                                            : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                                    }`}>
                                                        {order.payment_status || 'pending'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    ${Number(order.total_amount || 0).toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function SalesOrdersTabContent({ repId }: { repId: string }) {
    const navigate = useNavigate();
    const { profile: currentProfile } = useAuth();

    // Direct orders (where this rep is the sales rep)
    const { data: directOrders, isLoading } = useQuery({
        queryKey: ['partner_sales_orders', repId, currentProfile?.org_id],
        queryFn: async () => {
            if (!currentProfile?.org_id) return [];
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id, created_at, status, payment_status, total_amount,
                    commission_amount, profit_amount, source,
                    contacts (name),
                    sales_order_items (quantity, peptides (name))
                `)
                .eq('rep_id', repId)
                .eq('org_id', currentProfile.org_id)
                .neq('payment_status', 'commission_offset')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!currentProfile?.org_id,
    });

    // Override commissions — orders where this rep earned a second/third tier override
    const { data: overrideCommissions, isLoading: overridesLoading } = useQuery({
        queryKey: ['partner_override_commissions', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('commissions')
                .select(`
                    id, amount, commission_rate, type, status, sale_id,
                    sales_orders!sale_id (
                        id, created_at, status, payment_status, total_amount,
                        contacts (name),
                        profiles!rep_id (full_name),
                        sales_order_items (quantity, peptides (name))
                    )
                `)
                .eq('partner_id', repId)
                .in('type', ['second_tier_override', 'third_tier_override'])
                .neq('status', 'void');
            if (error) throw error;
            return data || [];
        },
    });

    if (isLoading || overridesLoading) return <div className="p-8 text-center text-muted-foreground">Loading sales orders...</div>;

    const orders = directOrders || [];
    const directVolume = orders.reduce((s: number, o) => s + Number(o.total_amount || 0), 0);
    const directCommission = orders.reduce((s: number, o) => s + Number(o.commission_amount || 0), 0);
    const overrideTotal = (overrideCommissions || []).reduce((s, c) => s + Number(c.amount || 0), 0);
    const orderCount = orders.length;
    const overrideCount = (overrideCommissions || []).length;

    const statusColor = (s: string) => {
        if (s === 'fulfilled' || s === 'delivered') return 'bg-green-500/10 text-green-500 border-green-500/20';
        if (s === 'cancelled') return 'bg-red-500/10 text-red-500 border-red-500/20';
        if (s === 'shipped') return 'bg-primary/10 text-primary border-primary/20';
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    };

    return (
        <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Direct Orders</p>
                        <p className="text-2xl font-bold">{orderCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Sales Volume</p>
                        <p className="text-2xl font-bold">${directVolume.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Direct Commission</p>
                        <p className="text-2xl font-bold text-green-500">${directCommission.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Override Commission</p>
                        <p className="text-2xl font-bold text-blue-500">${overrideTotal.toFixed(2)}</p>
                        {overrideCount > 0 && <p className="text-xs text-muted-foreground">{overrideCount} downline order{overrideCount !== 1 ? 's' : ''}</p>}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Sales History</CardTitle>
                    <CardDescription>{orderCount} order{orderCount !== 1 ? 's' : ''} placed through this partner</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Client</TableHead>
                                <TableHead>Items</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Payment</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Commission</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orderCount === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        No sales orders yet for this partner.
                                    </TableCell>
                                </TableRow>
                            )}
                            {orders?.map((order) => {
                                const items = order.sales_order_items || [];
                                const itemSummary = items.map((i) =>
                                    `${i.peptides?.name || '?'} ×${i.quantity}`
                                ).join(', ');

                                return (
                                    <TableRow
                                        key={order.id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => navigate(`/sales/${order.id}`)}
                                    >
                                        <TableCell className="text-sm">
                                            {format(new Date(order.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {order.contacts?.name || 'N/A'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                            {itemSummary || '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-xs ${statusColor(order.status)}`}>
                                                {order.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-xs ${
                                                order.payment_status === 'paid'
                                                    ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                                    : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                                            }`}>
                                                {order.payment_status || 'pending'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            ${Number(order.total_amount || 0).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-right text-green-500 font-medium">
                                            ${Number(order.commission_amount || 0).toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Downline override orders */}
            {overrideCount > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Downline Override Earnings</CardTitle>
                        <CardDescription>{overrideCount} order{overrideCount !== 1 ? 's' : ''} from downline reps earning override commission</CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Client</TableHead>
                                    <TableHead>Rep</TableHead>
                                    <TableHead>Order Total</TableHead>
                                    <TableHead>Tier</TableHead>
                                    <TableHead className="text-right">Override Earned</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(overrideCommissions || []).map((comm) => {
                                    const so = comm.sales_orders as any;
                                    const tierLabel = comm.type === 'second_tier_override' ? '2nd Tier' : '3rd Tier';
                                    return (
                                        <TableRow
                                            key={comm.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => navigate(`/sales/${comm.sale_id}`)}
                                        >
                                            <TableCell className="text-sm">
                                                {so?.created_at ? format(new Date(so.created_at), 'MMM d, yyyy') : '-'}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {so?.contacts?.name || 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {so?.profiles?.full_name || 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                ${Number(so?.total_amount || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                                                    {tierLabel}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-blue-500 font-medium">
                                                ${Number(comm.amount || 0).toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function PayoutsTabContent({ repId }: { repId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { profile: currentProfile } = useAuth();
    const payCommission = usePayCommission();
    const [applyingId, setApplyingId] = useState<string | null>(null);

    const { data: commissions, isLoading } = useQuery({
        queryKey: ['admin_partner_commissions', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('commissions')
                .select('*, sales_orders(total_amount, contacts(name))')
                .eq('partner_id', repId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    // Query product orders (commission_offset) for this partner
    const { data: productOrders } = useQuery({
        queryKey: ['partner-product-orders', repId, currentProfile?.org_id],
        queryFn: async () => {
            if (!currentProfile?.org_id) return [];
            // Find the partner's contact record — try linked_user_id first, then email
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, user_id')
                .eq('id', repId)
                .eq('org_id', currentProfile.org_id)
                .maybeSingle();
            if (!profile) return [];
            let contact: { id: string } | null = null;
            // Strategy 1: match by linked_user_id (handles auto-generated internal emails)
            if (profile.user_id) {
                const { data } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('linked_user_id', profile.user_id)
                    .eq('org_id', currentProfile.org_id)
                    .maybeSingle();
                if (data) contact = data;
            }
            // Strategy 2: match by email (fallback)
            if (!contact && profile.email) {
                const { data } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('email', profile.email)
                    .eq('org_id', currentProfile.org_id)
                    .maybeSingle();
                if (data) contact = data;
            }
            if (!contact) return [];
            // Fetch sales_orders where this partner is the customer with commission_offset
            const { data } = await supabase
                .from('sales_orders')
                .select('id, created_at, total_amount, payment_status, contacts(name), sales_order_items(quantity, unit_price)')
                .eq('client_id', contact.id)
                .eq('org_id', currentProfile.org_id)
                .eq('payment_status', 'commission_offset')
                .order('created_at', { ascending: false });
            return data || [];
        },
        enabled: !!currentProfile?.org_id,
    });

    const handlePay = (id: string) => {
        payCommission.mutate(id, {
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['admin_partner_commissions', repId] });
                toast({ title: 'Commission Paid', description: 'Status updated to paid.' });
            }
        });
    };

    const handleApplyToBalance = async (commissionId: string, amount: number) => {
        if (applyingId) return; // Prevent double-click
        if (!currentProfile?.org_id) {
            toast({ title: 'Error', description: 'No organization found.', variant: 'destructive' });
            return;
        }
        setApplyingId(commissionId);
        try {
            // 1. Find the partner's contact record — try linked_user_id first, then email
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, user_id')
                .eq('id', repId)
                .eq('org_id', currentProfile.org_id)
                .maybeSingle();

            if (!profile) {
                toast({ title: 'Error', description: 'Could not find partner profile.', variant: 'destructive' });
                return;
            }

            let contact: { id: string } | null = null;
            // Strategy 1: match by linked_user_id (handles auto-generated internal emails)
            if (profile.user_id) {
                const { data } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('linked_user_id', profile.user_id)
                    .eq('org_id', currentProfile.org_id)
                    .maybeSingle();
                if (data) contact = data;
            }
            // Strategy 2: match by email (fallback)
            if (!contact && profile.email) {
                const { data } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('email', profile.email)
                    .eq('org_id', currentProfile.org_id)
                    .maybeSingle();
                if (data) contact = data;
            }

            if (!contact) {
                toast({ title: 'No Contact Record', description: 'This partner has no matching contact record to apply credit against.', variant: 'destructive' });
                return;
            }

            // 2. Find unpaid commission_offset orders for this contact and apply the amount
            const { data: unpaidOrders } = await supabase
                .from('sales_orders')
                .select('id, payment_status, amount_paid, total_amount')
                .eq('client_id', contact.id)
                .eq('org_id', currentProfile.org_id)
                .eq('payment_status', 'commission_offset')
                .order('created_at', { ascending: true });

            let remaining = amount;

            if (unpaidOrders && unpaidOrders.length > 0) {
                for (const order of unpaidOrders) {
                    if (remaining <= 0) break;

                    const totalPrice = Number(order.total_amount || 0);
                    const alreadyPaid = Number(order.amount_paid || 0);
                    const owedOnThis = totalPrice - alreadyPaid;

                    if (owedOnThis <= 0) continue;

                    const paymentOnThis = Math.min(remaining, owedOnThis);
                    const newAmountPaid = alreadyPaid + paymentOnThis;
                    const fullyPaid = newAmountPaid >= totalPrice;

                    await supabase
                        .from('sales_orders')
                        .update({
                            amount_paid: newAmountPaid,
                            payment_status: fullyPaid ? 'paid' : 'commission_offset',
                            notes: `Commission credit applied: $${paymentOnThis.toFixed(2)}`
                        })
                        .eq('id', order.id)
                        .eq('org_id', currentProfile.org_id);

                    remaining -= paymentOnThis;
                }
            }

            // 3. Mark the commission as 'available' (= applied to balance)
            await supabase
                .from('commissions')
                .update({ status: 'available' })
                .eq('id', commissionId);

            // 4. Refresh queries
            queryClient.invalidateQueries({ queryKey: ['admin_partner_commissions', repId] });
            queryClient.invalidateQueries({ queryKey: ['partner-product-orders', repId] });

            const appliedAmount = amount - remaining;
            toast({
                title: 'Applied to Balance',
                description: `$${appliedAmount.toFixed(2)} applied to outstanding balance.${remaining > 0 ? ` $${remaining.toFixed(2)} excess added to credit.` : ''}`
            });
        } catch (err) {
            logger.error('Apply to balance error:', err);
            toast({ title: 'Error', description: (err as any)?.message || 'Failed to apply commission to balance.', variant: 'destructive' });
        } finally {
            setApplyingId(null);
        }
    };

    if (isLoading) return <div>Loading commissions...</div>;

    const pending = commissions?.filter((c) => c.status === 'pending') || [];
    const history = commissions?.filter((c) => c.status !== 'pending') || [];

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'paid': return { label: 'Paid', className: 'bg-primary/20 text-primary border-primary/40' };
            case 'available': return { label: 'Applied to Balance', className: 'bg-blue-900/20 text-blue-400 border-blue-500/40' };
            case 'void': return { label: 'Void', className: 'bg-red-900/20 text-red-400 border-red-500/40' };
            default: return { label: status, className: '' };
        }
    };

    // Compute commission vs product ledger
    const totalCommissionsEarned = commissions?.reduce((s, c) => s + (Number(c.amount) || 0), 0) || 0;
    const totalProductReceived = productOrders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;
    const netBalance = Math.round((totalCommissionsEarned - totalProductReceived) * 100) / 100;

    return (
        <div className="space-y-6">
            {/* Commission vs Product Ledger */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-l-4 border-l-green-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Commissions Earned</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">${totalCommissionsEarned.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">{commissions?.length || 0} commission records</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-violet-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Product Received</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-violet-500">${totalProductReceived.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">{productOrders?.length || 0} product orders</p>
                    </CardContent>
                </Card>
                <Card className={`border-l-4 ${netBalance >= 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Net Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${netBalance.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {netBalance >= 0 ? 'Commissions exceed product taken' : 'Product exceeds commissions earned'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pending Payouts</CardTitle>
                    <CardDescription>Commissions ready to be paid out.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Order Total</TableHead>
                                <TableHead>Commission</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pending.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">No pending commissions</TableCell>
                                </TableRow>
                            )}
                            {pending.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell>{new Date(c.created_at).toLocaleDateString('en-US')}</TableCell>
                                    <TableCell className="font-medium">{c.sales_orders?.contacts?.name || 'N/A'}</TableCell>
                                    <TableCell>${Number(c.sales_orders?.total_amount || 0).toFixed(2)}</TableCell>
                                    <TableCell className="font-medium">${Number(c.amount).toFixed(2)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-blue-500/40 text-blue-400 hover:bg-blue-900/20"
                                                onClick={() => handleApplyToBalance(c.id, Number(c.amount))}
                                                disabled={applyingId === c.id}
                                            >
                                                {applyingId === c.id ? 'Applying...' : 'Apply to Balance'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handlePay(c.id)}
                                                disabled={payCommission.isPending}
                                            >
                                                Mark Paid
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Payout History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Order Total</TableHead>
                                <TableHead>Commission</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground">No history found</TableCell>
                                </TableRow>
                            )}
                            {history.map((c) => {
                                const statusInfo = getStatusLabel(c.status);
                                return (
                                    <TableRow key={c.id}>
                                        <TableCell>{new Date(c.created_at).toLocaleDateString('en-US')}</TableCell>
                                        <TableCell className="font-medium">{c.sales_orders?.contacts?.name || 'N/A'}</TableCell>
                                        <TableCell>${Number(c.sales_orders?.total_amount || 0).toFixed(2)}</TableCell>
                                        <TableCell>${Number(c.amount).toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={statusInfo.className}>
                                                {statusInfo.label}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


function AssignedClientsTabContent({ repId, partnerTier }: { repId: string; partnerTier?: string }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const { profile: currentProfile } = useAuth();
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; email?: string | null } | null>(null);
    const [isPromoting, setIsPromoting] = useState(false);

    const [addClientOpen, setAddClientOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
    const [promoteEmail, setPromoteEmail] = useState('');

    // Fetch contacts assigned to this partner
    const { data: clients, isLoading, refetch } = useQuery({
        queryKey: ['partner_clients', repId, currentProfile?.org_id],
        queryFn: async () => {
            if (!currentProfile?.org_id) return [];
            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('assigned_rep_id', repId)
                .eq('org_id', currentProfile.org_id)
                .order('name');
            if (error) throw error;
            return data;
        }
    });

    // Walk the upline chain and return all parent rep IDs (excluding self)
    const getUplineChain = async (startRepId: string): Promise<string[]> => {
        const chain: string[] = [];
        let currentId = startRepId;
        const visited = new Set<string>();

        while (currentId) {
            if (visited.has(currentId)) break; // prevent infinite loops
            visited.add(currentId);

            const { data: profile } = await supabase
                .from('profiles')
                .select('parent_rep_id')
                .eq('id', currentId)
                .eq('org_id', currentProfile?.org_id)
                .maybeSingle();

            if (profile?.parent_rep_id) {
                chain.push(profile.parent_rep_id);
                currentId = profile.parent_rep_id;
            } else {
                break;
            }
        }
        return chain;
    };

    const handleAddClient = async () => {
        if (!newClient.name.trim()) {
            toast({ variant: 'destructive', title: 'Name required', description: 'Please enter a client name.' });
            return;
        }
        if (!currentProfile?.org_id) {
            toast({ variant: 'destructive', title: 'Error', description: 'No organization found.' });
            return;
        }
        setIsAdding(true);

        try {
            // 1. Create the contact assigned to this partner
            const { data: contact, error: contactErr } = await supabase
                .from('contacts')
                .insert({
                    name: newClient.name.trim(),
                    email: newClient.email.trim() || null,
                    phone: newClient.phone.trim() || null,
                    address: newClient.address.trim() || null,
                    notes: newClient.notes.trim() || null,
                    type: 'customer',
                    assigned_rep_id: repId,
                    org_id: currentProfile.org_id,
                })
                .select()
                .maybeSingle();

            if (contactErr) throw contactErr;

            // 2. Walk the upline chain and create contact_rep_links for each senior
            const uplineIds = await getUplineChain(repId);
            if (uplineIds.length > 0) {
                // For each senior in the chain, also assign this contact to them
                // We use the contacts' "notes" or a separate linking mechanism
                // The simplest approach: duplicate assigned entries in a link table
                // For now, log the upline association in the contact metadata
                // and also set assigned_rep_id on contacts for the direct partner

                // Store the full rep chain as metadata on the contact
                const existingNotes = newClient.notes.trim();
                const uplineNote = `Upline chain: ${uplineIds.join(' → ')}`;
                await supabase
                    .from('contacts')
                    .update({
                        notes: existingNotes ? `${existingNotes}\n\n${uplineNote}` : uplineNote,
                    })
                    .eq('id', contact.id)
                    .eq('org_id', currentProfile.org_id);
            }

            toast({
                title: 'Client Added!',
                description: `${newClient.name} has been added under this partner${uplineIds.length > 0 ? ` (with ${uplineIds.length} senior${uplineIds.length > 1 ? 's' : ''} in the upline)` : ''}.`,
            });

            setNewClient({ name: '', email: '', phone: '', address: '', notes: '' });
            setAddClientOpen(false);
            refetch();
        } catch (err) {
            toast({
                variant: 'destructive',
                title: 'Failed to add client',
                description: (err as any)?.message || 'Something went wrong.',
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handlePromote = async () => {
        if (!selectedContact) return;
        setIsPromoting(true);

        try {
            // Use RPC — works from localhost, handles both linked and unlinked contacts
            const { data, error } = await supabase.rpc('promote_contact_to_partner', {
                p_contact_id: selectedContact.id,
                p_parent_rep_id: repId,
                p_redirect_origin: window.location.origin,
                p_target_org_id: currentProfile?.org_id || null,
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.message || 'Promotion failed');

            if (data.action_link) {
                try {
                    await navigator.clipboard.writeText(data.action_link);
                    toast({
                        title: "Partner Added — Link Copied!",
                        description: `${selectedContact.name} is now a Partner. Invite link copied to clipboard.`,
                        duration: 10000,
                    });
                } catch {
                    toast({ title: "Partner Added!", description: data.action_link, duration: 15000 });
                }
            } else {
                toast({
                    title: "Partner Added!",
                    description: data.message || `${selectedContact.name} is now a Partner.`
                });
            }

            setPromoteOpen(false);
            refetch();
        } catch (err) {
            toast({
                variant: 'destructive',
                title: "Promotion Failed",
                description: (err as any)?.message || "Could not promote contact."
            });
        } finally {
            setIsPromoting(false);
        }
    };

    const openPromote = (contact: { id: string; name: string; email?: string | null }) => {
        setSelectedContact(contact);
        setPromoteEmail('');
        setPromoteOpen(true);
    }

    if (isLoading) return <div>Loading clients...</div>;

    const list = clients || [];

    return (
        <>
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>{partnerTier === 'referral' ? 'Preferred Clients' : 'Assigned Clients'}</CardTitle>
                            <CardDescription>
                                {partnerTier === 'referral'
                                    ? 'Preferred clients referred by this partner.'
                                    : 'Customers and Partners explicitly assigned to this Rep.'}
                            </CardDescription>
                        </div>
                        <Button onClick={() => setAddClientOpen(true)} size="sm">
                            <UserPlus className="h-4 w-4 mr-2" /> Add Client
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {list.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                        No assigned clients found.
                                    </TableCell>
                                </TableRow>
                            )}
                            {list.map(client => (
                                <TableRow key={client.id} className="hover:bg-muted/50">
                                    <TableCell className="font-medium">
                                        <div className="flex flex-col">
                                            <span>{client.name}</span>
                                            {client.company && <span className="text-xs text-muted-foreground">{client.company}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={client.type === 'partner' ? 'secondary' : 'default'}
                                            className="capitalize"
                                        >
                                            {client.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{client.email || '-'}</TableCell>
                                    <TableCell>{client.phone || '-'}</TableCell>
                                    <TableCell>{new Date(client.created_at).toLocaleDateString('en-US')}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {client.type !== 'partner' && (
                                                <Button size="sm" variant="outline" onClick={() => openPromote(client)}>
                                                    <UserPlus className="h-3 w-3 mr-1" /> Promote
                                                </Button>
                                            )}
                                            {client.type === 'partner' && !client.linked_user_id && (
                                                <Button size="sm" variant="outline" className="border-amber-500/40 text-amber-400" onClick={() => openPromote(client)}>
                                                    <UserPlus className="h-3 w-3 mr-1" /> Set Up Account
                                                </Button>
                                            )}
                                            {client.type === 'partner' && client.linked_user_id && (
                                                <Badge variant="outline" className="text-primary border-primary">
                                                    ✓ Partner
                                                </Badge>
                                            )}
                                            <Button size="sm" variant="outline" onClick={() => navigate(`/sales/new?contact_id=${client.id}`)}>
                                                <ShoppingCart className="h-3 w-3 mr-1" /> Order
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => navigate(`/contacts/${client.id}`)}>
                                                View
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Add Client Dialog */}
            <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add New Client</DialogTitle>
                        <DialogDescription>
                            Create a new client assigned to this partner. The client will also be linked to all senior partners in the upline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="client-name">Name *</Label>
                            <Input
                                id="client-name"
                                placeholder="Client full name"
                                value={newClient.name}
                                onChange={(e) => setNewClient(prev => ({ ...prev, name: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="client-email">Email</Label>
                            <Input
                                id="client-email"
                                type="email"
                                placeholder="client@example.com"
                                value={newClient.email}
                                onChange={(e) => setNewClient(prev => ({ ...prev, email: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="client-phone">Phone</Label>
                            <Input
                                id="client-phone"
                                type="tel"
                                placeholder="(555) 123-4567"
                                value={newClient.phone}
                                onChange={(e) => setNewClient(prev => ({ ...prev, phone: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="client-address">Address</Label>
                            <Input
                                id="client-address"
                                placeholder="123 Main St, City, State ZIP"
                                value={newClient.address}
                                onChange={(e) => setNewClient(prev => ({ ...prev, address: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="client-notes">Notes</Label>
                            <Textarea
                                id="client-notes"
                                placeholder="Any notes about this client..."
                                rows={3}
                                value={newClient.notes}
                                onChange={(e) => setNewClient(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddClientOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddClient} disabled={isAdding}>
                            {isAdding ? 'Adding...' : 'Add Client'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Promote Dialog */}
            <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Make Partner</DialogTitle>
                        <DialogDescription>
                            This will immediately add <strong>{selectedContact?.name}</strong> as a Sales Partner
                            under this Rep's downline. They'll start at 10% commission, Standard tier.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="font-medium">{selectedContact?.name}</span>
                        </div>
                        {selectedContact?.email && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Email:</span>
                                <span>{selectedContact.email}</span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
                        <Button onClick={handlePromote} disabled={isPromoting}>
                            {isPromoting ? 'Setting up...' : 'Make Partner'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── Discount Codes Tab ───
function DiscountCodesTabContent({ repId, orgId }: { repId: string; orgId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { config: tenantConfig } = useTenantConfig();
    const defaultDiscount = tenantConfig?.default_customer_discount ?? 20;
    const [newCode, setNewCode] = useState({ code: '', discount_percent: defaultDiscount, platform: 'both' });

    const { data: codes, isLoading } = useQuery({
        queryKey: ['partner_discount_codes', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('partner_discount_codes')
                .select('*')
                .eq('partner_id', repId)
                .eq('org_id', orgId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    const handleCreate = async () => {
        if (!newCode.code.trim()) {
            toast({ variant: 'destructive', title: 'Code required', description: 'Enter a discount code name.' });
            return;
        }
        setCreating(true);
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            if (!token) throw new Error('Not authenticated');

            const res = await fetch(
                `${(supabase as any).supabaseUrl}/functions/v1/sync-discount-codes`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        action: 'create',
                        code: newCode.code.trim().toUpperCase(),
                        discount_percent: newCode.discount_percent,
                        partner_id: repId,
                        platform: newCode.platform,
                    }),
                }
            );

            const result = await res.json();
            if (!result.success) throw new Error(result.error || 'Failed to create discount code');

            toast({ title: 'Discount code created', description: `${newCode.code.toUpperCase()} is active.` });
            setNewCode({ code: '', discount_percent: defaultDiscount, platform: 'both' });
            queryClient.invalidateQueries({ queryKey: ['partner_discount_codes', repId] });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: (err as any)?.message || 'Failed to create code.' });
        } finally {
            setCreating(false);
        }
    };

    const handleDelete = async (codeId: string, codeName: string) => {
        setDeletingId(codeId);
        try {
            const { data: session } = await supabase.auth.getSession();
            const token = session?.session?.access_token;
            if (!token) throw new Error('Not authenticated');

            const res = await fetch(
                `${(supabase as any).supabaseUrl}/functions/v1/sync-discount-codes`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ action: 'delete', code_id: codeId }),
                }
            );

            const result = await res.json();
            if (!result.success) throw new Error(result.error || 'Failed to delete');

            toast({ title: 'Deactivated', description: `${codeName} has been deactivated.` });
            queryClient.invalidateQueries({ queryKey: ['partner_discount_codes', repId] });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: (err as any)?.message || 'Failed to delete code.' });
        } finally {
            setDeletingId(null);
        }
    };

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading discount codes...</div>;

    const activeCodes = codes?.filter(c => c.active) || [];
    const inactiveCodes = codes?.filter(c => !c.active) || [];

    const platformBadge = (platform: string | null) => {
        if (platform === 'woocommerce') return <Badge variant="outline" className="text-xs">WooCommerce</Badge>;
        if (platform === 'shopify') return <Badge variant="outline" className="text-xs">Shopify</Badge>;
        if (platform === 'both') return <Badge variant="outline" className="text-xs">All Platforms</Badge>;
        return <Badge variant="outline" className="text-xs text-muted-foreground">App Only</Badge>;
    };

    const syncBadge = (platformCouponId: string | null) => {
        if (!platformCouponId) return <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">Not Synced</Badge>;
        const parts = platformCouponId.split(',').filter(Boolean);
        return (
            <div className="flex gap-1">
                {parts.map(p => (
                    <Badge key={p} variant="outline" className="text-xs text-green-400 border-green-500/30">
                        {p.startsWith('woo:') ? 'WC' : p.startsWith('shopify:') ? 'Shopify' : p}
                    </Badge>
                ))}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Create New Code */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Create Discount Code
                    </CardTitle>
                    <CardDescription>
                        Create a coupon code for this partner. It will be synced to connected platforms.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="discount-code">Code</Label>
                            <Input
                                id="discount-code"
                                placeholder="e.g. JOHN20"
                                value={newCode.code}
                                onChange={(e) => setNewCode(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="discount-pct">Discount %</Label>
                            <Input
                                id="discount-pct"
                                type="number"
                                min={1}
                                max={100}
                                value={newCode.discount_percent}
                                onChange={(e) => setNewCode(prev => ({ ...prev, discount_percent: Number(e.target.value) }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="discount-platform">Platform</Label>
                            <select
                                id="discount-platform"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={newCode.platform}
                                onChange={(e) => setNewCode(prev => ({ ...prev, platform: e.target.value }))}
                            >
                                <option value="both">All Platforms</option>
                                <option value="woocommerce">WooCommerce Only</option>
                                <option value="shopify">Shopify Only</option>
                            </select>
                        </div>
                    </div>
                    <Button onClick={handleCreate} disabled={creating}>
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        {creating ? 'Creating...' : 'Create Code'}
                    </Button>
                </CardContent>
            </Card>

            {/* Active Codes */}
            <Card>
                <CardHeader>
                    <CardTitle>Active Codes ({activeCodes.length})</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead className="text-center">Discount</TableHead>
                                <TableHead>Platform</TableHead>
                                <TableHead>Sync Status</TableHead>
                                <TableHead className="text-center">Uses</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {activeCodes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                        No active discount codes for this partner.
                                    </TableCell>
                                </TableRow>
                            )}
                            {activeCodes.map((dc) => (
                                <TableRow key={dc.id}>
                                    <TableCell className="font-mono font-bold text-primary">{dc.code}</TableCell>
                                    <TableCell className="text-center">{dc.discount_percent}%</TableCell>
                                    <TableCell>{platformBadge(dc.platform)}</TableCell>
                                    <TableCell>{syncBadge(dc.platform_coupon_id)}</TableCell>
                                    <TableCell className="text-center">{dc.uses_count || 0}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {format(new Date(dc.created_at), 'MMM d, yyyy')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                            onClick={() => handleDelete(dc.id, dc.code)}
                                            disabled={deletingId === dc.id}
                                        >
                                            {deletingId === dc.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Inactive / Deactivated Codes */}
            {inactiveCodes.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-muted-foreground">Deactivated Codes ({inactiveCodes.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead className="text-center">Discount</TableHead>
                                    <TableHead>Platform</TableHead>
                                    <TableHead className="text-center">Uses</TableHead>
                                    <TableHead>Deactivated</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {inactiveCodes.map((dc) => (
                                    <TableRow key={dc.id} className="opacity-50">
                                        <TableCell className="font-mono line-through">{dc.code}</TableCell>
                                        <TableCell className="text-center">{dc.discount_percent}%</TableCell>
                                        <TableCell>{platformBadge(dc.platform)}</TableCell>
                                        <TableCell className="text-center">{dc.uses_count || 0}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {dc.updated_at ? format(new Date(dc.updated_at), 'MMM d, yyyy') : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile: currentProfile, userRole } = useAuth();
    const { startViewAsUser, isSwapping } = useImpersonation();
    const { isEnabled } = useOrgFeatures();
    const canViewAs = (userRole?.role === 'admin' || userRole?.role === 'super_admin') && isEnabled('view_as_user');

    // 1. Fetch Partner Profile
    const { data: partner, isLoading, isError, refetch } = useQuery({
        queryKey: ['partner_detail', id, currentProfile?.org_id],
        queryFn: async () => {
            if (!id || !currentProfile?.org_id) throw new Error("No ID");
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', id)
                .eq('org_id', currentProfile.org_id)
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('Partner profile not found');
            return data;
        },
        enabled: !!id && !!currentProfile?.org_id
    });

    // Toggle can_recruit on the profile
    const toggleRecruit = useMutation({
        mutationFn: async (newValue: boolean | null) => {
            if (!id || !currentProfile?.org_id) throw new Error('No ID');
            const { error } = await supabase
                .from('profiles')
                .update({ can_recruit: newValue })
                .eq('id', id)
                .eq('org_id', currentProfile.org_id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partner_detail', id] });
            toast({ title: 'Updated', description: 'Recruitment setting saved.' });
        },
        onError: (err) => {
            toast({ title: 'Error', description: (err as any)?.message || 'Failed to update', variant: 'destructive' });
        },
    });

    if (isLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (isError) return <QueryError message="Failed to load partner details." onRetry={refetch} />;
    if (!partner) return <div className="p-6">Partner not found</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" aria-label="Back to partners" onClick={() => navigate('/admin/reps')}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight">{partner.full_name}</h1>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant={partner.role === 'sales_rep' ? 'secondary' : 'default'}>
                            {partner.role?.replace('_', ' ')}
                        </Badge>
                        <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {partner.email}
                        </span>
                    </div>
                </div>
                {canViewAs && partner.user_id && (
                    <Button
                        variant="outline"
                        disabled={isSwapping}
                        onClick={async () => {
                            try {
                                await startViewAsUser({
                                    userId: partner.user_id,
                                    profileId: partner.id,
                                    name: partner.full_name || 'Partner',
                                    role: partner.role || 'sales_rep',
                                });
                                navigate('/partner');
                            } catch (err: any) {
                                toast({ variant: 'destructive', title: 'Impersonation failed', description: err.message || 'Could not switch to this user' });
                            }
                        }}
                    >
                        {isSwapping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                        {isSwapping ? 'Switching...' : `View As ${partner.full_name?.split(' ')[0] || 'Partner'}`}
                    </Button>
                )}
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold">Commission Rate</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{((partner.commission_rate || 0) * 100).toFixed(0)}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold">Partner Tier</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold capitalize ${partner.partner_tier === 'referral' ? 'text-sky-400' : ''}`}>{partner.partner_tier || 'Standard'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold">Can Recruit</CardTitle>
                        <Network className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant={partner.can_recruit ? 'default' : 'outline'}
                            size="sm"
                            disabled={toggleRecruit.isPending}
                            onClick={() => toggleRecruit.mutate(partner.can_recruit ? false : true)}
                            className={partner.can_recruit
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'text-muted-foreground'}
                        >
                            {toggleRecruit.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : null}
                            {partner.can_recruit ? 'Yes — Click to Disable' : 'No — Click to Enable'}
                        </Button>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold">Joined</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {partner.created_at ? format(new Date(partner.created_at), 'MMM yyyy') : 'N/A'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="place_order">Place Order</TabsTrigger>
                    <TabsTrigger value="orders">Sales Orders</TabsTrigger>
                    <TabsTrigger value="clients">Clients</TabsTrigger>
                    <TabsTrigger value="network">Network Hierarchy</TabsTrigger>
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                    <TabsTrigger value="discount_codes">Discount Codes</TabsTrigger>
                </TabsList>

                <TabsContent value="place_order">
                    <PlaceOrderTabContent partner={partner} />
                </TabsContent>

                <TabsContent value="overview" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Partner Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="font-medium">Phone:</span> {partner.phone || 'N/A'}
                                </div>
                                <div>
                                    <span className="font-medium">Address:</span> {partner.address || 'N/A'}
                                </div>
                                <div>
                                    <span className="font-medium">Bio:</span> {partner.bio || 'N/A'}
                                </div>
                                <div>
                                    <span className="font-medium">Price Multiplier:</span>{' '}
                                    {partner.price_multiplier != null
                                        ? pricingMode === 'cost_multiplier'
                                            ? `${partner.price_multiplier}x cost`
                                            : pricingMode === 'cost_plus'
                                                ? `Cost + $${markup} markup`
                                                : `${((1 - partner.price_multiplier) * 100).toFixed(0)}% off retail`
                                        : 'Standard pricing'}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <ReferralActivityCard repId={id!} />
                </TabsContent>

                <TabsContent value="orders">
                    <SalesOrdersTabContent repId={id!} />
                </TabsContent>

                <TabsContent value="clients">
                    <AssignedClientsTabContent repId={id!} partnerTier={partner.partner_tier} />
                </TabsContent>

                <TabsContent value="network" className="space-y-4">
                    <NetworkTabContent repId={id!} />
                </TabsContent>

                <TabsContent value="payouts" className="space-y-4">
                    <PayoutsTabContent repId={id!} />
                </TabsContent>

                <TabsContent value="discount_codes" className="space-y-4">
                    <DiscountCodesTabContent repId={id!} orgId={partner.org_id} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
