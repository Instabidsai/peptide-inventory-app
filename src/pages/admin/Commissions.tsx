
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { DollarSign, Users, TrendingUp, Clock, CheckCircle, Wallet } from 'lucide-react';
import { format } from 'date-fns';

interface CommissionRow {
    id: string;
    created_at: string;
    partner_id: string;
    sale_id: string | null;
    type: string;
    amount: number;
    commission_rate: number;
    status: string;
    profiles: { full_name: string; credit_balance: number; partner_tier: string | null } | null;
    sales_orders: { id: string; total_amount: number; contacts: { name: string } | null } | null;
}

export default function Commissions() {
    // Fetch ALL commissions — NO joins (Supabase FK resolution is unreliable)
    const { data: commissions, isLoading, isError, refetch } = useQuery({
        queryKey: ['admin_commissions_full'],
        queryFn: async () => {
            // 1. Fetch flat commissions
            const { data: rawCommissions, error } = await supabase
                .from('commissions')
                .select('id, created_at, partner_id, sale_id, type, amount, commission_rate, status')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!rawCommissions?.length) return [] as CommissionRow[];

            // 2. Batch-fetch sales orders
            const saleIds = [...new Set(rawCommissions.map((c) => c.sale_id).filter(Boolean))] as string[];
            const { data: orders } = saleIds.length
                ? await supabase.from('sales_orders').select('id, total_amount, client_id').in('id', saleIds)
                : { data: [] };
            const orderMap = new Map((orders || []).map((o) => [o.id, o]));

            // 3. Batch-fetch partner profiles
            const partnerIds = [...new Set(rawCommissions.map((c) => c.partner_id).filter(Boolean))] as string[];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, credit_balance, partner_tier')
                .in('id', partnerIds);
            const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

            // 4. Batch-fetch customer contacts
            const contactIds = [...new Set((orders || []).map((o) => o.client_id).filter(Boolean))] as string[];
            const { data: contacts } = contactIds.length
                ? await supabase.from('contacts').select('id, name').in('id', contactIds)
                : { data: [] };
            const contactMap = new Map((contacts || []).map(c => [c.id, c]));

            // 5. Merge into final rows
            return rawCommissions.map((c) => {
                const order = orderMap.get(c.sale_id) || null;
                return {
                    ...c,
                    profiles: profileMap.get(c.partner_id) || null,
                    sales_orders: order
                        ? { ...order, contacts: contactMap.get(order.client_id) || null }
                        : null
                };
            }) as CommissionRow[];
        },
    });

    // Compute summary stats (with rounding to avoid floating-point drift)
    const rawStats = (commissions || []).reduce(
        (acc, c) => {
            const amt = Number(c.amount) || 0;
            acc.total += amt;
            acc.count += 1;
            switch (c.status) {
                case 'pending': acc.pending += amt; acc.pendingCount += 1; break;
                case 'available': acc.available += amt; acc.availableCount += 1; break;
                case 'paid': acc.paid += amt; acc.paidCount += 1; break;
                case 'applied_to_debt': acc.appliedToDebt += amt; acc.appliedCount += 1; break;
                default: acc.other += amt; break;
            }
            // Order totals for weighted avg rate
            const orderTotal = Number(c.sales_orders?.total_amount) || 0;
            acc.totalOrderValue += orderTotal;
            return acc;
        },
        { total: 0, count: 0, pending: 0, pendingCount: 0, available: 0, availableCount: 0, paid: 0, paidCount: 0, appliedToDebt: 0, appliedCount: 0, other: 0, totalOrderValue: 0 }
    );
    const stats = {
        ...rawStats,
        total: Math.round(rawStats.total * 100) / 100,
        pending: Math.round(rawStats.pending * 100) / 100,
        available: Math.round(rawStats.available * 100) / 100,
        paid: Math.round(rawStats.paid * 100) / 100,
        appliedToDebt: Math.round(rawStats.appliedToDebt * 100) / 100,
        other: Math.round(rawStats.other * 100) / 100,
        totalOrderValue: Math.round(rawStats.totalOrderValue * 100) / 100,
    };

    const avgRate = commissions?.length
        ? Math.round((commissions.reduce((sum, c) => sum + (Number(c.commission_rate) || 0), 0) / commissions.length * 100) * 100) / 100
        : 0;

    const statusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500"><Clock className="h-3 w-3" />Pending</Badge>;
            case 'available':
                return <Badge variant="outline" className="gap-1 text-blue-500 border-blue-500"><Wallet className="h-3 w-3" />Available</Badge>;
            case 'paid':
                return <Badge variant="outline" className="gap-1 text-green-500 border-green-500"><CheckCircle className="h-3 w-3" />Paid Cash</Badge>;
            case 'applied_to_debt':
                return <Badge variant="outline" className="gap-1 text-purple-500 border-purple-500"><DollarSign className="h-3 w-3" />Applied to Debt</Badge>;
            default:
                return <Badge variant="outline">{status || 'Unknown'}</Badge>;
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6 p-2">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
                </div>
                <Skeleton className="h-96" />
            </div>
        );
    }

    if (isError) return <QueryError message="Failed to load commissions." onRetry={refetch} />;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Commission Center</h1>
                <p className="text-muted-foreground">Full breakdown of every partner commission — paid, pending, and applied.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.total.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">{stats.count} commission{stats.count !== 1 ? 's' : ''} across ${stats.totalOrderValue.toFixed(2)} in orders</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">${stats.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">{stats.pendingCount} awaiting action</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Paid Cash</CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">${stats.paid.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">{stats.paidCount} paid out</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Applied to Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-500">
                            ${(stats.available + stats.appliedToDebt).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.availableCount + stats.appliedCount} applied ({stats.appliedCount} to debt)
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Avg Rate Card */}
            <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="flex items-center gap-4 py-4">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    <div>
                        <p className="text-sm font-medium">Average Commission Rate</p>
                        <p className="text-2xl font-bold">{avgRate.toFixed(1)}%</p>
                    </div>
                    <div className="ml-auto text-right">
                        <p className="text-sm text-muted-foreground">Partners Earning</p>
                        <p className="text-lg font-semibold">
                            {new Set(commissions?.map(c => c.partner_id)).size}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Top Earners */}
            {commissions && commissions.length > 0 && (() => {
                const earnerMap = new Map<string, { name: string; tier: string; total: number; count: number }>();
                commissions.forEach(c => {
                    const pid = c.partner_id;
                    const existing = earnerMap.get(pid) || {
                        name: c.profiles?.full_name || 'Unknown',
                        tier: c.profiles?.partner_tier || 'standard',
                        total: 0,
                        count: 0,
                    };
                    existing.total = Math.round((existing.total + (Number(c.amount) || 0)) * 100) / 100;
                    existing.count += 1;
                    earnerMap.set(pid, existing);
                });
                const topEarners = [...earnerMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

                return (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TrendingUp className="h-4 w-4" /> Top Earners
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {topEarners.map((earner, i) => (
                                    <div key={earner.name} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-bold text-muted-foreground w-6">
                                                {i + 1}
                                            </span>
                                            <div>
                                                <p className="font-medium text-sm">{earner.name}</p>
                                                <p className="text-xs text-muted-foreground capitalize">{earner.tier} · {earner.count} sale{earner.count !== 1 ? 's' : ''}</p>
                                            </div>
                                        </div>
                                        <span className="font-bold text-green-500">${earner.total.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                );
            })()}

            {/* Full Commission Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        All Commissions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Partner</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead className="text-right">Order Total</TableHead>
                                    <TableHead className="text-right">Rate</TableHead>
                                    <TableHead className="text-right">Commission</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {commissions?.map((c) => {
                                    const orderTotal = Number(c.sales_orders?.total_amount) || 0;
                                    const rate = Number(c.commission_rate) || 0;
                                    const partnerName = c.profiles?.full_name || 'Unknown';
                                    const customerName = c.sales_orders?.contacts?.name || '—';

                                    return (
                                        <TableRow key={c.id}>
                                            <TableCell className="whitespace-nowrap">
                                                {format(new Date(c.created_at), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium">{partnerName}</span>
                                                        {(() => {
                                                            const tier = c.profiles?.partner_tier;
                                                            const tierEmoji = tier === 'senior' ? '🥇' : tier === 'associate' ? '🥉' : tier === 'executive' ? '⭐' : '🥈';
                                                            return <span className="text-xs">{tierEmoji}</span>;
                                                        })()}
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">
                                                        Balance: ${(c.profiles?.credit_balance || 0).toFixed(2)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{customerName}</TableCell>
                                            <TableCell className="text-right">${orderTotal.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono">{(rate * 100).toFixed(0)}%</TableCell>
                                            <TableCell className="text-right font-bold text-green-500">
                                                ${Number(c.amount).toFixed(2)}
                                            </TableCell>
                                            <TableCell>
                                                {(() => {
                                                    const type = c.type || 'direct';
                                                    const label = type === 'direct' ? 'Direct' : type === 'second_tier_override' ? '2nd Tier' : type === 'third_tier_override' ? '3rd Tier' : type;
                                                    const color = type === 'direct' ? 'bg-blue-500/10 text-blue-500' : type === 'second_tier_override' ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500';
                                                    return <Badge variant="secondary" className={`text-xs ${color}`}>{label}</Badge>;
                                                })()}
                                            </TableCell>
                                            <TableCell>{statusBadge(c.status)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {(!commissions || commissions.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                            No commissions recorded yet. Commissions are generated when sales are made through partner referrals.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
