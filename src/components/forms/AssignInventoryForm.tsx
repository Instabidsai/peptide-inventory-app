
import { useState, useEffect } from "react";
import { useBottles } from "@/hooks/use-bottles";
import { useCreateMovement } from "@/hooks/use-movements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DialogFooter } from "@/components/ui/dialog";
import { Loader2, Check, ChevronsUpDown, DollarSign, Gift, Home } from "lucide-react";
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

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function AssignInventoryForm({
    contactId,
    onClose,
    defaultPeptideId,
    defaultQuantity = 1,
    protocolItemId
}: {
    contactId: string,
    onClose: () => void,
    defaultPeptideId?: string,
    defaultQuantity?: number,
    protocolItemId?: string
}) {
    const { data: allBottles } = useBottles({ status: 'in_stock' });
    const createMovement = useCreateMovement();

    // Filter bottles if a default peptide is provided
    const bottles = defaultPeptideId
        ? allBottles?.filter(b => b.lots?.peptide_id === defaultPeptideId)
        : allBottles;

    const [open, setOpen] = useState(false);
    // Multi-select state
    const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);

    // Movement Type state
    const [movementType, setMovementType] = useState<'sale' | 'giveaway' | 'internal_use'>('sale');

    // Auto-select defaults only if we have a specific target peptide (e.g. from Regimen flow)
    useEffect(() => {
        if (defaultPeptideId && bottles && bottles.length > 0 && selectedBottleIds.length === 0) {
            // Sort by creation or lot? Usually FIFO (First In First Out) is best.
            // Assuming bottles are returned sorted or we sort them.
            // For now, take the first N available.
            const autoSelect = bottles.slice(0, defaultQuantity).map(b => b.id);
            setSelectedBottleIds(autoSelect);
        }
    }, [bottles, defaultQuantity, defaultPeptideId]);

    const [price, setPrice] = useState<string>('');
    const [paymentStatus, setPaymentStatus] = useState<string>('unpaid');
    const [amountPaid, setAmountPaid] = useState<string>('0');
    const [isPriceDirty, setIsPriceDirty] = useState(false);

    // Calculate total cost for all selected
    const selectedBottles = bottles?.filter(b => selectedBottleIds.includes(b.id)) || [];
    const totalCost = selectedBottles.reduce((acc, b) => acc + (b.lots?.cost_per_unit || 0), 0);

    // Auto-fill price with cost + $4 fee when selection changes
    useEffect(() => {
        if (movementType !== 'sale') {
            setPrice('0');
            setPaymentStatus('paid');
            setAmountPaid('0');
            return;
        }

        const fee = selectedBottles.length * 4;
        const totalWithFee = totalCost + fee;
        const totalMSRP = selectedBottles.reduce((acc, b) => acc + (b.lots?.peptides?.retail_price || 0), 0);

        // Auto-update price only if the user hasn't manually edited it
        // Default to cost + $4/bottle fee (family/internal pricing)
        if (!isPriceDirty) {
            setPrice(totalWithFee.toFixed(2));
        }
    }, [selectedBottles.length, totalCost, movementType, isPriceDirty, JSON.stringify(selectedBottles.map(b => b.lots?.peptides?.retail_price))]);

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
            const pricePerItem = parseFloat(price) / selectedBottleIds.length;

            await createMovement.mutateAsync({
                type: movementType,
                contact_id: contactId,
                movement_date: new Date().toISOString(),
                items: selectedBottleIds.map(id => ({
                    bottle_id: id,
                    price_at_sale: pricePerItem || 0,
                    protocol_item_id: protocolItemId
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
                                ? (selectedBottleIds.length + " bottles selected")
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
                                            value={b.uid + " " + (b.lots?.peptides?.name || "") + " " + (b.lots?.lot_number || "")}
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

            {/* Movement Type Selector */}
            <div className="space-y-3 border p-4 rounded-md bg-muted/20">
                <Label className="text-sm font-medium">Assignment Type</Label>
                <RadioGroup value={movementType} onValueChange={(v: any) => setMovementType(v)} className="grid grid-cols-3 gap-2">
                    <div>
                        <RadioGroupItem value="sale" id="type-sale" className="peer sr-only" />
                        <Label
                            htmlFor="type-sale"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer"
                        >
                            <DollarSign className="mb-2 h-4 w-4 text-emerald-600" />
                            <span className="text-xs">Sale</span>
                        </Label>
                    </div>
                    <div>
                        <RadioGroupItem value="giveaway" id="type-giveaway" className="peer sr-only" />
                        <Label
                            htmlFor="type-giveaway"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer"
                        >
                            <Gift className="mb-2 h-4 w-4 text-purple-600" />
                            <span className="text-xs">Giveaway</span>
                        </Label>
                    </div>
                    <div>
                        <RadioGroupItem value="internal_use" id="type-internal" className="peer sr-only" />
                        <Label
                            htmlFor="type-internal"
                            className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer"
                        >
                            <Home className="mb-2 h-4 w-4 text-blue-600" />
                            <span className="text-xs">Internal</span>
                        </Label>
                    </div>
                </RadioGroup>

                {movementType === 'giveaway' && (
                    <p className="text-xs text-muted-foreground bg-purple-500/10 p-2 rounded border border-purple-500/20">
                        Tracks cost as overhead. Client not charged.
                    </p>
                )}
                {movementType === 'internal_use' && (
                    <p className="text-xs text-muted-foreground bg-blue-500/10 p-2 rounded border border-blue-500/20">
                        For personal/family use. Tracks cost as overhead.
                    </p>
                )}
            </div>

            {selectedBottles.length > 0 && (() => {
                const calculatedTotalCost = selectedBottles.reduce((acc, b) => acc + (b.lots?.cost_per_unit || 0), 0);
                const totalMSRP = selectedBottles.reduce((acc, b) => acc + (b.lots?.peptides?.retail_price || 0), 0);
                const fees = selectedBottles.length * 4;
                const costPlusFees = calculatedTotalCost + fees;

                return (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <div className="flex justify-between items-center">
                                <Label>Total Sale Price ($)</Label>
                                {isPriceDirty && (
                                    <Button
                                        variant="link"
                                        className="h-auto p-0 text-xs"
                                        onClick={() => setIsPriceDirty(false)}
                                    >
                                        Reset to Auto
                                    </Button>
                                )}
                            </div>

                            {/* MSRP / Discount Selector */}
                            {movementType === 'sale' && totalMSRP > 0 && (
                                <Select onValueChange={(val) => {
                                    setPrice(parseFloat(val).toFixed(2));
                                    setIsPriceDirty(true);
                                }}>
                                    <SelectTrigger className="w-full mb-2">
                                        <SelectValue placeholder="Quick Select Price..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={totalMSRP.toString()}>
                                            MSRP: ${totalMSRP.toFixed(2)}
                                        </SelectItem>
                                        <SelectItem value={(totalMSRP * 0.9).toString()}>
                                            MSRP - 10%: ${(totalMSRP * 0.9).toFixed(2)}
                                        </SelectItem>
                                        <SelectItem value={(totalMSRP * 0.8).toString()}>
                                            MSRP - 20%: ${(totalMSRP * 0.8).toFixed(2)}
                                        </SelectItem>
                                        <SelectItem value={(totalMSRP * 0.7).toString()}>
                                            MSRP - 30%: ${(totalMSRP * 0.7).toFixed(2)}
                                        </SelectItem>
                                        <SelectItem value={costPlusFees.toString()}>
                                            Cost + Fees: ${costPlusFees.toFixed(2)}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            )}

                            <Input
                                type="number"
                                step="0.01"
                                value={price}
                                onChange={(e) => {
                                    setPrice(e.target.value);
                                    setIsPriceDirty(true);
                                }}
                                disabled={movementType !== 'sale'}
                            />
                            {!movementType.match(/^(giveaway|internal_use)$/) && (
                                <div className="flex flex-col gap-1 text-xs text-muted-foreground mt-1">
                                    <div className="flex justify-between">
                                        <span>Base: ${calculatedTotalCost.toFixed(2)} + Fees: ${fees.toFixed(2)}</span>
                                        <span>Cost Basis: ${costPlusFees.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between font-medium">
                                        <span>MSRP Total: ${totalMSRP > 0 ? totalMSRP.toFixed(2) : 'N/A'}</span>
                                        <span className={cn(
                                            parseFloat(price) < costPlusFees ? "text-destructive" : "text-emerald-600"
                                        )}>
                                            ${(parseFloat(price) / selectedBottles.length || 0).toFixed(2)} / bottle
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}

            <Separator />

            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label>Payment Status</Label>
                    <Select value={paymentStatus} onValueChange={(val) => {
                        setPaymentStatus(val);
                        if (val === 'paid') setAmountPaid(price);
                        if (val === 'unpaid') setAmountPaid('0');
                    }} disabled={movementType !== 'sale'}>
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
                        disabled={paymentStatus === 'unpaid' || movementType !== 'sale'}
                    />
                </div>
            </div>

            <DialogFooter className="mt-4">
                <Button onClick={handleSubmit} disabled={selectedBottleIds.length === 0 || createMovement.isPending}>
                    {createMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {movementType === 'giveaway' ? ("Distribute " + selectedBottleIds.length + " Free Bottle(s)") :
                        movementType === 'internal_use' ? ("Assign " + selectedBottleIds.length + " to Internal Use") :
                            ("Confirm Sale(" + selectedBottleIds.length + ")")}
                </Button>
            </DialogFooter>
        </div>
    );
}

