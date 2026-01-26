import { useState } from 'react';
import { useSalesOrders, useMySalesOrders, type SalesOrder, useUpdateSalesOrder, type SalesOrderStatus } from '@/hooks/use-sales-orders';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, DollarSign, Package } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function OrderList() {
    const { userRole, profile } = useAuth();
    const navigate = useNavigate();
    const [filterStatus, setFilterStatus] = useState<SalesOrderStatus | 'all'>('all');

    // Reps see 'My Orders', Admins see 'All Orders' (by default, can switch)
    const isRep = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

    const { data: allOrders, isLoading: allLoading } = useSalesOrders(filterStatus === 'all' ? undefined : filterStatus);
    const { data: myOrders, isLoading: myLoading } = useMySalesOrders();

    const orders = isRep ? myOrders : allOrders;
    const isLoading = isRep ? myLoading : allLoading;

    if (isLoading) return <div className="p-8 text-center">Loading orders...</div>;

    const getStatusColor = (status: SalesOrderStatus) => {
        switch (status) {
            case 'draft': return 'secondary';
            case 'submitted': return 'default'; // Blueish
            case 'fulfilled': return 'outline'; // Greenish usually better, lets use custom classes if needed
            case 'cancelled': return 'destructive';
            default: return 'secondary';
        }
    };

    const getPaymentColor = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200';
            case 'partial': return 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200';
            case 'unpaid': return 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200';
            default: return 'secondary';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
                    <p className="text-muted-foreground">Manage customer orders and commissions.</p>
                </div>
                <Button onClick={() => navigate('/sales/new')}>
                    <Plus className="mr-2 h-4 w-4" /> New Order
                </Button>
            </div>

            <div className="flex items-center gap-4">
                <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Card>
                <CardHeader className="p-0">
                    {/* Optional Header Content */}
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Order ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Customer</TableHead>
                                {!isRep && <TableHead>Rep</TableHead>}
                                <TableHead>Status</TableHead>
                                <TableHead>Payment</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                {isRep && <TableHead className="text-right">Commission</TableHead>}
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders && orders.length > 0 ? (
                                orders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-mono text-xs">
                                            {order.id.slice(0, 8)}...
                                        </TableCell>
                                        <TableCell>
                                            {format(new Date(order.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{order.contacts?.name}</span>
                                                <span className="text-xs text-muted-foreground">{order.contacts?.email}</span>
                                            </div>
                                        </TableCell>
                                        {!isRep && (
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{order.profiles?.full_name || 'Unknown'}</span>
                                                </div>
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <Badge variant={getStatusColor(order.status) as any}>
                                                {order.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={getPaymentColor(order.payment_status)}>
                                                {order.payment_status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            ${order.total_amount.toFixed(2)}
                                        </TableCell>
                                        {isRep && (
                                            <TableCell className="text-right text-green-600 font-medium">
                                                ${order.commission_amount?.toFixed(2) || '0.00'}
                                            </TableCell>
                                        )}
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link to={`/sales/${order.id}`}>
                                                    <Eye className="h-4 w-4 mr-1" /> View
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={isRep ? 8 : 9} className="h-24 text-center text-muted-foreground">
                                        No orders found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
