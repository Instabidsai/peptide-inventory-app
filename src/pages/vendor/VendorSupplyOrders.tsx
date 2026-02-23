import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from './vendor-shared';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Package,
    Search,
    ShoppingCart,
    DollarSign,
    Truck,
    Clock,
    Download,
} from 'lucide-react';
import { format } from 'date-fns';

interface SupplierOrder {
    order_id: string;
    merchant_org_id: string;
    merchant_name: string;
    order_date: string;
    status: string;
    payment_status: string;
    total_amount: number;
    item_count: number;
}

interface OrderLineItem {
    id: string;
    peptide_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

function useSupplierOrders() {
    const { profile } = useAuth();

    return useQuery({
        queryKey: ['supplier-orders', profile?.org_id],
        enabled: !!profile?.org_id,
        queryFn: async (): Promise<SupplierOrder[]> => {
            const { data, error } = await supabase.rpc('get_supplier_orders', {
                p_supplier_org_id: profile!.org_id,
            });
            if (error) throw error;
            return data || [];
        },
        staleTime: 30_000,
    });
}

function useOrderLineItems(orderId: string | null) {
    return useQuery({
        queryKey: ['supplier-order-items', orderId],
        enabled: !!orderId,
        queryFn: async (): Promise<OrderLineItem[]> => {
            const { data, error } = await supabase
                .from('sales_order_items')
                .select(`
                    id,
                    quantity,
                    unit_price,
                    total_price,
                    peptides(name)
                `)
                .eq('sales_order_id', orderId!);

            if (error) throw error;
            return (data || []).map((item: any) => ({
                id: item.id,
                peptide_name: item.peptides?.name || 'Unknown',
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price,
            }));
        },
    });
}

function OrderStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'submitted':
            return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30">Submitted</Badge>;
        case 'fulfilled':
            return <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Fulfilled</Badge>;
        case 'cancelled':
            return <Badge variant="destructive">Cancelled</Badge>;
        case 'draft':
            return <Badge variant="secondary">Draft</Badge>;
        default:
            return <Badge variant="outline">{status}</Badge>;
    }
}

function PaymentBadge({ status }: { status: string }) {
    switch (status) {
        case 'paid':
            return <Badge className="bg-green-500/15 text-green-500 border-green-500/30">Paid</Badge>;
        case 'unpaid':
            return <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Unpaid</Badge>;
        case 'partial':
            return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Partial</Badge>;
        default:
            return <Badge variant="outline">{status}</Badge>;
    }
}

function OrderDetailDialog({ orderId, merchantName, onClose }: { orderId: string; merchantName: string; onClose: () => void }) {
    const { data: items, isLoading } = useOrderLineItems(orderId);

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Order from {merchantName}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                ) : !items?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No line items found.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Unit Price</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map(item => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium">{item.peptide_name}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">${item.unit_price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">${item.total_price.toFixed(2)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={2} className="font-semibold">Total</TableCell>
                                <TableCell />
                                <TableCell className="text-right font-bold">
                                    ${items.reduce((s, i) => s + i.total_price, 0).toFixed(2)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default function VendorSupplyOrders() {
    const { data: orders, isLoading } = useSupplierOrders();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterPayment, setFilterPayment] = useState<string>('all');
    const [selectedOrder, setSelectedOrder] = useState<{ id: string; merchant: string } | null>(null);

    const filtered = orders
        ?.filter(o => filterStatus === 'all' || o.status === filterStatus)
        ?.filter(o => filterPayment === 'all' || o.payment_status === filterPayment)
        ?.filter(o => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return o.merchant_name.toLowerCase().includes(q) || o.order_id.toLowerCase().includes(q);
        });

    // Summary stats
    const totalOrders = filtered?.length || 0;
    const totalRevenue = filtered?.reduce((s, o) => s + o.total_amount, 0) || 0;
    const totalUnits = filtered?.reduce((s, o) => s + o.item_count, 0) || 0;
    const pendingCount = filtered?.filter(o => o.status === 'submitted').length || 0;

    const exportCSV = () => {
        if (!filtered?.length) return;
        const headers = ['Order ID', 'Merchant', 'Date', 'Status', 'Payment', 'Items', 'Total'];
        const rows = filtered.map(o => [
            o.order_id.slice(0, 8),
            `"${o.merchant_name}"`,
            format(new Date(o.order_date), 'yyyy-MM-dd'),
            o.status,
            o.payment_status,
            String(o.item_count),
            o.total_amount.toFixed(2),
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `supply-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Supply Orders</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Wholesale orders from your merchant network.
                    </p>
                </div>
                {filtered && filtered.length > 0 && (
                    <Button variant="outline" onClick={exportCSV}>
                        <Download className="h-4 w-4 mr-2" /> Export CSV
                    </Button>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Orders" value={totalOrders} icon={ShoppingCart} />
                <StatCard label="Revenue" value={`$${totalRevenue.toFixed(0)}`} icon={DollarSign} />
                <StatCard label="Units Ordered" value={totalUnits} icon={Package} />
                <StatCard label="Pending Fulfillment" value={pendingCount} icon={Clock} />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-[300px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search merchant or order ID..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterPayment} onValueChange={setFilterPayment}>
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
            </div>

            {/* Orders Table */}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="space-y-3 p-4">
                            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                        </div>
                    ) : !filtered?.length ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium text-lg">No supply orders yet</p>
                            <p className="text-sm mt-1">
                                {searchQuery || filterStatus !== 'all' || filterPayment !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Orders will appear here when merchants restock from your catalog'}
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Order</TableHead>
                                    <TableHead>Merchant</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Payment</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(order => (
                                    <TableRow
                                        key={order.order_id}
                                        className="cursor-pointer"
                                        onClick={() => setSelectedOrder({ id: order.order_id, merchant: order.merchant_name })}
                                    >
                                        <TableCell className="font-mono text-xs">
                                            {order.order_id.slice(0, 8)}...
                                        </TableCell>
                                        <TableCell className="font-medium">{order.merchant_name}</TableCell>
                                        <TableCell>{format(new Date(order.order_date), 'MMM d, yyyy')}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{order.item_count} items</Badge>
                                        </TableCell>
                                        <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                                        <TableCell><PaymentBadge status={order.payment_status} /></TableCell>
                                        <TableCell className="text-right font-medium">
                                            ${order.total_amount.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-muted/50 font-semibold">
                                    <TableCell colSpan={4} className="text-xs text-muted-foreground">
                                        {filtered.length} order{filtered.length !== 1 ? 's' : ''}
                                    </TableCell>
                                    <TableCell />
                                    <TableCell />
                                    <TableCell className="text-right">
                                        ${totalRevenue.toFixed(2)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Detail Dialog */}
            {selectedOrder && (
                <OrderDetailDialog
                    orderId={selectedOrder.id}
                    merchantName={selectedOrder.merchant}
                    onClose={() => setSelectedOrder(null)}
                />
            )}
        </div>
    );
}
