import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSalesOrders, useUpdateSalesOrder, useFulfillOrder, useCreateShippingLabel, type SalesOrder } from '@/hooks/use-sales-orders';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { format, isAfter, subDays, formatDistanceToNow } from 'date-fns';
import {
    Package, Truck, CheckCircle, Printer,
    MapPin, User, AlertCircle, PackageCheck,
    ClipboardList, ArrowRight, ExternalLink, Copy,
    AlertTriangle, RefreshCw, Pill, Clock, Save, HandMetal
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FulfillmentCenter() {
    const { data: allOrders, isLoading } = useSalesOrders();
    const fulfillOrder = useFulfillOrder();
    const updateOrder = useUpdateSalesOrder();
    const shipLabel = useCreateShippingLabel();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { user, organization } = useAuth();

    // Track which order is being acted on (prevents shared loading state bug)
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [confirmFulfillOrder, setConfirmFulfillOrder] = useState<SalesOrder | null>(null);

    // Hours logging state
    const [hoursInput, setHoursInput] = useState('');
    const [hoursNotes, setHoursNotes] = useState('');
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Fetch today's hours
    const { data: todayHours } = useQuery({
        queryKey: ['daily_hours', todayStr],
        queryFn: async () => {
            const { data } = await supabase
                .from('daily_hours')
                .select('*')
                .eq('user_id', user?.id)
                .eq('work_date', todayStr)
                .maybeSingle();
            return data;
        },
        enabled: !!user,
    });

    // Fetch this week's total
    const weekStart = format(subDays(new Date(), new Date().getDay()), 'yyyy-MM-dd');
    const { data: weekHours } = useQuery({
        queryKey: ['weekly_hours', weekStart],
        queryFn: async () => {
            const { data } = await supabase
                .from('daily_hours')
                .select('hours')
                .eq('user_id', user?.id)
                .gte('work_date', weekStart);
            return (data || []).reduce((sum, r) => sum + Number(r.hours), 0);
        },
        enabled: !!user,
    });

    const saveHours = useMutation({
        mutationFn: async () => {
            const hours = parseFloat(hoursInput);
            if (isNaN(hours) || hours < 0 || hours > 24) throw new Error('Invalid hours');
            const { error } = await supabase
                .from('daily_hours')
                .upsert({
                    user_id: user!.id,
                    org_id: organization?.id,
                    work_date: todayStr,
                    hours,
                    notes: hoursNotes || null,
                }, { onConflict: 'user_id,work_date' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['daily_hours'] });
            queryClient.invalidateQueries({ queryKey: ['weekly_hours'] });
            toast({ title: 'Hours saved' });
        },
        onError: (e: Error) => {
            toast({ variant: 'destructive', title: 'Failed to save hours', description: e.message });
        },
    });

    // Get stock counts per peptide for pick list
    const { data: stockCounts } = useQuery({
        queryKey: ['fulfillment_stock'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('bottles')
                .select('id, lots!inner(peptide_id, peptides!inner(id, name))')
                .eq('status', 'in_stock');
            if (error) throw error;

            const counts: Record<string, { name: string; count: number }> = {};
            for (const b of (data || [])) {
                const pid = (b as any).lots?.peptide_id;
                const pname = (b as any).lots?.peptides?.name;
                if (pid) {
                    if (!counts[pid]) counts[pid] = { name: pname || 'Unknown', count: 0 };
                    counts[pid].count++;
                }
            }
            return counts;
        },
        refetchInterval: 30000,
    });

    // Categorize orders — sevenDaysAgo computed inside useMemo to avoid re-render loop
    const { readyToPick, readyToShip, readyForPickup, recentlyCompleted } = useMemo(() => {
        if (!allOrders) return { readyToPick: [], readyToShip: [], readyForPickup: [], recentlyCompleted: [] };

        const cutoff = subDays(new Date(), 7);
        const pick: SalesOrder[] = [];
        const ship: SalesOrder[] = [];
        const pickup: SalesOrder[] = [];
        const completed: SalesOrder[] = [];

        for (const o of allOrders) {
            if (o.status === 'cancelled') continue;
            const isPickup = o.delivery_method === 'local_pickup';

            // Ready to pick: submitted, not yet fulfilled (any payment status)
            if (o.status === 'submitted') {
                pick.push(o);
            }
            // Fulfilled + local_pickup → ready for pickup
            else if (o.status === 'fulfilled' && isPickup && o.shipping_status !== 'delivered') {
                pickup.push(o);
            }
            // Ready to ship: fulfilled, delivery=ship, not yet shipped (includes error/pending state)
            else if (o.status === 'fulfilled' && !isPickup && (!o.shipping_status || o.shipping_status === 'pending' || o.shipping_status === 'label_created' || o.shipping_status === 'printed' || o.shipping_status === 'error')) {
                ship.push(o);
            }
            // Completed: shipped/delivered OR picked-up in last 7 days
            else if (
                o.status === 'fulfilled' &&
                (o.shipping_status === 'in_transit' || o.shipping_status === 'delivered') &&
                isAfter(new Date(o.updated_at || o.created_at), cutoff)
            ) {
                completed.push(o);
            }
        }

        // Sort pick list oldest first — fulfill in order received
        pick.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        return { readyToPick: pick, readyToShip: ship, readyForPickup: pickup, recentlyCompleted: completed };
    }, [allOrders]);

    // Total bottles to pull across all pick orders
    const totalBottlesToPull = useMemo(() => {
        return readyToPick.reduce((sum, o) =>
            sum + (o.sales_order_items?.reduce((s, i) => s + i.quantity, 0) || 0), 0);
    }, [readyToPick]);

    const handleFulfill = (order: SalesOrder) => {
        // Check if all items have stock before confirming
        const outOfStock = order.sales_order_items?.some(item => {
            const stock = stockCounts?.[item.peptide_id];
            return !stock || stock.count < item.quantity;
        });
        if (outOfStock) {
            toast({ variant: 'destructive', title: 'Insufficient stock', description: 'One or more items don\'t have enough inventory.' });
            return;
        }
        setConfirmFulfillOrder(order);
    };

    const executeFulfill = () => {
        if (!confirmFulfillOrder) return;
        const orderId = confirmFulfillOrder.id;
        setActiveOrderId(orderId);
        fulfillOrder.mutate(orderId, {
            onSettled: () => {
                setActiveOrderId(null);
                setConfirmFulfillOrder(null);
                // Refresh stock counts immediately
                queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            }
        });
    };

    const handleCreateLabel = (orderId: string) => {
        setActiveOrderId(orderId);
        shipLabel.mutate(orderId, {
            onSettled: () => setActiveOrderId(null),
        });
    };

    const handleMarkPrinted = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, shipping_status: 'printed' },
            {
                onSuccess: () => toast({ title: 'Label marked as printed' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const handleMarkShipped = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, shipping_status: 'in_transit' },
            {
                onSuccess: () => toast({ title: 'Marked as shipped!' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const handleMarkDelivered = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, shipping_status: 'delivered' },
            {
                onSuccess: () => toast({ title: 'Order delivered!' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const handleMarkPickedUp = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, shipping_status: 'delivered' },
            {
                onSuccess: () => toast({ title: 'Marked as picked up!' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const printPackingSlip = (order: SalesOrder) => {
        const items = order.sales_order_items?.map(item =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.peptides?.name || 'Unknown'}</td>` +
            `<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td></tr>`
        ).join('') || '';

        const html = `<!DOCTYPE html><html><head><title>Packing Slip - ${order.id.slice(0, 8)}</title>
            <style>body{font-family:system-ui,sans-serif;margin:40px;color:#333}
            h1{font-size:24px;margin-bottom:4px} table{width:100%;border-collapse:collapse;margin:20px 0}
            th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:14px}
            .label{color:#666;font-size:12px;margin-bottom:2px} .value{font-size:14px}
            @media print{body{margin:20px}}</style></head><body>
            <h1>Packing Slip</h1>
            <p style="color:#666">Order #${order.id.slice(0, 8)} &mdash; ${format(new Date(order.created_at), 'MMMM d, yyyy')}</p>
            <div style="margin:20px 0">
                <div class="label">Ship To</div>
                <div class="value"><strong>${order.contacts?.name || 'N/A'}</strong><br>${order.shipping_address || order.contacts?.email || ''}</div>
            </div>
            <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th></tr></thead>
            <tbody>${items}</tbody></table>
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

    const isOrderBusy = (orderId: string) => activeOrderId === orderId;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">Fulfillment Center</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <Card key={i}><CardContent className="p-6"><div className="h-20 animate-pulse bg-muted rounded" /></CardContent></Card>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Fulfillment Center</h1>
                <p className="text-muted-foreground">Pick, pack, and ship orders.</p>
            </div>

            {/* Hours Logging Card */}
            <Card className="border-primary/20">
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10">
                                <Clock className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="font-semibold">{format(new Date(), 'EEEE, MMMM d')}</p>
                                {todayHours ? (
                                    <p className="text-sm text-muted-foreground">Logged: <strong>{todayHours.hours}h</strong> today | Week: <strong>{weekHours || 0}h</strong></p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No hours logged today | Week: <strong>{weekHours || 0}h</strong></p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-1 sm:justify-end w-full sm:w-auto">
                            <Input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                placeholder="Hours"
                                value={hoursInput || (todayHours?.hours?.toString() ?? '')}
                                onChange={e => setHoursInput(e.target.value)}
                                className="w-20"
                            />
                            <Input
                                placeholder="Notes (optional)"
                                value={hoursNotes || (todayHours?.notes ?? '')}
                                onChange={e => setHoursNotes(e.target.value)}
                                className="flex-1 min-w-[120px] max-w-[200px]"
                            />
                            <Button
                                size="sm"
                                disabled={saveHours.isPending}
                                onClick={() => saveHours.mutate()}
                            >
                                <Save className="h-4 w-4 mr-1" />
                                {saveHours.isPending ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-amber-500/10">
                            <ClipboardList className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{readyToPick.length}</p>
                            <p className="text-sm text-muted-foreground">To Pick</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-purple-500/10">
                            <Pill className="h-6 w-6 text-purple-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{totalBottlesToPull}</p>
                            <p className="text-sm text-muted-foreground">Bottles</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-blue-500/10">
                            <Package className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{readyToShip.length}</p>
                            <p className="text-sm text-muted-foreground">To Ship</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-orange-500/10">
                            <HandMetal className="h-6 w-6 text-orange-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{readyForPickup.length}</p>
                            <p className="text-sm text-muted-foreground">Pickup</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{recentlyCompleted.length}</p>
                            <p className="text-sm text-muted-foreground">Done (7d)</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Workflow Tabs */}
            <Tabs defaultValue="pick" className="space-y-4">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="pick" className="gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Pick & Pack
                        {readyToPick.length > 0 && (
                            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white px-1">
                                {readyToPick.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="ship" className="gap-2">
                        <Package className="h-4 w-4" />
                        Label & Ship
                        {readyToShip.length > 0 && (
                            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white px-1">
                                {readyToShip.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="pickup" className="gap-2">
                        <HandMetal className="h-4 w-4" />
                        Ready for Pickup
                        {readyForPickup.length > 0 && (
                            <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white px-1">
                                {readyForPickup.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Completed
                    </TabsTrigger>
                </TabsList>

                {/* ========== TAB 1: PICK & PACK ========== */}
                <TabsContent value="pick" className="space-y-4">
                    {readyToPick.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                                <p className="text-lg font-medium text-muted-foreground">All caught up!</p>
                                <p className="text-sm text-muted-foreground">No orders waiting to be picked.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        readyToPick.map((order, index) => {
                            const orderAge = formatDistanceToNow(new Date(order.created_at), { addSuffix: true });
                            const ageMs = Date.now() - new Date(order.created_at).getTime();
                            const isUrgent = ageMs > 48 * 60 * 60 * 1000; // > 2 days old
                            const busy = isOrderBusy(order.id);

                            return (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card className={isUrgent ? 'border-red-500/40' : 'border-amber-500/30'}>
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-col sm:flex-row justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${isUrgent ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                                                        <ClipboardList className={`h-5 w-5 ${isUrgent ? 'text-red-500' : 'text-amber-500'}`} />
                                                    </div>
                                                    <div>
                                                        <CardTitle className="text-lg">
                                                            Order #{order.id.slice(0, 8)}
                                                        </CardTitle>
                                                        <p className="text-sm text-muted-foreground">
                                                            {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                                                            <span className={`ml-2 ${isUrgent ? 'text-red-400 font-medium' : ''}`}>
                                                                ({orderAge})
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isUrgent && (
                                                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                                                            <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                                        </Badge>
                                                    )}
                                                    <Badge variant="outline" className={
                                                        order.payment_status === 'paid' ? "bg-green-500/15 text-green-500 border-green-500/30" :
                                                        order.payment_status === 'partial' ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                                        "bg-red-500/15 text-red-400 border-red-500/30"
                                                    }>
                                                        {order.payment_status === 'paid' ? 'Paid' : order.payment_status === 'partial' ? 'Partial' : 'Unpaid'}
                                                    </Badge>
                                                    {order.delivery_method === 'local_pickup' ? (
                                                        <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                            <MapPin className="h-3 w-3 mr-1" /> Pickup
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                                                            <Truck className="h-3 w-3 mr-1" /> Ship
                                                        </Badge>
                                                    )}
                                                    {order.order_source === 'woocommerce' && (
                                                        <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30">
                                                            WC
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* Customer + Shipping */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="flex items-start gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="font-medium">{order.contacts?.name || 'Unknown'}</p>
                                                        <p className="text-sm text-muted-foreground">{order.contacts?.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-2">
                                                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                    <p className="text-sm">
                                                        {order.shipping_address || <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No address on file</span>}
                                                    </p>
                                                </div>
                                            </div>

                                            <Separator />

                                            {/* Pick List */}
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                                    <Package className="h-4 w-4" /> Items to Pick
                                                </h4>
                                                <div className="space-y-2">
                                                    {order.sales_order_items?.map(item => {
                                                        const stock = stockCounts?.[item.peptide_id];
                                                        const hasStock = stock && stock.count >= item.quantity;
                                                        return (
                                                            <div key={item.id} className="flex items-center justify-between bg-muted/30 p-3 rounded-lg">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${hasStock ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>
                                                                        {item.quantity}
                                                                    </div>
                                                                    <span className="font-medium">{item.peptides?.name || 'Unknown Peptide'}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className={`text-sm font-medium ${hasStock ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {stock?.count ?? 0} in stock
                                                                    </span>
                                                                    {!hasStock && (
                                                                        <p className="text-xs text-red-400">Insufficient!</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Notes */}
                                            {order.notes && (
                                                <div className="bg-amber-500/10 p-3 rounded-md border border-amber-500/20 text-sm">
                                                    <strong className="text-amber-400">Note:</strong> {order.notes}
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                                <Button
                                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                                    size="lg"
                                                    disabled={busy}
                                                    onClick={() => handleFulfill(order)}
                                                >
                                                    {busy ? 'Fulfilling...' : 'Fulfill Order'}
                                                    <PackageCheck className="ml-2 h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => printPackingSlip(order)}
                                                >
                                                    <Printer className="mr-2 h-4 w-4" /> Packing Slip
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/sales/${order.id}`)}
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })
                    )}
                </TabsContent>

                {/* ========== TAB 2: LABEL & SHIP ========== */}
                <TabsContent value="ship" className="space-y-4">
                    {readyToShip.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Truck className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                                <p className="text-lg font-medium text-muted-foreground">Nothing to ship</p>
                                <p className="text-sm text-muted-foreground">Fulfill orders in the "Pick & Pack" tab first.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        readyToShip.map((order, index) => {
                            const busy = isOrderBusy(order.id);
                            const hasError = order.shipping_status === 'error';

                            return (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card className={hasError ? 'border-red-500/40' : 'border-blue-500/30'}>
                                        <CardHeader className="pb-3">
                                            <div className="flex flex-col sm:flex-row justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${hasError ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
                                                        {hasError ? (
                                                            <AlertTriangle className="h-5 w-5 text-red-500" />
                                                        ) : (
                                                            <Package className="h-5 w-5 text-blue-500" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <CardTitle className="text-lg">
                                                            Order #{order.id.slice(0, 8)}
                                                        </CardTitle>
                                                        <p className="text-sm text-muted-foreground">
                                                            {order.contacts?.name} — {format(new Date(order.created_at), 'MMM d')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasError ? (
                                                        <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                                                            <AlertTriangle className="h-3 w-3 mr-1" /> Label Error
                                                        </Badge>
                                                    ) : (
                                                        <>
                                                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                                                <CheckCircle className="h-3 w-3 mr-1" /> Fulfilled
                                                            </Badge>
                                                            {order.shipping_status && order.shipping_status !== 'error' && (
                                                                <Badge variant="outline" className={
                                                                    order.shipping_status === 'label_created' ? 'bg-blue-900/20 text-blue-400 border-blue-500/40' :
                                                                    order.shipping_status === 'printed' ? 'bg-indigo-900/20 text-indigo-400 border-indigo-500/40' : ''
                                                                }>
                                                                    {order.shipping_status.replace('_', ' ')}
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            {/* Shipping Error */}
                                            {hasError && order.shipping_error && (
                                                <div className="bg-red-900/20 border border-red-500/40 p-3 rounded-md text-sm text-red-400">
                                                    <strong>Error:</strong> {order.shipping_error}
                                                </div>
                                            )}

                                            {/* Shipping Address */}
                                            <div className="flex items-start gap-2">
                                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                <p className="text-sm">
                                                    {order.shipping_address || <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No address — add in order details</span>}
                                                </p>
                                            </div>

                                            {/* Items summary */}
                                            <div className="flex flex-wrap gap-2">
                                                {order.sales_order_items?.map(item => (
                                                    <Badge key={item.id} variant="secondary" className="text-xs">
                                                        {item.quantity}x {item.peptides?.name}
                                                    </Badge>
                                                ))}
                                            </div>

                                            {/* Tracking Info */}
                                            {order.tracking_number && (
                                                <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                                                    <p className="text-xs text-muted-foreground">Tracking Number</p>
                                                    <div className="flex items-center gap-2">
                                                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded flex-1">
                                                            {order.tracking_number}
                                                        </code>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(order.tracking_number!);
                                                                toast({ title: 'Tracking number copied' });
                                                            }}>
                                                            <Copy className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        via {order.carrier || 'Unknown'}
                                                        {order.shipping_cost ? ` — $${Number(order.shipping_cost).toFixed(2)}` : ''}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Shipping Actions - Step by step */}
                                            <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                                {/* Create Label (if no tracking yet) or Retry on error */}
                                                {(!order.tracking_number || hasError) && (
                                                    <Button
                                                        className={`flex-1 ${hasError ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                        size="lg"
                                                        disabled={busy || !order.shipping_address}
                                                        onClick={() => handleCreateLabel(order.id)}
                                                    >
                                                        {busy ? 'Creating...' : hasError ? (
                                                            <><RefreshCw className="mr-2 h-4 w-4" /> Retry Label</>
                                                        ) : (
                                                            <>Create Shipping Label <Truck className="ml-2 h-4 w-4" /></>
                                                        )}
                                                    </Button>
                                                )}

                                                {/* Print Label */}
                                                {order.label_url && !hasError && (
                                                    <Button
                                                        variant="outline"
                                                        className="border-indigo-500/40 text-indigo-400"
                                                        onClick={() => window.open(order.label_url!, '_blank')}
                                                    >
                                                        <Printer className="mr-2 h-4 w-4" /> Print Label
                                                    </Button>
                                                )}

                                                {/* Confirm Printed */}
                                                {order.shipping_status === 'label_created' && (
                                                    <Button
                                                        variant="outline"
                                                        disabled={busy}
                                                        onClick={() => handleMarkPrinted(order.id)}
                                                    >
                                                        <CheckCircle className="mr-2 h-4 w-4" /> Confirm Printed
                                                    </Button>
                                                )}

                                                {/* Mark Shipped — available at any pre-ship stage */}
                                                {(!order.shipping_status || order.shipping_status === 'pending' || order.shipping_status === 'label_created' || order.shipping_status === 'printed') && (
                                                    <Button
                                                        className="flex-1 bg-amber-600 hover:bg-amber-700"
                                                        size="lg"
                                                        disabled={busy}
                                                        onClick={() => handleMarkShipped(order.id)}
                                                    >
                                                        {busy ? 'Updating...' : 'Mark as Shipped'}
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                )}

                                                {/* Skip shipping — mark as already complete */}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="border-green-500/40 text-green-500"
                                                    disabled={busy}
                                                    onClick={() => handleMarkDelivered(order.id)}
                                                >
                                                    <CheckCircle className="mr-1 h-3 w-3" /> Already Done
                                                </Button>

                                                {/* Packing slip */}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => printPackingSlip(order)}
                                                >
                                                    <Printer className="mr-2 h-4 w-4" /> Slip
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/sales/${order.id}`)}
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })
                    )}
                </TabsContent>

                {/* ========== TAB 3: READY FOR PICKUP ========== */}
                <TabsContent value="pickup" className="space-y-4">
                    {readyForPickup.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <HandMetal className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                                <p className="text-lg font-medium text-muted-foreground">No orders waiting for pickup</p>
                                <p className="text-sm text-muted-foreground">Local pickup orders will appear here after fulfillment.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        readyForPickup.map((order, index) => {
                            const busy = isOrderBusy(order.id);
                            return (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card className="border-orange-500/30">
                                        <CardContent className="p-4">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-lg bg-orange-500/10">
                                                        <MapPin className="h-5 w-5 text-orange-500" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{order.contacts?.name}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            Order #{order.id.slice(0, 8)} —{' '}
                                                            {order.sales_order_items?.map(i => `${i.quantity}x ${i.peptides?.name}`).join(', ')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                        <MapPin className="h-3 w-3 mr-1" /> Local Pickup
                                                    </Badge>
                                                    <Button
                                                        className="bg-green-600 hover:bg-green-700"
                                                        size="sm"
                                                        disabled={busy}
                                                        onClick={() => handleMarkPickedUp(order.id)}
                                                    >
                                                        {busy ? 'Updating...' : 'Picked Up'}
                                                        <CheckCircle className="ml-1 h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => navigate(`/sales/${order.id}`)}
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })
                    )}
                </TabsContent>

                {/* ========== TAB 4: COMPLETED ========== */}
                <TabsContent value="completed" className="space-y-4">
                    {recentlyCompleted.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                                <p className="text-lg font-medium text-muted-foreground">No recent completions</p>
                                <p className="text-sm text-muted-foreground">Shipped and picked-up orders from the last 7 days will appear here.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        recentlyCompleted.map((order, index) => {
                            const busy = isOrderBusy(order.id);

                            return (
                                <motion.div
                                    key={order.id}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card className={order.shipping_status === 'delivered' ? 'border-green-500/30 opacity-75' : 'border-emerald-500/30'}>
                                        <CardContent className="p-4">
                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${order.shipping_status === 'delivered' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                                                        {order.shipping_status === 'delivered' ? (
                                                            <CheckCircle className="h-5 w-5 text-green-500" />
                                                        ) : (
                                                            <Truck className="h-5 w-5 text-amber-500" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{order.contacts?.name}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            Order #{order.id.slice(0, 8)} —{' '}
                                                            {order.sales_order_items?.map(i => `${i.quantity}x ${i.peptides?.name}`).join(', ')}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {order.tracking_number && (
                                                        <div className="flex items-center gap-1">
                                                            <code className="text-xs font-mono text-muted-foreground">
                                                                {order.tracking_number.length > 18
                                                                    ? `${order.tracking_number.slice(0, 18)}...`
                                                                    : order.tracking_number}
                                                            </code>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(order.tracking_number!);
                                                                    toast({ title: 'Copied' });
                                                                }}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {order.delivery_method === 'local_pickup' ? (
                                                        <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                            <MapPin className="h-3 w-3 mr-1" /> Picked Up
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className={
                                                            order.shipping_status === 'delivered'
                                                                ? 'bg-green-500/15 text-green-500 border-green-500/30'
                                                                : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                                                        }>
                                                            {order.shipping_status === 'delivered' ? 'Delivered' : 'In Transit'}
                                                        </Badge>
                                                    )}

                                                    {order.shipping_status === 'in_transit' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="border-green-500/40 text-green-500"
                                                            disabled={busy}
                                                            onClick={() => handleMarkDelivered(order.id)}
                                                        >
                                                            <CheckCircle className="mr-1 h-3 w-3" /> Delivered
                                                        </Button>
                                                    )}

                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => navigate(`/sales/${order.id}`)}
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })
                    )}
                </TabsContent>
            </Tabs>

            {/* Fulfill Order Confirmation */}
            <AlertDialog open={!!confirmFulfillOrder} onOpenChange={() => setConfirmFulfillOrder(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Fulfill this order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will deduct inventory for{' '}
                            <strong>Order #{confirmFulfillOrder?.id.slice(0, 8)}</strong>
                            {confirmFulfillOrder?.contacts?.name ? ` (${confirmFulfillOrder.contacts.name})` : ''}:
                            <ul className="mt-2 space-y-1">
                                {confirmFulfillOrder?.sales_order_items?.map(item => (
                                    <li key={item.id} className="flex items-center gap-2">
                                        <span className="font-medium">{item.quantity}x</span> {item.peptides?.name}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-3 text-amber-500 font-medium">
                                Bottles will be marked as sold and removed from available stock.
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-green-600 hover:bg-green-700"
                            onClick={executeFulfill}
                        >
                            Confirm & Fulfill
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
