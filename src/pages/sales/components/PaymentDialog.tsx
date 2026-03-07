import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote } from 'lucide-react';

interface PaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    totalAmount: number;
    amountPaid: number;
    onConfirm: (amount: number, method: string) => void;
}

export function PaymentDialog({
    open,
    onOpenChange,
    totalAmount,
    amountPaid,
    onConfirm,
}: PaymentDialogProps) {
    const remainingBalance = Math.max(0, totalAmount - amountPaid);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('processor');

    // Reset amount to remaining balance when dialog opens
    useEffect(() => {
        if (open) {
            setAmount(remainingBalance.toFixed(2));
            setMethod('processor');
        }
    }, [open, remainingBalance]);

    const parsedAmount = parseFloat(amount) || 0;
    const isValid = parsedAmount > 0 && parsedAmount <= remainingBalance + 0.01; // small float tolerance

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                    <DialogDescription>
                        Order total: ${totalAmount.toFixed(2)} | Paid so far: ${amountPaid.toFixed(2)} | Remaining: ${remainingBalance.toFixed(2)}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Payment Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={remainingBalance}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="pl-7"
                                placeholder="0.00"
                            />
                        </div>
                        {parsedAmount > remainingBalance + 0.01 && (
                            <p className="text-xs text-destructive mt-1">
                                Amount exceeds remaining balance of ${remainingBalance.toFixed(2)}
                            </p>
                        )}
                        {parsedAmount > 0 && parsedAmount < remainingBalance - 0.01 && (
                            <p className="text-xs text-amber-500 mt-1">
                                This is a partial payment. ${(remainingBalance - parsedAmount).toFixed(2)} will remain unpaid.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1 block">Payment Method</label>
                        <Select value={method} onValueChange={setMethod}>
                            <SelectTrigger>
                                <SelectValue placeholder="Payment method" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="processor">Payment Processor (5% fee)</SelectItem>
                                <SelectItem value="zelle">Zelle (no fee)</SelectItem>
                                <SelectItem value="cashapp">Cash App (no fee)</SelectItem>
                                <SelectItem value="venmo">Venmo (no fee)</SelectItem>
                                <SelectItem value="cash">Cash (no fee)</SelectItem>
                                <SelectItem value="wire">Wire Transfer (no fee)</SelectItem>
                                <SelectItem value="credit">Store Credit (no fee)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {method === 'processor' && parsedAmount > 0 && (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                            <Banknote className="h-3 w-3" />
                            Merchant fee: ${(parsedAmount * 0.05).toFixed(2)}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={() => onConfirm(parsedAmount, method)}
                        className="bg-green-600 hover:bg-green-700"
                        disabled={!isValid}
                    >
                        {parsedAmount >= remainingBalance - 0.01 ? 'Confirm Full Payment' : 'Record Partial Payment'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
