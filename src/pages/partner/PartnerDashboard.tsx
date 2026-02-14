
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePartnerDownline, useCommissions, useCommissionStats, useDownlineClients, PartnerNode, DownlineClient } from '@/hooks/use-partner';
import { useCreateContact } from '@/hooks/use-contacts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
    Users,
    DollarSign,
    TrendingUp,
    ChevronRight,
    Network,
    ShoppingBag,
    Percent,
    User,
    UserPlus,
    AlertTriangle,
    Wallet,
    Clock,
    ArrowRightLeft,
    CheckCircle2,
    Loader2,
    Plus
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
    senior: { label: 'Senior Partner', discount: '70% off retail', emoji: '🥇' },
    standard: { label: 'Standard Partner', discount: '35% off retail', emoji: '🥈' },
    associate: { label: 'Associate Partner', discount: '25% off retail', emoji: '🥉' },
    executive: { label: 'Executive', discount: '50% off retail', emoji: '⭐' },
};

type SheetView = 'balance' | 'commissions' | 'owed' | 'earnings' | 'add-person' | null;

const EMPTY_PERSON = { name: '', email: '', phone: '', address: '', assignedTo: '' };

export default function PartnerDashboard() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile: authProfile, userRole, user, refreshProfile } = useAuth();
    const { data: downline, isLoading: downlineLoading } = usePartnerDownline();
    const { data: commissions, isLoading: commissionsLoading } = useCommissions();
    const stats = useCommissionStats();
    const [activeSheet, setActiveSheet] = useState<SheetView>(null);
    const [newPerson, setNewPerson] = useState(EMPTY_PERSON);
    const createContact = useCreateContact();

    const tier = (authProfile as any)?.partner_tier || 'standard';
    const tierInfo = TIER_INFO[tier] || TIER_INFO.standard;
    const commRate = Number((authProfile as any)?.commission_rate || 0) * 100;
    const creditBalance = Number((authProfile as any)?.credit_balance || 0);

    // Compute actual discount % from price_multiplier
    const priceMultiplier = Number((authProfile as any)?.price_multiplier || 1);
    const discountPct = Math.round((1 - priceMultiplier) * 100);

    // Fetch clients assigned to all reps in the network
    const myProfileId = (authProfile as any)?.id as string | undefined;
    const allRepIds = [
        ...(myProfileId ? [myProfileId] : []),
        ...(downline?.map(d => d.id) || [])
    ];
    const { data: clients } = useDownlineClients(allRepIds);

    // Fetch movements for Amount Owed (simple query — just totals)
    const { data: owedMovements } = useQuery({
        queryKey: ['partner_owed_movements', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];

            // Find linked contact
            const { data: contact } = await supabase
                .from('contacts')
                .select('id')
                .eq('linked_user_id', user.id)
                .maybeSingle();

            if (!contact?.id) return [];

            // Fetch movements with items (just price_at_sale for totals)
            const { data: movements, error } = await (supabase as any)
                .from('movements')
                .select('id, created_at, amount_paid, payment_status, discount_amount, notes, movement_items(price_at_sale)')
                .eq('contact_id', contact.id)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('owedMovements query error:', error);
                return [];
            }
            if (!movements?.length) return [];

            return movements.map((m: any) => {
                const subtotal = (m.movement_items || []).reduce((s: number, i: any) => s + (Number(i.price_at_sale) || 0), 0);
                const discount = Number(m.discount_amount) || 0;
                const paid = Number(m.amount_paid) || 0;
                const owed = Math.max(0, subtotal - discount - paid);
                const itemCount = (m.movement_items || []).length;
                return { ...m, subtotal, discount, paid, owed, itemCount, items: [] };
            });
        },
        enabled: !!user?.id,
    });

    const totalOwed = owedMovements?.reduce((s: number, m: any) => s + m.owed, 0) || 0;
    const unpaidMovements = owedMovements?.filter((m: any) => m.owed > 0) || [];

    // Apply commissions to amount owed mutation
    const applyCommissions = useMutation({
        mutationFn: async () => {
            if (!myProfileId) throw new Error('No profile');
            const { data, error } = await supabase.rpc('apply_commissions_to_owed', {
                partner_profile_id: myProfileId
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data: any) => {
            toast({
                title: 'Commissions Applied',
                description: `$${Number(data.applied).toFixed(2)} applied to owed balance. ${data.remaining_credit > 0 ? `$${Number(data.remaining_credit).toFixed(2)} added to store credit.` : ''}`,
            });
            // Refresh everything
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['partner_owed_movements'] });
            queryClient.invalidateQueries({ queryKey: ['partner_amount_owed'] });
            queryClient.invalidateQueries({ queryKey: ['my_sidebar_profile'] });
            refreshProfile?.();
        },
        onError: (err: any) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });

    // Convert commission to store credit mutation
    const convertToCredit = useMutation({
        mutationFn: async (commissionId: string) => {
            // Validate commission status before converting
            const commission = commissions?.find((c: any) => c.id === commissionId);
            if (commission?.status === 'paid') {
                throw new Error('Commission already converted');
            }
            if (commission && commission.status !== 'available') {
                throw new Error(`Cannot convert commission with status "${commission.status}". Only available commissions can be converted.`);
            }
            const { error } = await supabase.rpc('convert_commission_to_credit', { commission_id: commissionId });
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: 'Converted', description: 'Commission added to your store credit.' });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['my_sidebar_profile'] });
            refreshProfile?.();
        },
        onError: (err: any) => {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight">Partner Portal</h1>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setActiveSheet('add-person')}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Person
                        </Button>
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
                <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-muted-foreground">Manage your team and track your earnings.</p>
                    <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5">
                        {tierInfo.emoji} {tierInfo.label}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {(authProfile as any)?.pricing_mode === 'cost_plus'
                            ? `Cost + $${Number((authProfile as any)?.cost_plus_markup || 0)}`
                            : `${discountPct}% off retail`
                        } · {commRate.toFixed(1)}% commission
                    </Badge>
                </div>
            </div>

            {/* Stats Overview — Clickable Cards */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <Card
                    className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 cursor-pointer hover:border-green-500/40 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300"
                    onClick={() => setActiveSheet('commissions')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available Commission</CardTitle>
                        <Wallet className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">${(stats.available + creditBalance).toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {creditBalance > 0 ? `$${creditBalance.toFixed(2)} credit + $${stats.available.toFixed(2)} earned` : 'Earned & ready'}
                            <ChevronRight className="h-3 w-3" />
                        </p>
                    </CardContent>
                </Card>
                <Card
                    className="border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 cursor-pointer hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all duration-300"
                    onClick={() => setActiveSheet('commissions')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-500">${stats.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">Awaiting payment <ChevronRight className="h-3 w-3" /></p>
                    </CardContent>
                </Card>
                <Card
                    className={`cursor-pointer transition-all duration-300 ${(totalOwed) > 0 ? 'border-red-500/20 bg-gradient-to-br from-red-500/10 to-red-500/5 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/10' : 'border-border hover:bg-muted/30 hover:border-border/60'}`}
                    onClick={() => setActiveSheet('owed')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Amount Owed</CardTitle>
                        <AlertTriangle className={`h-4 w-4 ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                            ${totalOwed.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {unpaidMovements.length} unpaid <ChevronRight className="h-3 w-3" />
                        </p>
                    </CardContent>
                </Card>
                <Card
                    className="cursor-pointer hover:bg-muted/30 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                    onClick={() => setActiveSheet('earnings')}
                >
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Lifetime Earnings</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.total.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">All time <ChevronRight className="h-3 w-3" /></p>
                    </CardContent>
                </Card>
                <Card className="hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">My Network</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(downline?.length || 0) + (clients?.length || 0)}</div>
                        <p className="text-xs text-muted-foreground">
                            {downline?.length || 0} partners · {clients?.length || 0} customers
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Apply Commission Banner — shown when available commissions AND owed exist */}
            {(stats.available + creditBalance) > 0 && totalOwed > 0 && (
                <Card className="border-primary/30 bg-gradient-to-r from-primary/10 to-primary/5 shadow-sm shadow-primary/5">
                    <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                            <ArrowRightLeft className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-sm font-medium">Apply ${(stats.available + creditBalance).toFixed(2)} in earned commissions to your ${totalOwed.toFixed(2)} balance?</p>
                                <p className="text-xs text-muted-foreground">Pays off oldest invoices first. Any surplus goes to store credit.</p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => applyCommissions.mutate()}
                            disabled={applyCommissions.isPending}
                        >
                            {applyCommissions.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                            Apply Now
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                {/* Commission History Table */}
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
                            <div className="overflow-x-auto -mx-4 px-4">
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
                                                Order #{comm.sale_id?.slice(0, 8) || 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize text-xs">
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
                            </div>
                        ) : (
                            <div className="text-center py-6 text-muted-foreground text-sm">
                                No commission history yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Downline Tree / List */}
                <Card className="col-span-1">
                    <CardHeader className="flex flex-row items-start justify-between space-y-0">
                        <div>
                            <CardTitle>Network Hierarchy</CardTitle>
                            <CardDescription>Your team structure</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setActiveSheet('add-person')}>
                            <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {downlineLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-full" />
                                <Skeleton className="h-8 w-full" />
                            </div>
                        ) : (downline && downline.length > 0) || (clients && clients.length > 0) ? (
                            <NetworkTree
                                rootName={(authProfile as any)?.full_name || 'You'}
                                rootTier={tier}
                                rootProfileId={myProfileId || null}
                                partners={downline || []}
                                clients={clients || []}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <Network className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-sm text-muted-foreground">No partners or customers yet.</p>
                                <p className="text-xs text-muted-foreground mt-1">Use "Add Person" to add customers to your network.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Downline Activity Section */}
            <DownlineActivity downline={downline || []} />

            {/* ===== DETAIL SHEETS ===== */}

            {/* Balance Sheet */}
            <Sheet open={activeSheet === 'balance'} onOpenChange={(open) => !open && setActiveSheet(null)}>
                <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-green-500" />
                            Available Balance
                        </SheetTitle>
                        <SheetDescription>Your store credit balance and history</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                            <p className="text-sm text-muted-foreground">Current Balance</p>
                            <p className="text-4xl font-bold text-green-500">${creditBalance.toFixed(2)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Your store credit can be used for purchases in the Partner Store. Credit is earned from
                            commission conversions.
                        </p>
                        {stats.pending > 0 && (
                            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                                <p className="text-sm font-medium text-amber-500">
                                    You have ${stats.pending.toFixed(2)} in pending commissions that can be converted to store credit.
                                </p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Recent Activity</h4>
                            {commissions?.filter((c: any) => c.status === 'paid').length ? (
                                commissions.filter((c: any) => c.status === 'paid').slice(0, 10).map((c: any) => (
                                    <div key={c.id} className="flex justify-between items-center p-2 rounded border border-border/50">
                                        <div>
                                            <p className="text-sm font-medium">Commission converted</p>
                                            <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), 'MMM d, yyyy')}</p>
                                        </div>
                                        <span className="text-sm font-medium text-green-500">+${Number(c.amount).toFixed(2)}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No credit history yet.</p>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Commissions Sheet */}
            <Sheet open={activeSheet === 'commissions'} onOpenChange={(open) => !open && setActiveSheet(null)}>
                <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-amber-500" />
                            Commissions
                        </SheetTitle>
                        <SheetDescription>Manage your earned commissions</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="text-2xl font-bold text-amber-500">${stats.pending.toFixed(2)}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                                <p className="text-xs text-muted-foreground">Paid Out</p>
                                <p className="text-2xl font-bold text-green-500">${stats.paid.toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Apply to owed button */}
                        {stats.available > 0 && totalOwed > 0 && (
                            <Button
                                className="w-full"
                                onClick={() => applyCommissions.mutate()}
                                disabled={applyCommissions.isPending}
                            >
                                {applyCommissions.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                                Apply ${stats.available.toFixed(2)} to Amount Owed (${totalOwed.toFixed(2)})
                            </Button>
                        )}

                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold">All Commissions</h4>
                            {commissions && commissions.length > 0 ? (
                                commissions.map((comm: any) => (
                                    <div key={comm.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium truncate">
                                                    Order #{comm.sale_id?.slice(0, 8) || 'N/A'}
                                                </p>
                                                <Badge variant="outline" className="capitalize text-xs shrink-0">
                                                    {comm.type.replace(/_/g, ' ')}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{format(new Date(comm.created_at), 'MMM d, yyyy')}</p>
                                        </div>
                                        <div className="text-right shrink-0 ml-2 flex items-center gap-2">
                                            <span className={`text-sm font-bold ${
                                                comm.status === 'paid' ? 'text-muted-foreground' :
                                                comm.status === 'pending' ? 'text-amber-500' : 'text-green-500'
                                            }`}>
                                                ${Number(comm.amount).toFixed(2)}
                                            </span>
                                            <Badge variant={comm.status === 'paid' ? 'secondary' : comm.status === 'pending' ? 'outline' : 'default'} className="text-xs">
                                                {comm.status}
                                            </Badge>
                                            {comm.status === 'available' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 text-xs px-2"
                                                    disabled={convertToCredit.isPending}
                                                    onClick={() => convertToCredit.mutate(comm.id)}
                                                    aria-label={`Convert commission ${comm.id} to store credit`}
                                                >
                                                    {convertToCredit.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Convert'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No commissions yet.</p>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Amount Owed Sheet */}
            <Sheet open={activeSheet === 'owed'} onOpenChange={(open) => !open && setActiveSheet(null)}>
                <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <AlertTriangle className={`h-5 w-5 ${totalOwed > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                            Amount Owed
                        </SheetTitle>
                        <SheetDescription>Peptides received with outstanding balance</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                            <p className="text-xs text-muted-foreground">Total Outstanding</p>
                            <p className={`text-4xl font-bold ${totalOwed > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                ${totalOwed.toFixed(2)}
                            </p>
                        </div>

                        {stats.available > 0 && totalOwed > 0 && (
                            <Button
                                className="w-full"
                                onClick={() => applyCommissions.mutate()}
                                disabled={applyCommissions.isPending}
                            >
                                {applyCommissions.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRightLeft className="h-4 w-4 mr-2" />}
                                Apply ${stats.available.toFixed(2)} Commissions Here
                            </Button>
                        )}

                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold">
                                {unpaidMovements.length > 0 ? 'Unpaid Orders' : 'All Paid Up!'}
                            </h4>
                            {unpaidMovements.map((m: any) => (
                                <div key={m.id} className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'MMM d, yyyy')}</p>
                                            <p className="text-sm">{m.itemCount} item{m.itemCount !== 1 ? 's' : ''} — ${m.subtotal.toFixed(2)}</p>
                                            {m.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.notes}</p>}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-red-500">${m.owed.toFixed(2)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                of ${m.subtotal.toFixed(2)}
                                                {m.paid > 0 && ` (paid $${m.paid.toFixed(2)})`}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Show paid movements too */}
                            {owedMovements && owedMovements.filter((m: any) => m.owed === 0).length > 0 && (
                                <>
                                    <h4 className="text-sm font-semibold text-muted-foreground mt-4">Paid Orders</h4>
                                    {owedMovements.filter((m: any) => m.owed === 0).slice(0, 10).map((m: any) => (
                                        <div key={m.id} className="p-3 rounded-lg border border-border/50 space-y-1">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'MMM d, yyyy')}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {m.itemCount} item{m.itemCount !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 text-green-500">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    <span className="text-sm font-medium">${m.subtotal.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Lifetime Earnings Sheet */}
            <Sheet open={activeSheet === 'earnings'} onOpenChange={(open) => !open && setActiveSheet(null)}>
                <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-primary" />
                            Lifetime Earnings
                        </SheetTitle>
                        <SheetDescription>Your complete commission earnings breakdown</SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                            <p className="text-xs text-muted-foreground">Total Earned</p>
                            <p className="text-4xl font-bold text-primary">${stats.total.toFixed(2)}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="p-3 rounded-lg border text-center">
                                <p className="text-xs text-muted-foreground">Pending</p>
                                <p className="text-lg font-bold text-amber-500">${stats.pending.toFixed(2)}</p>
                            </div>
                            <div className="p-3 rounded-lg border text-center">
                                <p className="text-xs text-muted-foreground">Available</p>
                                <p className="text-lg font-bold text-green-500">${stats.available.toFixed(2)}</p>
                            </div>
                            <div className="p-3 rounded-lg border text-center">
                                <p className="text-xs text-muted-foreground">Paid</p>
                                <p className="text-lg font-bold">${stats.paid.toFixed(2)}</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold">Breakdown by Type</h4>
                            {commissions && commissions.length > 0 ? (() => {
                                const byType: Record<string, number> = {};
                                commissions.forEach((c: any) => {
                                    const label = c.type.replace(/_/g, ' ');
                                    byType[label] = (byType[label] || 0) + Number(c.amount);
                                });
                                return Object.entries(byType).map(([type, amount]) => (
                                    <div key={type} className="flex justify-between p-2 rounded border border-border/50">
                                        <span className="text-sm capitalize">{type}</span>
                                        <span className="text-sm font-medium">${amount.toFixed(2)}</span>
                                    </div>
                                ));
                            })() : (
                                <p className="text-sm text-muted-foreground">No earnings yet. Commissions are earned when your network makes sales.</p>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Add Person Sheet */}
            <Sheet open={activeSheet === 'add-person'} onOpenChange={(open) => { if (!open) { setActiveSheet(null); setNewPerson(EMPTY_PERSON); } }}>
                <SheetContent className="overflow-y-auto w-full sm:max-w-lg">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            Add Person
                        </SheetTitle>
                        <SheetDescription>Add a customer to your network</SheetDescription>
                    </SheetHeader>
                    <form
                        className="mt-6 space-y-4"
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newPerson.name.trim()) return;
                            const assignedTo = newPerson.assignedTo || myProfileId || undefined;
                            try {
                                await createContact.mutateAsync({
                                    name: newPerson.name.trim(),
                                    email: newPerson.email.trim() || undefined,
                                    phone: newPerson.phone.trim() || undefined,
                                    address: newPerson.address.trim() || undefined,
                                    type: 'customer',
                                    assigned_rep_id: assignedTo || null,
                                });
                                queryClient.invalidateQueries({ queryKey: ['downline_clients'] });
                                setActiveSheet(null);
                                setNewPerson(EMPTY_PERSON);
                            } catch {
                                // useCreateContact already toasts the error
                            }
                        }}
                    >
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Name *</label>
                            <Input
                                placeholder="Full name"
                                value={newPerson.name}
                                onChange={e => setNewPerson(p => ({ ...p, name: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Email</label>
                            <Input
                                type="email"
                                placeholder="email@example.com"
                                value={newPerson.email}
                                onChange={e => setNewPerson(p => ({ ...p, email: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Phone</label>
                            <Input
                                type="tel"
                                placeholder="(555) 123-4567"
                                value={newPerson.phone}
                                onChange={e => setNewPerson(p => ({ ...p, phone: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Shipping Address</label>
                            <Textarea
                                placeholder="Street, City, State, ZIP"
                                value={newPerson.address}
                                onChange={e => setNewPerson(p => ({ ...p, address: e.target.value }))}
                                rows={2}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Assign To</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={newPerson.assignedTo}
                                onChange={e => setNewPerson(p => ({ ...p, assignedTo: e.target.value }))}
                            >
                                <option value="">Directly under me ({(authProfile as any)?.full_name || 'You'})</option>
                                {downline && downline.length > 0 && (
                                    <optgroup label="Under a team partner">
                                        {downline.map(partner => (
                                            <option key={partner.id} value={partner.id}>
                                                {partner.full_name || partner.email} — {TIER_INFO[partner.partner_tier]?.label || 'Partner'}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Choose who this customer is assigned to. Default is directly under you.
                            </p>
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={createContact.isPending || !newPerson.name.trim()}
                        >
                            {createContact.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <UserPlus className="h-4 w-4 mr-2" />
                            )}
                            Add to Network
                        </Button>
                    </form>
                </SheetContent>
            </Sheet>
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
    // Exclude contacts who are also partners in the downline
    const partnerIds = new Set(partners.map(p => p.id));
    const partnerNames = new Set(partners.map(p => p.full_name?.toLowerCase()).filter(Boolean));
    const filteredClients = clients.filter(c =>
        !partnerIds.has(c.id) && !partnerNames.has(c.name?.toLowerCase())
    );

    // Group clients by assigned rep
    const clientsByRep = new Map<string, DownlineClient[]>();
    filteredClients.forEach(c => {
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

    const renderClientRow = (client: DownlineClient, indent: number) => (
        <div
            key={client.id}
            className="flex items-center gap-2 py-1.5 border-l-2 border-muted/40"
            style={{ paddingLeft: indent * 20 + 8 }}
        >
            <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <span className="text-sm text-foreground/80 truncate">{client.name}</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-blue-500/30 text-blue-400 shrink-0">
                Customer
            </Badge>
        </div>
    );

    const renderPartnerRow = (partner: PartnerNode, indent: number) => (
        <div
            className="flex items-center justify-between py-2 border-l-2 border-primary/30"
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
                    <p className="text-xs text-primary/70 capitalize">
                        {TIER_INFO[partner.partner_tier]?.label || 'Partner'}
                    </p>
                </div>
            </div>
            <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-medium">
                    ${Number(partner.total_sales).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Sales</p>
            </div>
        </div>
    );

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
                            {renderPartnerRow(partner, indent)}
                            {partnerClients.map(client => renderClientRow(client, indent + 1))}
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
                    <p className="text-xs text-primary/70 capitalize">{TIER_INFO[rootTier]?.label || 'Partner'}</p>
                </div>
            </div>

            {/* Root's own direct customers */}
            {rootClients.length > 0 && (
                <div className="ml-3 mb-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2 py-1">
                        My Customers ({rootClients.length})
                    </p>
                    {rootClients.map(client => renderClientRow(client, 1))}
                </div>
            )}

            {/* Partners + their customers */}
            {partners.length > 0 && (
                <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2 py-1">
                        Team Partners ({partners.filter(p => p.depth === 1).length})
                    </p>
                    {renderBranch(null, 1)}
                </div>
            )}
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
