import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label as FormLabel } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface FinancialOverviewProps {
    contactId: string;
}

interface OrderWithItems {
    id: string;
    source: 'sales_order' | 'movement'; // track origin for payment updates
    status: string;
    payment_status: string;
    total_amount: number;
    amount_paid: number;
    payment_method: string | null;
    payment_date: string | null;
    created_at: string;
    notes: string | null;
    items: { peptide_name: string; quantity: number; unit_price: number }[];
}

export function FinancialOverview({ contactId }: FinancialOverviewProps) {
    const { session } = useAuth();
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const fetchFinancials = async () => {
        try {
            // === 1. Fetch sales_orders (primary/new system) ===
            const { data: rawOrders, error } = await (supabase as any)
                .from('sales_orders')
                .select('id, status, payment_status, total_amount, amount_paid, payment_method, payment_date, created_at, notes')
                .eq('client_id', contactId)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false });

            if (error) throw error;

            let assembled: OrderWithItems[] = [];

            if (rawOrders?.length) {
                // Fetch line items for all orders in one query
                const orderIds = rawOrders.map((o: any) => o.id);
                const { data: allItems, error: itemsErr } = await (supabase as any)
                    .from('sales_order_items')
                    .select('sales_order_id, quantity, unit_price, peptide_id')
                    .in('sales_order_id', orderIds);

                if (itemsErr) console.error("Error fetching order items:", itemsErr);

                // Fetch peptide names in one batch
                const peptideIds = [...new Set((allItems || []).map((i: any) => i.peptide_id))];
                let nameMap: Record<string, string> = {};
                if (peptideIds.length > 0) {
                    const { data: peptides } = await supabase
                        .from('peptides')
                        .select('id, name')
                        .in('id', peptideIds as string[]);
                    nameMap = Object.fromEntries((peptides || []).map((p: any) => [p.id, p.name]));
                }

                // Assemble orders with items
                assembled = rawOrders.map((o: any) => {
                    const orderItems = (allItems || [])
                        .filter((i: any) => i.sales_order_id === o.id)
                        .map((i: any) => ({
                            peptide_name: nameMap[i.peptide_id] || "Item",
                            quantity: Number(i.quantity) || 0,
                            unit_price: Number(i.unit_price) || 0,
                        }));
                    return {
                        id: o.id,
                        source: 'sales_order' as const,
                        status: o.status,
                        payment_status: o.payment_status || 'unpaid',
                        total_amount: Number(o.total_amount) || 0,
                        amount_paid: Number(o.amount_paid) || 0,
                        payment_method: o.payment_method,
                        payment_date: o.payment_date,
                        created_at: o.created_at,
                        notes: o.notes,
                        items: orderItems,
                    };
                });
            }

            // === 2. Fetch legacy movements NOT linked to any sales_order ===
            const { data: legacyMoves } = await supabase
                .from('movements')
                .select('id, payment_status, amount_paid, movement_date, notes, created_at, payment_date, movement_items(price_at_sale, bottles(lots(peptide_id, peptides(name))))')
                .eq('contact_id', contactId)
                .eq('type', 'sale')
                .order('created_at', { ascending: false });

            if (legacyMoves?.length) {
                // Get set of movement IDs already linked to sales_orders (avoid double-count)
                const linkedIds = new Set<string>();
                // Linked movements have notes like "[SO:xxx]" or "Sales Order #xxx"
                for (const m of legacyMoves) {
                    const n = m.notes || '';
                    if (n.includes('[SO:') || n.match(/^Sales Order #/)) {
                        linkedIds.add(m.id);
                    }
                }

                // Convert unlinked legacy movements to OrderWithItems format
                for (const m of legacyMoves) {
                    if (linkedIds.has(m.id)) continue;

                    const items: { peptide_name: string; quantity: number; unit_price: number }[] = [];
                    let totalPrice = 0;
                    const movItems = (m as any).movement_items || [];
                    for (const mi of movItems) {
                        const price = Number(mi.price_at_sale) || 0;
                        totalPrice += price;
                        const pepName = mi.bottles?.lots?.peptides?.name || 'Item';
                        // Group by peptide name
                        const existing = items.find(i => i.peptide_name === pepName);
                        if (existing) {
                            existing.quantity += 1;
                        } else {
                            items.push({ peptide_name: pepName, quantity: 1, unit_price: price });
                        }
                    }

                    // Extract payment method from notes (e.g. "Paid via cash")
                    const methodMatch = (m.notes || '').match(/Paid via (\w+)/i);
                    const method = methodMatch ? methodMatch[1] : null;

                    assembled.push({
                        id: m.id,
                        source: 'movement',
                        status: 'fulfilled', // Legacy movements were always fulfilled
                        payment_status: m.payment_status || 'unpaid',
                        total_amount: totalPrice,
                        amount_paid: Number(m.amount_paid) || 0,
                        payment_method: method,
                        payment_date: m.payment_date || null,
                        created_at: m.created_at,
                        notes: m.notes,
                        items,
                    });
                }
            }

            // Sort combined results by date descending
            assembled.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setOrders(assembled);
        } catch (error) {
            console.error("Error fetching financials:", error);
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when contactId or session changes (ensures auth is ready)
    useEffect(() => {
        if (session) fetchFinancials();
    }, [contactId, session?.access_token]);

    const unpaidOrders = orders.filter(o => o.payment_status !== 'paid');
    const pendingOrders = orders.filter(o => o.status === 'submitted' || o.status === 'pending');
    const fulfilledUnpaid = orders.filter(o => o.status === 'fulfilled' && o.payment_status !== 'paid');
    const paidOrders = orders.filter(o => o.payment_status === 'paid');

    const outstandingBalance = unpaidOrders.reduce((sum, o) => sum + (o.total_amount - o.amount_paid), 0);
    const pendingTotal = pendingOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const fulfilledUnpaidTotal = fulfilledUnpaid.reduce((sum, o) => sum + (o.total_amount - o.amount_paid), 0);

    const handleMarkPaid = async () => {
        try {
            setLoading(true);
            const toMark = fulfilledUnpaid;
            if (toMark.length === 0) return;

            // Separate by source type
            const salesOrderItems = toMark.filter(o => o.source === 'sales_order');
            const movementItems = toMark.filter(o => o.source === 'movement');

            // Update sales_orders
            if (salesOrderItems.length > 0) {
                const orderUpdates = salesOrderItems.map(o =>
                    (supabase as any)
                        .from('sales_orders')
                        .update({
                            payment_status: 'paid',
                            amount_paid: o.total_amount,
                            payment_method: paymentMethod,
                            payment_date: new Date().toISOString(),
                        })
                        .eq('id', o.id)
                        .select()
                );
                const results = await Promise.all(orderUpdates);
                const failed = results.filter((r: any) => r.error || !r.data?.length);
                if (failed.length > 0) {
                    const firstErr = (failed[0] as any).error;
                    throw firstErr || new Error("Unable to update payment. Check permissions.");
                }

                // Also mark linked movements as paid
                const { data: relatedMoves } = await supabase
                    .from('movements')
                    .select('id')
                    .eq('contact_id', contactId)
                    .eq('payment_status', 'unpaid');

                if (relatedMoves?.length) {
                    await Promise.all(relatedMoves.map(m =>
                        supabase.from('movements').update({
                            payment_status: 'paid',
                            payment_date: new Date().toISOString(),
                            notes: `Paid via ${paymentMethod}`,
                        }).eq('id', m.id)
                    ));
                }
            }

            // Update legacy movements directly
            if (movementItems.length > 0) {
                const moveUpdates = movementItems.map(o =>
                    supabase.from('movements').update({
                        payment_status: 'paid',
                        amount_paid: o.total_amount,
                        payment_date: new Date().toISOString(),
                        notes: (o.notes ? o.notes + ' | ' : '') + `Paid via ${paymentMethod}`,
                    }).eq('id', o.id)
                );
                await Promise.all(moveUpdates);
            }

            await fetchFinancials();
            queryClient.invalidateQueries({ queryKey: ['movements'] });
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
            setIsPaymentOpen(false);

            toast({
                title: "Payment Recorded",
                description: `Marked ${toMark.length} order${toMark.length !== 1 ? 's' : ''} as paid.`,
                className: "bg-green-50 border-green-200 text-green-900"
            });
        } catch (error: any) {
            console.error("Error marking paid:", error);
            toast({
                title: "Payment Failed",
                description: error.message || "Could not update payment status.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;

    const hasBalance = fulfilledUnpaidTotal > 0;
    const hasPending = pendingTotal > 0;
    const totalOwed = outstandingBalance;
    const hasAnyBalance = totalOwed > 0;

    return (
        <Card className={`${hasAnyBalance ? 'border-slate-200 bg-slate-50/50' : 'border-emerald-100 bg-emerald-50/30'}`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className={`text-base flex items-center gap-2 ${hasAnyBalance ? 'text-slate-800' : 'text-emerald-900'}`}>
                        {hasAnyBalance ? <AlertCircle className="h-5 w-5 text-slate-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                        {hasBalance ? 'Outstanding Balance' : hasPending ? 'Pending Orders' : 'Account Status'}
                    </CardTitle>
                    {hasBalance && (
                        <Badge variant="outline" className="bg-card text-foreground border-border shadow-sm">
                            Action Required
                        </Badge>
                    )}
                    {!hasBalance && hasPending && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            Awaiting Fulfillment
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                        <DollarSign className={`h-6 w-6 ${hasAnyBalance ? 'text-slate-600' : 'text-emerald-600'}`} />
                        <span className={`text-3xl font-bold ${hasAnyBalance ? 'text-slate-900' : 'text-emerald-900'}`}>
                            {totalOwed.toFixed(2)}
                        </span>
                        {!hasAnyBalance && <span className="text-sm text-emerald-700 font-medium">All paid up</span>}
                    </div>

                    {hasPending && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>${pendingTotal.toFixed(2)} in {pendingOrders.length} pending order{pendingOrders.length !== 1 ? 's' : ''} awaiting fulfillment</span>
                        </div>
                    )}

                    {hasBalance && (
                        <Button
                            variant="default"
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white shadow-sm"
                            onClick={() => setIsPaymentOpen(true)}
                        >
                            Mark as Paid
                        </Button>
                    )}

                    <div className="pt-2">
                        <Tabs defaultValue={hasBalance ? "unpaid" : hasPending ? "pending" : "history"} className="w-full">
                            <TabsList className="w-full grid grid-cols-3 bg-muted/50">
                                <TabsTrigger value="unpaid" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
                                    Unpaid{unpaidOrders.length > 0 && ` (${unpaidOrders.length})`}
                                </TabsTrigger>
                                <TabsTrigger value="pending" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
                                    Pending{pendingOrders.length > 0 && ` (${pendingOrders.length})`}
                                </TabsTrigger>
                                <TabsTrigger value="history" className="data-[state=active]:bg-card data-[state=active]:text-foreground">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="unpaid" className="mt-2 text-sm">
                                <div className="bg-card rounded-md border border-border p-2 max-h-[200px] overflow-y-auto space-y-2 shadow-sm">
                                    {unpaidOrders.length === 0 ? (
                                        <div className="text-center py-4 text-slate-400">No unpaid orders.</div>
                                    ) : unpaidOrders.map(o => {
                                        const remaining = o.total_amount - o.amount_paid;
                                        const isPartial = o.amount_paid > 0;
                                        return (
                                            <div key={o.id} className="p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors rounded-sm">
                                                <div className="flex justify-between font-medium text-slate-900">
                                                    <span>{format(new Date(o.created_at), 'MMM d, yyyy')}</span>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <Badge variant="secondary" className={
                                                            o.status === 'fulfilled'
                                                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                                                : "bg-amber-100 text-amber-700 border-amber-200"
                                                        }>
                                                            {o.status === 'fulfilled' ? 'Fulfilled' : o.status === 'submitted' ? 'Submitted' : 'Pending'}
                                                        </Badge>
                                                        <span className="text-xs font-bold text-slate-700">
                                                            ${remaining.toFixed(2)}
                                                            {isPartial && <span className="text-slate-400 font-normal ml-1">(of ${o.total_amount.toFixed(0)})</span>}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 pl-2 border-l-2 border-slate-200">
                                                    {o.items.map((item, idx) => (
                                                        <div key={idx} className="flex justify-between">
                                                            <span>{item.peptide_name} x{item.quantity}</span>
                                                            <span className="opacity-70">${item.unit_price.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                    {o.notes && <div className="mt-1 text-slate-400 italic">{o.notes}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </TabsContent>

                            <TabsContent value="pending" className="mt-2 text-sm">
                                <div className="bg-card rounded-md border border-border p-2 max-h-[200px] overflow-y-auto space-y-2 shadow-sm">
                                    {pendingOrders.length === 0 ? (
                                        <div className="text-center py-4 text-slate-400">No pending orders.</div>
                                    ) : pendingOrders.map(o => (
                                        <div key={o.id} className="p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors rounded-sm">
                                            <div className="flex justify-between font-medium text-slate-900">
                                                <span>{format(new Date(o.created_at), 'MMM d, yyyy')}</span>
                                                <div className="flex flex-col items-end gap-1">
                                                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">
                                                        {o.status === 'submitted' ? 'Submitted' : 'Pending'}
                                                    </Badge>
                                                    <span className="text-xs font-bold text-slate-700">${o.total_amount.toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1 pl-2 border-l-2 border-amber-200">
                                                {o.items.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between">
                                                        <span>{item.peptide_name} x{item.quantity}</span>
                                                        <span className="opacity-70">${item.unit_price.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                                {o.notes && <div className="mt-1 text-slate-400 italic">{o.notes}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="mt-2 text-sm">
                                <div className="bg-card rounded-md border border-border p-2 max-h-[200px] overflow-y-auto space-y-2 shadow-sm">
                                    {paidOrders.length === 0 ? (
                                        <div className="text-center py-4 text-slate-400">No payment history found.</div>
                                    ) : paidOrders.map(o => (
                                        <div key={o.id} className="p-3 border-b border-slate-100 last:border-0 opacity-90 hover:bg-slate-50/50 transition-colors">
                                            <div className="flex justify-between">
                                                <span className="font-medium text-slate-800">{format(new Date(o.created_at), 'MMM d, yyyy')}</span>
                                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-1">
                                                ${o.total_amount.toFixed(2)} • Paid on {o.payment_date ? format(new Date(o.payment_date), 'MMM d') : 'N/A'}
                                                {o.payment_method && ` via ${o.payment_method}`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>

                    <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Record Payment</DialogTitle>
                                <DialogDescription>
                                    Verify you have received payment for <strong>${fulfilledUnpaidTotal.toFixed(2)}</strong> in fulfilled orders.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <FormLabel>Payment Method</FormLabel>
                                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Cash</SelectItem>
                                        <SelectItem value="venmo">Venmo</SelectItem>
                                        <SelectItem value="zelle">Zelle</SelectItem>
                                        <SelectItem value="apple_pay">Apple Pay</SelectItem>
                                        <SelectItem value="credit_card">Credit Card (External)</SelectItem>
                                        <SelectItem value="check">Check</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>Cancel</Button>
                                <Button onClick={handleMarkPaid} className="bg-green-600 hover:bg-green-700">
                                    Confirm Payment
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardContent>
        </Card>
    );
}
