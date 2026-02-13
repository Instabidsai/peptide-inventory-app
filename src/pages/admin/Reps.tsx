import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useReps, useUpdateProfile, type UserProfile, useTeamMembers } from '@/hooks/use-profiles';
import { useInviteRep } from '@/hooks/use-invite';
import { useFullNetwork } from '@/hooks/use-partner';
import DownlineVisualizer from './components/DownlineVisualizer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from '@/components/ui/label';
import { Pencil, UserPlus, Users, Eye, Loader2, Network, DollarSign } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from 'react-router-dom';

export default function Reps() {
    const navigate = useNavigate();
    const { data: reps, isLoading } = useReps();
    const { data: networkData, isLoading: networkLoading } = useFullNetwork();
    const updateProfile = useUpdateProfile();

    const [editingRep, setEditingRep] = useState<UserProfile | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    // Fetch per-rep performance: sales volume + commission earned (from commissions table, not orders)
    const { data: repStats } = useQuery({
        queryKey: ['rep_performance', reps?.map(r => r.id)],
        queryFn: async () => {
            if (!reps || reps.length === 0) return new Map<string, { volume: number; commission: number; orders: number; customers: number }>();

            // Get sales stats per rep (volume = orders where they're the rep)
            const { data: orders } = await (supabase as any)
                .from('sales_orders')
                .select('rep_id, total_amount')
                .not('rep_id', 'is', null)
                .neq('status', 'cancelled');

            // Get commission earned from commissions table (includes overrides!)
            const { data: commissions } = await (supabase as any)
                .from('commissions')
                .select('partner_id, amount')
                .neq('status', 'void');

            // Get customer counts per rep
            const { data: contacts } = await (supabase as any)
                .from('contacts')
                .select('assigned_rep_id')
                .not('assigned_rep_id', 'is', null);

            const stats = new Map<string, { volume: number; commission: number; orders: number; customers: number }>();

            // Aggregate order volume by rep
            (orders || []).forEach((o: any) => {
                const existing = stats.get(o.rep_id) || { volume: 0, commission: 0, orders: 0, customers: 0 };
                existing.volume += Number(o.total_amount || 0);
                existing.orders += 1;
                stats.set(o.rep_id, existing);
            });

            // Aggregate commission earned from commissions table (direct + overrides)
            (commissions || []).forEach((c: any) => {
                const existing = stats.get(c.partner_id) || { volume: 0, commission: 0, orders: 0, customers: 0 };
                existing.commission += Number(c.amount || 0);
                stats.set(c.partner_id, existing);
            });

            // Count customers
            (contacts || []).forEach((c: any) => {
                const existing = stats.get(c.assigned_rep_id) || { volume: 0, commission: 0, orders: 0, customers: 0 };
                existing.customers += 1;
                stats.set(c.assigned_rep_id, existing);
            });

            return stats;
        },
        enabled: !!reps && reps.length > 0,
    });

    // Fetch customer contacts for the 3rd-level tree in list view
    const { data: customerContacts } = useQuery({
        queryKey: ['rep_customers_list', reps?.map(r => r.id)],
        queryFn: async () => {
            if (!reps || reps.length === 0) return [];
            const repIds = reps.map(r => r.id);
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type, assigned_rep_id')
                .in('assigned_rep_id', repIds)
                .eq('type', 'customer')
                .order('name');
            if (error) throw error;
            // Exclude contacts who share a name with a partner (they're already shown as partners)
            const partnerNames = new Set(reps.map(r => r.full_name?.toLowerCase()));
            return (data || []).filter(c => !partnerNames.has(c.name?.toLowerCase()));
        },
        enabled: !!reps && reps.length > 0,
    });

    if (isLoading) return <div>Loading reps...</div>;

    // Build a lookup map: rep ID -> name (for showing upline names in the table)
    const repNameMap = new Map<string, string>();
    reps?.forEach(r => repNameMap.set(r.id, r.full_name || 'Unnamed'));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Partners</h1>
                    <p className="text-muted-foreground">Manage commissions, pricing, and team roles.</p>
                </div>
                <Button onClick={() => setIsInviteOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Add Partner
                </Button>
            </div>

            <Tabs defaultValue="list" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="list" className="gap-2">
                        <Users className="h-4 w-4" /> List View
                    </TabsTrigger>
                    <TabsTrigger value="network" className="gap-2">
                        <Network className="h-4 w-4" /> Network View
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" /> Active Partners
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Commission Rate</TableHead>
                                        <TableHead>Tier</TableHead>
                                        <TableHead className="text-right">Sales Volume</TableHead>
                                        <TableHead className="text-right">Earned</TableHead>
                                        <TableHead className="text-right">Customers</TableHead>
                                        <TableHead>Upline</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(() => {
                                        if (!reps || reps.length === 0) {
                                            return (
                                                <TableRow>
                                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                        No sales reps found. Invite or promote users to get started.
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }

                                        // Build hierarchy: top-level first, then children under each
                                        const repIds = new Set(reps.map(r => r.id));
                                        const topLevel = reps.filter(r => !r.parent_rep_id || !repIds.has(r.parent_rep_id));
                                        const childrenOf = (parentId: string) => reps.filter(r => r.parent_rep_id === parentId);

                                        // Get customer contacts for a given rep
                                        const clientsOf = (repId: string) =>
                                            (customerContacts || []).filter(c => c.assigned_rep_id === repId);

                                        const renderRow = (rep: UserProfile, depth: number = 0): React.ReactNode[] => {
                                            const children = childrenOf(rep.id);
                                            const clients = clientsOf(rep.id);
                                            return [
                                                <TableRow key={rep.id} className={depth > 0 ? 'bg-muted/20' : ''}>
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center" style={{ paddingLeft: `${depth * 24}px` }}>
                                                            {depth > 0 && (
                                                                <span className="text-muted-foreground mr-2 font-mono text-xs">└─</span>
                                                            )}
                                                            <span>{rep.full_name || 'Unnamed'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{rep.email || 'No email'}</TableCell>
                                                    <TableCell>{((rep.commission_rate || 0) * 100).toFixed(0)}%</TableCell>
                                                    <TableCell className="capitalize">
                                                        <Badge variant="secondary">{rep.partner_tier || 'Standard'}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        ${(repStats?.get(rep.id)?.volume || 0).toFixed(2)}
                                                        {(repStats?.get(rep.id)?.orders || 0) > 0 && (
                                                            <span className="text-xs text-muted-foreground ml-1">
                                                                ({repStats?.get(rep.id)?.orders})
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right text-green-600 font-medium">
                                                        ${(repStats?.get(rep.id)?.commission || 0).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {repStats?.get(rep.id)?.customers || 0}
                                                    </TableCell>
                                                    <TableCell>
                                                        {rep.parent_rep_id
                                                            ? <span className="text-sm">{repNameMap.get(rep.parent_rep_id) || '—'}</span>
                                                            : <span className="text-muted-foreground text-xs">None</span>
                                                        }
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/partners/${rep.id}`)}>
                                                                <Eye className="h-4 w-4 mr-2" /> View Details
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingRep(rep)}>
                                                                <Pencil className="h-4 w-4 mr-2" /> Edit
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>,
                                                ...children.flatMap(child => renderRow(child, depth + 1)),
                                                // Render customer contacts as leaf nodes under this partner
                                                ...clients.map(client => (
                                                    <TableRow key={`client-${client.id}`} className="bg-blue-50/30 dark:bg-blue-950/10">
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center" style={{ paddingLeft: `${(depth + 1) * 24}px` }}>
                                                                <span className="text-muted-foreground mr-2 font-mono text-xs">└─</span>
                                                                <span className="text-blue-600 dark:text-blue-400">{client.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-sm">{client.email || '—'}</TableCell>
                                                        <TableCell className="text-muted-foreground text-xs">—</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-blue-600 border-blue-300">customer</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                                                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                                                        <TableCell className="text-right text-muted-foreground">—</TableCell>
                                                        <TableCell className="text-sm">{rep.full_name}</TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="sm" onClick={() => navigate(`/contacts`)}>
                                                                <Eye className="h-4 w-4 mr-2" /> View
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ];
                                        };

                                        return topLevel.flatMap(rep => renderRow(rep));
                                    })()}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="network">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Network className="h-5 w-5" /> Partner Network
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {networkLoading ? (
                                <div className="flex items-center justify-center py-12 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading network...
                                </div>
                            ) : (
                                <DownlineVisualizer data={networkData || []} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <EditRepDialog
                rep={editingRep}
                allReps={reps || []}
                open={!!editingRep}
                onOpenChange={(open) => !open && setEditingRep(null)}
                onSave={(id, updates) => {
                    updateProfile.mutate({ id, ...updates });
                    setEditingRep(null);
                }}
            />

            <AddRepDialog
                open={isInviteOpen}
                onOpenChange={setIsInviteOpen}
                allReps={reps || []}
            />
        </div >
    );
}

function AddRepDialog({ open, onOpenChange, allReps }: { open: boolean, onOpenChange: (open: boolean) => void, allReps: UserProfile[] }) {
    const inviteRep = useInviteRep();
    const updateProfile = useUpdateProfile();
    const { data: candidates } = useTeamMembers();
    const { toast } = useToast();

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [parentRepId, setParentRepId] = useState('');
    const [activeTab, setActiveTab] = useState('promote');

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        inviteRep.mutate({ email, fullName: name, parentRepId: parentRepId || undefined }, {
            onSuccess: () => {
                onOpenChange(false);
                setEmail('');
                setName('');
                setParentRepId('');
            }
        });
    };

    const handlePromote = async () => {
        if (!selectedUserId) return;

        updateProfile.mutate({
            id: selectedUserId,
            role: 'sales_rep',
            commission_rate: 0,
            price_multiplier: 1.0,
            parent_rep_id: parentRepId || null,
        }, {
            onSuccess: () => {
                toast({ title: "User Promoted", description: "Role updated to Sales Rep." });
                onOpenChange(false);
                setSelectedUserId('');
                setParentRepId('');
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add Partner</DialogTitle>
                    <DialogDescription>
                        Invite a new partner via email or promote an existing user.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="promote">From Existing Users</TabsTrigger>
                        <TabsTrigger value="invite">Invite New</TabsTrigger>
                    </TabsList>

                    <TabsContent value="promote" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a user..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {candidates?.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.full_name || 'Unnamed'} ({user.role})
                                        </SelectItem>
                                    ))}
                                    {(!candidates || candidates.length === 0) && (
                                        <SelectItem value="none" disabled>No eligible users found</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Looking for users with role 'client' or 'staff'.
                            </p>
                        </div>
                        {/* Upline Selector (shared for Promote) */}
                        <div className="space-y-2">
                            <Label>Assign Upline (optional)</Label>
                            <Select value={parentRepId || '__none__'} onValueChange={(v) => setParentRepId(v === '__none__' ? '' : v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select upline partner..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">
                                        <span className="text-muted-foreground">No Upline (Top-Level)</span>
                                    </SelectItem>
                                    {allReps.filter(r => r.id !== selectedUserId).map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            {r.full_name || 'Unnamed'} — {r.partner_tier || 'standard'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Place this partner under an existing partner in the hierarchy.
                            </p>
                        </div>
                        <DialogFooter>
                            <Button onClick={handlePromote} disabled={!selectedUserId || updateProfile.isPending} className="w-full">
                                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Promote to Partner
                            </Button>
                        </DialogFooter>
                    </TabsContent>

                    <TabsContent value="invite" className="space-y-0">
                        <form onSubmit={handleInvite} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Full Name</Label>
                                <Input
                                    required
                                    placeholder="John Doe"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input
                                    required
                                    type="email"
                                    placeholder="john@example.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                            {/* Upline Selector (shared for Invite) */}
                            <div className="space-y-2">
                                <Label>Assign Upline (optional)</Label>
                                <Select value={parentRepId || '__none__'} onValueChange={(v) => setParentRepId(v === '__none__' ? '' : v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select upline partner..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">
                                            <span className="text-muted-foreground">No Upline (Top-Level)</span>
                                        </SelectItem>
                                        {allReps.map(r => (
                                            <SelectItem key={r.id} value={r.id}>
                                                {r.full_name || 'Unnamed'} — {r.partner_tier || 'standard'}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Place this partner under an existing partner in the hierarchy.
                                </p>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={inviteRep.isPending} className="w-full">
                                    {inviteRep.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Send Invitation
                                </Button>
                            </DialogFooter>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}

function EditRepDialog({
    rep,
    allReps,
    open,
    onOpenChange,
    onSave
}: {
    rep: UserProfile | null,
    allReps: UserProfile[],
    open: boolean,
    onOpenChange: (open: boolean) => void,
    onSave: (id: string, updates: Partial<UserProfile>) => void
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Partner</DialogTitle>
                    <DialogDescription>
                        Adjust commission, tier, and upline for {rep?.full_name}.
                    </DialogDescription>
                </DialogHeader>

                {rep && (
                    <RepForm
                        rep={rep}
                        allReps={allReps}
                        onSubmit={(updates) => onSave(rep.id, updates)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function RepForm({ rep, allReps, onSubmit }: { rep: UserProfile, allReps: UserProfile[], onSubmit: (u: any) => void }) {
    // Tier → default commission rate and price multiplier
    const TIER_DEFAULTS: Record<string, { commission: number; multiplier: number; label: string }> = {
        senior: { commission: 10, multiplier: 0.50, label: '50% off retail · 10% commission' },
        standard: { commission: 7.5, multiplier: 0.65, label: '35% off retail · 7.5% commission' },
        associate: { commission: 7.5, multiplier: 0.75, label: '25% off retail · 7.5% commission' },
        executive: { commission: 10, multiplier: 0.50, label: '50% off retail · 10% commission' },
    };

    const [comm, setComm] = useState((rep.commission_rate || 0) * 100);
    const [mult, setMult] = useState(rep.price_multiplier || 1.0);
    const [tier, setTier] = useState(rep.partner_tier || 'standard');
    const [parentRep, setParentRep] = useState(rep.parent_rep_id || '');

    const handleTierChange = (newTier: string) => {
        setTier(newTier);
        const defaults = TIER_DEFAULTS[newTier];
        if (defaults) {
            setComm(defaults.commission);
            setMult(defaults.multiplier);
        }
    };

    // Filter out the current rep from potential parents (can't be your own parent)
    const potentialParents = allReps.filter(r => r.id !== rep.id);

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Tier</Label>
                <Select value={tier} onValueChange={handleTierChange}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="senior">🥇 Senior Partner</SelectItem>
                        <SelectItem value="standard">🥈 Standard Partner</SelectItem>
                        <SelectItem value="associate">🥉 Associate Partner</SelectItem>
                        <SelectItem value="executive">⭐ Executive</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {TIER_DEFAULTS[tier] && (
                <p className="text-xs text-muted-foreground text-right">
                    {TIER_DEFAULTS[tier].label}
                </p>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Commission (%)</Label>
                <Input
                    type="number"
                    className="col-span-3"
                    value={comm}
                    onChange={e => setComm(parseFloat(e.target.value))}
                />
            </div>
            <p className="text-xs text-muted-foreground text-right">
                Direct commission rate on sales. Override rate on downline sales.
            </p>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Price Multiplier</Label>
                <Input
                    type="number"
                    step="0.01"
                    className="col-span-3"
                    value={mult}
                    onChange={e => setMult(parseFloat(e.target.value))}
                />
            </div>
            <p className="text-xs text-muted-foreground text-right">
                {mult < 1 ? `${((1 - mult) * 100).toFixed(0)}% discount off retail` : 'No discount (retail price)'}
            </p>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Upline</Label>
                <Select value={parentRep || '__none__'} onValueChange={(v) => setParentRep(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select upline partner..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">
                            <span className="text-muted-foreground">No Upline (Top-Level)</span>
                        </SelectItem>
                        {potentialParents.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.full_name || 'Unnamed'} — {p.partner_tier || 'standard'} · {((p.commission_rate || 0) * 100).toFixed(0)}%
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <p className="text-xs text-muted-foreground text-right">
                The upline partner earns override commissions on this partner's sales.
            </p>

            <DialogFooter>
                <Button onClick={() => onSubmit({
                    commission_rate: comm / 100,
                    price_multiplier: mult,
                    partner_tier: tier,
                    parent_rep_id: parentRep || null
                })}>
                    Save Changes
                </Button>
            </DialogFooter>
        </div>
    )
}

