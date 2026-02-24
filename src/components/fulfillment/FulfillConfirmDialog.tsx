import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { FulfillConfirmDialogProps } from './types';

export default function FulfillConfirmDialog({
    order,
    onOpenChange,
    onConfirm,
}: FulfillConfirmDialogProps) {
    return (
        <AlertDialog open={!!order} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Fulfill this order?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will deduct inventory for{' '}
                        <strong>Order #{order?.id.slice(0, 8)}</strong>
                        {order?.contacts?.name ? ` (${order.contacts.name})` : ''}:
                        <ul className="mt-2 space-y-1">
                            {order?.sales_order_items?.map(item => (
                                <li key={item.id} className="flex items-center gap-2">
                                    <span className="font-medium">{item.quantity}x</span> {item.peptides?.name}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-amber-500 font-medium">
                            Bottles will be marked as sold and removed from available stock.
                        </p>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-green-600 hover:bg-green-700"
                        onClick={onConfirm}
                    >
                        Confirm & Fulfill
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
