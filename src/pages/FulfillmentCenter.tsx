import { useState, useMemo } from 'react';
import { useSalesOrders, useUpdateSalesOrder, useFulfillOrder, useGetShippingRates, useBuyShippingLabel, type SalesOrder, type ShippingRate } from '@/hooks/use-sales-orders';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, isAfter, subDays, startOfWeek } from 'date-fns';
import {
    Package, CheckCircle,
    ClipboardList, HandMetal,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { QueryError } from '@/components/ui/query-error';

import HoursLoggingCard from '@/components/fulfillment/HoursLoggingCard';
import SummaryStats from '@/components/fulfillment/SummaryStats';
import PickPackTab from '@/components/fulfillment/PickPackTab';
import LabelShipTab from '@/components/fulfillment/LabelShipTab';
import ReadyForPickupTab from '@/components/fulfillment/ReadyForPickupTab';
import CompletedTab from '@/components/fulfillment/CompletedTab';
import FulfillConfirmDialog from '@/components/fulfillment/FulfillConfirmDialog';

export default function FulfillmentCenter() {
    usePageTitle('Fulfillment Center');
    const { data: allOrders, isLoading, isError, refetch } = useSalesOrders();
    const fulfillOrder = useFulfillOrder();
    const updateOrder = useUpdateSalesOrder();
    const getRates = useGetShippingRates();
    const buyLabel = useBuyShippingLabel();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { user, organization } = useAuth();

    // Fulfillment type filter: 'all' | 'standard' | 'dropship'
    const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('all');

    // Track which order is being acted on (prevents shared loading state bug)
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [confirmFulfillOrder, setConfirmFulfillOrder] = useState<SalesOrder | null>(null);

    // Per-order rate fetching state for 3-step label flow
    const [orderRates, setOrderRates] = useState<Record<string, ShippingRate[]>>({});
    const [selectedRates, setSelectedRates] = useState<Record<string, string>>({});

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
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
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

    // Resolve merchant org names for dropship orders
    const dropshipOrgIds = useMemo(() => {
        if (!allOrders) return [];
        const ids = new Set<string>();
        for (const o of allOrders) {
            if (o.is_supplier_order && o.source_org_id) ids.add(o.source_org_id);
        }
        return Array.from(ids);
    }, [allOrders]);

    const { data: merchantOrgs } = useQuery({
        queryKey: ['merchant_orgs', dropshipOrgIds],
        queryFn: async () => {
            if (dropshipOrgIds.length === 0) return {};
            const { data } = await supabase
                .from('organizations')
                .select('id, name')
                .in('id', dropshipOrgIds);
            const map: Record<string, string> = {};
            for (const o of data || []) map[o.id] = o.name;
            return map;
        },
        enabled: dropshipOrgIds.length > 0,
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

            type BottleWithLot = { id: string; lots: { peptide_id: string; peptides: { id: string; name: string } } };
            const rows = (data || []) as unknown as BottleWithLot[];
            const counts: Record<string, { name: string; count: number }> = {};
            for (const b of rows) {
                const pid = b.lots?.peptide_id;
                const pname = b.lots?.peptides?.name;
                if (pid) {
                    if (!counts[pid]) counts[pid] = { name: pname || 'Unknown', count: 0 };
                    counts[pid].count++;
                }
            }
            return counts;
        },
        refetchInterval: 30000,
    });

    // Categorize orders
    const { readyToPick, readyToShip, readyForPickup, recentlyCompleted } = useMemo(() => {
        if (!allOrders) return { readyToPick: [], readyToShip: [], readyForPickup: [], recentlyCompleted: [] };

        const cutoff = subDays(new Date(), 7);
        const pick: SalesOrder[] = [];
        const ship: SalesOrder[] = [];
        const pickup: SalesOrder[] = [];
        const completed: SalesOrder[] = [];

        for (const o of allOrders) {
            if (o.status === 'cancelled') continue;

            // Apply fulfillment type filter
            if (fulfillmentFilter === 'dropship' && !o.is_supplier_order) continue;
            if (fulfillmentFilter === 'standard' && o.is_supplier_order) continue;
            const isPickup = o.delivery_method === 'local_pickup';

            if (o.status === 'submitted') {
                pick.push(o);
            } else if (o.status === 'fulfilled' && isPickup && o.shipping_status !== 'delivered') {
                pickup.push(o);
            } else if (o.status === 'fulfilled' && !isPickup && (!o.shipping_status || o.shipping_status === 'pending' || o.shipping_status === 'label_created' || o.shipping_status === 'printed' || o.shipping_status === 'error')) {
                ship.push(o);
            } else if (
                o.status === 'fulfilled' &&
                (o.shipping_status === 'in_transit' || o.shipping_status === 'delivered') &&
                isAfter(new Date(o.updated_at || o.created_at), cutoff)
            ) {
                completed.push(o);
            }
        }

        pick.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        return { readyToPick: pick, readyToShip: ship, readyForPickup: pickup, recentlyCompleted: completed };
    }, [allOrders, fulfillmentFilter]);

    // Total bottles to pull across all pick orders
    const totalBottlesToPull = useMemo(() => {
        return readyToPick.reduce((sum, o) =>
            sum + (o.sales_order_items?.reduce((s, i) => s + i.quantity, 0) || 0), 0);
    }, [readyToPick]);

    // ── Handler functions ──

    const handleFulfill = (order: SalesOrder) => {
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
                queryClient.invalidateQueries({ queryKey: ['fulfillment_stock'] });
            }
        });
    };

    const handleGetRates = (orderId: string) => {
        setActiveOrderId(orderId);
        setOrderRates(prev => ({ ...prev, [orderId]: [] }));
        setSelectedRates(prev => { const n = { ...prev }; delete n[orderId]; return n; });

        getRates.mutate(orderId, {
            onSuccess: (data) => {
                setOrderRates(prev => ({ ...prev, [orderId]: data.rates }));
            },
            onSettled: () => setActiveOrderId(null),
        });
    };

    const handleSelectRate = (orderId: string, rateId: string) => {
        setSelectedRates(prev => ({ ...prev, [orderId]: rateId }));
    };

    const handleBuyLabel = (orderId: string) => {
        const rateId = selectedRates[orderId];
        if (!rateId) return;

        setActiveOrderId(orderId);
        buyLabel.mutate({ orderId, rateId }, {
            onSuccess: () => {
                setOrderRates(prev => { const n = { ...prev }; delete n[orderId]; return n; });
                setSelectedRates(prev => { const n = { ...prev }; delete n[orderId]; return n; });
            },
            onSettled: () => setActiveOrderId(null),
        });
    };

    const handleCancelRates = (orderId: string) => {
        setOrderRates(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        setSelectedRates(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    };

    const handlePrintLabel = async (labelUrl: string) => {
        try {
            const svc = await fetch('https://localhost:9111/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: labelUrl }),
            });
            if (svc.ok) {
                toast({ title: 'Sent to label printer' });
                return;
            }
        } catch {
            // Print service not running
        }

        try {
            const svc = await fetch('http://localhost:9112/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: labelUrl }),
            });
            if (svc.ok) {
                toast({ title: 'Sent to label printer' });
                return;
            }
        } catch {
            // Not available either
        }

        window.open(labelUrl, '_blank');
        toast({ title: 'Label opened in new tab', description: 'Print service not detected — use Ctrl+P to print.' });
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

    const handleMoveToPickPack = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, status: 'submitted' as const, shipping_status: null },
            {
                onSuccess: () => toast({ title: 'Moved back to Pick & Pack' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const handleMoveToLabelShip = (orderId: string) => {
        setActiveOrderId(orderId);
        updateOrder.mutate(
            { id: orderId, delivery_method: 'ship', shipping_status: 'pending' },
            {
                onSuccess: () => toast({ title: 'Moved to Label & Ship' }),
                onSettled: () => setActiveOrderId(null),
            }
        );
    };

    const printPackingSlip = (order: SalesOrder) => {
        const items = order.sales_order_items?.map(item =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${item.peptides?.name || 'Unknown'}</td>` +
            `<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td></tr>`
        ).join('') || '';

        const merchantName = order.is_supplier_order && order.source_org_id
            ? merchantOrgs?.[order.source_org_id] || ''
            : '';
        const brandLine = merchantName
            ? `<p style="color:#0891b2;font-weight:600;margin-bottom:4px">Fulfilled for: ${merchantName}</p>`
            : '';

        const html = `<!DOCTYPE html><html><head><title>Packing Slip - ${order.id.slice(0, 8)}</title>
            <style>body{font-family:system-ui,sans-serif;margin:40px;color:#333}
            h1{font-size:24px;margin-bottom:4px} table{width:100%;border-collapse:collapse;margin:20px 0}
            th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:14px}
            .label{color:#666;font-size:12px;margin-bottom:2px} .value{font-size:14px}
            @media print{body{margin:20px}}</style></head><body>
            ${brandLine}
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

    if (isError) return <QueryError message="Failed to load fulfillment orders." onRetry={() => refetch()} />;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="space-y-2">
                    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Link to="/" className="hover:text-foreground transition-colors">Dashboard</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Fulfillment</span>
                    </nav>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                            <Package className="h-5 w-5 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Fulfillment Center</h1>
                    </div>
                </div>
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
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                className="space-y-2"
            >
            <nav className="flex items-center gap-1 text-xs text-muted-foreground">
                <Link to="/" className="hover:text-foreground transition-colors">Dashboard</Link>
                <span>/</span>
                <span className="text-foreground font-medium">Fulfillment</span>
            </nav>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                        <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Fulfillment Center</h1>
                        <p className="text-muted-foreground text-sm">Pick, pack, and ship orders.</p>
                    </div>
                </div>
                <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter orders" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Orders</SelectItem>
                        <SelectItem value="standard">My Orders</SelectItem>
                        <SelectItem value="dropship">Dropship</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            </motion.div>

            <HoursLoggingCard
                todayHours={todayHours}
                weekHours={weekHours}
                hoursInput={hoursInput}
                hoursNotes={hoursNotes}
                onHoursInputChange={setHoursInput}
                onHoursNotesChange={setHoursNotes}
                onSave={() => saveHours.mutate()}
                isSaving={saveHours.isPending}
            />

            <SummaryStats
                readyToPickCount={readyToPick.length}
                totalBottlesToPull={totalBottlesToPull}
                readyToShipCount={readyToShip.length}
                readyForPickupCount={readyForPickup.length}
                recentlyCompletedCount={recentlyCompleted.length}
            />

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

                <TabsContent value="pick" className="space-y-4">
                    <PickPackTab
                        orders={readyToPick}
                        stockCounts={stockCounts}
                        merchantOrgs={merchantOrgs}
                        isOrderBusy={isOrderBusy}
                        navigate={navigate}
                        onFulfill={handleFulfill}
                        onPrintPackingSlip={printPackingSlip}
                    />
                </TabsContent>

                <TabsContent value="ship" className="space-y-4">
                    <LabelShipTab
                        orders={readyToShip}
                        merchantOrgs={merchantOrgs}
                        orderRates={orderRates}
                        selectedRates={selectedRates}
                        isOrderBusy={isOrderBusy}
                        navigate={navigate}
                        onGetRates={handleGetRates}
                        onSelectRate={handleSelectRate}
                        onBuyLabel={handleBuyLabel}
                        onCancelRates={handleCancelRates}
                        onPrintLabel={handlePrintLabel}
                        onMarkPrinted={handleMarkPrinted}
                        onMarkShipped={handleMarkShipped}
                        onMarkDelivered={handleMarkDelivered}
                        onMoveToPickPack={handleMoveToPickPack}
                        onPrintPackingSlip={printPackingSlip}
                        toast={toast}
                    />
                </TabsContent>

                <TabsContent value="pickup" className="space-y-4">
                    <ReadyForPickupTab
                        orders={readyForPickup}
                        isOrderBusy={isOrderBusy}
                        navigate={navigate}
                        onMarkPickedUp={handleMarkPickedUp}
                        onMoveToLabelShip={handleMoveToLabelShip}
                        onMoveToPickPack={handleMoveToPickPack}
                    />
                </TabsContent>

                <TabsContent value="completed" className="space-y-4">
                    <CompletedTab
                        orders={recentlyCompleted}
                        isOrderBusy={isOrderBusy}
                        navigate={navigate}
                        onMarkDelivered={handleMarkDelivered}
                        toast={toast}
                    />
                </TabsContent>
            </Tabs>

            <FulfillConfirmDialog
                order={confirmFulfillOrder}
                onOpenChange={() => setConfirmFulfillOrder(null)}
                onConfirm={executeFulfill}
            />
        </div>
    );
}
