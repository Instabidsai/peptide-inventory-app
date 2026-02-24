import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePeptides } from '@/hooks/use-peptides';
import { useOrgWholesaleTier, calculateWholesalePrice } from '@/hooks/use-wholesale-pricing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Package, Minus, Plus, ShoppingCart, Loader2 } from 'lucide-react';

interface CartItem {
    peptide_id: string;
    name: string;
    quantity: number;
    base_cost: number;
    wholesale_price: number;
}

function useCreateSupplierOrder() {
    const { session } = useAuth();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: { items: { peptide_id: string; quantity: number; unit_price: number }[] }) => {
            const { data, error } = await supabase.functions.invoke('create-supplier-order', {
                body: payload,
                headers: {
                    Authorization: `Bearer ${session?.access_token}`,
                },
            });
            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Order creation failed');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
        },
    });
}

export default function SupplierOrderDialog() {
    const [open, setOpen] = useState(false);
    const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
    const { toast } = useToast();

    const { data: peptides, isLoading: peptidesLoading } = usePeptides();
    const { data: tierInfo, isLoading: tierLoading } = useOrgWholesaleTier();
    const createOrder = useCreateSupplierOrder();

    const markupAmount = tierInfo?.tier?.markup_amount || 0;
    const tierName = tierInfo?.tier?.name || 'Standard';

    // Only show peptides that have a base_cost set
    const catalogPeptides = (peptides || []).filter(p => (p.base_cost ?? 0) > 0);

    const updateQty = (peptide: typeof catalogPeptides[0], delta: number) => {
        const newCart = new Map(cart);
        const existing = newCart.get(peptide.id);
        const currentQty = existing?.quantity || 0;
        const newQty = Math.max(0, currentQty + delta);

        if (newQty === 0) {
            newCart.delete(peptide.id);
        } else {
            newCart.set(peptide.id, {
                peptide_id: peptide.id,
                name: peptide.name,
                quantity: newQty,
                base_cost: peptide.base_cost!,
                wholesale_price: calculateWholesalePrice(peptide.base_cost!, markupAmount),
            });
        }
        setCart(newCart);
    };

    const setQty = (peptide: typeof catalogPeptides[0], qty: number) => {
        const newCart = new Map(cart);
        const safeQty = Math.max(0, Math.floor(qty));

        if (safeQty === 0) {
            newCart.delete(peptide.id);
        } else {
            newCart.set(peptide.id, {
                peptide_id: peptide.id,
                name: peptide.name,
                quantity: safeQty,
                base_cost: peptide.base_cost!,
                wholesale_price: calculateWholesalePrice(peptide.base_cost!, markupAmount),
            });
        }
        setCart(newCart);
    };

    const cartItems = Array.from(cart.values());
    const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);
    const totalCost = cartItems.reduce((s, i) => s + i.wholesale_price * i.quantity, 0);

    const handleSubmit = async () => {
        if (cartItems.length === 0) return;

        try {
            await createOrder.mutateAsync({
                items: cartItems.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                    unit_price: i.wholesale_price,
                })),
            });

            toast({ title: 'Order placed!', description: `${totalItems} units ordered for $${totalCost.toFixed(2)}` });
            setCart(new Map());
            setOpen(false);
        } catch (err) {
            toast({
                variant: 'destructive',
                title: 'Order failed',
                description: err instanceof Error ? err.message : 'Could not place order',
            });
        }
    };

    const isLoading = peptidesLoading || tierLoading;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Package className="h-4 w-4 mr-2" /> Restock from Supplier
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Order from Supplier
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                ) : !tierInfo?.supplier_org_id ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p className="font-medium">No supplier connected</p>
                        <p className="text-sm">Contact support to connect to a supplier catalog.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                                Your tier: <Badge variant="outline">{tierName}</Badge> (cost + ${markupAmount.toFixed(0)})
                            </span>
                            {totalItems > 0 && (
                                <Badge>{totalItems} items in cart</Badge>
                            )}
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Your Cost</TableHead>
                                    <TableHead className="text-center">Quantity</TableHead>
                                    <TableHead className="text-right">Subtotal</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {catalogPeptides.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                            No products in catalog
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    catalogPeptides.map(p => {
                                        const wholesalePrice = calculateWholesalePrice(p.base_cost!, markupAmount);
                                        const qty = cart.get(p.id)?.quantity || 0;
                                        return (
                                            <TableRow key={p.id} className={qty > 0 ? 'bg-primary/5' : ''}>
                                                <TableCell className="font-medium">{p.name}</TableCell>
                                                <TableCell className="text-right font-medium text-green-600">
                                                    ${wholesalePrice.toFixed(2)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => updateQty(p, -1)}
                                                            disabled={qty === 0}
                                                        >
                                                            <Minus className="h-3 w-3" />
                                                        </Button>
                                                        <Input
                                                            type="number"
                                                            min={0}
                                                            value={qty || ''}
                                                            onChange={e => setQty(p, parseInt(e.target.value) || 0)}
                                                            className="w-14 h-7 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                        />
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => updateQty(p, 1)}
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {qty > 0 ? `$${(wholesalePrice * qty).toFixed(2)}` : '\u2014'}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                            {totalItems > 0 && (
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={2} className="font-semibold">Order Total</TableCell>
                                        <TableCell className="text-center font-semibold">{totalItems} units</TableCell>
                                        <TableCell className="text-right font-bold text-lg">
                                            ${totalCost.toFixed(2)}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button
                        disabled={totalItems === 0 || createOrder.isPending}
                        onClick={handleSubmit}
                    >
                        {createOrder.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Placing Order...</>
                        ) : (
                            <>Place Order (${totalCost.toFixed(2)})</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
