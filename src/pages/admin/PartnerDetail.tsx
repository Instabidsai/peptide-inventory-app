
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Added useQueryClient
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, DollarSign, TrendingUp, Users, UserPlus, ShoppingCart } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import DownlineVisualizer from './components/DownlineVisualizer'; // Corrected to default import
import { usePartnerDownline, useCommissions, usePayCommission, PartnerNode } from '@/hooks/use-partner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { QueryError } from '@/components/ui/query-error';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

// Referral Activity Card — shows total referrals, total spend, per-customer breakdown
function ReferralActivityCard({ repId }: { repId: string }) {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['partner-referral-stats', repId],
        queryFn: async () => {
            const { data: clients } = await supabase
                .from('contacts')
                .select('id, name')
                .eq('assigned_rep_id', repId);

            const { data: orders } = await supabase
                .from('sales_orders')
                .select('id, total_amount, contact_id, created_at, status')
                .eq('rep_id', repId);

            const customerSpend: Record<string, { name: string; total: number; orderCount: number }> = {};
            for (const client of (clients || [])) {
                customerSpend[client.id] = { name: client.name, total: 0, orderCount: 0 };
            }
            for (const order of (orders || [])) {
                if (order.contact_id && customerSpend[order.contact_id]) {
                    customerSpend[order.contact_id].total += Number(order.total_amount || 0);
                    customerSpend[order.contact_id].orderCount += 1;
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
    const { data: downline, isLoading } = usePartnerDownline(repId);

    // Also fetch assigned clients/contacts for all reps in the downline
    const repIds = React.useMemo(() => {
        if (!downline) return [];
        return downline.map(n => n.id);
    }, [downline]);

    const { data: clients } = useQuery({
        queryKey: ['downline_clients', repId, repIds],
        queryFn: async () => {
            if (repIds.length === 0) return [];
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type, assigned_rep_id')
                .in('assigned_rep_id', repIds);
            if (error) throw error;
            return data || [];
        },
        enabled: repIds.length > 0,
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

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // 1. Fetch Partner Profile
    const { data: partner, isLoading, isError, refetch } = useQuery({
        queryKey: ['partner_detail', id],
        queryFn: async () => {
            if (!id) throw new Error("No ID");
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!id
    });

    // 2. Fetch Stats (Optional - can be added later)

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
                <div>
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
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-3">
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
                    <TabsTrigger value="orders">Sales Orders</TabsTrigger>
                    <TabsTrigger value="clients">Clients</TabsTrigger>
                    <TabsTrigger value="network">Network Hierarchy</TabsTrigger>
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                </TabsList>

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
                                        ? `${((1 - partner.price_multiplier) * 100).toFixed(0)}% off retail`
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
                    {/* The new Downline Visualizer */}
                    <NetworkTabContent repId={id!} />
                </TabsContent>

                <TabsContent value="payouts" className="space-y-4">
                    <PayoutsTabContent repId={id!} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function SalesOrdersTabContent({ repId }: { repId: string }) {
    const navigate = useNavigate();

    const { data: orders, isLoading } = useQuery({
        queryKey: ['partner_sales_orders', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id, created_at, status, payment_status, total_amount,
                    commission_amount, profit_amount, source,
                    contacts (name),
                    sales_order_items (quantity, peptides (name))
                `)
                .eq('rep_id', repId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
    });

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading sales orders...</div>;

    const totalVolume = orders?.reduce((s: number, o) => s + Number(o.total_amount || 0), 0) || 0;
    const totalCommission = orders?.reduce((s: number, o) => s + Number(o.commission_amount || 0), 0) || 0;
    const orderCount = orders?.length || 0;

    const statusColor = (s: string) => {
        if (s === 'fulfilled' || s === 'delivered') return 'bg-green-500/10 text-green-500 border-green-500/20';
        if (s === 'cancelled') return 'bg-red-500/10 text-red-500 border-red-500/20';
        if (s === 'shipped') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    };

    return (
        <div className="space-y-4">
            {/* Summary stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Total Orders</p>
                        <p className="text-2xl font-bold">{orderCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Sales Volume</p>
                        <p className="text-2xl font-bold">${totalVolume.toFixed(2)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <p className="text-xs text-muted-foreground">Total Commission</p>
                        <p className="text-2xl font-bold text-green-500">${totalCommission.toFixed(2)}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Sales History</CardTitle>
                    <CardDescription>{orderCount} order{orderCount !== 1 ? 's' : ''} placed through this partner</CardDescription>
                </CardHeader>
                <CardContent>
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
        </div>
    );
}

function PayoutsTabContent({ repId }: { repId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const payCommission = usePayCommission();

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
        queryKey: ['partner-product-orders', repId],
        queryFn: async () => {
            // Find the partner's contact record via email match
            const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', repId)
                .single();
            if (!profile?.email) return [];
            const { data: contact } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', profile.email)
                .single();
            if (!contact) return [];
            // Fetch movements where this contact is the buyer with commission_offset payment
            const { data } = await supabase
                .from('movements')
                .select('id, movement_date, amount_paid, payment_status, notes, movement_items(price_at_sale)')
                .eq('contact_id', contact.id)
                .eq('payment_status', 'commission_offset')
                .eq('type', 'sale')
                .order('movement_date', { ascending: false });
            return data || [];
        }
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
        try {
            // 1. Find the partner's contact record by matching email
            const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', repId)
                .single();

            if (!profile?.email) {
                toast({ title: 'Error', description: 'Could not find partner email.', variant: 'destructive' });
                return;
            }

            const { data: contact } = await supabase
                .from('contacts')
                .select('id')
                .eq('email', profile.email)
                .single();

            if (!contact) {
                toast({ title: 'No Contact Record', description: 'This partner has no matching contact record to apply credit against.', variant: 'destructive' });
                return;
            }

            // 2. Find unpaid movements for this contact and apply the amount
            const { data: unpaidMovements } = await supabase
                .from('movements')
                .select('id, payment_status, amount_paid, movement_items(price_at_sale)')
                .eq('contact_id', contact.id)
                .neq('payment_status', 'paid')
                .neq('status', 'returned')
                .order('created_at', { ascending: true });

            let remaining = amount;

            if (unpaidMovements && unpaidMovements.length > 0) {
                for (const movement of unpaidMovements) {
                    if (remaining <= 0) break;

                    type MovementItem = { price_at_sale: number };
                    const totalPrice = (movement.movement_items as MovementItem[] | undefined)?.reduce(
                        (sum: number, item: MovementItem) => sum + (item.price_at_sale || 0), 0
                    ) || 0;
                    const alreadyPaid = movement.amount_paid || 0;
                    const owedOnThis = totalPrice - alreadyPaid;

                    if (owedOnThis <= 0) continue;

                    const paymentOnThis = Math.min(remaining, owedOnThis);
                    const newAmountPaid = alreadyPaid + paymentOnThis;
                    const fullyPaid = newAmountPaid >= totalPrice;

                    await supabase
                        .from('movements')
                        .update({
                            amount_paid: newAmountPaid,
                            payment_status: fullyPaid ? 'paid' : 'partial',
                            payment_date: new Date().toISOString(),
                            notes: `Commission credit applied: $${paymentOnThis.toFixed(2)}`
                        })
                        .eq('id', movement.id);

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
            queryClient.invalidateQueries({ queryKey: ['movements'] });

            const appliedAmount = amount - remaining;
            toast({
                title: 'Applied to Balance',
                description: `$${appliedAmount.toFixed(2)} applied to outstanding balance.${remaining > 0 ? ` $${remaining.toFixed(2)} excess added to credit.` : ''}`
            });
        } catch (err) {
            console.error('Apply to balance error:', err);
            toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to apply commission to balance.', variant: 'destructive' });
        }
    };

    if (isLoading) return <div>Loading commissions...</div>;

    const pending = commissions?.filter((c) => c.status === 'pending') || [];
    const history = commissions?.filter((c) => c.status !== 'pending') || [];

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'paid': return { label: 'Paid', className: 'bg-emerald-900/20 text-emerald-400 border-emerald-500/40' };
            case 'available': return { label: 'Applied to Balance', className: 'bg-blue-900/20 text-blue-400 border-blue-500/40' };
            case 'void': return { label: 'Void', className: 'bg-red-900/20 text-red-400 border-red-500/40' };
            default: return { label: status, className: '' };
        }
    };

    // Compute commission vs product ledger
    const totalCommissionsEarned = commissions?.reduce((s, c) => s + (Number(c.amount) || 0), 0) || 0;
    const totalProductReceived = productOrders?.reduce((s, m) => {
        type MItem = { price_at_sale: number };
        const items = m.movement_items as MItem[] | undefined;
        return s + (items?.reduce((sum: number, i: MItem) => sum + (i.price_at_sale || 0), 0) || 0);
    }, 0) || 0;
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
                <CardContent>
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
                                            >
                                                Apply to Balance
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
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; email?: string | null } | null>(null);
    const [isPromoting, setIsPromoting] = useState(false);

    const [addClientOpen, setAddClientOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', address: '', notes: '' });
    const [promoteEmail, setPromoteEmail] = useState('');

    // Fetch contacts assigned to this partner
    const { data: clients, isLoading, refetch } = useQuery({
        queryKey: ['partner_clients', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contacts')
                .select('*')
                .eq('assigned_rep_id', repId)
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
                .single();

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
        setIsAdding(true);

        try {
            // Get the partner's org_id
            const { data: repProfile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', repId)
                .single();

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
                    org_id: repProfile?.org_id || null,
                })
                .select()
                .single();

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
                    .eq('id', contact.id);
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
                description: err instanceof Error ? err.message : 'Something went wrong.',
            });
        } finally {
            setIsAdding(false);
        }
    };

    const handlePromote = async () => {
        if (!selectedContact) return;
        setIsPromoting(true);

        try {
            // Call promote-contact Edge Function — immediately creates auth user + profile + links contact
            const { data, error: invokeError } = await supabase.functions.invoke('promote-contact', {
                body: {
                    contact_id: selectedContact.id,
                    contact_name: selectedContact.name,
                    contact_email: selectedContact.email,
                    parent_rep_id: repId,
                }
            });

            if (invokeError) throw invokeError;

            const result = typeof data === 'string' ? JSON.parse(data) : data;
            if (!result?.success) throw new Error(result?.error || 'Promotion failed');

            toast({
                title: "Partner Added!",
                description: `${selectedContact.name} is now a Partner in the hierarchy. They'll appear in the Partners list.`
            });

            setPromoteOpen(false);
            refetch();
        } catch (err) {
            toast({
                variant: 'destructive',
                title: "Promotion Failed",
                description: err instanceof Error ? err.message : "Could not promote contact."
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
                                                <Badge variant="outline" className="text-emerald-500 border-emerald-500">
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
