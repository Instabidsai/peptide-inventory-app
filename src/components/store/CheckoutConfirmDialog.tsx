import React from 'react';
import { CreditCard } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CheckoutConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemCount: number;
    cartTotal: number;
    onConfirm: () => void;
}

export function CheckoutConfirmDialog({
    open,
    onOpenChange,
    itemCount,
    cartTotal,
    onConfirm,
}: CheckoutConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Order</AlertDialogTitle>
                    <AlertDialogDescription>
                        You're about to checkout with {itemCount} item{itemCount !== 1 ? 's' : ''} for <span className="font-semibold text-foreground">${cartTotal.toFixed(2)}</span>. You'll be redirected to our secure payment page.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Go Back</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Proceed to Payment
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
