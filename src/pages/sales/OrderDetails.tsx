import { useParams, useNavigate } from 'react-router-dom';
import { useSalesOrders, useUpdateSalesOrder, useFulfillOrder, type SalesOrder } from '@/hooks/use-sales-orders';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, Truck, XCircle, CreditCard, DollarSign } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from '@/hooks/use-toast';

export default function OrderDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: salesOrders, isLoading } = useSalesOrders();
    // Optimization: In real app use specific hook useSalesOrder(id), but filtering list for now is okay for prototype

    const updateOrder = useUpdateSalesOrder();
    const fulfillOrder = useFulfillOrder();
    const { toast } = useToast();

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
                <Button variant="ghost" onClick={() => navigate('/sales')}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Orders
                </Button>
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
                                        <DropdownMenuItem onClick={() => handleStatusChange('cancelled')} className="text-destructive">Cancelled</DropdownMenuItem>
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
                </div>
            </div>
        </div>
    );
}
