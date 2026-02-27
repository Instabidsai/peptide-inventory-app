import { useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { useOrders, useCreateOrder, useUpdateOrder, useDeleteOrder, useMarkOrderReceived, useCancelOrder, useRecordOrderPayment, type Order, type OrderStatus } from '@/hooks/use-orders';
import { usePeptides } from '@/hooks/use-peptides';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, SortableTableHead } from '@/components/ui/table';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { QueryError } from '@/components/ui/query-error';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Plus,
    ClipboardList,
    Search,
    Filter,
    MoreHorizontal,
    Pencil,
    Trash2,
    PackageCheck,
    X,
    DollarSign,
    Download,
    Clock,
    CheckCircle2,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/ui/empty-state';
import { AnimatedValue } from '@/components/ui/animated-value';
import { logger } from '@/lib/logger';

const orderSchema = z.object({
    peptide_id: z.string().min(1, 'Peptide is required'),
    quantity_ordered: z.coerce.number().min(1, 'Must order at least 1'),
    estimated_cost_per_unit: z.coerce.number().min(0).optional(),
    order_date: z.string().optional(),
    expected_arrival_date: z.string().optional(),
    supplier: z.string().optional(),
    tracking_number: z.string().optional(),
    notes: z.string().optional(),
});

const receiveSchema = z.object({
    actual_quantity: z.coerce.number().min(1, 'Must receive at least 1'),
    actual_cost_per_unit: z.coerce.number().min(0, 'Cost must be positive'),
    lot_number: z.string().min(1, 'Lot number is required'),
    expiry_date: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;
type ReceiveFormData = z.infer<typeof receiveSchema>;

const statusColors: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'default',
    received: 'secondary',
    cancelled: 'destructive',
};

const statusLabels: Record<OrderStatus, string> = {
    pending: 'Pending',
    received: 'Received',
    cancelled: 'Cancelled',
};

export default function Orders() {
    usePageTitle('Purchase Orders');
    const [searchParams] = useSearchParams();
    const initialStatus = searchParams.get('status') as OrderStatus | null;

    const { userRole } = useAuth();
    const { data: peptides } = usePeptides();

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>(initialStatus || 'all');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [receivingOrder, setReceivingOrder] = useState<Order | null>(null);
    const [orderToDelete, setOrderToDelete] = useState<string | null>(null);

    const { data: orders, isLoading, isError, refetch } = useOrders(statusFilter === 'all' ? undefined : statusFilter);
    const createOrder = useCreateOrder();
    const updateOrder = useUpdateOrder();
    const deleteOrder = useDeleteOrder();
    const markReceived = useMarkOrderReceived();
    const cancelOrder = useCancelOrder();

    const canEdit = userRole?.role === 'admin' || userRole?.role === 'super_admin' || userRole?.role === 'staff';

    const form = useForm<OrderFormData>({
        resolver: zodResolver(orderSchema),
        defaultValues: {
            peptide_id: '',
            quantity_ordered: 1,
            estimated_cost_per_unit: 0,
            order_date: format(new Date(), 'yyyy-MM-dd'),
            expected_arrival_date: '',
            supplier: '',
            tracking_number: '',
            notes: '',
        },
    });

    const editForm = useForm<OrderFormData>({
        resolver: zodResolver(orderSchema),
    });

    const receiveForm = useForm<ReceiveFormData>({
        resolver: zodResolver(receiveSchema),
    });

    const filteredOrders = orders?.filter((o) =>
        o.peptides?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.tracking_number?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const orderSortAccessors = {
        peptide: (o: Order) => o.peptides?.name?.toLowerCase() ?? '',
        qty: (o: Order) => o.quantity_ordered ?? 0,
        cost: (o: Order) => (o.estimated_cost_per_unit ?? 0) * (o.quantity_ordered ?? 0),
        orderDate: (o: Order) => o.order_date ? new Date(o.order_date).getTime() : 0,
        expected: (o: Order) => o.expected_arrival_date ? new Date(o.expected_arrival_date).getTime() : 0,
        supplier: (o: Order) => o.supplier?.toLowerCase() ?? '',
        status: (o: Order) => o.status ?? '',
        payment: (o: Order) => o.payment_status ?? '',
    } as const;

    const { sortedData: sortedOrders, sortState: orderSortState, requestSort: requestOrderSort } = useSortableTable(
        filteredOrders,
        orderSortAccessors,
    );

    const handleCreate = async (data: OrderFormData) => {
        try {
            await createOrder.mutateAsync(data);
            setIsCreateOpen(false);
            form.reset();
        } catch { /* onError in hook shows toast */ }
    };

    const handleOpenEdit = (order: Order) => {
        setEditingOrder(order);
        editForm.reset({
            peptide_id: order.peptide_id,
            quantity_ordered: order.quantity_ordered,
            estimated_cost_per_unit: order.estimated_cost_per_unit || 0,
            order_date: order.order_date?.split('T')[0] || '',
            expected_arrival_date: order.expected_arrival_date?.split('T')[0] || '',
            supplier: order.supplier || '',
            tracking_number: order.tracking_number || '',
            notes: order.notes || '',
        });
    };

    const handleEditSubmit = async (data: OrderFormData) => {
        if (!editingOrder) return;
        try {
            await updateOrder.mutateAsync({ id: editingOrder.id, ...data });
            setEditingOrder(null);
        } catch { /* onError in hook shows toast */ }
    };

    const handleOpenReceive = (order: Order) => {
        setReceivingOrder(order);
        receiveForm.reset({
            actual_quantity: order.quantity_ordered,
            actual_cost_per_unit: order.estimated_cost_per_unit || 0,
            lot_number: '',
            expiry_date: '',
        });
    };

    const handleReceiveSubmit = async (data: ReceiveFormData) => {
        if (!receivingOrder) return;
        try {
            await markReceived.mutateAsync({
                order_id: receivingOrder.id,
                actual_quantity: data.actual_quantity,
                actual_cost_per_unit: data.actual_cost_per_unit,
                lot_number: data.lot_number,
                expiry_date: data.expiry_date,
            });
            setReceivingOrder(null);
        } catch { /* onError in hook shows toast */ }
    };

    const handleDeleteConfirm = async () => {
        if (orderToDelete) {
            try {
                await deleteOrder.mutateAsync(orderToDelete);
                setOrderToDelete(null);
            } catch (error) {
                logger.error("Failed to delete order:", error);
                // Toast is handled by hook onError, but catching prevents React crash
            }
        }
    };

    const activePeptides = peptides?.filter((p) => p.active) || [];

    // Summary stats
    const pendingOrders = filteredOrders?.filter(o => o.status === 'pending') || [];
    const receivedOrders = filteredOrders?.filter(o => o.status === 'received') || [];
    const pendingValue = pendingOrders.reduce((s, o) => s + (o.quantity_ordered * (o.estimated_cost_per_unit || 0)), 0);
    const totalSpent = (filteredOrders || []).reduce((s, o) => s + (o.amount_paid || 0), 0);

    const exportOrdersCSV = () => {
        if (!filteredOrders || filteredOrders.length === 0) return;
        const headers = ['Peptide', 'Quantity', 'Est. Cost/Unit', 'Est. Total', 'Order Date', 'Expected Arrival', 'Supplier', 'Tracking', 'Status', 'Payment', 'Amount Paid'];
        const rows = filteredOrders.map(o => [
            (o.peptides?.name || '').replace(/,/g, ''),
            o.quantity_ordered,
            (o.estimated_cost_per_unit || 0).toFixed(2),
            (o.quantity_ordered * (o.estimated_cost_per_unit || 0)).toFixed(2),
            o.order_date ? format(new Date(o.order_date), 'yyyy-MM-dd') : '',
            o.expected_arrival_date ? format(new Date(o.expected_arrival_date), 'yyyy-MM-dd') : '',
            (o.supplier || '').replace(/,/g, ''),
            o.tracking_number || '',
            o.status,
            o.payment_status || 'unpaid',
            (o.amount_paid || 0).toFixed(2),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `purchase-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const recordPayment = useRecordOrderPayment();
    const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
    const [paymentData, setPaymentData] = useState({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        method: 'credit_card',
        note: ''
    });

    const handleOpenPayment = (order: Order) => {
        setPaymentOrder(order);
        const estimatedTotal = (order.quantity_ordered * (order.estimated_cost_per_unit || 0)).toFixed(2);
        const remaining = (Number(estimatedTotal) - (order.amount_paid || 0)).toFixed(2);

        setPaymentData({
            amount: remaining,
            date: format(new Date(), 'yyyy-MM-dd'),
            method: 'credit_card',
            note: `Payment for ${order.peptides?.name}`
        });
    };

    const handlePaymentSubmit = async () => {
        if (!paymentOrder) return;
        const amount = Number(paymentData.amount);
        if (isNaN(amount) || amount <= 0) {
            toast({ variant: 'destructive', title: 'Invalid amount', description: 'Please enter a valid payment amount.' });
            return;
        }

        // Determine if full payment
        // Heuristic: If amount >= remaining estimated cost
        const estimatedTotal = paymentOrder.quantity_ordered * (paymentOrder.estimated_cost_per_unit || 0);
        const currentPaid = paymentOrder.amount_paid || 0;
        const isFull = (currentPaid + amount) >= (estimatedTotal - 0.01); // Float tolerance

        try {
            await recordPayment.mutateAsync({
                orderId: paymentOrder.id,
                amount,
                method: paymentData.method,
                date: paymentData.date,
                note: paymentData.note,
                isFullPayment: isFull
            });
            setPaymentOrder(null);
        } catch { /* onError in hook shows toast */ }
    };

    return (
        <div className="space-y-6">
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="space-y-2"
            >
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link to="/" className="hover:text-foreground transition-colors">Dashboard</Link>
                <span>/</span>
                <span className="text-foreground font-medium">Orders</span>
            </nav>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                        <ClipboardList className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
                            {filteredOrders && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20">
                                    {filteredOrders.length} total
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground text-sm">Track pending inventory orders</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {filteredOrders && filteredOrders.length > 0 && (
                        <Button variant="outline" onClick={exportOrdersCSV}>
                            <Download className="mr-2 h-4 w-4" /> Export CSV
                        </Button>
                    )}
                {canEdit && (
                    <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) form.reset(); }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                New Order
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Create New Order</DialogTitle>
                                <DialogDescription>
                                    Track a pending inventory order
                                </DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="peptide_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Peptide</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select peptide" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {activePeptides.map((p) => (
                                                            <SelectItem key={p.id} value={p.id}>
                                                                {p.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="quantity_ordered"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Quantity</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" min={1} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="estimated_cost_per_unit"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Est. Cost/Unit ($)</FormLabel>
                                                    <FormControl>
                                                        <Input type="number" step="0.01" min={0} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="order_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Order Date</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="expected_arrival_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Expected Arrival</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="supplier"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Supplier (optional)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Vendor name" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="tracking_number"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Tracking # (optional)</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Tracking number" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="notes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes (optional)</FormLabel>
                                                <FormControl>
                                                    <Textarea placeholder="Additional notes..." {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <Button type="submit" disabled={createOrder.isPending}>
                                            Create Order
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                )}
                </div>
            </div>
            </motion.div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}>
                <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-amber-500/15">
                                <Clock className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Pending Orders</p>
                                <p className="text-2xl font-bold"><AnimatedValue value={pendingOrders.length} /></p>
                                <p className="text-xs text-muted-foreground">${pendingValue.toFixed(2)} est. value</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-green-500/15">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Received</p>
                                <p className="text-2xl font-bold"><AnimatedValue value={receivedOrders.length} /></p>
                                <p className="text-xs text-muted-foreground">of {(filteredOrders || []).length} total orders</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}>
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-blue-500/15">
                                <DollarSign className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Total Paid</p>
                                <p className="text-2xl font-bold">$<AnimatedValue value={totalSpent} decimals={2} /></p>
                                <p className="text-xs text-muted-foreground">across all orders</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                </motion.div>
            </div>

            <Card className="bg-card border-border/60">
                <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                aria-label="Search orders"
                                placeholder="Search by peptide, supplier, or tracking..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | 'all')}>
                            <SelectTrigger className="w-[140px]">
                                <Filter className="mr-2 h-4 w-4" />
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                {Object.entries(statusLabels).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {isError ? (
                        <QueryError message="Failed to load orders." onRetry={() => refetch()} />
                    ) : isLoading ? (
                        <TableSkeleton rows={5} columns={5} />
                    ) : filteredOrders?.length === 0 ? (
                        <EmptyState
                            icon={ClipboardList}
                            title="No orders found"
                            description="Create your first order to start tracking inventory"
                        />
                    ) : (
                        <div className="overflow-x-auto" role="region" aria-label="Orders table" tabIndex={0}>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <SortableTableHead columnKey="peptide" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort} className="sticky left-0 z-20 bg-background">Peptide</SortableTableHead>
                                        <SortableTableHead columnKey="qty" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Qty</SortableTableHead>
                                        <SortableTableHead columnKey="cost" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Est. Cost</SortableTableHead>
                                        <SortableTableHead columnKey="orderDate" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Order Date</SortableTableHead>
                                        <SortableTableHead columnKey="expected" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Expected</SortableTableHead>
                                        <SortableTableHead columnKey="supplier" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Supplier</SortableTableHead>
                                        <SortableTableHead columnKey="status" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Status</SortableTableHead>
                                        <SortableTableHead columnKey="payment" activeColumn={orderSortState.column} direction={orderSortState.direction} onSort={requestOrderSort}>Payment</SortableTableHead>
                                        {canEdit && <TableHead className="w-[70px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedOrders?.map((order, index) => (
                                        <motion.tr
                                            key={order.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.25, delay: index * 0.03, ease: [0.23, 1, 0.32, 1] }}
                                            className="border-b transition-colors hover:bg-muted/50"
                                        >
                                            <TableCell className="font-medium sticky left-0 z-10 bg-background">
                                                {order.peptides?.name || '-'}
                                            </TableCell>
                                            <TableCell>{order.quantity_ordered}</TableCell>
                                            <TableCell>
                                                ${((order.estimated_cost_per_unit || 0) * order.quantity_ordered).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {order.order_date ? format(new Date(order.order_date), 'MMM d, yyyy') : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {order.expected_arrival_date ? (
                                                    <Badge variant="outline">
                                                        {format(new Date(order.expected_arrival_date), 'MMM d')}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {order.supplier || '-'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={statusColors[order.status]}>
                                                    {statusLabels[order.status]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={order.payment_status === 'paid' ? 'default' : 'outline'} className={order.payment_status === 'paid' ? 'bg-green-600 hover:bg-green-700' : order.payment_status === 'commission_offset' ? 'text-violet-500 border-violet-500' : ''}>
                                                    {order.payment_status === 'commission_offset' ? 'PRODUCT OFFSET' : (order.payment_status?.toUpperCase() || 'UNPAID')}
                                                </Badge>
                                            </TableCell>
                                            {canEdit && (
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <span className="sr-only">Open menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            {order.payment_status !== 'paid' && (
                                                                <DropdownMenuItem onClick={() => handleOpenPayment(order)}>
                                                                    <DollarSign className="mr-2 h-4 w-4 text-green-600" />
                                                                    Record Payment
                                                                </DropdownMenuItem>
                                                            )}
                                                            {order.status === 'pending' && (
                                                                <>
                                                                    <DropdownMenuItem onClick={() => handleOpenReceive(order)}>
                                                                        <PackageCheck className="mr-2 h-4 w-4" />
                                                                        Mark Received
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleOpenEdit(order)}>
                                                                        <Pencil className="mr-2 h-4 w-4" />
                                                                        Edit
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => cancelOrder.mutate(order.id)}>
                                                                        <X className="mr-2 h-4 w-4" />
                                                                        Cancel
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                </>
                                                            )}
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive"
                                                                onClick={() => setOrderToDelete(order.id)}
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            )}
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {filteredOrders && filteredOrders.length > 0 && (
                        <div className="mt-4 text-sm text-muted-foreground">
                            Showing {filteredOrders.length} orders
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Payment Dialog */}
            <Dialog open={!!paymentOrder} onOpenChange={(open) => !open && setPaymentOrder(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record Payment</DialogTitle>
                        <DialogDescription>
                            Record a payment for Order of {paymentOrder?.quantity_ordered}x {paymentOrder?.peptides?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="payment-amount" className="text-sm font-medium">Amount ($)</label>
                            <Input
                                id="payment-amount"
                                type="number"
                                value={paymentData.amount}
                                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="payment-date" className="text-sm font-medium">Payment Date</label>
                            <Input
                                id="payment-date"
                                type="date"
                                value={paymentData.date}
                                onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="payment-method" className="text-sm font-medium">Method</label>
                            <Select value={paymentData.method} onValueChange={(v) => setPaymentData({ ...paymentData, method: v })}>
                                <SelectTrigger id="payment-method"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="credit_card">Credit Card</SelectItem>
                                    <SelectItem value="wire">Wire Transfer</SelectItem>
                                    <SelectItem value="cash">Cash / Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="payment-note" className="text-sm font-medium">Note</label>
                            <Input
                                id="payment-note"
                                value={paymentData.note}
                                onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
                                placeholder="Transaction ID, etc."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handlePaymentSubmit}>Record Payment</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Order Dialog */}
            <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Order</DialogTitle>
                        <DialogDescription>Update order details</DialogDescription>
                    </DialogHeader>
                    <Form {...editForm}>
                        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
                            <FormField
                                control={editForm.control}
                                name="quantity_ordered"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Quantity</FormLabel>
                                        <FormControl>
                                            <Input type="number" min={1} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="estimated_cost_per_unit"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Est. Cost/Unit ($)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" min={0} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="expected_arrival_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Expected Arrival</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="supplier"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Supplier</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={editForm.control}
                                name="tracking_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tracking #</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="submit" disabled={updateOrder.isPending}>
                                    Save Changes
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Mark Received Dialog */}
            <Dialog open={!!receivingOrder} onOpenChange={(open) => !open && setReceivingOrder(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Mark Order as Received</DialogTitle>
                        <DialogDescription>
                            Enter the actual received details. This will create a new lot and bottles.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...receiveForm}>
                        <form onSubmit={receiveForm.handleSubmit(handleReceiveSubmit)} className="space-y-4">
                            <FormField
                                control={receiveForm.control}
                                name="lot_number"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Lot Number</FormLabel>
                                        <FormControl>
                                            <Input placeholder="LOT-2026-001" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={receiveForm.control}
                                    name="actual_quantity"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Actual Qty Received</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={1} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={receiveForm.control}
                                    name="actual_cost_per_unit"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Actual Cost/Unit ($)</FormLabel>
                                            <FormControl>
                                                <Input type="number" step="0.01" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <FormField
                                control={receiveForm.control}
                                name="expiry_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Expiry Date (optional)</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button type="submit" disabled={markReceived.isPending}>
                                    <PackageCheck className="mr-2 h-4 w-4" />
                                    Receive Order
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the order record.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
