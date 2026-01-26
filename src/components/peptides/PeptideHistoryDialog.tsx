
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
import { AlertCircle } from "lucide-react";

interface PeptideHistoryDialogProps {
    peptideId: string | null;
    peptideName: string;
    open: boolean;
    onClose: () => void;
}

export function PeptideHistoryDialog({
    peptideId,
    peptideName,
    open,
    onClose,
}: PeptideHistoryDialogProps) {
    const { data: history, isLoading } = useQuery({
        queryKey: ["peptide-sales-history", peptideId],
        queryFn: async () => {
            if (!peptideId) return [];

            // We need to find movement_items linked to this peptide
            // Path: movement_items -> bottles -> lots -> peptide_id
            const { data, error } = await supabase
                .from("movement_items")
                .select(`
          id,
          price_at_sale,
          created_at,
          movements (
            id,
            movement_date,
            type,
            notes,
            contact_id,
            contacts (
              name
            )
          ),
          description,
          bottles!inner (
            uid,
            lots!inner (
              peptide_id
            )
          )
        `)
                .eq("bottles.lots.peptide_id", peptideId)
                .eq("movements.type", "sale") // Only interested in sales for "who sold to"
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!peptideId && open,
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Sales History: {peptideName}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : !history || history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                            <p>No sales history found for this peptide.</p>
                        </div>
                    ) : (
                        <div className="border rounded-md max-h-[60vh] overflow-y-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Contact (Buyer)</TableHead>
                                        <TableHead>Sale Price</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {history.map((item: any) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                {format(new Date(item.movements?.movement_date || item.created_at), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {item.movements?.contacts?.name ||
                                                    (item.movements?.contact_id ? `Client (Join Hidden)` :
                                                        "Staff/Misc")}
                                            </TableCell>
                                            <TableCell>
                                                ${Number(item.price_at_sale || 0).toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                                                {item.movements?.notes || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {history && history.length > 0 && (
                        <div className="text-right text-sm text-muted-foreground pt-2">
                            Total Sold: <span className="font-medium text-foreground">{history.length} vials</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
