import { useState } from 'react';
import { usePageTitle } from '@/hooks/use-page-title';
import { motion } from 'framer-motion';
import { useSalesOrders, useMySalesOrders, type SalesOrder, useUpdateSalesOrder, type SalesOrderStatus, useDeleteSalesOrder } from '@/hooks/use-sales-orders';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, Truck, Download, Search, Printer, Tag, MapPin, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
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
    usePageTitle('Orders');
    const { userRole, profile } = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [filterStatus, setFilterStatus] = useState<SalesOrderStatus | 'all'>('all');
    const [filterSource, setFilterSource] = useState<'all' | 'app' | 'woocommerce'>('all');
    const [filterPayment, setFilterPayment] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
    const [filterShipping, setFilterShipping] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Reps see 'My Orders', Admins see 'All Orders' (by default, can switch)
    const isRep = userRole?.role === 'sales_rep' || profile?.role === 'sales_rep';

    const { data: allOrders, isLoading: allLoading, isError: allError, refetch: allRefetch } = useSalesOrders(filterStatus === 'all' ? undefined : filterStatus);
    const { data: myOrders, isLoading: myLoading, isError: myError, refetch: myRefetch } = useMySalesOrders();
    const deleteOrder = useDeleteSalesOrder();
    const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

    const rawOrders = isRep ? myOrders : allOrders;
    const orders = rawOrders
        ?.filter(o => filterSource === 'all' || (o.order_source || 'app') === filterSource)
        ?.filter(o => filterPayment === 'all' || o.payment_status === filterPayment)
        ?.filter(o => filterShipping === 'all' || (o.shipping_status || 'none') === filterShipping)
        ?.filter(o => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
                o.contacts?.name?.toLowerCase().includes(q) ||
                o.contacts?.email?.toLowerCase().includes(q) ||
                o.id.toLowerCase().includes(q) ||
                o.tracking_number?.toLowerCase().includes(q)
            );
        });
    const isLoading = isRep ? myLoading : allLoading;
    const isError = isRep ? myError : allError;
    const refetch = isRep ? myRefetch : allRefetch;

    if (isLoading) return (
        <div className="space-y-3 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
            ))}
        </div>
    );

    if (isError) return <QueryError message="Failed to load orders." onRetry={refetch} />;

    const exportCSV = () => {
        if (!orders || orders.length === 0) return;
        const esc = (v: string) => {
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                return `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };
        const headers = ['Date', 'Client', 'Source', 'Status', 'Payment', 'ShipStatus', 'Carrier', 'Tracking', 'Total', 'COGS', 'Shipping', 'Commission', 'Fee', 'Profit'];
        const rows = orders.map(o => [
            format(new Date(o.created_at), 'yyyy-MM-dd'),
            esc(o.contacts?.name || ''),
            o.order_source || 'app',
            o.status,
            o.payment_status,
            o.shipping_status || '',
            esc(o.carrier || ''),
            esc(o.tracking_number || ''),
            (o.total_amount || 0).toFixed(2),
            (o.cogs_amount || 0).toFixed(2),
            (o.shipping_cost || 0).toFixed(2),
            (o.commission_amount || 0).toFixed(2),
            (o.merchant_fee || 0).toFixed(2),
            (o.profit_amount || 0).toFixed(2),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getStatusColor = (status: SalesOrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
        switch (status) {
            case 'draft': return 'secondary';
            case 'submitted': return 'default';
            case 'fulfilled': return 'outline';
            case 'cancelled': return 'destructive';
            default: return 'secondary';
        }
    };

    const getPaymentColor = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-green-500/15 text-green-500 hover:bg-green-500/15 border-green-500/30';
            case 'partial': return 'bg-amber-500/15 text-amber-500 hover:bg-amber-500/15 border-amber-500/30';
            case 'unpaid': return 'bg-red-500/15 text-red-500 hover:bg-red-500/15 border-red-500/30';
            case 'commission_offset': return 'bg-violet-500/15 text-violet-500 hover:bg-violet-500/15 border-violet-500/30';
            default: return 'secondary';
        }
    };

    const getPaymentLabel = (status: string) => {
        switch (status) {
            case 'commission_offset': return 'Product Offset';
            default: return status;
        }
    };

    const getShippingColor = (status: string | null | undefined) => {
        switch (status) {
            case 'label_created': return 'bg-blue-500/15 text-blue-500 border-blue-500/30';
            case 'printed': return 'bg-indigo-900/20 text-indigo-400 border-indigo-500/40';
            case 'in_transit': return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
            case 'delivered': return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
            case 'error': return 'bg-red-500/15 text-red-500 border-red-500/30';
            default: return 'bg-muted text-muted-foreground border-border';
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

            <div className="flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        aria-label="Search sales orders"
                        placeholder="Search customer, email, ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as SalesOrderStatus | 'all')}>
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
                <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v as typeof filterPayment)}>
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
                <Select value={filterShipping} onValueChange={setFilterShipping}>
                    <SelectTrigger className="w-[170px]">
                        <SelectValue placeholder="Shipping" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Shipping</SelectItem>
                        <SelectItem value="none">No Label</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="label_created">Label Created</SelectItem>
                        <SelectItem value="printed">Printed</SelectItem>
                        <SelectItem value="in_transit">In Transit</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                </Select>
                {!isRep && (
                    <Select value={filterSource} onValueChange={(v) => setFilterSource(v as typeof filterSource)}>
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

            {/* Mobile Card View */}
            {isMobile && orders && orders.length > 0 && (
                <div className="space-y-3 md:hidden">
                    {orders.map((order, index) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: index * 0.04 }}
                        >
                            <Card
                                className="cursor-pointer hover:bg-accent/30 hover:shadow-card hover:border-border/80 transition-all"
                                onClick={() => navigate(`/sales/${order.id}`)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <p className="font-medium">{order.contacts?.name || 'Unknown'}</p>
                                            <p className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM d, yyyy')}</p>
                                        </div>
                                        <span className="text-lg font-bold">${order.total_amount.toFixed(2)}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={getStatusColor(order.status)} className="text-xs">{order.status}</Badge>
                                        <Badge variant="outline" className={`text-xs ${getPaymentColor(order.payment_status)}`}>{getPaymentLabel(order.payment_status)}</Badge>
                                        {order.delivery_method === 'local_pickup' && (
                                            <Badge variant="outline" className="text-xs bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                <MapPin className="h-2.5 w-2.5 mr-0.5" /> Pickup
                                            </Badge>
                                        )}
                                        {order.order_source === 'woocommerce' && (
                                            <Badge variant="outline" className="text-xs bg-purple-500/15 text-purple-400 border-purple-500/30">WC</Badge>
                                        )}
                                        {!isRep && (
                                            <span className={`ml-auto text-sm font-medium ${(order.profit_amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                P: ${(order.profit_amount || 0).toFixed(2)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 mt-3 pt-3 border-t">
                                        <Button
                                            className="flex-1 h-11 bg-blue-600 hover:bg-blue-700"
                                            onClick={(e) => { e.stopPropagation(); navigate(`/sales/${order.id}`); }}
                                        >
                                            <Pencil className="h-4 w-4 mr-2" />
                                            Edit Order
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Desktop Table View */}
            <Card className={isMobile ? 'hidden' : ''}>
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
                                orders.map((order, index) => (
                                    <motion.tr key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer" role="link" tabIndex={0} aria-label={`View order ${order.id.slice(0, 8)}`} onClick={() => navigate(`/sales/${order.id}`)} onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/sales/${order.id}`); } }}>
                                        <TableCell className="font-mono text-xs">
                                            {order.id.slice(0, 8)}...
                                            {order.order_source === 'woocommerce' && (
                                                <Badge variant="outline" className="ml-1 text-xs py-0 bg-purple-500/15 text-purple-400 border-purple-500/30">WC</Badge>
                                            )}
                                            {order.delivery_method === 'local_pickup' && (
                                                <Badge variant="outline" className="ml-1 text-xs py-0 bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                    <MapPin className="h-2.5 w-2.5" />
                                                </Badge>
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
                                            <Badge variant={getStatusColor(order.status)}>
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
                                                    <div className="flex items-center gap-1">
                                                        <Badge variant="outline" className={getShippingColor(order.shipping_status)}>
                                                            <Truck className="h-3 w-3 mr-1" />
                                                            {(order.shipping_status || 'pending').replace('_', ' ')}
                                                        </Badge>
                                                        {/* Quick action: print label */}
                                                        {order.label_url && order.shipping_status === 'label_created' && (
                                                            <button
                                                                aria-label="Print shipping label"
                                                                className="p-1 rounded hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    window.open(order.label_url, '_blank');
                                                                }}
                                                            >
                                                                <Printer className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {order.tracking_number && (
                                                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[100px]">
                                                            {order.tracking_number.slice(0, 14)}...
                                                        </span>
                                                    )}
                                                </div>
                                            ) : order.status === 'fulfilled' && order.payment_status === 'paid' && !order.tracking_number ? (
                                                <Link
                                                    to={`/sales/${order.id}`}
                                                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                                    aria-label="Create shipping label"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Tag className="h-3 w-3" />
                                                    Create Label
                                                </Link>
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
                                            <Button variant="ghost" size="sm" className="text-blue-400" asChild>
                                                <Link to={`/sales/${order.id}`}>
                                                    <Pencil className="h-4 w-4 mr-1" /> Edit
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
                                    </motion.tr>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={isRep ? 9 : 11} className="h-32 text-center">
                                        <div>
                                            <Truck className="mx-auto h-10 w-10 mb-3 opacity-30" />
                                            <p className="text-lg font-semibold text-muted-foreground">No orders found</p>
                                            <p className="text-sm mt-1 text-muted-foreground/70">
                                                {filterStatus !== 'all' || filterSource !== 'all' || filterPayment !== 'all' || filterShipping !== 'all' || searchQuery
                                                    ? 'Try adjusting your filters or search'
                                                    : 'Create your first sales order to get started'}
                                            </p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        {orders && orders.length > 0 && (() => {
                            const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
                            const totalProfit = orders.reduce((s, o) => s + (o.profit_amount || 0), 0);
                            const totalCommission = orders.reduce((s, o) => s + (o.commission_amount || 0), 0);
                            return (
                                <TableFooter>
                                    <TableRow className="bg-muted/50 font-semibold">
                                        <TableCell colSpan={isRep ? 5 : 6} className="text-xs text-muted-foreground">
                                            {orders.length} order{orders.length !== 1 ? 's' : ''}
                                            {(filterStatus !== 'all' || filterSource !== 'all' || filterPayment !== 'all' || filterShipping !== 'all') && ' (filtered)'}
                                        </TableCell>
                                        <TableCell />
                                        <TableCell className="text-right">
                                            ${totalRevenue.toFixed(2)}
                                        </TableCell>
                                        {isRep && (
                                            <TableCell className="text-right text-green-600">
                                                ${totalCommission.toFixed(2)}
                                            </TableCell>
                                        )}
                                        {!isRep && (
                                            <TableCell className="text-right">
                                                <span className={totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                                                    ${totalProfit.toFixed(2)}
                                                </span>
                                            </TableCell>
                                        )}
                                        <TableCell />
                                    </TableRow>
                                </TableFooter>
                            );
                        })()}
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
                            disabled={deleteOrder.isPending}
                            onClick={() => {
                                if (orderToDelete) deleteOrder.mutate(orderToDelete);
                                setOrderToDelete(null);
                            }}
                        >
                            {deleteOrder.isPending ? 'Deleting...' : 'Delete Order'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
