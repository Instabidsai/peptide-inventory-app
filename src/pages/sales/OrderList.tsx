import { useState } from 'react';
import { useSalesOrders, useMySalesOrders, type SalesOrder, useUpdateSalesOrder, type SalesOrderStatus, useDeleteSalesOrder } from '@/hooks/use-sales-orders';
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
import { Plus, Eye, Trash2, Truck, Download } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
    const [filterSource, setFilterSource] = useState<'all' | 'app' | 'woocommerce'>('all');
    const [filterPayment, setFilterPayment] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');

    // Reps see 'My Orders', Admins see 'All Orders' (by default, can switch)
    const isRep = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

    const { data: allOrders, isLoading: allLoading } = useSalesOrders(filterStatus === 'all' ? undefined : filterStatus);
    const { data: myOrders, isLoading: myLoading } = useMySalesOrders();
    const deleteOrder = useDeleteSalesOrder();
    const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

    const rawOrders = isRep ? myOrders : allOrders;
    const orders = rawOrders
        ?.filter(o => filterSource === 'all' || (o.order_source || 'app') === filterSource)
        ?.filter(o => filterPayment === 'all' || o.payment_status === filterPayment);
    const isLoading = isRep ? myLoading : allLoading;

    if (isLoading) return <div className="p-8 text-center">Loading orders...</div>;

    const exportCSV = () => {
        if (!orders || orders.length === 0) return;
        const headers = ['Date', 'Client', 'Source', 'Status', 'Payment', 'Total', 'COGS', 'Shipping', 'Commission', 'Fee', 'Profit'];
        const rows = orders.map(o => [
            format(new Date(o.created_at), 'yyyy-MM-dd'),
            (o.contacts?.name || '').replace(/,/g, ''),
            o.order_source || 'app',
            o.status,
            o.payment_status,
            (o.total_amount || 0).toFixed(2),
            (o.cogs_amount || 0).toFixed(2),
            (o.shipping_cost || 0).toFixed(2),
            (o.commission_amount || 0).toFixed(2),
            (o.merchant_fee || 0).toFixed(2),
            (o.profit_amount || 0).toFixed(2),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

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

    const getShippingColor = (status: string | null | undefined) => {
        switch (status) {
            case 'label_created': return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'in_transit': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'delivered': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'error': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-600 border-gray-200';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Orders</h1>
                    <p className="text-muted-foreground">Manage customer orders and commissions.</p>
                </div>
                <div className="flex gap-2">
                    {orders && orders.length > 0 && (
                        <Button variant="outline" onClick={exportCSV}>
                            <Download className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    )}
                    <Button onClick={() => navigate('/sales/new')}>
                        <Plus className="mr-2 h-4 w-4" /> New Order
                    </Button>
                </div>
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
                <Select value={filterPayment} onValueChange={(v: any) => setFilterPayment(v)}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="Payment" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Payments</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                </Select>
                {!isRep && (
                    <Select value={filterSource} onValueChange={(v: any) => setFilterSource(v)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Order Source" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Sources</SelectItem>
                            <SelectItem value="app">App Orders</SelectItem>
                            <SelectItem value="woocommerce">WooCommerce</SelectItem>
                        </SelectContent>
                    </Select>
                )}
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
                                <TableHead>Shipping</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                {isRep && <TableHead className="text-right">Commission</TableHead>}
                                {!isRep && <TableHead className="text-right">Profit</TableHead>}
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders && orders.length > 0 ? (
                                orders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell className="font-mono text-xs">
                                            {order.id.slice(0, 8)}...
                                            {order.order_source === 'woocommerce' && (
                                                <Badge variant="outline" className="ml-1 text-[10px] py-0 bg-purple-50 text-purple-700 border-purple-200">WC</Badge>
                                            )}
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
                                        <TableCell>
                                            {order.status === 'fulfilled' || order.tracking_number ? (
                                                <div className="flex flex-col gap-0.5">
                                                    <Badge variant="outline" className={getShippingColor(order.shipping_status)}>
                                                        <Truck className="h-3 w-3 mr-1" />
                                                        {(order.shipping_status || 'pending').replace('_', ' ')}
                                                    </Badge>
                                                    {order.tracking_number && (
                                                        <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[100px]">
                                                            {order.tracking_number.slice(0, 14)}...
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                            ${order.total_amount.toFixed(2)}
                                        </TableCell>
                                        {isRep && (
                                            <TableCell className="text-right text-green-600 font-medium">
                                                ${order.commission_amount?.toFixed(2) || '0.00'}
                                            </TableCell>
                                        )}
                                        {!isRep && (
                                            <TableCell className="text-right font-medium">
                                                <span className={(order.profit_amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                    ${(order.profit_amount || 0).toFixed(2)}
                                                </span>
                                            </TableCell>
                                        )}
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" asChild>
                                                <Link to={`/sales/${order.id}`}>
                                                    <Eye className="h-4 w-4 mr-1" /> View
                                                </Link>
                                            </Button>
                                            {(!isRep || order.status === 'draft') && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => setOrderToDelete(order.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={isRep ? 9 : 11} className="h-32 text-center">
                                        <div className="text-muted-foreground">
                                            <Truck className="mx-auto h-10 w-10 mb-3 opacity-50" />
                                            <p className="text-lg font-medium">No orders found</p>
                                            <p className="text-sm mt-1">
                                                {filterStatus !== 'all' || filterSource !== 'all' || filterPayment !== 'all'
                                                    ? 'Try adjusting your filters'
                                                    : 'Create your first sales order to get started'}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AlertDialog open={!!orderToDelete} onOpenChange={() => setOrderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Sales Order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this order record.
                            <br /><br />
                            <strong className="text-destructive">Note on Inventory:</strong> Deleting this order does <strong>NOT</strong> automatically revert any inventory movements or restock bottles. You must separate manage any refunds or inventory adjustments in the "Movements" tab.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                if (orderToDelete) deleteOrder.mutate(orderToDelete);
                                setOrderToDelete(null);
                            }}
                        >
                            Delete Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
