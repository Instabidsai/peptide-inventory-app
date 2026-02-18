import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useCheckout } from '@/hooks/use-checkout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShoppingCart,
    Package,
    Plus,
    Minus,
    CreditCard,
    Loader2,
    Search,
    Info,
    Percent,
} from 'lucide-react';
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

interface CartItem {
    peptide_id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function ClientStore() {
    const { user } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const checkout = useCheckout();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);

    // Auto-fill shipping address from contact profile
    useEffect(() => {
        if (contact && contact.address && !shippingAddress) {
            setShippingAddress(contact.address);
        }
    }, [contact]);

    // Get all active peptides
    const { data: peptides, isLoading, isError } = useQuery({
        queryKey: ['client_store_peptides'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('peptides')
                .select('*')
                .eq('active', true)
                .order('name');
            if (error) throw error;
            return data;
        },
    });

    // Get the assigned rep for this client (for commission tracking + pricing discount)
    const { data: assignedRep } = useQuery({
        queryKey: ['client_assigned_rep', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return null;
            // The contact's assigned_rep_id field links to a profile
            if (!contact.assigned_rep_id) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, commission_rate, price_multiplier, partner_tier, pricing_mode, cost_plus_markup')
                .eq('id', contact.assigned_rep_id)
                .single();
            return data;
        },
        enabled: !!contact?.id,
    });

    // Fetch avg lot costs for cost_plus pricing (only if rep uses cost_plus mode)
    const repPricingMode = assignedRep?.pricing_mode || 'percentage';
    const { data: lotCosts } = useQuery({
        queryKey: ['client_lot_costs'],
        queryFn: async () => {
            const { data: lots } = await supabase
                .from('lots')
                .select('peptide_id, cost_per_unit')
                .gt('cost_per_unit', 0);
            if (!lots) return {};
            const costMap: Record<string, { total: number; count: number }> = {};
            lots.forEach((l) => {
                const pid = l.peptide_id;
                if (!costMap[pid]) costMap[pid] = { total: 0, count: 0 };
                costMap[pid].total += Number(l.cost_per_unit);
                costMap[pid].count += 1;
            });
            const result: Record<string, number> = {};
            Object.entries(costMap).forEach(([pid, { total, count }]) => {
                result[pid] = total / count;
            });
            return result;
        },
        enabled: !!assignedRep && repPricingMode === 'cost_plus',
    });

    // Calculate client price: if rep assigned, apply rep's pricing model; otherwise retail
    const getClientPrice = (peptide: { id: string; retail_price?: number | null }): number => {
        const retail = Number(peptide.retail_price || 0);
        if (!assignedRep) return retail;

        const mode = assignedRep.pricing_mode || 'percentage';
        const multiplier = Number(assignedRep.price_multiplier) || 1.0;
        const markup = Number(assignedRep.cost_plus_markup) || 0;

        if (mode === 'cost_plus' && lotCosts) {
            const avgCost = lotCosts[peptide.id] || 0;
            if (avgCost > 0) {
                return Math.round((avgCost + markup) * 100) / 100;
            }
            // Fallback to percentage if no lot cost data
        }

        // percentage mode
        return Math.round(retail * multiplier * 100) / 100;
    };

    const addToCart = (peptide: { id: string; name: string; retail_price?: number | null }) => {
        const price = getClientPrice(peptide);
        setCart(prev => {
            const existing = prev.find(i => i.peptide_id === peptide.id);
            if (existing) {
                return prev.map(i =>
                    i.peptide_id === peptide.id
                        ? { ...i, quantity: i.quantity + 1 }
                        : i
                );
            }
            return [...prev, {
                peptide_id: peptide.id,
                name: peptide.name,
                price,
                quantity: 1,
            }];
        });
    };

    const updateQuantity = (peptideId: string, delta: number) => {
        setCart(prev =>
            prev.map(i => {
                if (i.peptide_id !== peptideId) return i;
                const newQty = Math.max(0, i.quantity + delta);
                return { ...i, quantity: newQty };
            }).filter(i => i.quantity > 0)
        );
    };

    const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

    // Filter peptides by search query
    const filteredPeptides = peptides?.filter((p) => {
        if (!searchQuery) return true;
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Checkout handler — creates order + redirects to PsiFi payment
    const handleCheckout = async () => {
        if (!user?.id) return;
        if (cart.length === 0) return;

        // Get org_id from profile
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('id, org_id')
            .eq('user_id', user.id)
            .single();

        if (!userProfile) return;
        const orgId = userProfile.org_id;
        if (!orgId) return;

        const repId = assignedRep ? assignedRep.id : null;

        checkout.mutate({
            org_id: orgId,
            client_id: contact?.id || null,
            rep_id: repId,
            total_amount: cartTotal,
            shipping_address: shippingAddress || undefined,
            notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}.\n${notes}`,
            items: cart.map(i => ({
                peptide_id: i.peptide_id,
                name: i.name,
                quantity: i.quantity,
                unit_price: i.price,
            })),
        });
    };

    if (isLoadingContact) {
        return (
            <div className="space-y-6 pb-20">
                <div>
                    <Skeleton className="h-7 w-40 mb-2" />
                    <Skeleton className="h-4 w-56" />
                </div>
                <Skeleton className="h-10 w-full rounded-md" />
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <GlassCard key={i}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-3 w-16" />
                                        <Skeleton className="h-6 w-20 mt-1" />
                                    </div>
                                    <Skeleton className="h-9 w-16 rounded-md" />
                                </div>
                            </CardContent>
                        </GlassCard>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Order Peptides</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Browse and order peptides directly from your portal
                </p>
            </div>

            {/* Partner discount banner */}
            {assignedRep && Number(assignedRep.price_multiplier || 1) < 1 && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06]">
                    <Percent className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-300">
                        Partner pricing active — you're getting <strong>{Math.round((1 - Number(assignedRep.price_multiplier)) * 100)}% off</strong> retail on all products.
                    </p>
                </div>
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    aria-label="Search store"
                    placeholder="Search peptides..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* Product Grid */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Package className="h-5 w-5 text-primary" />
                    Available Peptides
                    {filteredPeptides && (
                        <Badge variant="secondary" className="text-xs">
                            {filteredPeptides.length} products
                        </Badge>
                    )}
                </h2>

                {isLoading ? (
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <GlassCard key={i}>
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-28" />
                                            <Skeleton className="h-3 w-16" />
                                            <Skeleton className="h-6 w-20 mt-1" />
                                        </div>
                                        <Skeleton className="h-9 w-16 rounded-md" />
                                    </div>
                                </CardContent>
                            </GlassCard>
                        ))}
                    </div>
                ) : isError ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p className="text-sm">Failed to load products. Please try refreshing the page.</p>
                    </div>
                ) : filteredPeptides?.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">{searchQuery ? 'No peptides match your search.' : 'No peptides available right now.'}</p>
                    </div>
                ) : (
                    <motion.div
                        className="grid gap-3 grid-cols-1 sm:grid-cols-2"
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
                    >
                        {filteredPeptides?.map((peptide) => {
                            const price = getClientPrice(peptide);
                            const retail = Number(peptide.retail_price || 0);
                            const hasDiscount = assignedRep && price < retail;
                            const inCart = cart.find(i => i.peptide_id === peptide.id);

                            if (price <= 0 && retail <= 0) return null; // Skip items without a price

                            return (
                                <motion.div key={peptide.id} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} whileTap={{ scale: 0.98 }}>
                                <GlassCard className="hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{peptide.name}</p>
                                                {peptide.sku && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">SKU: {peptide.sku}</p>
                                                )}
                                                <div className="flex items-baseline gap-2 mt-1">
                                                    <p className="text-xl font-bold text-primary">
                                                        ${price.toFixed(2)}
                                                    </p>
                                                    {hasDiscount && (
                                                        <span className="text-sm text-muted-foreground line-through">
                                                            ${retail.toFixed(2)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                {inCart ? (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-9 w-9"
                                                            onClick={() => updateQuantity(peptide.id, -1)}
                                                            aria-label={`Decrease quantity of ${peptide.name}`}
                                                        >
                                                            <Minus className="h-4 w-4" />
                                                        </Button>
                                                        <span className="w-6 text-center text-sm font-medium">
                                                            {inCart.quantity}
                                                        </span>
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-9 w-9"
                                                            onClick={() => updateQuantity(peptide.id, 1)}
                                                            aria-label={`Increase quantity of ${peptide.name}`}
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => addToCart(peptide)}
                                                        className="flex items-center gap-1"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                        Add
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </GlassCard>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </div>

            {/* Cart Summary — Fixed Bottom Card */}
            <AnimatePresence>
            {cart.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 24, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 24, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                >
                <GlassCard className="border-primary/20 shadow-lg shadow-primary/5 ring-1 ring-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <ShoppingCart className="h-5 w-5" />
                            Your Order
                        </CardTitle>
                        <CardDescription>
                            {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Cart items compact list */}
                        <div className="space-y-2">
                            {cart.map(item => (
                                <div key={item.peptide_id} className="flex items-center justify-between text-sm">
                                    <div className="flex-1 min-w-0">
                                        <p className="truncate font-medium">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            ${item.price.toFixed(2)} × {item.quantity}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => updateQuantity(item.peptide_id, -1)}
                                            aria-label={`Decrease quantity of ${item.name}`}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => updateQuantity(item.peptide_id, 1)}
                                            aria-label={`Increase quantity of ${item.name}`}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="font-semibold w-16 text-right">
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Total */}
                        <div className="border-t pt-3 flex justify-between items-center">
                            <span className="text-muted-foreground">Total</span>
                            <span className="text-xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                        </div>

                        {/* Shipping */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Shipping Address</label>
                            <Textarea
                                placeholder="Enter your shipping address..."
                                value={shippingAddress}
                                onChange={e => setShippingAddress(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Notes (optional)</label>
                            <Input
                                placeholder="Any special instructions..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                            />
                        </div>

                        {/* Checkout with Payment */}
                        <Button
                            className="w-full shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                            size="lg"
                            onClick={() => setShowCheckoutConfirm(true)}
                            disabled={checkout.isPending || cart.length === 0}
                        >
                            {checkout.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <CreditCard className="h-4 w-4 mr-2" />
                            )}
                            Checkout — ${cartTotal.toFixed(2)}
                        </Button>
                    </CardContent>
                </GlassCard>
                </motion.div>
            )}
            </AnimatePresence>

            {/* Info card */}
            <Card className="bg-muted/20 border-muted/50">
                <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">
                            You'll be redirected to our secure payment processor to complete your order.
                            Once payment is confirmed, your order will be processed and shipped.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Checkout confirmation dialog */}
            <AlertDialog open={showCheckoutConfirm} onOpenChange={setShowCheckoutConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Order</AlertDialogTitle>
                        <AlertDialogDescription>
                            You're about to checkout with {itemCount} item{itemCount !== 1 ? 's' : ''} for <span className="font-semibold text-foreground">${cartTotal.toFixed(2)}</span>. You'll be redirected to our secure payment page.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Go Back</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCheckout}>
                            <CreditCard className="h-4 w-4 mr-2" />
                            Proceed to Payment
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
