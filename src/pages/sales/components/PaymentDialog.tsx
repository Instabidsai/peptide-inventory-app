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
import { Banknote } from 'lucide-react';

interface PaymentDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    totalAmount: number;
    selectedPaymentMethod: string;
    setSelectedPaymentMethod: (method: string) => void;
    onConfirm: () => void;
}

export function PaymentDialog({
    open,
    onOpenChange,
    totalAmount,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    onConfirm
}: PaymentDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Mark as Paid</DialogTitle>
                    <DialogDescription>
                        Select how this ${totalAmount.toFixed(2)} payment was received.
                        A 5% merchant fee applies for processor payments.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
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
                    {selectedPaymentMethod === 'processor' && (
                        <p className="text-xs text-amber-500 flex items-center gap-1">
                            <Banknote className="h-3 w-3" />
                            Merchant fee: ${(totalAmount * 0.05).toFixed(2)}
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onConfirm} className="bg-green-600 hover:bg-green-700">
                        Confirm Payment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
