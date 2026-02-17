
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PeptideHistoryDialogProps {
    peptideId: string | null;
    peptideName: string;
    open: boolean;
    onClose: () => void;
}

type HistoryItem = {
    id: string;
    date: string;
    type: 'sale' | 'restock';
    contact: string;
    quantity: number;
    price: number | null; // Unit price or cost
    notes: string | null;
    paymentStatus?: string | null;
};

export function PeptideHistoryDialog({
    peptideId,
    peptideName,
    open,
    onClose,
}: PeptideHistoryDialogProps) {
    const { data: historyItems, isLoading } = useQuery({
        queryKey: ["peptide-mixed-history", peptideId],
        queryFn: async () => {
            if (!peptideId) return [];

            // 1. Fetch Sales (Movement Items)
            const { data: salesData, error: salesError } = await supabase
                .from("movement_items")
                .select(`
                    id,
                    price_at_sale,
                    created_at,
                    movements (
                        movement_date,
                        notes,
                        contacts (name)
                    ),
                    bottles!inner (
                        lots!inner (peptide_id)
                    )
                `)
                .eq("bottles.lots.peptide_id", peptideId);

            if (salesError) throw salesError;

            // 2. Fetch Receipts (Lots)
            const { data: lotsData, error: lotsError } = await supabase
                .from("lots")
                .select(`
                    id,
                    lot_number,
                    quantity_received,
                    cost_per_unit,
                    received_date,
                    created_at,
                    notes,
                    payment_status
                `)
                .eq("peptide_id", peptideId);

            if (lotsError) throw lotsError;

            // 3. Transform and Merge
            const sales: HistoryItem[] = salesData?.map((item) => ({
                id: item.id,
                date: item.movements?.movement_date || item.created_at,
                type: 'sale',
                contact: item.movements?.contacts?.name || "Unknown Client",
                quantity: 1, // Movement items are usually 1 line per bottle, or we aggregate? 
                // Wait, movement_items is 1 row per bottle if we structured it that way?
                // Schema: movement_items has bottle_id. So yes, 1 row = 1 bottle.
                price: item.price_at_sale,
                notes: item.movements?.notes
            })) || [];

            const receipts: HistoryItem[] = lotsData?.map((lot) => ({
                id: lot.id,
                date: lot.received_date || lot.created_at,
                type: 'restock',
                contact: `Lot: ${lot.lot_number}`,
                quantity: lot.quantity_received,
                price: lot.cost_per_unit,
                notes: lot.notes,
                paymentStatus: lot.payment_status // Pass it through
            })) || [];

            return [...sales, ...receipts].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
        },
        enabled: !!peptideId && open,
    });

    const totalSold = historyItems?.filter(i => i.type === 'sale').length || 0;
    const totalReceived = historyItems?.filter(i => i.type === 'restock').reduce((acc, i) => acc + i.quantity, 0) || 0;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex justify-between items-center pr-8">
                        <span>History: {peptideName}</span>
                        <div className="flex gap-4 text-sm font-normal">
                            <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">
                                +{totalReceived} Added
                            </Badge>
                            <Badge variant="outline" className="text-blue-500 border-blue-500/20 bg-blue-500/10">
                                -{totalSold} Sold
                            </Badge>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {isLoading ? (
                        <div className="space-y-2 p-4">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : !historyItems || historyItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <AlertCircle className="h-10 w-10 mb-3 opacity-30" />
                            <p>No history found for this peptide.</p>
                        </div>
                    ) : (
                        <div className="border rounded-md overflow-y-auto flex-1">
                            <Table>
                                <TableHeader className="sticky top-0 bg-secondary/50 backdrop-blur-sm z-10">
                                    <TableRow>
                                        <TableHead className="w-[120px]">Date</TableHead>
                                        <TableHead className="w-[100px]">Type</TableHead>
                                        <TableHead>Details </TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Price/Cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyItems.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-muted/50">
                                            <TableCell className="font-medium whitespace-nowrap">
                                                {format(new Date(item.date), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                                {item.type === 'restock' ? (
                                                    <Badge variant="outline" className="text-emerald-500 hover:text-emerald-600 border-emerald-500/30">
                                                        <ArrowDownLeft className="mr-1 h-3 w-3" /> Received
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-blue-500 hover:text-blue-600 border-blue-500/30">
                                                        <ArrowUpRight className="mr-1 h-3 w-3" /> Sold
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{item.contact}</span>
                                                    {item.notes && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{item.notes}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono">
                                                {item.type === 'restock' ? `+${item.quantity}` : `-${item.quantity}`}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-muted-foreground">
                                                {item.price ? `$${Number(item.price).toFixed(2)}` : '-'}
                                                {item.type === 'restock' && (
                                                    <div className="mt-1">
                                                        {item.paymentStatus === 'paid' ? (
                                                            <Badge variant="outline" className="text-[10px] h-5 px-1 py-0 border-emerald-500/20 text-emerald-500">Paid</Badge>
                                                        ) : item.paymentStatus === 'partial' ? (
                                                            <Badge variant="outline" className="text-[10px] h-5 px-1 py-0 border-amber-500/20 text-amber-500">Partial</Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] h-5 px-1 py-0 border-red-500/20 text-red-500">Unpaid</Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
