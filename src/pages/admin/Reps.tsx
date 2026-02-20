import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useReps, useUpdateProfile, type UserProfile, useTeamMembers } from '@/hooks/use-profiles';
import { useInviteRep } from '@/hooks/use-invite';
import { useFullNetwork } from '@/hooks/use-partner';
import { useAuth } from '@/contexts/AuthContext';
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
import { Pencil, UserPlus, Users, Eye, Loader2, Network, DollarSign, ShoppingCart, UserX, Link2, Copy, Check, QrCode } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-error';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from 'react-router-dom';

export default function Reps() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { data: reps, isLoading, isError: repsError, refetch: repsRefetch } = useReps();
    const { data: networkData, isLoading: networkLoading } = useFullNetwork();
    const updateProfile = useUpdateProfile();

    // Unlink a customer from their assigned rep
    const unlinkCustomer = useMutation({
        mutationFn: async (contactId: string) => {
            const { error } = await supabase
                .from('contacts')
                .update({ assigned_rep_id: null })
                .eq('id', contactId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rep_customers_list'] });
            queryClient.invalidateQueries({ queryKey: ['rep_performance'] });
            queryClient.invalidateQueries({ queryKey: ['full_network'] });
            toast({ title: 'Customer removed from partner' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove customer', description: error.message });
        },
    });

    const [editingRep, setEditingRep] = useState<UserProfile | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean; title: string; description: string; action: () => void;
    }>({ open: false, title: '', description: '', action: () => {} });

    // ── Add Client Under Partner ──
    const [addingToRep, setAddingToRep] = useState<UserProfile | null>(null);
    const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', address: '' });
    const [assignContactId, setAssignContactId] = useState('');
    const [isAddingClient, setIsAddingClient] = useState(false);

    // Fetch unassigned customer contacts
    const { data: unassignedContacts, refetch: refetchUnassigned } = useQuery({
        queryKey: ['unassigned_contacts'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type')
                .is('assigned_rep_id', null)
                .eq('type', 'customer')
                .order('name');
            if (error) throw error;
            return data || [];
        },
    });

    // Assign existing contact to a partner
    const assignContact = useMutation({
        mutationFn: async ({ contactId, repId }: { contactId: string; repId: string }) => {
            const { error } = await supabase
                .from('contacts')
                .update({ assigned_rep_id: repId })
                .eq('id', contactId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rep_customers_list'] });
            queryClient.invalidateQueries({ queryKey: ['rep_performance'] });
            queryClient.invalidateQueries({ queryKey: ['full_network'] });
            queryClient.invalidateQueries({ queryKey: ['unassigned_contacts'] });
            toast({ title: 'Client assigned to partner' });
            setAddingToRep(null);
            setAssignContactId('');
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to assign client', description: error.message });
        },
    });

    // Create new client under a partner
    const handleCreateClient = async () => {
        if (!addingToRep || !newClient.name.trim()) {
            toast({ variant: 'destructive', title: 'Name required' });
            return;
        }
        setIsAddingClient(true);
        try {
            const { data: repProfile } = await supabase
                .from('profiles')
                .select('org_id')
                .eq('id', addingToRep.id)
                .single();

            const { error } = await supabase
                .from('contacts')
                .insert({
                    name: newClient.name.trim(),
                    email: newClient.email.trim() || null,
                    phone: newClient.phone.trim() || null,
                    address: newClient.address.trim() || null,
                    type: 'customer',
                    assigned_rep_id: addingToRep.id,
                    org_id: repProfile?.org_id || null,
                });
            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['rep_customers_list'] });
            queryClient.invalidateQueries({ queryKey: ['rep_performance'] });
            queryClient.invalidateQueries({ queryKey: ['full_network'] });
            toast({ title: 'Client added', description: `${newClient.name} added under ${addingToRep.full_name}` });
            setNewClient({ name: '', email: '', phone: '', address: '' });
            setAddingToRep(null);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Failed to add client', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setIsAddingClient(false);
        }
    };

    // Fetch per-rep performance: sales volume + commission earned (from commissions table, not orders)
    const { data: repStats } = useQuery({
        queryKey: ['rep_performance', reps?.map(r => r.id)],
        queryFn: async () => {
            if (!reps || reps.length === 0) return new Map<string, { volume: number; commission: number; orders: number; customers: number }>();

            // Get sales stats per rep (volume = orders where they're the rep)
            const { data: orders } = await supabase
                .from('sales_orders')
                .select('rep_id, total_amount')
                .not('rep_id', 'is', null)
                .neq('status', 'cancelled');

            // Get commission earned from commissions table (includes overrides!)
            const { data: commissions } = await supabase
                .from('commissions')
                .select('partner_id, amount')
                .neq('status', 'void');

            // Get customer counts per rep
            const { data: contacts } = await supabase
                .from('contacts')
                .select('assigned_rep_id')
                .not('assigned_rep_id', 'is', null);

            const stats = new Map<string, { volume: number; commission: number; orders: number; customers: number }>();

            // Aggregate order volume by rep
            (orders || []).forEach((o) => {
                const existing = stats.get(o.rep_id) || { volume: 0, commission: 0, orders: 0, customers: 0 };
                existing.volume += Number(o.total_amount || 0);
                existing.orders += 1;
                stats.set(o.rep_id, existing);
            });

            // Aggregate commission earned from commissions table (direct + overrides)
            (commissions || []).forEach((c) => {
                const existing = stats.get(c.partner_id) || { volume: 0, commission: 0, orders: 0, customers: 0 };
                existing.commission += Number(c.amount || 0);
                stats.set(c.partner_id, existing);
            });

            // Count customers
            (contacts || []).forEach((c) => {
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
    if (repsError) return <QueryError message="Failed to load partners." onRetry={repsRefetch} />;

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
                    <TabsTrigger value="invites" className="gap-2">
                        <Link2 className="h-4 w-4" /> Invite Links
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
                                        <TableHead>Actions</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Commission Rate</TableHead>
                                        <TableHead>Tier</TableHead>
                                        <TableHead className="text-right">Sales Volume</TableHead>
                                        <TableHead className="text-right">Earned</TableHead>
                                        <TableHead className="text-right">Customers</TableHead>
                                        <TableHead>Upline</TableHead>
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
                                                    <TableCell>
                                                        <div className="flex gap-1">
                                                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/partners/${rep.id}`)}>
                                                                <Eye className="h-4 w-4 mr-1" /> View
                                                            </Button>
                                                            <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => { setAddingToRep(rep); setNewClient({ name: '', email: '', phone: '', address: '' }); setAssignContactId(''); }}>
                                                                <UserPlus className="h-4 w-4 mr-1" /> Client
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingRep(rep)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
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
                                                        <Badge variant="secondary" className={rep.partner_tier === 'referral' ? 'bg-sky-900/20 text-sky-400 border-sky-500/40' : ''}>{rep.partner_tier || 'Standard'}</Badge>
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
                                                </TableRow>,
                                                // Direct customers listed FIRST (blue) right under this partner
                                                ...clients.map(client => (
                                                    <TableRow key={`client-${client.id}`}>
                                                        <TableCell>
                                                            <div className="flex gap-1">
                                                                <Button variant="outline" size="sm" className="text-blue-600 border-blue-300" onClick={() => navigate(`/contacts/${client.id}`)}>
                                                                    <Eye className="h-4 w-4 mr-1" /> View
                                                                </Button>
                                                                <Button variant="secondary" size="sm" className="text-blue-600" onClick={() => navigate(`/sales/new?contact_id=${client.id}`)}>
                                                                    <ShoppingCart className="h-4 w-4 mr-1" /> Order
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                                    onClick={() => setConfirmDialog({
                                                                        open: true,
                                                                        title: 'Remove Client',
                                                                        description: `Remove ${client.name} from ${rep.full_name}? They will become unassigned.`,
                                                                        action: () => unlinkCustomer.mutate(client.id),
                                                                    })}
                                                                >
                                                                    <UserX className="h-4 w-4 mr-1" /> Remove
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="font-medium">
                                                            <div className="flex items-center" style={{ paddingLeft: `${(depth + 1) * 24}px` }}>
                                                                <span className="text-blue-500 mr-2 font-mono text-xs">└─</span>
                                                                <span className="text-blue-600 dark:text-blue-400">{client.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-blue-500/70 text-sm">{client.email || ''}</TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-blue-600 border-blue-300">customer</Badge>
                                                        </TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell></TableCell>
                                                        <TableCell className="text-blue-500/70 text-sm">{rep.full_name}</TableCell>
                                                    </TableRow>
                                                )),
                                                // Then child partners (white indentation) with their own subtrees
                                                ...children.flatMap(child => renderRow(child, depth + 1)),
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

                <TabsContent value="invites">
                    <InviteLinksTab reps={reps || []} />
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

            {/* Add Client Under Partner Dialog */}
            <Dialog open={!!addingToRep} onOpenChange={(open) => !open && setAddingToRep(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Add Client Under {addingToRep?.full_name}</DialogTitle>
                        <DialogDescription>
                            Create a new client or assign an existing unassigned contact to this partner.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="new" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="new">New Client</TabsTrigger>
                            <TabsTrigger value="assign">Assign Existing{unassignedContacts?.length ? ` (${unassignedContacts.length})` : ''}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="new" className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Name *</Label>
                                <Input placeholder="Client name" value={newClient.name} onChange={e => setNewClient(prev => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input type="email" placeholder="client@example.com" value={newClient.email} onChange={e => setNewClient(prev => ({ ...prev, email: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input placeholder="555-123-4567" value={newClient.phone} onChange={e => setNewClient(prev => ({ ...prev, phone: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Address</Label>
                                <Textarea placeholder="123 Main St, City, ST 12345" value={newClient.address} onChange={e => setNewClient(prev => ({ ...prev, address: e.target.value }))} />
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreateClient} disabled={isAddingClient || !newClient.name.trim()} className="w-full">
                                    {isAddingClient && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Add Client Under {addingToRep?.full_name}
                                </Button>
                            </DialogFooter>
                        </TabsContent>

                        <TabsContent value="assign" className="space-y-4 py-4">
                            {unassignedContacts && unassignedContacts.length > 0 ? (
                                <>
                                    <div className="space-y-2">
                                        <Label>Select Unassigned Contact</Label>
                                        <Select value={assignContactId} onValueChange={setAssignContactId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose a contact..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {unassignedContacts.map(c => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        {c.name}{c.email ? ` (${c.email})` : ''}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            onClick={() => addingToRep && assignContact.mutate({ contactId: assignContactId, repId: addingToRep.id })}
                                            disabled={!assignContactId || assignContact.isPending}
                                            className="w-full"
                                        >
                                            {assignContact.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Assign to {addingToRep?.full_name}
                                        </Button>
                                    </DialogFooter>
                                </>
                            ) : (
                                <p className="text-center text-muted-foreground py-4">No unassigned customer contacts found.</p>
                            )}
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Shared confirm dialog */}
            <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => { confirmDialog.action(); setConfirmDialog(prev => ({ ...prev, open: false })); }}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}

function InviteLinksTab({ reps }: { reps: UserProfile[] }) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const { profile: authProfile } = useAuth();

    const handleCopy = async (url: string, key: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const CopyBtn = ({ url, copyKey, label }: { url: string; copyKey: string; label: string }) => {
        const isCopied = copiedKey === copyKey;
        return (
            <Button
                variant="outline"
                size="sm"
                className={isCopied
                    ? 'border-emerald-500/30 text-emerald-400 min-w-[140px]'
                    : 'border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300 min-w-[140px]'
                }
                onClick={() => handleCopy(url, copyKey)}
            >
                {isCopied ? (
                    <><Check className="h-4 w-4 mr-1.5" /> Copied!</>
                ) : (
                    <><Copy className="h-4 w-4 mr-1.5" /> {label}</>
                )}
            </Button>
        );
    };

    // Admin's own partner invite link (for recruiting new partners under yourself)
    const adminProfileId = authProfile?.id;

    return (
        <div className="space-y-4">
            {/* Admin's Own Partner Recruit Link */}
            {adminProfileId && (
                <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <UserPlus className="h-5 w-5 text-violet-400" /> Recruit New Partners
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                            Send this link to someone and they sign up as a <strong>partner</strong> under you.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <code className="flex-1 text-xs bg-black/20 rounded-lg px-3 py-2.5 text-violet-300 truncate">
                                {`${window.location.origin}/#/auth?ref=${adminProfileId}&role=partner`}
                            </code>
                            <CopyBtn
                                url={`${window.location.origin}/#/auth?ref=${adminProfileId}&role=partner`}
                                copyKey="admin-partner"
                                label="Copy Link"
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Per-Partner Links */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5" /> Partner Invite Links
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Each partner has two links: one that creates <strong>customers</strong> under them, and one that recruits new <strong>partners</strong> under them.
                    </p>
                </CardHeader>
                <CardContent>
                    {reps.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No partners yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {reps.map(rep => {
                                const customerUrl = `${window.location.origin}/#/auth?ref=${rep.id}`;
                                const partnerUrl = `${window.location.origin}/#/auth?ref=${rep.id}&role=partner`;
                                return (
                                    <div
                                        key={rep.id}
                                        className="p-4 rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/20 transition-colors space-y-3"
                                    >
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">{rep.full_name || 'Unnamed'}</p>
                                            <Badge variant="secondary" className="text-xs capitalize">{rep.partner_tier || 'standard'}</Badge>
                                            <span className="text-xs text-muted-foreground ml-auto">{rep.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-20 shrink-0">Customer:</span>
                                            <code className="flex-1 text-[11px] bg-black/10 rounded-lg px-3 py-1.5 text-muted-foreground/70 truncate">{customerUrl}</code>
                                            <CopyBtn url={customerUrl} copyKey={`${rep.id}-cust`} label="Customer" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-violet-400 w-20 shrink-0">Partner:</span>
                                            <code className="flex-1 text-[11px] bg-violet-500/10 rounded-lg px-3 py-1.5 text-violet-300/70 truncate">{partnerUrl}</code>
                                            <CopyBtn url={partnerUrl} copyKey={`${rep.id}-partner`} label="Partner" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
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

function RepForm({ rep, allReps, onSubmit }: { rep: UserProfile, allReps: UserProfile[], onSubmit: (u: { commission_rate: number; price_multiplier: number; partner_tier: string; parent_rep_id: string | null }) => void }) {
    // Tier → default commission rate and price multiplier
    const TIER_DEFAULTS: Record<string, { commission: number; multiplier: number; label: string }> = {
        senior: { commission: 10, multiplier: 0.50, label: '50% off retail · 10% commission' },
        standard: { commission: 7.5, multiplier: 0.65, label: '35% off retail · 7.5% commission' },
        associate: { commission: 7.5, multiplier: 0.75, label: '25% off retail · 7.5% commission' },
        executive: { commission: 10, multiplier: 0.50, label: '50% off retail · 10% commission' },
        referral: { commission: 0, multiplier: 0.50, label: '50% off retail · 0% commission (referral only)' },
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
                        <SelectItem value="referral">🔗 Referral Partner</SelectItem>
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
                    onChange={e => { const v = parseFloat(e.target.value); setComm(isNaN(v) ? 0 : v); }}
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
                    onChange={e => { const v = parseFloat(e.target.value); setMult(isNaN(v) ? 1 : v); }}
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

