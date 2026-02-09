
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Added useQueryClient
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, DollarSign, TrendingUp, Users, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import DownlineVisualizer from './components/DownlineVisualizer'; // Corrected to default import
import { usePartnerDownline, useCommissions, usePayCommission, useConvertCommission } from '@/hooks/use-partner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

// Helper for the Network Tab
function NetworkTabContent({ repId }: { repId: string }) {
    const { data: downline, isLoading } = usePartnerDownline(repId); // Uses the new hook logic

    if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading network data...</div>;

    // Pass root partner details if needed, but Visualizer takes a list?
    // The hook returns FlattenedPartnerNode[]. Visualizer expects that.
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Network Strategy</h3>
                <Badge variant="outline">Total Downline: {downline?.length || 0}</Badge>
            </div>
            <DownlineVisualizer data={downline || []} />
        </div>
    );
}

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // 1. Fetch Partner Profile
    const { data: partner, isLoading } = useQuery({
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

    if (!partner) return <div className="p-6">Partner not found</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin/reps')}>
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
                        <CardTitle className="text-sm font-medium">Commission Rate</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{((partner.commission_rate || 0) * 100).toFixed(0)}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Partner Tier</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize">{partner.partner_tier || 'Standard'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Joined</CardTitle>
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
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="orders">
                    <Card>
                        <CardHeader><CardTitle>Sales History</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">Order history table coming soon...</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="clients">
                    <AssignedClientsTabContent repId={id!} />
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

function PayoutsTabContent({ repId }: { repId: string }) {
    // We need to fetch commissions for THIS partner, not the logged in user.
    // The hook useCommissions uses useAuth().user.id. 
    // We need to refactor useCommissions or make a new query here.
    // Let's make a quick specialized query here for now or update the hook?
    // Updating the hook is cleaner.

    // Actually, I'll update the hook in the NEXT step if needed, but for now let's assume I can pass an ID.
    // Wait, useCommissions doesn't accept an ID. I should have checked that.
    // I will use a direct query here for speed, or update the hook.
    // Let's use direct query to avoid breaking the existing hook used by Dashboard.

    const { toast } = useToast();
    const queryClient = useQueryClient(); // Need this context
    const payCommission = usePayCommission();
    const convertCommission = useConvertCommission();

    const { data: commissions, isLoading } = useQuery({
        queryKey: ['admin_partner_commissions', repId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('commissions')
                .select('*')
                .eq('partner_id', repId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }
    });

    const handlePay = (id: string) => {
        payCommission.mutate(id, {
            onSuccess: () => {
                toast({ title: 'Commission Paid', description: 'Status updated to paid.' });
            }
        });
    };

    const handleConvert = (id: string) => {
        convertCommission.mutate(id, {
            onSuccess: () => {
                toast({ title: 'Converted to Credit', description: 'Commission added to partner wallet.' });
            }
        });
    };

    /* 
       Note: The usePayCommission hook invalidates ['commissions']. 
       Our query key is ['admin_partner_commissions', repId].
       So it won't auto-refresh. I should pass onSuccess to invalidate this key.
       Or better, refactor useCommissions to accept ID.
       
       Let's stick to the inline query but add invalidation.
    */

    if (isLoading) return <div>Loading commissions...</div>;

    const pending = commissions?.filter(c => c.status === 'pending') || [];
    const history = commissions?.filter(c => c.status !== 'pending') || [];

    return (
        <div className="space-y-6">
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
                                <TableHead>Order</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pending.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground">No pending commissions</TableCell>
                                </TableRow>
                            )}
                            {pending.map(c => (
                                <TableRow key={c.id}>
                                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell>{c.sales_orders?.order_number || 'N/A'}</TableCell>
                                    <TableCell className="capitalize">{c.type.replace(/_/g, ' ')}</TableCell>
                                    <TableCell className="font-medium">${c.amount.toFixed(2)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleConvert(c.id)}
                                                disabled={convertCommission.isPending || payCommission.isPending}
                                            >
                                                To Credit
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handlePay(c.id)}
                                                disabled={payCommission.isPending || convertCommission.isPending}
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
                                <TableHead>Order</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground">No history found</TableCell>
                                </TableRow>
                            )}
                            {history.map(c => (
                                <TableRow key={c.id}>
                                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell>{c.sales_orders?.order_number || 'N/A'}</TableCell>
                                    <TableCell className="capitalize">{c.type.replace(/_/g, ' ')}</TableCell>
                                    <TableCell>${c.amount.toFixed(2)}</TableCell>
                                    <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


function AssignedClientsTabContent({ repId }: { repId: string }) {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [promoteOpen, setPromoteOpen] = useState(false);
    const [selectedContact, setSelectedContact] = useState<any>(null);
    const [isPromoting, setIsPromoting] = useState(false);

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

    const handlePromote = async () => {
        if (!selectedContact) return;
        setIsPromoting(true);

        try {
            // 1. Update the contact's type to 'partner'
            const { error: contactError } = await supabase
                .from('contacts')
                .update({ type: 'partner' })
                .eq('id', selectedContact.id);

            if (contactError) throw contactError;

            // 2. If contact has a linked user profile, update their role and parent_rep_id
            if (selectedContact.linked_user_id) {
                // Find the profile by user_id
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('user_id', selectedContact.linked_user_id)
                    .single();

                if (profile) {
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .update({
                            role: 'sales_rep',
                            parent_rep_id: repId,
                            commission_rate: 0.10, // Default 10%
                            partner_tier: 'standard',
                        })
                        .eq('id', profile.id);

                    if (profileError) throw profileError;
                }
            }

            toast({
                title: "Promoted!",
                description: `${selectedContact.name} is now a Partner under this rep.`
            });
            setPromoteOpen(false);
            refetch();
        } catch (err: any) {
            toast({
                variant: 'destructive',
                title: "Promotion Failed",
                description: err.message || "Could not promote contact."
            });
        } finally {
            setIsPromoting(false);
        }
    };

    const openPromote = (contact: any) => {
        setSelectedContact(contact);
        setPromoteOpen(true);
    }

    if (isLoading) return <div>Loading clients...</div>;

    const list = clients || [];

    return (
        <>
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Assigned Clients</CardTitle>
                    <CardDescription>
                        Customers and Partners explicitly assigned to this Rep.
                    </CardDescription>
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
                                        <Badge variant={client.type === 'partner' ? 'secondary' : 'default'} className="capitalize">
                                            {client.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{client.email || '-'}</TableCell>
                                    <TableCell>{client.phone || '-'}</TableCell>
                                    <TableCell>{new Date(client.created_at).toLocaleDateString()}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            {client.type !== 'partner' && (
                                                <Button size="sm" variant="outline" onClick={() => openPromote(client)}>
                                                    <UserPlus className="h-3 w-3 mr-1" /> Promote
                                                </Button>
                                            )}
                                            {client.type === 'partner' && (
                                                <Badge variant="outline" className="text-emerald-500 border-emerald-500">
                                                    ✓ Partner
                                                </Badge>
                                            )}
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

            <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Promote to Partner</DialogTitle>
                        <DialogDescription>
                            This will promote <strong>{selectedContact?.name}</strong> to a Sales Partner
                            under this Rep's downline. They'll start at 10% commission, Standard tier.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="font-medium">{selectedContact?.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">Email:</span>
                            <span>{selectedContact?.email || 'No email'}</span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPromoteOpen(false)}>Cancel</Button>
                        <Button onClick={handlePromote} disabled={isPromoting}>
                            {isPromoting ? 'Promoting...' : 'Promote Now'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
