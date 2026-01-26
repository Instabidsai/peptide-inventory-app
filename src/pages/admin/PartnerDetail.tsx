import { useParams, useNavigate } from 'react-router-dom';
import { useRepProfile } from '@/hooks/use-profiles';
import { useContacts } from '@/hooks/use-contacts';
import { useSalesOrders } from '@/hooks/use-sales-orders';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Users, ShoppingBag, DollarSign, Wallet } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { format } from 'date-fns';

export default function PartnerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: rep, isLoading: repLoading } = useRepProfile(id || null);

    // Fetch contacts assigned to this rep
    const { data: contacts, isLoading: contactsLoading } = useContacts();
    const myContacts = contacts?.filter(c => (c as any).assigned_rep_id === id) || [];

    // Fetch orders - for a specific rep, we want orders linked to their clients
    // Or if the order table has assigned_rep_id, we use that.
    // OrderList uses useMySalesOrders which filters by user ID. 
    // For Admin View, we fetch all and filter.
    const { data: allOrders, isLoading: ordersLoading } = useSalesOrders();
    const myOrders = allOrders?.filter(o =>
        o.assigned_rep_id === id ||
        myContacts.some(c => c.id === o.contact_id)
    ) || [];

    if (repLoading) return <div className="p-8 text-center animate-pulse">Loading Partner Details...</div>;
    if (!rep) return <div className="p-8 text-center text-destructive">Partner not found.</div>;

    const totalSales = myOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalCommission = myOrders.reduce((sum, o) => sum + (o.commission_amount || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{rep.full_name}</h1>
                    <p className="text-muted-foreground">{rep.email} • Partner Details</p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{myContacts.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalSales.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Comm.</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-500">${totalCommission.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${(rep.credit_balance || 0).toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="clients" className="w-full">
                <TabsList>
                    <TabsTrigger value="clients">Assigned Clients ({myContacts.length})</TabsTrigger>
                    <TabsTrigger value="orders">Sales Orders ({myOrders.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="clients" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Tier</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myContacts.length > 0 ? myContacts.map(contact => (
                                        <TableRow key={contact.id}>
                                            <TableCell className="font-medium">{contact.name}</TableCell>
                                            <TableCell>{contact.email}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{contact.tier}</Badge>
                                            </TableCell>
                                            <TableCell>{format(new Date(contact.created_at), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${contact.id}`)}>
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No clients assigned to this partner yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="orders" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Order ID</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead className="text-right">Comm.</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {myOrders.length > 0 ? myOrders.map(order => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-mono text-xs">{order.id.slice(0, 8)}</TableCell>
                                            <TableCell>{(order as any).contacts?.name || 'Unknown'}</TableCell>
                                            <TableCell>
                                                <Badge>{order.status}</Badge>
                                            </TableCell>
                                            <TableCell>${order.total_amount.toLocaleString()}</TableCell>
                                            <TableCell className="text-right text-emerald-500 font-medium">
                                                ${order.commission_amount?.toLocaleString() || '0'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" onClick={() => navigate(`/sales/${order.id}`)}>
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                No orders processed by this partner yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
