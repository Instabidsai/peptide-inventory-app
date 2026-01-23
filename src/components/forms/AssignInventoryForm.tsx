
import { useState, useEffect } from "react";
import { useBottles } from "@/hooks/use-bottles";
import { useCreateMovement } from "@/hooks/use-movements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"; // Keeping Select for Payment Status

export function AssignInventoryForm({ contactId, onClose, defaultPeptideId, defaultQuantity = 1 }: { contactId: string, onClose: () => void, defaultPeptideId?: string, defaultQuantity?: number }) {
    const { data: allBottles } = useBottles({ status: 'in_stock' });
    const createMovement = useCreateMovement();

    // Filter bottles if a default peptide is provided
    const bottles = defaultPeptideId
        ? allBottles?.filter(b => b.lots?.peptide_id === defaultPeptideId)
        : allBottles;

    const [open, setOpen] = useState(false);
    // Multi-select state
    const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);

    // Auto-select defaults when bottles load
    useEffect(() => {
        if (bottles && bottles.length > 0 && selectedBottleIds.length === 0) {
            // Sort by creation or lot? Usually FIFO (First In First Out) is best.
            // Assuming bottles are returned sorted or we sort them.
            // For now, take the first N available.
            const autoSelect = bottles.slice(0, defaultQuantity).map(b => b.id);
            setSelectedBottleIds(autoSelect);
        }
    }, [bottles, defaultQuantity]);

    const [price, setPrice] = useState<string>('');
    const [paymentStatus, setPaymentStatus] = useState<string>('unpaid');
    const [amountPaid, setAmountPaid] = useState<string>('0');

    // Calculate total cost for all selected
    const selectedBottles = bottles?.filter(b => selectedBottleIds.includes(b.id)) || [];
    const totalCost = selectedBottles.reduce((acc, b) => acc + (b.lots?.cost_per_unit || 0), 0);

    // Auto-fill price with cost when selection changes (if empty or default)
    // Auto-fill price with cost + $4 fee when selection changes (if empty or default)
    useEffect(() => {
        const fee = selectedBottles.length * 4;
        const totalWithFee = totalCost + fee;

        if (selectedBottles.length > 0 && !price) {
            setPrice(totalWithFee.toString());
        } else if (selectedBottles.length > 0 && price === '0') {
            setPrice(totalWithFee.toString());
        }
    }, [selectedBottles.length, totalCost]); // Only update if selection count changes to avoid overriding user input
    // Actually, simpler: Default price to totalCost.

    const toggleBottle = (id: string) => {
        setSelectedBottleIds(prev =>
            prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        if (selectedBottleIds.length === 0) return;

        try {
            // Distribute price and payment across items? 
            // Or just treat 'price' as total sale price.
            // Data model expects price_at_sale per ITEM.
            // We should split the total price evenly or per unit cost?
            // User inputs TOTAL Price usually.
            // Let's split it evenly for simplicity.
            const pricePerItem = parseFloat(price) / selectedBottleIds.length;
            const payPerItem = parseFloat(amountPaid) / selectedBottleIds.length;

            await createMovement.mutateAsync({
                type: 'sale',
                contact_id: contactId,
                movement_date: new Date().toISOString(),
                items: selectedBottleIds.map(id => ({
                    bottle_id: id,
                    price_at_sale: pricePerItem || 0
                })),
                payment_status: paymentStatus as any,
                amount_paid: parseFloat(amountPaid) || 0,
                payment_date: paymentStatus === 'paid' ? new Date().toISOString() : undefined
            });
            onClose();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-4 py-4">
            <div className="grid gap-2">
                <Label>Select Bottles ({selectedBottleIds.length} selected)</Label>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between"
                        >
                            {selectedBottleIds.length > 0
                                ? `${selectedBottleIds.length} bottles selected`
                                : "Select bottles..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                            <CommandInput placeholder="Search inventory..." />
                            <CommandList>
                                <CommandEmpty>No bottle found.</CommandEmpty>
                                <CommandGroup>
                                    {bottles?.map((b) => (
                                        <CommandItem
                                            key={b.id}
                                            value={`${b.uid} ${b.lots?.peptides?.name} ${b.lots?.lot_number}`}
                                            onSelect={() => {
                                                toggleBottle(b.id);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selectedBottleIds.includes(b.id) ? "opacity-100" : "opacity-0"
                                                )}
                                            />
                                            {b.uid} - {b.lots?.peptides?.name} ({b.lots?.lot_number})
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>

            {selectedBottles.length > 0 && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label>Total Sale Price ($)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Base Cost: ${(totalCost).toFixed(2)} + ${(selectedBottles.length * 4).toFixed(2)} Fee
                        </p>
                    </div>
                </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label>Payment Status</Label>
                    <Select value={paymentStatus} onValueChange={(val) => {
                        setPaymentStatus(val);
                        if (val === 'paid') setAmountPaid(price);
                        if (val === 'unpaid') setAmountPaid('0');
                    }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unpaid">Unpaid</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="partial">Partial</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label>Amount Paid ($)</Label>
                    <Input
                        type="number"
                        step="0.01"
                        value={amountPaid}
                        onChange={(e) => setAmountPaid(e.target.value)}
                        disabled={paymentStatus === 'unpaid'}
                    />
                </div>
            </div>

            <DialogFooter className="mt-4">
                <Button onClick={handleSubmit} disabled={selectedBottleIds.length === 0 || createMovement.isPending}>
                    {createMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Assignment ({selectedBottleIds.length})
                </Button>
            </DialogFooter>
        </div>
    );
}
