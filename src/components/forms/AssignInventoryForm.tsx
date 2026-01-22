
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

export function AssignInventoryForm({ contactId, onClose }: { contactId: string, onClose: () => void }) {
    const { data: bottles } = useBottles({ status: 'in_stock' });
    const createMovement = useCreateMovement();

    const [open, setOpen] = useState(false);
    const [selectedBottleId, setSelectedBottleId] = useState<string>('');
    const [price, setPrice] = useState<string>('');
    const [paymentStatus, setPaymentStatus] = useState<string>('unpaid');
    const [amountPaid, setAmountPaid] = useState<string>('0');

    const selectedBottle = bottles?.find(b => b.id === selectedBottleId);

    // Auto-fill price with cost when bottle selected
    useEffect(() => {
        if (selectedBottle && !price) {
            setPrice(selectedBottle.lots?.cost_per_unit.toString() || '0');
        }
    }, [selectedBottle]);

    const handleSubmit = async () => {
        if (!selectedBottleId) return;

        try {
            await createMovement.mutateAsync({
                type: 'sale',
                contact_id: contactId,
                movement_date: new Date().toISOString(),
                items: [{
                    bottle_id: selectedBottleId,
                    price_at_sale: parseFloat(price) || 0
                }],
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
                <Label>Select Bottle</Label>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between"
                        >
                            {selectedBottleId
                                ? (() => {
                                    const b = bottles?.find((b) => b.id === selectedBottleId);
                                    return b ? `${b.uid} - ${b.lots?.peptides?.name} (${b.lots?.lot_number})` : "Select bottle...";
                                })()
                                : "Search inventory..."}
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
                                                setSelectedBottleId(b.id === selectedBottleId ? "" : b.id);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mr-2 h-4 w-4",
                                                    selectedBottleId === b.id ? "opacity-100" : "opacity-0"
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

            {selectedBottle && (
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label>Sale Price ($)</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Cost: ${selectedBottle.lots?.cost_per_unit}
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
                <Button onClick={handleSubmit} disabled={!selectedBottleId || createMovement.isPending}>
                    {createMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Assignment
                </Button>
            </DialogFooter>
        </div>
    );
}
