import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label as FormLabel } from "@/components/ui/label";

interface FinancialOverviewProps {
    contactId: string;
}

export function FinancialOverview({ contactId }: FinancialOverviewProps) {
    const [outstandingBalance, setOutstandingBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [unpaidMovements, setUnpaidMovements] = useState<any[]>([]);

    useEffect(() => {
        const fetchFinancials = async () => {
            try {
                // Fetch movements where payment_status is 'unpaid' or 'partial'
                const { data: movements, error } = await supabase
                    .from('movements')
                    .select('id, payment_status, status, amount_paid, created_at, movement_items(price_at_sale, bottle:bottles(lot:lots(peptide:peptides(name), lot_number)))')
                    .eq('contact_id', contactId)
                    .in('payment_status', ['unpaid', 'partial'])
                    .neq('status', 'returned');

                if (error) throw error;

                if (movements) {
                    setUnpaidMovements(movements);

                    // Calculate total owed
                    const totalOwed = movements.reduce((acc, movement) => {
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

        fetchFinancials();
    }, [contactId]);

    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const handleMarkPaid = async () => {
        try {
            setLoading(true);
            const updates = unpaidMovements.map(m => {
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

            // Refresh local state by hiding the card (simplest way without refetching parent)
            setOutstandingBalance(0);
            setIsPaymentOpen(false);

        } catch (error) {
            console.error("Error marking paid:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return null;
    if (outstandingBalance <= 0) return null;

    return (
        <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                        <AlertCircle className="h-5 w-5" />
                        Outstanding Balance
                    </CardTitle>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        {unpaidMovements.length} order{unpaidMovements.length !== 1 ? 's' : ''}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    <div className="space-y-4">
                        <div className="flex items-baseline gap-2">
                            <DollarSign className="h-6 w-6 text-amber-700" />
                            <span className="text-3xl font-bold text-amber-900">
                                {outstandingBalance.toFixed(2)}
                            </span>
                        </div>
                        <p className="text-sm text-amber-700">
                            You have pending payments for received inventory.
                        </p>

                        {/* Itemized List */}
                        <div className="bg-amber-100/50 rounded-md p-3 text-sm space-y-2 max-h-[150px] overflow-y-auto border border-amber-200">
                            {unpaidMovements.map(m => (
                                <div key={m.id} className="space-y-1">
                                    <div className="text-xs font-semibold text-amber-800 opacity-70">
                                        Order from {new Date(m.created_at).toLocaleDateString()}
                                    </div>
                                    {m.movement_items?.map((item: any) => (
                                        <div key={item.id || Math.random()} className="flex justify-between items-center text-amber-900">
                                            <span>{item.bottle?.lot?.peptide?.name || 'Unknown Item'}</span>
                                            <span className="font-mono">${item.price_at_sale}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="default"
                                className="w-full bg-amber-600 hover:bg-amber-700"
                            >
                                Mark as Paid
                            </Button>
                        </DialogTrigger>
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
                                <div className="text-xs text-muted-foreground bg-muted p-3 rounded">
                                    <strong>Note:</strong> This checks off the debt in your digital ledger. Please ensure actual transaction is complete.
                                </div>
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
