import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertCircle, CheckCircle2, History, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label as FormLabel } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

interface FinancialOverviewProps {
    contactId: string;
}

export function FinancialOverview({ contactId }: FinancialOverviewProps) {
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
                    .eq('id', m.id);
            });

            await Promise.all(updates);
            await fetchFinancials(); // Re-fetch to update history and clear balance
            setIsPaymentOpen(false);

        } catch (error) {
            console.error("Error marking paid:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;

    const hasBalance = outstandingBalance > 0;

    return (
        <Card className={`${hasBalance ? 'border-amber-200 bg-amber-50/50' : 'border-green-100 bg-green-50/30'}`}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className={`text-base flex items-center gap-2 ${hasBalance ? 'text-amber-900' : 'text-green-900'}`}>
                        {hasBalance ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                        {hasBalance ? 'Outstanding Balance' : 'Account Status'}
                    </CardTitle>
                    {hasBalance && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                            Action Required
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                        <DollarSign className={`h-6 w-6 ${hasBalance ? 'text-amber-700' : 'text-green-700'}`} />
                        <span className={`text-3xl font-bold ${hasBalance ? 'text-amber-900' : 'text-green-900'}`}>
                            {outstandingBalance.toFixed(2)}
                        </span>
                        {!hasBalance && <span className="text-sm text-green-700 font-medium">All paid up</span>}
                    </div>

                    {hasBalance && (
                        <Button
                            variant="default"
                            className="w-full bg-amber-600 hover:bg-amber-700"
                            onClick={() => setIsPaymentOpen(true)}
                        >
                            Mark as Paid
                        </Button>
                    )}

                    <div className="pt-2">
                        <Tabs defaultValue={hasBalance ? "unpaid" : "history"} className="w-full">
                            <TabsList className="w-full grid grid-cols-2">
                                <TabsTrigger value="unpaid" disabled={!hasBalance}>Unpaid Orders</TabsTrigger>
                                <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="unpaid" className="mt-2 text-sm">
                                <div className="bg-white/50 rounded-md border p-2 max-h-[200px] overflow-y-auto space-y-2">
                                    {allMovements.filter(m => m.payment_status !== 'paid').map(m => (
                                        <div key={m.id} className="p-2 border-b last:border-0">
                                            <div className="flex justify-between font-medium">
                                                <span>{format(new Date(m.created_at), 'MMM d, yyyy')}</span>
                                                <Badge variant="outline" className="text-amber-600 border-amber-200">Unpaid</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1 pl-2 border-l-2 border-amber-100">
                                                {m.movement_items?.map((item: any) => (
                                                    <div key={item.random_id || Math.random()} className="flex justify-between">
                                                        <span>{item.bottle?.lot?.peptide?.name}</span>
                                                        <span>${item.price_at_sale}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="mt-2 text-sm">
                                <div className="bg-white/50 rounded-md border p-2 max-h-[200px] overflow-y-auto space-y-2">
                                    {allMovements.filter(m => m.payment_status === 'paid').length === 0 ? (
                                        <div className="text-center py-4 text-muted-foreground">No payment history found.</div>
                                    ) : (
                                        allMovements.filter(m => m.payment_status === 'paid').map(m => (
                                            <div key={m.id} className="p-2 border-b last:border-0 opacity-80">
                                                <div className="flex justify-between">
                                                    <span className="font-medium">{format(new Date(m.created_at), 'MMM d, yyyy')}</span>
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground mt-1">
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
