import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSalesOrders, useUpdateSalesOrder, useFulfillOrder, usePayWithCredit, useCreateShippingLabel, type SalesOrder } from '@/hooks/use-sales-orders';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, Truck, XCircle, CreditCard, DollarSign, Copy, FileDown, TrendingUp } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export default function OrderDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const { data: salesOrders, isLoading } = useSalesOrders();
    // Optimization: In real app use specific hook useSalesOrder(id), but filtering list for now is okay for prototype

    const updateOrder = useUpdateSalesOrder();
    const fulfillOrder = useFulfillOrder();
    const payWithCredit = usePayWithCredit();
    const shipLabel = useCreateShippingLabel();
    const { toast } = useToast();
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    const order = salesOrders?.find(o => o.id === id);

    if (isLoading) return <div className="p-8 text-center">Loading...</div>;
    if (!order) return <div className="p-8 text-center">Order not found</div>;

    const handleStatusChange = (status: SalesOrder['status']) => {
        updateOrder.mutate({ id: order.id, status });
    };

    const handlePaymentStatusChange = (status: SalesOrder['payment_status']) => {
        updateOrder.mutate({
            id: order.id,
            payment_status: status,
            // If paid, set amount_paid to total if currently 0
            amount_paid: status === 'paid' && order.amount_paid === 0 ? order.total_amount : order.amount_paid
        });
    };

    const handlePayWithCredit = () => {
        if (!profile?.credit_balance || profile.credit_balance < order.total_amount) {
            toast({
                title: "Insufficient Credit",
                description: `Balance: $${(profile?.credit_balance || 0).toFixed(2)}. Needed: $${order.total_amount.toFixed(2)}`,
                variant: "destructive"
            });
            return;
        }
        payWithCredit.mutate({ orderId: order.id });
    };

    const attemptFulfill = () => {
        if (order.payment_status !== 'paid') {
            toast({ title: "Warning", description: "This order is not marked as PAID yet.", variant: "destructive" });
            return; // Or allow it with override? Let's block for safety.
        }
        fulfillOrder.mutate(order.id);
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <div className="flex items-center gap-2 mb-4">
                <nav className="flex items-center text-sm text-muted-foreground">
                    <Link to="/sales" className="hover:text-foreground transition-colors">Sales Orders</Link>
                    <span className="mx-2">/</span>
                    <span className="text-foreground font-medium">Order #{order.id.slice(0, 8)}</span>
                </nav>
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-6">
                {/* Main Content */}
                <div className="flex-1 space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-2xl">Order #{order.id.slice(0, 8)}</CardTitle>
                                <div className="text-sm text-muted-foreground mt-1">
                                    Placed on {format(new Date(order.created_at), 'MMMM d, yyyy')}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {order.order_source === 'woocommerce' && (
                                    <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 py-1 px-3">
                                        WooCommerce
                                    </Badge>
                                )}
                                <Badge variant="outline" className="text-lg py-1 px-3">
                                    {order.status.toUpperCase()}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <h3 className="font-semibold text-muted-foreground">Customer</h3>
                                    <p className="text-lg">{order.contacts?.name}</p>
                                    <p>{order.contacts?.email}</p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-muted-foreground">Sales Rep</h3>
                                    <p className="text-lg">{order.profiles?.full_name || 'N/A'}</p>
                                </div>
                            </div>

                            <Separator />

                            <div>
                                <h3 className="font-semibold mb-3">Order Items</h3>
                                <div className="space-y-3">
                                    {order.sales_order_items?.map(item => (
                                        <div key={item.id} className="flex justify-between items-center bg-muted/20 p-3 rounded-lg">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{item.peptides?.name}</span>
                                                <span className="text-xs text-muted-foreground">Qty: {item.quantity} × ${item.unit_price.toFixed(2)}</span>
                                            </div>
                                            <span className="font-bold">
                                                ${(item.quantity * item.unit_price).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-between items-center text-lg font-bold pt-4 border-t">
                                <span>Total Amount</span>
                                <span>${order.total_amount.toFixed(2)}</span>
                            </div>

                            {/* Notes Section */}
                            {order.notes && (
                                <div className="bg-amber-50 p-4 rounded-md border border-amber-100">
                                    <h4 className="font-semibold text-amber-800 text-sm mb-1">Notes</h4>
                                    <p className="text-sm text-amber-700">{order.notes}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar Actions */}
                <div className="w-full md:w-80 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Payment Status */}
                            <div>
                                <label className="text-sm font-medium mb-1 block">Payment Status</label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            <span className="capitalize">{order.payment_status}</span>
                                            <CreditCard className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('unpaid')}>Unpaid</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('paid')}>Paid (Full)</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('partial')}>Partial</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('refunded')}>Refunded</DropdownMenuItem>
                                        {(profile?.credit_balance || 0) > 0 && (
                                            <>
                                                <div className="h-px bg-muted my-1" />
                                                <DropdownMenuItem onClick={handlePayWithCredit} className="text-green-600 font-medium">
                                                    Pay with Credit (${(profile?.credit_balance || 0).toFixed(2)})
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Order Status */}
                            <div>
                                <label className="text-sm font-medium mb-1 block">Order Status</label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            <span className="capitalize">{order.status}</span>
                                            <CheckCircle className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                        <DropdownMenuItem onClick={() => handleStatusChange('draft')}>Draft</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange('submitted')}>Submitted</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setShowCancelConfirm(true)} className="text-destructive">Cancelled</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <Separator />

                            {/* Fulfill Button - The Big One */}
                            <Button
                                className="w-full bg-green-600 hover:bg-green-700"
                                size="lg"
                                disabled={order.status === 'fulfilled'}
                                onClick={attemptFulfill}
                            >
                                {order.status === 'fulfilled' ? (
                                    <>Fulfilled <CheckCircle className="ml-2 h-4 w-4" /></>
                                ) : (
                                    <>Fulfill & Deduct Inventory <Truck className="ml-2 h-4 w-4" /></>
                                )}
                            </Button>
                            {order.status === 'fulfilled' && (
                                <p className="text-xs text-center text-muted-foreground mt-2">
                                    Inventory has been deducted.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Shipping Status Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                                <Truck className="h-4 w-4" /> Shipping
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm">Status</span>
                                <Badge variant="outline" className={
                                    order.shipping_status === 'label_created' ? 'bg-blue-900/20 text-blue-400 border-blue-500/40' :
                                    order.shipping_status === 'in_transit' ? 'bg-amber-900/20 text-amber-400 border-amber-500/40' :
                                    order.shipping_status === 'delivered' ? 'bg-emerald-900/20 text-emerald-400 border-emerald-500/40' :
                                    order.shipping_status === 'error' ? 'bg-red-900/20 text-red-400 border-red-500/40' :
                                    ''
                                }>
                                    {(order.shipping_status || 'pending').replace('_', ' ').toUpperCase()}
                                </Badge>
                            </div>

                            {order.tracking_number && (
                                <div className="space-y-1">
                                    <span className="text-xs text-muted-foreground">Tracking</span>
                                    <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1 truncate">
                                            {order.tracking_number}
                                        </code>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                                            onClick={() => {
                                                navigator.clipboard.writeText(order.tracking_number);
                                                toast({ title: 'Copied tracking number' });
                                            }}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        via {order.carrier || 'Unknown'}
                                        {order.ship_date && ` — ${format(new Date(order.ship_date), 'MMM d')}`}
                                    </span>
                                </div>
                            )}

                            {order.label_url && (
                                <Button variant="outline" size="sm" className="w-full" asChild>
                                    <a href={order.label_url} target="_blank" rel="noopener noreferrer">
                                        <FileDown className="mr-2 h-4 w-4" /> Download Label (PDF)
                                    </a>
                                </Button>
                            )}

                            {order.shipping_cost > 0 && (
                                <div className="text-xs text-muted-foreground">
                                    Label cost: ${Number(order.shipping_cost).toFixed(2)}
                                </div>
                            )}

                            {order.shipping_status === 'error' && (
                                <div className="bg-red-900/20 border border-red-500/40 p-2 rounded text-xs text-red-400">
                                    {order.shipping_error || 'Unknown shipping error'}
                                </div>
                            )}

                            {order.status === 'fulfilled' && !order.tracking_number && order.shipping_status !== 'error' && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="w-full"
                                    disabled={shipLabel.isPending}
                                    onClick={() => shipLabel.mutate(order.id)}
                                >
                                    {shipLabel.isPending ? 'Creating Label...' : 'Create Shipping Label'}
                                </Button>
                            )}

                            {order.shipping_status === 'error' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-amber-500/40 text-amber-400"
                                    disabled={shipLabel.isPending}
                                    onClick={() => shipLabel.mutate(order.id)}
                                >
                                    {shipLabel.isPending ? 'Retrying...' : 'Retry Shipping'}
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-muted-foreground">Commission</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold flex items-center text-green-600">
                                <DollarSign className="h-5 w-5 mr-1" />
                                {order.commission_amount?.toFixed(2) || '0.00'}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Calculated at time of sale.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" /> Profit Breakdown
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Revenue</span>
                                <span className="font-medium">${order.total_amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-red-500">
                                <span>COGS</span>
                                <span>-${(order.cogs_amount || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-red-500">
                                <span>Shipping</span>
                                <span>-${(order.shipping_cost || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-red-500">
                                <span>Commission</span>
                                <span>-${(order.commission_amount || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-red-500">
                                <span>Merchant Fee (5%)</span>
                                <span>-${(order.merchant_fee || 0).toFixed(2)}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-bold text-lg">
                                <span>Net Profit</span>
                                <span className={(order.profit_amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'}>
                                    ${(order.profit_amount || 0).toFixed(2)}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                Margin: {order.total_amount > 0
                                    ? ((order.profit_amount || 0) / order.total_amount * 100).toFixed(1)
                                    : '0.0'}%
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Cancel Order Confirmation */}
            <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will mark the order as cancelled. The ${order.total_amount.toFixed(2)} order
                            {order.contacts?.name ? ` for ${order.contacts.name}` : ''} will no longer be active.
                            This action can be undone by changing the status back.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Order</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleStatusChange('cancelled')}
                        >
                            Cancel Order
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
