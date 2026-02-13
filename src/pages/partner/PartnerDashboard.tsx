
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePartnerDownline, useCommissions, useCommissionStats, useDownlineClients, PartnerNode, DownlineClient } from '@/hooks/use-partner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
    Users,
    DollarSign,
    TrendingUp,
    ChevronRight,
    Network,
    ShoppingBag,
    Percent,
    User
} from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';

// Tier display config
const TIER_INFO: Record<string, { label: string; discount: string; emoji: string }> = {
    senior: { label: 'Senior Partner', discount: '50% off retail', emoji: '🥇' },
    standard: { label: 'Standard Partner', discount: '35% off retail', emoji: '🥈' },
    associate: { label: 'Associate Partner', discount: '25% off retail', emoji: '🥉' },
    executive: { label: 'Executive', discount: '50% off retail', emoji: '⭐' },
};

export default function PartnerDashboard() {
    const navigate = useNavigate();
    const { profile: authProfile, userRole } = useAuth();
    const { data: downline, isLoading: downlineLoading } = usePartnerDownline();
    const { data: commissions, isLoading: commissionsLoading } = useCommissions();
    const stats = useCommissionStats();

    const tier = (authProfile as any)?.partner_tier || 'standard';
    const tierInfo = TIER_INFO[tier] || TIER_INFO.standard;
    const commRate = Number((authProfile as any)?.commission_rate || 0) * 100;

    // Fetch clients assigned to all reps in the network
    const myProfileId = (authProfile as any)?.id as string | undefined;
    const allRepIds = [
        ...(myProfileId ? [myProfileId] : []),
        ...(downline?.map(d => d.id) || [])
    ];
    const { data: clients } = useDownlineClients(allRepIds);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight">Partner Portal</h1>
                    <div className="flex items-center gap-2">
                        <Link to="/partner/store">
                            <Button variant="default" size="sm">
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Order Peptides
                            </Button>
                        </Link>
                        {userRole?.role === 'admin' && (
                            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-primary/20 hover:bg-primary/10 hover:text-primary">
                                <DollarSign className="mr-2 h-4 w-4" />
                                Return to Admin
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <p className="text-muted-foreground">Manage your team and track your earnings.</p>
                    <Badge variant="outline" className="text-xs">
                        {tierInfo.emoji} {tierInfo.label}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {tierInfo.discount} · {commRate.toFixed(1)}% commission
                    </Badge>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">${stats.available.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Ready for payout</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Clearing in 30 days</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.total.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">All time commissions</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">My Downline</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{downline?.length || 0}</div>
                        <p className="text-xs text-muted-foreground">Active partners in network</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Available Commissions Table */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Commission History</CardTitle>
                        <CardDescription>Recent earnings from your network</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {commissionsLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-12 w-full" />
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ) : commissions && commissions.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {commissions.slice(0, 10).map((comm: any) => (
                                        <TableRow key={comm.id}>
                                            <TableCell>{format(new Date(comm.created_at), 'MMM d')}</TableCell>
                                            <TableCell className="font-medium">
                                                {/* If we had better joins we could show partner name, currently just showing sale ID or generic */}
                                                Order #{comm.sales_orders?.order_number || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize text-[10px]">
                                                    {comm.type.replace(/_/g, ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${comm.status === 'paid' ? 'text-muted-foreground' :
                                                comm.status === 'available' ? 'text-green-600' : 'text-amber-600'
                                                }`}>
                                                ${Number(comm.amount).toFixed(2)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                No commission history yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Downline Tree / List */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Network Hierarchy</CardTitle>
                        <CardDescription>Your team structure</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {downlineLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        ) : downline && downline.length > 0 ? (
                            <NetworkTree
                                rootName={(authProfile as any)?.full_name || 'You'}
                                rootTier={tier}
                                rootProfileId={myProfileId || null}
                                partners={downline}
                                clients={clients || []}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Network className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">You haven't recruited any partners yet.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Downline Activity Section */}
            <DownlineActivity downline={downline || []} />
        </div>
    );
}

interface NetworkTreeProps {
    rootName: string;
    rootTier: string;
    rootProfileId: string | null;
    partners: PartnerNode[];
    clients: DownlineClient[];
}

function NetworkTree({ rootName, rootTier, rootProfileId, partners, clients }: NetworkTreeProps) {
    // Group clients by assigned rep
    const clientsByRep = new Map<string, DownlineClient[]>();
    clients.forEach(c => {
        if (c.assigned_rep_id) {
            const list = clientsByRep.get(c.assigned_rep_id) || [];
            list.push(c);
            clientsByRep.set(c.assigned_rep_id, list);
        }
    });

    // Derive parent from the path array returned by the RPC
    const getParentId = (p: PartnerNode): string | null => {
        if (p.path && p.path.length >= 2) return p.path[p.path.length - 2];
        return null; // depth 1 nodes are direct children of root
    };

    const renderBranch = (parentId: string | null, indent: number): React.ReactNode => {
        const childPartners = parentId === null
            ? partners.filter(p => p.depth === 1)
            : partners.filter(p => getParentId(p) === parentId);

        return (
            <>
                {childPartners.map(partner => {
                    const partnerClients = clientsByRep.get(partner.id) || [];
                    return (
                        <React.Fragment key={partner.id}>
                            {/* Partner row */}
                            <div
                                className="flex items-center justify-between py-2 border-l-2 border-primary/20"
                                style={{ paddingLeft: indent * 20 + 8 }}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm shrink-0">
                                        {TIER_INFO[partner.partner_tier]?.emoji || '🥈'}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {partner.full_name || partner.email}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground capitalize">
                                            {partner.partner_tier} Partner
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 ml-2">
                                    <p className="text-xs font-medium">
                                        ${Number(partner.total_sales).toFixed(2)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Vol</p>
                                </div>
                            </div>
                            {/* This partner's clients */}
                            {partnerClients.map(client => (
                                <div
                                    key={client.id}
                                    className="flex items-center gap-2 py-1 border-l-2 border-muted"
                                    style={{ paddingLeft: (indent + 1) * 20 + 8 }}
                                >
                                    <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                                        <User className="h-3 w-3 text-muted-foreground" />
                                    </div>
                                    <span className="text-sm text-muted-foreground truncate">
                                        {client.name}
                                    </span>
                                </div>
                            ))}
                            {/* Sub-partners (recursive) */}
                            {renderBranch(partner.id, indent + 1)}
                        </React.Fragment>
                    );
                })}
            </>
        );
    };

    const rootClients = rootProfileId ? (clientsByRep.get(rootProfileId) || []) : [];

    return (
        <div className="space-y-0.5">
            {/* Root node (the logged-in partner) */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 mb-1">
                <span className="text-base">{TIER_INFO[rootTier]?.emoji || '⭐'}</span>
                <div>
                    <p className="text-sm font-semibold">{rootName}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{rootTier} Partner</p>
                </div>
            </div>
            {/* Root's own clients */}
            {rootClients.map(client => (
                <div
                    key={client.id}
                    className="flex items-center gap-2 py-1 border-l-2 border-primary/20"
                    style={{ paddingLeft: 28 }}
                >
                    <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                        <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground truncate">
                        {client.name}
                    </span>
                </div>
            ))}
            {/* Partner tree from depth 1 down */}
            {renderBranch(null, 1)}
        </div>
    );
}

function DownlineActivity({ downline }: { downline: PartnerNode[] }) {
    const downlineIds = downline.map(d => d.id);

    const { data: downlineSales, isLoading } = useQuery({
        queryKey: ['downline_activity', downlineIds],
        queryFn: async () => {
            if (downlineIds.length === 0) return [];

            // Get recent orders from downline partners
            const { data, error } = await (supabase as any)
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
                        {downlineSales.map((sale: any) => {
                            const repName = nameMap.get(sale.rep_id) || 'Unknown';
                            const clientName = sale.contacts?.name || (sale.notes?.includes('SELF-ORDER') ? 'Self' : '—');
                            const itemCount = sale.sales_order_items?.reduce((s: number, i: any) => s + (i.quantity || 0), 0) || 0;

                            return (
                                <div key={sale.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
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
                                        <p className="text-[10px] text-muted-foreground">{getTimeAgo(sale.created_at)}</p>
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
