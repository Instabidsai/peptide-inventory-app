import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
                    .select('id, payment_status, amount_paid, created_at, movement_items(price_at_sale, bottle:bottles(lot:lots(peptide:peptides(name), lot_number)))')
                    .eq('contact_id', contactId)
                    .in('payment_status', ['unpaid', 'partial']);

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
                    <Button
                        variant="default"
                        className="w-full bg-amber-600 hover:bg-amber-700"
                        onClick={() => {
                            // TODO: Integrate with payment system
                            alert('Payment integration coming soon!');
                        }}
                    >
                        Make Payment
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
