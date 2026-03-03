import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useReps, useUpdateProfile, type UserProfile, useTeamMembers } from '@/hooks/use-profiles';
import { useInviteRep } from '@/hooks/use-invite';
import { useFullNetwork } from '@/hooks/use-partner';
import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';

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
import {
    Pencil,
    UserPlus,
    Users,
    Eye,
    Loader2,
    Network,
    ShoppingCart,
    UserX,
    Link2,
    Copy,
    Check,
    Settings2,
} from 'lucide-react';
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
import { useTierConfig, tierToInfo, type TierConfig } from '@/hooks/use-tier-config';
import TierConfigTab from './components/TierConfigTab';

export default function Reps() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile: currentProfile } = useAuth();
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

    // Remove a partner — demotes back to client, reassigns their downline
    const removePartner = useMutation({
        mutationFn: async (rep: UserProfile) => {
            const orgId = currentProfile?.org_id;
            if (!orgId) throw new Error('No org context');

            // 1. Reassign child partners to this partner's upline (preserves hierarchy)
            const { error: childErr } = await supabase
                .from('profiles')
                .update({ parent_rep_id: rep.parent_rep_id || null })
                .eq('parent_rep_id', rep.id)
                .eq('org_id', orgId);
            if (childErr) throw childErr;

            // 2. Unassign any contacts assigned to this partner
            const { error: contactErr } = await supabase
                .from('contacts')
                .update({ assigned_rep_id: null })
                .eq('assigned_rep_id', rep.id)
                .eq('org_id', orgId);
            if (contactErr) throw contactErr;

            // 3. Demote the partner's profile back to client
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({
                    role: 'client',
                    commission_rate: 0,
                    partner_tier: null,
                    parent_rep_id: null,
                    price_multiplier: null,
                    can_recruit: null,
                })
                .eq('id', rep.id)
                .eq('org_id', orgId);
            if (profileErr) throw profileErr;

            // 4. Update user_roles table
            const { error: roleErr } = await supabase
                .from('user_roles')
                .update({ role: 'client' })
                .eq('user_id', rep.user_id);
            if (roleErr && roleErr.code !== 'PGRST116') throw roleErr; // ignore "no rows" error

            // 5. Update any linked contact record back to customer type
            await supabase
                .from('contacts')
                .update({ type: 'customer' })
                .eq('linked_user_id', rep.user_id)
                .eq('org_id', orgId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['reps'] });
            queryClient.invalidateQueries({ queryKey: ['rep_customers_list'] });
            queryClient.invalidateQueries({ queryKey: ['rep_performance'] });
            queryClient.invalidateQueries({ queryKey: ['full_network'] });
            queryClient.invalidateQueries({ queryKey: ['pending_partners'] });
            queryClient.invalidateQueries({ queryKey: ['team_candidates'] });
            queryClient.invalidateQueries({ queryKey: ['unassigned_contacts'] });
            toast({ title: 'Partner removed', description: 'Demoted to client. Downline has been reassigned to their upline.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove partner', description: error.message });
        },
    });

    // Remove a pending partner (contact promoted but no auth account yet) — revert to customer
    const removePendingPartner = useMutation({
        mutationFn: async (contactId: string) => {
            const { error } = await supabase
                .from('contacts')
                .update({ type: 'customer', invite_link: null })
                .eq('id', contactId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pending_partners'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['customer_contacts_for_promote'] });
            toast({ title: 'Pending partner removed', description: 'Reverted to customer.' });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to remove pending partner', description: error.message });
        },
    });

    const [editingRep, setEditingRep] = useState<UserProfile | null>(null);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('list');

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
        queryKey: ['unassigned_contacts', currentProfile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type')
                .is('assigned_rep_id', null)
                .in('type', ['customer', 'preferred'])
                .eq('org_id', currentProfile!.org_id!)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        enabled: !!currentProfile?.org_id,
    });

    // Fetch pending partners (promoted but no auth account yet — show in Active Partners table)
    const { data: pendingPartners } = useQuery({
        queryKey: ['pending_partners', currentProfile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, invite_link, type, assigned_rep_id, created_at')
                .eq('type', 'partner')
                .is('linked_user_id', null)
                .eq('org_id', currentProfile!.org_id!)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },
        enabled: !!currentProfile?.org_id,
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
                .maybeSingle();

            const { error } = await supabase
                .from('contacts')
                .insert({
                    name: newClient.name.trim(),
                    email: newClient.email.trim() || null,
                    phone: newClient.phone.trim() || null,
                    address: newClient.address.trim() || null,
                    type: 'customer',
                    assigned_rep_id: addingToRep.id,
                    org_id: repProfile?.org_id || currentProfile?.org_id || null,
                });
            if (error) throw error;

            queryClient.invalidateQueries({ queryKey: ['rep_customers_list'] });
            queryClient.invalidateQueries({ queryKey: ['rep_performance'] });
            queryClient.invalidateQueries({ queryKey: ['full_network'] });
            toast({ title: 'Client added', description: `${newClient.name} added under ${addingToRep.full_name}` });
            setNewClient({ name: '', email: '', phone: '', address: '' });
            setAddingToRep(null);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Failed to add client', description: (err as any)?.message || 'Unknown error' });
        } finally {
            setIsAddingClient(false);
        }
    };

    // Fetch per-rep performance: sales volume + commission earned (from commissions table, not orders)
    const { data: repStats } = useQuery({
        queryKey: ['rep_performance', currentProfile?.org_id, reps?.map(r => r.id)],
        queryFn: async () => {
            if (!reps || reps.length === 0) return new Map<string, { volume: number; commission: number; orders: number; customers: number }>();

            // Get sales stats per rep (volume = orders where they're the rep) — org-scoped
            const { data: orders } = await supabase
                .from('sales_orders')
                .select('rep_id, total_amount')
                .eq('org_id', currentProfile!.org_id!)
                .not('rep_id', 'is', null)
                .neq('status', 'cancelled');

            // Get commission earned from commissions table (includes overrides!) — org-scoped
            const { data: commissions } = await supabase
                .from('commissions')
                .select('partner_id, amount')
                .eq('org_id', currentProfile!.org_id!)
                .neq('status', 'void');

            // Get customer counts per rep — org-scoped
            const { data: contacts } = await supabase
                .from('contacts')
                .select('assigned_rep_id')
                .eq('org_id', currentProfile!.org_id!)
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
        enabled: !!reps && reps.length > 0 && !!currentProfile?.org_id,
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
                .in('type', ['customer', 'preferred'])
                .order('name');
            if (error) throw error;
            // Exclude contacts whose linked_user_id matches a partner profile (they're already shown as partners)
            const partnerEmails = new Set(reps.map(r => r.email?.toLowerCase()));
            return (data || []).filter(c => !partnerEmails.has(c.email?.toLowerCase()));
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

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
                    <TabsTrigger value="tiers" className="gap-2">
                        <Settings2 className="h-4 w-4" /> Tier Config
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="list">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" /> Active Partners
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
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
                                        const hasPending = pendingPartners && pendingPartners.length > 0;
                                        if ((!reps || reps.length === 0) && !hasPending) {
                                            return (
                                                <TableRow>
                                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                        No partners found. Invite or promote users to get started.
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        }

                                        // Build hierarchy: top-level first, then children under each
                                        const safeReps = reps ?? [];
                                        const repIds = new Set(safeReps.map(r => r.id));
                                        const topLevel = safeReps.filter(r => !r.parent_rep_id || !repIds.has(r.parent_rep_id));
                                        const childrenOf = (parentId: string) => safeReps.filter(r => r.parent_rep_id === parentId);

                                        // Get customer contacts for a given rep
                                        const clientsOf = (repId: string) =>
                                            (customerContacts || []).filter(c => c.assigned_rep_id === repId);

                                        // Helper: find or create a contact for this partner, then navigate to new order
                                        const handlePartnerOrder = async (rep: UserProfile) => {
                                            try {
                                                // Look for existing contact matching partner email
                                                if (rep.email) {
                                                    const { data: existingContact } = await supabase
                                                        .from('contacts')
                                                        .select('id')
                                                        .eq('email', rep.email)
                                                        .eq('org_id', currentProfile?.org_id ?? '')
                                                        .maybeSingle();
                                                    if (existingContact) {
                                                        navigate(`/sales/new?contact_id=${existingContact.id}`);
                                                        return;
                                                    }
                                                }
                                                // No contact found — create one as type=partner
                                                const { data: newContact, error } = await supabase
                                                    .from('contacts')
                                                    .insert({
                                                        name: rep.full_name || 'Partner',
                                                        email: rep.email || null,
                                                        type: 'partner',
                                                        org_id: currentProfile?.org_id || null,
                                                        linked_user_id: rep.id,
                                                    })
                                                    .select('id')
                                                    .single();
                                                if (error) throw error;
                                                navigate(`/sales/new?contact_id=${newContact.id}`);
                                            } catch (err) {
                                                toast({ variant: 'destructive', title: 'Failed to start order', description: (err as any)?.message || 'Unknown error' });
                                            }
                                        };

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
                                                            <Button variant="secondary" size="sm" className="text-orange-600" onClick={() => handlePartnerOrder(rep)}>
                                                                <ShoppingCart className="h-4 w-4 mr-1" /> Order
                                                            </Button>
                                                            <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-950" onClick={() => { setAddingToRep(rep); setNewClient({ name: '', email: '', phone: '', address: '' }); setAssignContactId(''); }}>
                                                                <UserPlus className="h-4 w-4 mr-1" /> Client
                                                            </Button>
                                                            <Button variant="ghost" size="sm" onClick={() => setEditingRep(rep)}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                                                onClick={() => setConfirmDialog({
                                                                    open: true,
                                                                    title: 'Remove Partner',
                                                                    description: `Remove ${rep.full_name} as a partner? They will be demoted to a regular client. Their ${(customerContacts || []).filter(c => c.assigned_rep_id === rep.id).length} customer(s) will become unassigned, and any downline partners will be moved up to ${rep.parent_rep_id ? repNameMap.get(rep.parent_rep_id) || 'their upline' : 'top-level'}. Existing commission records are preserved.`,
                                                                    action: () => removePartner.mutate(rep),
                                                                })}
                                                            >
                                                                <UserX className="h-4 w-4" />
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
                                                        <Badge
                                                            variant={rep.partner_tier === 'referral' ? 'outline' : 'secondary'}
                                                            className={rep.partner_tier === 'referral' ? 'bg-sky-900/30 text-sky-400 border-sky-500/50' : ''}
                                                        >
                                                            {rep.partner_tier || 'Standard'}
                                                        </Badge>
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

                                        return [
                                            ...topLevel.flatMap(rep => renderRow(rep)),
                                            // Pending partners — promoted from contacts but no auth account yet
                                            ...(pendingPartners || []).map(p => (
                                                <TableRow key={`pending-${p.id}`} className="bg-amber-500/5 border-l-2 border-l-amber-500/40">
                                                    <TableCell>
                                                        <div className="flex gap-1">
                                                            <Button variant="outline" size="sm" onClick={() => navigate(`/contacts/${p.id}`)}>
                                                                <Eye className="h-4 w-4 mr-1" /> View
                                                            </Button>
                                                            {p.invite_link && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="text-amber-600 border-amber-400/50 hover:bg-amber-500/10"
                                                                    onClick={async () => {
                                                                        try {
                                                                            await navigator.clipboard.writeText(p.invite_link!);
                                                                            toast({ title: 'Invite link copied' });
                                                                        } catch {
                                                                            toast({ title: 'Invite Link', description: p.invite_link! });
                                                                        }
                                                                    }}
                                                                >
                                                                    <Copy className="h-4 w-4 mr-1" /> Link
                                                                </Button>
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                                                onClick={() => setConfirmDialog({
                                                                    open: true,
                                                                    title: 'Remove Pending Partner',
                                                                    description: `Remove ${p.name} as a pending partner? They will be reverted to a regular customer.`,
                                                                    action: () => removePendingPartner.mutate(p.id),
                                                                })}
                                                            >
                                                                <UserX className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{p.name}</TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{p.email || '—'}</TableCell>
                                                    <TableCell>0%</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                                                            Invited
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">$0.00</TableCell>
                                                    <TableCell className="text-right text-green-600 font-medium">$0.00</TableCell>
                                                    <TableCell className="text-right">0</TableCell>
                                                    <TableCell>
                                                        <span className="text-muted-foreground text-xs">Pending signup</span>
                                                    </TableCell>
                                                </TableRow>
                                            )),
                                        ];
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
                            {activeTab !== 'network' ? null : networkLoading ? (
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

                <TabsContent value="tiers">
                    <TierConfigTab orgId={currentProfile?.org_id} />
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
    const { isImpersonating, orgId: impOrgId } = useImpersonation();
    const { data: tierConfigs } = useTierConfig();
    const tierRecruitMap = new Map<string, boolean>();
    tierConfigs?.forEach(t => tierRecruitMap.set(t.tier_key, t.can_recruit));

    // When impersonating, fetch the impersonated org's admin profile
    // so we show THEIR referral links, not the super_admin's
    const { data: orgAdmin } = useQuery({
        queryKey: ['org_admin_profile', impOrgId],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, referral_slug, full_name, org_id')
                .eq('org_id', impOrgId!)
                .in('role', ['admin', 'super_admin'])
                .limit(1)
                .maybeSingle();
            return data;
        },
        enabled: isImpersonating && !!impOrgId,
    });

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
                    ? 'border-primary/30 text-primary min-w-[140px]'
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

    // Admin's own invite links — use impersonated org's admin when impersonating
    const adminProfileId = isImpersonating && orgAdmin ? orgAdmin.id : authProfile?.id;
    const adminOrgId = isImpersonating && orgAdmin ? orgAdmin.org_id : authProfile?.org_id;
    const adminSlug = isImpersonating && orgAdmin ? orgAdmin.referral_slug : authProfile?.referral_slug;

    return (
        <div className="space-y-4">
            {/* Admin's Own Invite Links */}
            {adminProfileId && (
                <div className="grid gap-4 sm:grid-cols-2">
                    {/* Customer Invite Link */}
                    <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-green-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <ShoppingCart className="h-5 w-5 text-emerald-400" /> Invite Customers
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Send this link so someone can <strong>sign up and purchase</strong>.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <code className="flex-1 text-xs bg-black/20 rounded-lg px-3 py-2.5 text-emerald-300 truncate">
                                    {adminSlug ? `${window.location.origin}/r/${adminSlug}` : `${window.location.origin}/join?ref=${adminProfileId}${adminOrgId ? `&org=${adminOrgId}` : ''}`}
                                </code>
                                <CopyBtn
                                    url={adminSlug ? `${window.location.origin}/r/${adminSlug}` : `${window.location.origin}/join?ref=${adminProfileId}${adminOrgId ? `&org=${adminOrgId}` : ''}`}
                                    copyKey="admin-customer"
                                    label="Copy Link"
                                />
                            </div>
                        </CardContent>
                    </Card>
                    {/* Partner Recruit Link */}
                    <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <UserPlus className="h-5 w-5 text-violet-400" /> Recruit Partners
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Send this link so someone signs up as a <strong>partner</strong> under you.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3">
                                <code className="flex-1 text-xs bg-black/20 rounded-lg px-3 py-2.5 text-violet-300 truncate">
                                    {adminSlug ? `${window.location.origin}/r/${adminSlug}?p` : `${window.location.origin}/join?ref=${adminProfileId}&role=partner&tier=standard${adminOrgId ? `&org=${adminOrgId}` : ''}`}
                                </code>
                                <CopyBtn
                                    url={adminSlug ? `${window.location.origin}/r/${adminSlug}?p` : `${window.location.origin}/join?ref=${adminProfileId}&role=partner&tier=standard${adminOrgId ? `&org=${adminOrgId}` : ''}`}
                                    copyKey="admin-partner"
                                    label="Copy Link"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Per-Partner Links */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5" /> Partner Invite Links
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Each partner has a <strong>customer</strong> link. Partners with <strong>recruit</strong> access can also share partner referral links.
                    </p>
                </CardHeader>
                <CardContent>
                    {!reps || reps.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">No partners yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {reps.map(rep => {
                                const customerUrl = rep.referral_slug
                                    ? `${window.location.origin}/r/${rep.referral_slug}`
                                    : `${window.location.origin}/join?ref=${rep.id}${adminOrgId ? `&org=${adminOrgId}` : ''}`;
                                const partnerUrl = rep.referral_slug
                                    ? `${window.location.origin}/r/${rep.referral_slug}?p`
                                    : `${window.location.origin}/join?ref=${rep.id}&role=partner&tier=standard${adminOrgId ? `&org=${adminOrgId}` : ''}`;
                                // Per-person override → tier default fallback
                                const canRecruit = rep.can_recruit ?? tierRecruitMap.get(rep.partner_tier || 'standard') ?? false;
                                return (
                                    <div
                                        key={rep.id}
                                        className="p-4 rounded-lg border border-border/60 bg-muted/10 hover:bg-muted/20 transition-colors space-y-3"
                                    >
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-sm">{rep.full_name || 'Unnamed'}</p>
                                            <Badge
                                                variant={rep.partner_tier === 'referral' ? 'outline' : 'secondary'}
                                                className={`text-xs capitalize ${rep.partner_tier === 'referral' ? 'bg-sky-900/30 text-sky-400 border-sky-500/50' : ''}`}
                                            >
                                                {rep.partner_tier || 'standard'}
                                            </Badge>
                                            {canRecruit && (
                                                <Badge variant="outline" className="text-xs bg-violet-900/30 text-violet-400 border-violet-500/50">
                                                    Can Recruit
                                                </Badge>
                                            )}
                                            <span className="text-xs text-muted-foreground ml-auto">{rep.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground w-20 shrink-0">Customer:</span>
                                            <code className="flex-1 text-[11px] bg-black/10 rounded-lg px-3 py-1.5 text-muted-foreground/70 truncate">{customerUrl}</code>
                                            <CopyBtn url={customerUrl} copyKey={`${rep.id}-cust`} label="Customer" />
                                        </div>
                                        {canRecruit && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-violet-400 w-20 shrink-0">Partner:</span>
                                                <code className="flex-1 text-[11px] bg-violet-500/10 rounded-lg px-3 py-1.5 text-violet-300/70 truncate">{partnerUrl}</code>
                                                <CopyBtn url={partnerUrl} copyKey={`${rep.id}-partner`} label="Partner" />
                                            </div>
                                        )}
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
    const { profile } = useAuth();
    const queryClient = useQueryClient();

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [parentRepId, setParentRepId] = useState('');
    const [activeTab, setActiveTab] = useState('promote');
    const [selectedContactId, setSelectedContactId] = useState('');
    const [isPromotingCustomer, setIsPromotingCustomer] = useState(false);

    // Fetch customer/preferred contacts for "From Customers" tab
    const { data: customerContacts } = useQuery({
        queryKey: ['customer_contacts_for_promote', profile?.org_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('contacts')
                .select('id, name, email, type, linked_user_id')
                .in('type', ['customer', 'preferred'])
                .eq('org_id', profile!.org_id!)
                .order('name');
            if (error) throw error;
            return data;
        },
        enabled: !!profile?.org_id && open,
    });

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        inviteRep.mutate({ email, fullName: name, parentRepId: parentRepId || undefined, targetOrgId: profile?.org_id || null }, {
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

    const handlePromoteCustomer = async () => {
        if (!selectedContactId) return;
        const contact = customerContacts?.find(c => c.id === selectedContactId);
        if (!contact) return;

        setIsPromotingCustomer(true);
        try {
            // Use RPC — handles both linked and unlinked contacts, works from localhost
            const { data, error } = await supabase.rpc('promote_contact_to_partner', {
                p_contact_id: contact.id,
                p_parent_rep_id: parentRepId || null,
                p_redirect_origin: window.location.origin,
                p_target_org_id: profile?.org_id || null,
            });

            if (error) {
                // 409 = unique constraint — partner profile already exists
                if (error.code === '23505' || error.message?.includes('409') || (error as any).status === 409) {
                    toast({ title: 'Already a Partner', description: `${contact.name} has already been promoted to partner.` });
                    queryClient.invalidateQueries({ queryKey: ['reps'] });
                    queryClient.invalidateQueries({ queryKey: ['pending_partners'] });
                    onOpenChange(false);
                    setSelectedContactId('');
                    setParentRepId('');
                    return;
                }
                throw error;
            }
            if (!data?.success) throw new Error(data?.message || 'Promotion failed');

            // If an invite link was generated, copy it to clipboard
            if (data.action_link) {
                try {
                    await navigator.clipboard.writeText(data.action_link);
                    toast({
                        title: 'Partner Created — Link Copied',
                        description: `${contact.name} is now a partner. Their invite link has been copied to your clipboard.`,
                        duration: 10000,
                    });
                } catch {
                    toast({ title: 'Partner Created', description: data.action_link, duration: 15000 });
                }
            } else {
                toast({ title: 'Partner Created', description: data.message || `${contact.name} is now a partner.` });
            }

            queryClient.invalidateQueries({ queryKey: ['reps'] });
            queryClient.invalidateQueries({ queryKey: ['contacts'] });
            queryClient.invalidateQueries({ queryKey: ['customer_contacts_for_promote'] });
            queryClient.invalidateQueries({ queryKey: ['pending_partners'] });
            onOpenChange(false);
            setSelectedContactId('');
            setParentRepId('');
        } catch (err) {
            toast({ variant: 'destructive', title: 'Promotion Failed', description: (err as any)?.message || String(err) });
        } finally {
            setIsPromotingCustomer(false);
        }
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
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="promote">From Users</TabsTrigger>
                        <TabsTrigger value="from_customer">From Customers</TabsTrigger>
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
                                All users except existing partners are shown.
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

                    <TabsContent value="from_customer" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select Customer</Label>
                            <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a customer..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {customerContacts?.map(c => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}{c.email ? ` (${c.email})` : ''}
                                        </SelectItem>
                                    ))}
                                    {(!customerContacts || customerContacts.length === 0) && (
                                        <SelectItem value="none" disabled>No customers found</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Pick a customer to make them a partner. You can send them a login link from their profile page later.
                            </p>
                        </div>
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
                        </div>
                        <DialogFooter>
                            <Button onClick={handlePromoteCustomer} disabled={!selectedContactId || isPromotingCustomer} className="w-full">
                                {isPromotingCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Make Partner
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

function RepForm({ rep, allReps, onSubmit }: { rep: UserProfile, allReps: UserProfile[], onSubmit: (u: { commission_rate: number; price_multiplier: number; pricing_mode: string; cost_plus_markup: number; partner_tier: string; parent_rep_id: string | null; can_recruit: boolean | null }) => void }) {
    // DB-driven tier defaults (per-org)
    const { data: tierConfigs } = useTierConfig();
    const tierMap = new Map<string, TierConfig>();
    tierConfigs?.forEach((t) => tierMap.set(t.tier_key, t));

    const [comm, setComm] = useState((rep.commission_rate || 0) * 100);
    const [mult, setMult] = useState(rep.price_multiplier || 2.0);
    const [pricingMode, setPricingMode] = useState(rep.pricing_mode || 'cost_multiplier');
    const [costPlus, setCostPlus] = useState(rep.cost_plus_markup || 2.0);
    const [tier, setTier] = useState(rep.partner_tier || 'standard');
    const [parentRep, setParentRep] = useState(rep.parent_rep_id || '');
    const [canRecruit, setCanRecruit] = useState<boolean | null>(rep.can_recruit ?? null);

    const handleTierChange = (newTier: string) => {
        setTier(newTier);
        const dbTier = tierMap.get(newTier);
        if (dbTier) {
            setComm(dbTier.commission_rate * 100);
            setMult(dbTier.price_multiplier);
            setPricingMode(dbTier.pricing_mode);
            setCostPlus(dbTier.cost_plus_markup);
        }
    };

    // Filter out the current rep from potential parents (can't be your own parent)
    const potentialParents = allReps.filter(r => r.id !== rep.id);

    // Build tier description from DB config
    const currentDbTier = tierMap.get(tier);
    const tierDescription = currentDbTier
        ? `${tierToInfo(currentDbTier).discount} · ${(currentDbTier.commission_rate * 100).toFixed(0)}% commission${currentDbTier.can_recruit ? ' · Can recruit' : ''}`
        : null;

    return (
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Tier</Label>
                <Select value={tier} onValueChange={handleTierChange}>
                    <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                        {(tierConfigs && tierConfigs.length > 0 ? tierConfigs : [
                            { tier_key: 'senior', emoji: '🥇', label: 'Senior Partner', active: true },
                            { tier_key: 'standard', emoji: '🥈', label: 'Standard Partner', active: true },
                            { tier_key: 'referral', emoji: '🔗', label: 'Referral Partner', active: true },
                        ]).filter((t: any) => t.active !== false).map((t: any) => (
                            <SelectItem key={t.tier_key} value={t.tier_key}>
                                {t.emoji} {t.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {tierDescription && (
                <p className="text-xs text-muted-foreground text-right">
                    {tierDescription}
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
                <Label className="text-right">Pricing Mode</Label>
                <Select value={pricingMode} onValueChange={(v) => {
                    setPricingMode(v);
                    if (v === 'percentage') setMult(0.8); // default 20% off
                    else if (v === 'cost_multiplier') setMult(2.0);
                }}>
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="cost_multiplier">Cost Multiplier (e.g. 2x cost)</SelectItem>
                        <SelectItem value="cost_plus">Cost Plus (cost + $X)</SelectItem>
                        <SelectItem value="percentage">Percentage of Retail</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {pricingMode === 'percentage' ? (
                <>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Discount</Label>
                        <Select
                            value={String(Math.round((1 - mult) * 100))}
                            onValueChange={(v) => setMult(1 - parseInt(v) / 100)}
                        >
                            <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {[20, 25, 30, 35, 40, 45, 50, 55, 60].map(pct => (
                                    <SelectItem key={pct} value={String(pct)}>{pct}% off retail</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                        Partner pays {Math.round(mult * 100)}% of retail price
                    </p>
                </>
            ) : pricingMode === 'cost_plus' ? (
                <>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Markup ($)</Label>
                        <Input
                            type="number"
                            step="0.50"
                            className="col-span-3"
                            value={costPlus}
                            onChange={e => { const v = parseFloat(e.target.value); setCostPlus(isNaN(v) ? 0 : v); }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                        Partner pays cost + ${costPlus.toFixed(2)} per item
                    </p>
                </>
            ) : (
                <>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Multiplier</Label>
                        <Input
                            type="number"
                            step="0.1"
                            className="col-span-3"
                            value={mult}
                            onChange={e => { const v = parseFloat(e.target.value); setMult(isNaN(v) ? 1 : v); }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                        Partner pays {mult}x average cost per item
                    </p>
                </>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Can Recruit</Label>
                <Select
                    value={canRecruit === null ? 'default' : canRecruit ? 'yes' : 'no'}
                    onValueChange={(v) => setCanRecruit(v === 'default' ? null : v === 'yes')}
                >
                    <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Use tier default ({currentDbTier?.can_recruit ? 'Yes' : 'No'})</SelectItem>
                        <SelectItem value="yes">Yes — can share partner referral links</SelectItem>
                        <SelectItem value="no">No — customer referral links only</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <p className="text-xs text-muted-foreground text-right">
                Override whether this partner can recruit other partners into the network.
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
                    pricing_mode: pricingMode,
                    cost_plus_markup: costPlus,
                    partner_tier: tier,
                    parent_rep_id: parentRep || null,
                    can_recruit: canRecruit,
                })}>
                    Save Changes
                </Button>
            </DialogFooter>
        </div>
    )
}

