import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSalesOrders, useUpdateSalesOrder, useFulfillOrder, usePayWithCredit, useCreateShippingLabel, useGetShippingRates, useBuyShippingLabel, type SalesOrder, type ShippingRate } from '@/hooks/use-sales-orders';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, Truck, XCircle, CreditCard, DollarSign, Copy, FileDown, TrendingUp, Banknote, Printer, Package, CircleDot, MapPin, Wand2, Pencil, Save, X, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/sb_client/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
    const getRates = useGetShippingRates();
    const buyLabel = useBuyShippingLabel();
    const { toast } = useToast();
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [showPaymentDialog, setShowPaymentDialog] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('processor');
    const [editing, setEditing] = useState(false);
    const [editItems, setEditItems] = useState<{ id: string; name: string; quantity: number; unit_price: number }[]>([]);
    const [editNotes, setEditNotes] = useState('');
    const [editShippingAddress, setEditShippingAddress] = useState('');
    const [saving, setSaving] = useState(false);
    const [showRatesDialog, setShowRatesDialog] = useState(false);
    const [availableRates, setAvailableRates] = useState<ShippingRate[]>([]);
    const [ratesShipmentId, setRatesShipmentId] = useState<string>('');

    const order = salesOrders?.find(o => o.id === id);

    if (isLoading) return (
        <div className="space-y-6 p-4">
            <Skeleton className="h-8 w-48" />
            <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
            <Skeleton className="h-60 w-full" />
        </div>
    );
    if (!order) return <div className="p-8 text-center">Order not found</div>;

    const handleStatusChange = (status: SalesOrder['status']) => {
        updateOrder.mutate({ id: order.id, status });
    };

    const handlePaymentStatusChange = (status: SalesOrder['payment_status'], paymentMethod?: string) => {
        updateOrder.mutate({
            id: order.id,
            payment_status: status,
            // If paid, set amount_paid to total if currently 0
            amount_paid: status === 'paid' && order.amount_paid === 0 ? order.total_amount : order.amount_paid,
            ...(paymentMethod ? { payment_method: paymentMethod } : {}),
        });
    };

    const handleMarkAsPaid = () => {
        const method = selectedPaymentMethod === 'processor' ? null : selectedPaymentMethod;
        handlePaymentStatusChange('paid', method || undefined);
        setShowPaymentDialog(false);
        setSelectedPaymentMethod('processor');
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
        if (order.payment_status !== 'paid' && order.payment_status !== 'commission_offset') {
            toast({ title: "Warning", description: "This order is not marked as PAID yet.", variant: "destructive" });
            return;
        }
        fulfillOrder.mutate(order.id);
    };

    const printPackingSlip = () => {
        const items = order.sales_order_items?.map(item =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.peptides?.name || 'Unknown'}</td>` +
            `<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>` +
            `<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${(item.quantity * item.unit_price).toFixed(2)}</td></tr>`
        ).join('') || '';

        const html = `<!DOCTYPE html><html><head><title>Packing Slip - ${order.id.slice(0, 8)}</title>
            <style>body{font-family:system-ui,sans-serif;margin:40px;color:#333}
            h1{font-size:24px;margin-bottom:4px} table{width:100%;border-collapse:collapse;margin:20px 0}
            th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:14px}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
            .label{color:#666;font-size:12px;margin-bottom:2px} .value{font-size:14px}
            @media print{body{margin:20px}}</style></head><body>
            <h1>Packing Slip</h1>
            <p style="color:#666">Order #${order.id.slice(0, 8)} — ${format(new Date(order.created_at), 'MMMM d, yyyy')}</p>
            <div class="grid">
                <div><div class="label">Ship To</div><div class="value"><strong>${order.contacts?.name || 'N/A'}</strong><br>${order.shipping_address || order.contacts?.email || ''}</div></div>
                <div><div class="label">Order Total</div><div class="value" style="font-size:20px;font-weight:bold">$${order.total_amount.toFixed(2)}</div></div>
            </div>
            <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody>${items}</tbody>
            <tfoot><tr><td colspan="2" style="padding:8px;font-weight:bold">Total</td>
            <td style="padding:8px;text-align:right;font-weight:bold">$${order.total_amount.toFixed(2)}</td></tr></tfoot></table>
            ${order.notes ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:4px"><strong>Notes:</strong> ${order.notes}</div>` : ''}
            <div style="margin-top:40px;padding-top:20px;border-top:1px solid #eee;color:#999;font-size:11px">Printed ${format(new Date(), 'MMM d, yyyy h:mm a')}</div>
            </body></html>`;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        }
    };

    const startEditing = () => {
        setEditItems(
            (order.sales_order_items || []).map(item => ({
                id: item.id,
                name: item.peptides?.name || 'Unknown',
                quantity: item.quantity,
                unit_price: item.unit_price,
            }))
        );
        setEditNotes(order.notes || '');
        setEditShippingAddress(order.shipping_address || '');
        setEditing(true);
    };

    const saveEdits = async () => {
        setSaving(true);
        try {
            // Update each item's quantity
            for (const item of editItems) {
                const { error } = await supabase
                    .from('sales_order_items')
                    .update({ quantity: item.quantity, unit_price: item.unit_price })
                    .eq('id', item.id);
                if (error) throw error;
            }

            // Delete removed items
            const currentIds = editItems.map(i => i.id);
            const originalIds = (order.sales_order_items || []).map(i => i.id);
            const removedIds = originalIds.filter(id => !currentIds.includes(id));
            for (const rid of removedIds) {
                await supabase.from('sales_order_items').delete().eq('id', rid);
            }

            // Recalculate total
            const newTotal = editItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

            // Update order-level fields
            updateOrder.mutate({
                id: order.id,
                total_amount: newTotal,
                notes: editNotes || null,
                shipping_address: editShippingAddress || null,
            });

            setEditing(false);
            toast({ title: 'Order updated successfully' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Failed to save', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <div className="flex items-center gap-2 mb-4">
                <nav className="flex items-center text-sm text-muted-foreground">
                    <Link to="/sales" className="hover:text-foreground transition-colors">Sales Orders</Link>
                    <span className="mx-2">/</span>
                    <span className="text-foreground font-semibold">Order #{order.id.slice(0, 8)}</span>
                </nav>
            </div>

            {/* ===== EDIT ORDER BUTTON — BIG AND OBVIOUS ===== */}
            {!editing ? (
                <Button
                    className="w-full h-14 text-lg font-semibold bg-blue-600 hover:bg-blue-700"
                    size="lg"
                    onClick={startEditing}
                >
                    <Pencil className="h-5 w-5 mr-2" />
                    Edit This Order
                </Button>
            ) : (
                <div className="flex gap-3">
                    <Button
                        className="flex-1 h-14 text-lg font-semibold bg-green-600 hover:bg-green-700"
                        size="lg"
                        disabled={saving}
                        onClick={saveEdits}
                    >
                        <Save className="h-5 w-5 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button
                        variant="outline"
                        className="h-14 text-lg px-6"
                        size="lg"
                        onClick={() => setEditing(false)}
                    >
                        <X className="h-5 w-5 mr-2" />
                        Cancel
                    </Button>
                </div>
            )}

            {/* Order Progress Timeline */}
            {order.status !== 'cancelled' && (
                <Card className="overflow-hidden">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            {(order.delivery_method === 'local_pickup' ? [
                                { label: 'Created', done: true, icon: CircleDot },
                                { label: order.payment_status === 'commission_offset' ? 'Offset' : 'Paid', done: order.payment_status === 'paid' || order.payment_status === 'commission_offset', icon: CreditCard },
                                { label: 'Fulfilled', done: order.status === 'fulfilled', icon: Package },
                                { label: 'Picked Up', done: order.shipping_status === 'delivered', icon: MapPin },
                            ] : [
                                { label: 'Created', done: true, icon: CircleDot },
                                { label: order.payment_status === 'commission_offset' ? 'Offset' : 'Paid', done: order.payment_status === 'paid' || order.payment_status === 'commission_offset', icon: CreditCard },
                                { label: 'Fulfilled', done: order.status === 'fulfilled', icon: Package },
                                { label: 'Label', done: !!order.tracking_number, icon: Truck },
                                { label: 'Printed', done: ['printed','in_transit','delivered'].includes(order.shipping_status), icon: Printer },
                                { label: 'Delivered', done: order.shipping_status === 'delivered', icon: CheckCircle },
                            ]).map((step, i, arr) => (
                                <div key={step.label} className="flex items-center flex-1 last:flex-none">
                                    <div className="flex flex-col items-center gap-1">
                                        <div className={`flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors ${
                                            step.done
                                                ? 'bg-green-500 border-green-500 text-white'
                                                : 'border-muted-foreground/30 text-muted-foreground/50'
                                        }`}>
                                            <step.icon className="h-4 w-4" />
                                        </div>
                                        <span className={`text-xs font-semibold ${step.done ? 'text-green-600' : 'text-muted-foreground'}`}>
                                            {step.label}
                                        </span>
                                    </div>
                                    {i < arr.length - 1 && (
                                        <div className={`flex-1 h-0.5 mx-2 mt-[-14px] ${step.done ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

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
                                {order.delivery_method === 'local_pickup' ? (
                                    <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30 py-1 px-3">
                                        <MapPin className="h-3 w-3 mr-1" /> Local Pickup
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30 py-1 px-3">
                                        <Truck className="h-3 w-3 mr-1" /> Ship
                                    </Badge>
                                )}
                                {order.order_source === 'woocommerce' && (
                                    <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30 py-1 px-3">
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
                                {order.payment_method && (
                                    <div>
                                        <h3 className="font-semibold text-muted-foreground">Payment Method</h3>
                                        <p className="text-lg capitalize">{order.payment_method}</p>
                                    </div>
                                )}
                            </div>

                            <Separator />

                            <div>
                                <h3 className="font-semibold mb-3">Order Items</h3>
                                {editing ? (
                                    <div className="space-y-3">
                                        {editItems.map((item, idx) => (
                                            <div key={item.id} className="flex items-center gap-3 bg-card/50 p-3 rounded-lg border border-border/40">
                                                <div className="flex-1">
                                                    <span className="font-medium">{item.name}</span>
                                                    <div className="text-xs text-muted-foreground">${item.unit_price.toFixed(2)} each</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => {
                                                            if (item.quantity > 1) {
                                                                const updated = [...editItems];
                                                                updated[idx] = { ...item, quantity: item.quantity - 1 };
                                                                setEditItems(updated);
                                                            }
                                                        }}
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        className="w-16 text-center h-8"
                                                        value={item.quantity}
                                                        onChange={(e) => {
                                                            const updated = [...editItems];
                                                            updated[idx] = { ...item, quantity: Math.max(1, parseInt(e.target.value) || 1) };
                                                            setEditItems(updated);
                                                        }}
                                                    />
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => {
                                                            const updated = [...editItems];
                                                            updated[idx] = { ...item, quantity: item.quantity + 1 };
                                                            setEditItems(updated);
                                                        }}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <span className="font-bold w-20 text-right">
                                                    ${(item.quantity * item.unit_price).toFixed(2)}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => setEditItems(editItems.filter((_, i) => i !== idx))}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                        <div className="flex justify-between items-center text-lg font-bold pt-3 border-t">
                                            <span>New Total</span>
                                            <span>${editItems.reduce((s, i) => s + i.quantity * i.unit_price, 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ) : (
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
                                )}
                            </div>

                            {!editing && (
                                <div className="flex justify-between items-center text-lg font-bold pt-4 border-t">
                                    <span>Total Amount</span>
                                    <span>${order.total_amount.toFixed(2)}</span>
                                </div>
                            )}

                            {/* Notes Section */}
                            {editing ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-semibold mb-1 block">Notes</label>
                                        <Textarea
                                            value={editNotes}
                                            onChange={(e) => setEditNotes(e.target.value)}
                                            placeholder="Order notes..."
                                            rows={3}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold mb-1 block">Shipping Address</label>
                                        <Textarea
                                            value={editShippingAddress}
                                            onChange={(e) => setEditShippingAddress(e.target.value)}
                                            placeholder="Shipping address..."
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            ) : order.notes ? (
                                <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/20">
                                    <h4 className="font-semibold text-amber-400 text-sm mb-1">Notes</h4>
                                    <p className="text-sm text-amber-400/90">{order.notes}</p>
                                </div>
                            ) : null}
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
                                <label className="text-sm font-semibold mb-1 block">Payment Status</label>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between">
                                            <span className="capitalize">{order.payment_status === 'commission_offset' ? 'Product Offset' : order.payment_status}</span>
                                            <CreditCard className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('unpaid')}>Unpaid</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setShowPaymentDialog(true)}>Paid (Full)</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('partial')}>Partial</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handlePaymentStatusChange('refunded')}>Refunded</DropdownMenuItem>
                                        {(profile?.credit_balance || 0) > 0 && (
                                            <>
                                                <div className="h-px bg-muted my-1" />
                                                <DropdownMenuItem onClick={handlePayWithCredit} disabled={payWithCredit.isPending} className="text-green-600 font-medium">
                                                    {payWithCredit.isPending ? 'Processing...' : `Pay with Credit ($${(profile?.credit_balance || 0).toFixed(2)})`}
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Order Status */}
                            <div>
                                <label className="text-sm font-semibold mb-1 block">Order Status</label>
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
                                disabled={order.status === 'fulfilled' || fulfillOrder.isPending || updateOrder.isPending}
                                onClick={attemptFulfill}
                            >
                                {fulfillOrder.isPending ? (
                                    <>Fulfilling... <Truck className="ml-2 h-4 w-4 animate-pulse" /></>
                                ) : order.status === 'fulfilled' ? (
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

                            <Button variant="outline" className="w-full" onClick={printPackingSlip}>
                                <Printer className="mr-2 h-4 w-4" /> Print Packing Slip
                            </Button>

                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => navigate(`/protocol-builder?order=${order.id}&contact=${order.client_id}`)}
                            >
                                <Wand2 className="mr-2 h-4 w-4" /> Generate Protocol
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Shipping Status Card — hidden for local pickup */}
                    {order.delivery_method !== 'local_pickup' && <Card>
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
                                    order.shipping_status === 'printed' ? 'bg-indigo-900/20 text-indigo-400 border-indigo-500/40' :
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
                                        <code className="text-sm font-mono bg-muted/50 px-3 py-1.5 rounded-lg flex-1 truncate">
                                            {order.tracking_number}
                                        </code>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                                            aria-label="Copy tracking number"
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

                            {/* Print label - sends to local print service or opens in new tab */}
                            {order.label_url && !['delivered'].includes(order.shipping_status) && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                                    onClick={async () => {
                                        const labelUrl = order.label_url!;
                                        // Try local print service (HTTPS then HTTP)
                                        for (const base of ['https://localhost:9111', 'http://localhost:9112']) {
                                            try {
                                                const r = await fetch(`${base}/print`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ url: labelUrl }),
                                                });
                                                if (r.ok) {
                                                    toast({ title: 'Sent to label printer' });
                                                    return;
                                                }
                                            } catch { /* service not available */ }
                                        }
                                        // Fallback: open in new tab
                                        window.open(labelUrl, '_blank');
                                        toast({ title: 'Label opened in new tab', description: 'Print service not detected — use Ctrl+P.' });
                                    }}
                                >
                                    <Printer className="mr-2 h-4 w-4" /> Print Shipping Label
                                </Button>
                            )}

                            {/* Confirm Printed - updates shipping_status to 'printed' */}
                            {order.shipping_status === 'label_created' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-indigo-500/40 text-indigo-400"
                                    disabled={updateOrder.isPending}
                                    onClick={() => {
                                        updateOrder.mutate(
                                            { id: order.id, shipping_status: 'printed' },
                                            { onSuccess: () => toast({ title: 'Label marked as printed' }) }
                                        );
                                    }}
                                >
                                    <CheckCircle className="mr-2 h-4 w-4" /> Confirm Label Printed
                                </Button>
                            )}

                            {/* Mark as Shipped - for when package is dropped off */}
                            {order.shipping_status === 'printed' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-amber-500/40 text-amber-400"
                                    disabled={updateOrder.isPending}
                                    onClick={() => {
                                        updateOrder.mutate(
                                            { id: order.id, shipping_status: 'in_transit' },
                                            { onSuccess: () => toast({ title: 'Marked as shipped!' }) }
                                        );
                                    }}
                                >
                                    <Truck className="mr-2 h-4 w-4" /> Mark as Shipped
                                </Button>
                            )}

                            {/* Mark as Delivered */}
                            {order.shipping_status === 'in_transit' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-emerald-500/40 text-emerald-400"
                                    disabled={updateOrder.isPending}
                                    onClick={() => {
                                        updateOrder.mutate(
                                            { id: order.id, shipping_status: 'delivered' },
                                            { onSuccess: () => toast({ title: 'Order delivered!' }) }
                                        );
                                    }}
                                >
                                    <CheckCircle className="mr-2 h-4 w-4" /> Mark as Delivered
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
                                <div className="space-y-2">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        className="w-full"
                                        disabled={getRates.isPending}
                                        onClick={() => {
                                            getRates.mutate(order.id, {
                                                onSuccess: (data) => {
                                                    setAvailableRates(data.rates);
                                                    setRatesShipmentId(data.shipment_id);
                                                    setShowRatesDialog(true);
                                                },
                                            });
                                        }}
                                    >
                                        {getRates.isPending ? 'Getting Rates...' : 'Choose Carrier & Ship'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full text-xs text-muted-foreground"
                                        disabled={shipLabel.isPending}
                                        onClick={() => shipLabel.mutate(order.id)}
                                    >
                                        {shipLabel.isPending ? 'Creating...' : 'Quick Ship (USPS Priority)'}
                                    </Button>
                                </div>
                            )}

                            {order.shipping_status === 'error' && (
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full border-amber-500/40 text-amber-400"
                                        disabled={getRates.isPending}
                                        onClick={() => {
                                            getRates.mutate(order.id, {
                                                onSuccess: (data) => {
                                                    setAvailableRates(data.rates);
                                                    setRatesShipmentId(data.shipment_id);
                                                    setShowRatesDialog(true);
                                                },
                                            });
                                        }}
                                    >
                                        {getRates.isPending ? 'Getting Rates...' : 'Retry — Choose Carrier'}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>}

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
                                <span>Merchant Fee{order.merchant_fee > 0 && order.total_amount > 0 ? ` (${(order.merchant_fee / order.total_amount * 100).toFixed(0)}%)` : ''}</span>
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

            {/* Payment Method Dialog */}
            <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Mark as Paid</DialogTitle>
                        <DialogDescription>
                            Select how this ${order.total_amount.toFixed(2)} payment was received.
                            A 5% merchant fee applies for processor payments.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {/* Payment methods:
                            'card'/'processor' -> 5% merchant fee
                            'zelle', 'cashapp', 'venmo', 'wire', 'cash' -> NO merchant fee
                            'credit' -> store credit, no fee */}
                        <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                            <SelectTrigger>
                                <SelectValue placeholder="Payment method" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="processor">Payment Processor (5% fee)</SelectItem>
                                <SelectItem value="zelle">Zelle (no fee)</SelectItem>
                                <SelectItem value="cashapp">Cash App (no fee)</SelectItem>
                                <SelectItem value="venmo">Venmo (no fee)</SelectItem>
                                <SelectItem value="cash">Cash (no fee)</SelectItem>
                                <SelectItem value="wire">Wire Transfer (no fee)</SelectItem>
                                <SelectItem value="credit">Store Credit (no fee)</SelectItem>
                            </SelectContent>
                        </Select>
                        {selectedPaymentMethod === 'processor' && (
                            <p className="text-xs text-amber-500 flex items-center gap-1">
                                <Banknote className="h-3 w-3" />
                                Merchant fee: ${(order.total_amount * 0.05).toFixed(2)}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
                        <Button onClick={handleMarkAsPaid} className="bg-green-600 hover:bg-green-700">
                            Confirm Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
