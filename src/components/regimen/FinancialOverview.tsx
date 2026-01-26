import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label as FormLabel } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface FinancialOverviewProps {
    contactId: string;
}

export function FinancialOverview({ contactId }: FinancialOverviewProps) {
    const queryClient = useQueryClient();
    const [outstandingBalance, setOutstandingBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [allMovements, setAllMovements] = useState<any[]>([]);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const fetchFinancials = async () => {
        try {
            // Fetch ALL movements unrelated to payment status (except returned)
            const { data: movements, error } = await supabase
                .from('movements')
                .select('id, payment_status, status, amount_paid, created_at, payment_date, notes, movement_items(price_at_sale, bottle:bottles(lot:lots(peptide:peptides(name), lot_number)))')
                .eq('contact_id', contactId)
                .neq('status', 'returned')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (movements) {
                setAllMovements(movements);

                // Calculate total owed based on unpaid items
                const totalOwed = movements.reduce((acc, movement) => {
                    if (movement.payment_status === 'paid') return acc;

                    const totalPrice = movement.movement_items?.reduce(
                        (sum: number, item: any) => sum + (item.price_at_sale || 0),
                        0
                    ) || 0;
                    const amountPaid = movement.amount_paid || 0;
                    return acc + (totalPrice - amountPaid);
                }, 0);

                setOutstandingBalance(totalOwed);
            }
        } catch (error) {
            console.error("Error fetching financials:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFinancials();
    }, [contactId]);

    const handleMarkPaid = async () => {
        try {
            setLoading(true);
            const unpaidMoves = allMovements.filter(m => m.payment_status === 'unpaid' || m.payment_status === 'partial');

            const updates = unpaidMoves.map(m => {
                const totalPrice = m.movement_items?.reduce(
                    (sum: number, item: any) => sum + (item.price_at_sale || 0),
                    0
                ) || 0;

                return supabase
                    .from('movements')
                    .update({
                        payment_status: 'paid',
                        amount_paid: totalPrice,
                        payment_date: new Date().toISOString(),
                        notes: m.notes ? `${m.notes} | Paid via ${paymentMethod}` : `Paid via ${paymentMethod}`
                    })
                    .eq('id', m.id)
                    .select(); // Must select to know if it worked
            });

            const results = await Promise.all(updates);

            // Check for failures (RLS often returns no error but 0 rows)
            const failed = results.filter(r => r.error || !r.data || r.data.length === 0);

            if (failed.length > 0) {
                // If all failed, throw error. If partial, maybe warn?
                // For now, let's look at the first failure
                if (failed[0].error) throw failed[0].error;
                if (!failed[0].data || failed[0].data.length === 0) {
                    throw new Error("Permission Denied: Unable to update payment records. Please contact support.");
                }
            }

            await fetchFinancials(); // Re-fetch to update history and clear balance

            // Invalidate global movements query so Admin table updates
            queryClient.invalidateQueries({ queryKey: ['movements'] });

            setIsPaymentOpen(false);

            // Show success toast
            toast({
                title: "Payment Recorded",
                description: `Successfully marked ${updates.length} orders as paid.`,
                className: "bg-green-50 border-green-200 text-green-900"
            });

        } catch (error: any) {
            console.error("Error marking paid:", error);
            // Show error toast
            toast({
                title: "Payment Failed",
                description: error.message || "Could not update payment status. Please try again.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;

    const hasBalance = outstandingBalance > 0;

    return (
        <Card className={`${hasBalance ? 'border-slate-200 bg-slate-50/50' : 'border-emerald-100 bg-emerald-50/30'}`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className={`text-base flex items-center gap-2 ${hasBalance ? 'text-slate-800' : 'text-emerald-900'}`}>
                        {hasBalance ? <AlertCircle className="h-5 w-5 text-slate-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                        {hasBalance ? 'Outstanding Balance' : 'Account Status'}
                    </CardTitle>
                    {hasBalance && (
                        <Badge variant="outline" className="bg-white text-slate-700 border-slate-300 shadow-sm">
                            Action Required
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                        <DollarSign className={`h-6 w-6 ${hasBalance ? 'text-slate-600' : 'text-emerald-600'}`} />
                        <span className={`text-3xl font-bold ${hasBalance ? 'text-slate-900' : 'text-emerald-900'}`}>
                            {outstandingBalance.toFixed(2)}
                        </span>
                        {!hasBalance && <span className="text-sm text-emerald-700 font-medium">All paid up</span>}
                    </div>

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
                        <Tabs defaultValue={hasBalance ? "unpaid" : "history"} className="w-full">
                            <TabsList className="w-full grid grid-cols-2 bg-slate-100/50">
                                <TabsTrigger value="unpaid" disabled={!hasBalance} className="data-[state=active]:bg-white data-[state=active]:text-slate-900">Unpaid Orders</TabsTrigger>
                                <TabsTrigger value="history" className="data-[state=active]:bg-white data-[state=active]:text-slate-900">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="unpaid" className="mt-2 text-sm">
                                <div className="bg-white rounded-md border border-slate-200 p-2 max-h-[200px] overflow-y-auto space-y-2 shadow-sm">
                                    {allMovements.filter(m => m.payment_status !== 'paid').map(m => {
                                        const totalPrice = m.movement_items?.reduce((sum: number, item: any) => sum + (item.price_at_sale || 0), 0) || 0;
                                        const paid = m.amount_paid || 0;
                                        const isPartial = paid > 0;
                                        const remaining = totalPrice - paid;

                                        return (
                                            <div key={m.id} className="p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors rounded-sm">
                                                <div className="flex justify-between font-medium text-slate-900">
                                                    <span>{format(new Date(m.created_at), 'MMM d, yyyy')}</span>
                                                    <div className="flex flex-col items-end gap-1">
                                                        {isPartial ? (
                                                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200">Partial</Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200">Unpaid</Badge>
                                                        )}
                                                        <span className="text-xs font-bold text-slate-700">
                                                            ${remaining.toFixed(2)}
                                                            {isPartial && <span className="text-slate-400 font-normal ml-1">(of ${totalPrice.toFixed(0)})</span>}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 pl-2 border-l-2 border-slate-200">
                                                    {m.movement_items?.map((item: any) => (
                                                        <div key={item.random_id || Math.random()} className="flex justify-between">
                                                            <span>{item.bottle?.lot?.peptide?.name}</span>
                                                            <span className="opacity-70">${item.price_at_sale?.toFixed(2)}</span>
                                                        </div>
                                                    ))}
                                                    {isPartial && (
                                                        <div className="flex justify-between mt-1 pt-1 border-t border-slate-100 font-medium text-emerald-600">
                                                            <span>Paid to date</span>
                                                            <span>-${paid.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="mt-2 text-sm">
                                <div className="bg-white rounded-md border border-slate-200 p-2 max-h-[200px] overflow-y-auto space-y-2 shadow-sm">
                                    {allMovements.filter(m => m.payment_status === 'paid').length === 0 ? (
                                        <div className="text-center py-4 text-slate-400">No payment history found.</div>
                                    ) : (
                                        allMovements.filter(m => m.payment_status === 'paid').map(m => (
                                            <div key={m.id} className="p-3 border-b border-slate-100 last:border-0 opacity-90 hover:bg-slate-50/50 transition-colors">
                                                <div className="flex justify-between">
                                                    <span className="font-medium text-slate-800">{format(new Date(m.created_at), 'MMM d, yyyy')}</span>
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    Paid on {m.payment_date ? format(new Date(m.payment_date), 'MMM d') : 'N/A'} • {m.notes || 'No notes'}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>

                    <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Record Payment</DialogTitle>
                                <DialogDescription>
                                    Verify you have made payment for the outstanding balance of <strong>${outstandingBalance.toFixed(2)}</strong>.
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
