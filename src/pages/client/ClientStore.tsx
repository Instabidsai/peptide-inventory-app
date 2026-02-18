import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useCheckout } from '@/hooks/use-checkout';
import { useCreateSalesOrder } from '@/hooks/use-sales-orders';
import { useToast } from '@/hooks/use-toast';
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
    Shield,
    ChevronDown,
    X,
    Banknote,
    Smartphone,
    ExternalLink,
    Check,
    Copy,
    Heart,
    TrendingUp,
    Flame,
    Brain,
    Moon,
    Sparkles,
    LayoutGrid,
    Layers,
} from 'lucide-react';
import { PROTOCOL_TEMPLATES, PROTOCOL_KNOWLEDGE } from '@/data/protocol-knowledge';
import type { ProtocolTemplate } from '@/data/protocol-knowledge';
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
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

type PaymentMethod = 'card' | 'zelle' | 'cashapp' | 'venmo';

const ZELLE_EMAIL = 'admin@nextgenresearchlabs.com';
const VENMO_HANDLE = 'PureUSPeptide';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid,
};

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
    const createOrder = useCreateSalesOrder();
    const { toast } = useToast();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
    const [selectedPeptide, setSelectedPeptide] = useState<any>(null);
    const [selectedProtocol, setSelectedProtocol] = useState<{ template: ProtocolTemplate; matched: any[] } | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
    const [copiedZelle, setCopiedZelle] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const cartRef = React.useRef<HTMLDivElement>(null);

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

    const copyZelleEmail = () => {
        navigator.clipboard.writeText(ZELLE_EMAIL);
        setCopiedZelle(true);
        setTimeout(() => setCopiedZelle(false), 2000);
    };

    // Card checkout — PsiFi payment redirect
    const handleCardCheckout = async () => {
        if (!user?.id) return;
        if (cart.length === 0) return;

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

    // Non-card checkout — creates order as awaiting payment
    const handleAlternativeCheckout = async () => {
        if (!contact?.id || cart.length === 0) return;
        setPlacingOrder(true);

        const methodLabel = paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo';

        try {
            await createOrder.mutateAsync({
                client_id: contact.id,
                items: cart.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                    unit_price: i.price,
                })),
                shipping_address: shippingAddress || undefined,
                notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}. Payment via ${methodLabel}.\n${notes}`,
                payment_method: paymentMethod,
            });
            setOrderPlaced(true);
            setCart([]);
            setNotes('');
            toast({ title: 'Order placed!', description: `Send $${cartTotal.toFixed(2)} via ${methodLabel} to complete your order.` });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Order failed', description: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setPlacingOrder(false);
        }
    };

    const handleCheckout = () => {
        if (paymentMethod === 'card') {
            handleCardCheckout();
        } else {
            handleAlternativeCheckout();
        }
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
                <h1 className="text-2xl font-bold tracking-tight">Peptide Collection</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Premium research compounds delivered to your door
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

            {/* Protocol Bundles */}
            {!searchQuery && peptides && peptides.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                        <Layers className="h-5 w-5 text-primary" />
                        Recommended Protocols
                    </h2>
                    <p className="text-xs text-muted-foreground/60 mb-4">
                        Pre-built peptide combinations for specific goals
                    </p>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {PROTOCOL_TEMPLATES
                            .filter(t => t.category !== 'full') // hide the 11-peptide mega bundle
                            .filter(t => !t.defaultTierId) // hide variant tiers (Injury, Gentle) — keep main ones
                            .map(template => {
                                const Icon = ICON_MAP[template.icon] || Package;
                                // Match template peptide names to actual peptides in DB
                                // DB names include size (e.g. "BPC-157 10mg") so use startsWith
                                const matchedPeptides = template.peptideNames
                                    .map(name => peptides.find(p => p.name?.toLowerCase().startsWith(name.toLowerCase())))
                                    .filter(Boolean) as any[];
                                // Deduplicate for display (but keep full list for quantities)
                                const uniqueMatched = [...new Map(matchedPeptides.map((p: any) => [p.id, p])).values()];
                                const bundlePrice = matchedPeptides.reduce((sum: number, p: any) => sum + getClientPrice(p), 0);
                                // Count expected qty per peptide from template
                                const expectedQty: Record<string, number> = {};
                                matchedPeptides.forEach((p: any) => { expectedQty[p.id] = (expectedQty[p.id] || 0) + 1; });
                                const allInCart = uniqueMatched.length > 0 && uniqueMatched.every(p => {
                                    const inCart = cart.find(c => c.peptide_id === p.id);
                                    return inCart && inCart.quantity >= (expectedQty[p.id] || 1);
                                });

                                if (matchedPeptides.length === 0) return null; // skip if no matching peptides in stock

                                return (
                                    <motion.div key={template.name} whileTap={{ scale: 0.98 }}>
                                        <GlassCard
                                            className="hover:border-primary/30 transition-all duration-200 cursor-pointer"
                                            onClick={() => setSelectedProtocol({ template, matched: matchedPeptides })}
                                        >
                                            <CardContent className="p-4 space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                                        <Icon className="h-4.5 w-4.5 text-primary" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-sm">{template.name}</p>
                                                        <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{template.description}</p>
                                                    </div>
                                                    <Info className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-1" />
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {uniqueMatched.map((p: any) => (
                                                        <Badge key={p.id} variant="secondary" className="text-[10px] px-2 py-0.5">
                                                            {expectedQty[p.id] > 1 ? `${expectedQty[p.id]}x ` : ''}{p.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                                <div className="flex items-center justify-between pt-1">
                                                    <span className="text-lg font-bold text-primary">${bundlePrice.toFixed(2)}</span>
                                                    {allInCart ? (
                                                        <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                                                            <Check className="h-4 w-4" />
                                                            In Cart
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                matchedPeptides.forEach((p: any) => addToCart(p));
                                                            }}
                                                        >
                                                            <Plus className="h-4 w-4 mr-1" />
                                                            Add All
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </GlassCard>
                                    </motion.div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Product Grid */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Package className="h-5 w-5 text-primary" />
                    Our Collection
                    {filteredPeptides && (
                        <Badge variant="secondary" className="text-xs">
                            {filteredPeptides.length}
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
                                <GlassCard
                                    className="hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 group cursor-pointer"
                                    onClick={() => setSelectedPeptide(peptide)}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{peptide.name}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <Shield className="h-3 w-3 text-emerald-400" />
                                                    <span className="text-[10px] text-emerald-400 font-medium">Research Grade</span>
                                                </div>
                                                <div className="flex items-baseline gap-2 mt-1.5">
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
                                            <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
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
                    ref={cartRef}
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

                        {/* Payment Method Selection */}
                        {!orderPlaced ? (
                            <div className="space-y-3">
                                <label className="text-sm font-medium">Payment Method</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { id: 'card' as PaymentMethod, label: 'Card', icon: CreditCard },
                                        { id: 'zelle' as PaymentMethod, label: 'Zelle', icon: Banknote },
                                        { id: 'cashapp' as PaymentMethod, label: 'Cash App', icon: Smartphone },
                                        { id: 'venmo' as PaymentMethod, label: 'Venmo', icon: Smartphone },
                                    ]).map(m => (
                                        <Button
                                            key={m.id}
                                            variant={paymentMethod === m.id ? 'default' : 'outline'}
                                            size="sm"
                                            className="justify-start"
                                            onClick={() => setPaymentMethod(m.id)}
                                        >
                                            <m.icon className="h-4 w-4 mr-2" />
                                            {m.label}
                                        </Button>
                                    ))}
                                </div>

                                {/* Zelle info */}
                                {paymentMethod === 'zelle' && (
                                    <div className="bg-purple-950/30 border border-purple-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-purple-300">Send payment via Zelle to:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 text-sm font-mono bg-background rounded px-2 py-1 border truncate">
                                                {ZELLE_EMAIL}
                                            </code>
                                            <Button variant="outline" size="sm" onClick={copyZelleEmail} className="shrink-0" aria-label="Copy Zelle email">
                                                {copiedZelle ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via your bank's Zelle. We'll confirm when received.
                                        </p>
                                    </div>
                                )}

                                {/* Cash App info */}
                                {paymentMethod === 'cashapp' && (
                                    <div className="bg-green-950/30 border border-green-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-green-300">Pay via Cash App</p>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via Cash App. We'll confirm when received.
                                        </p>
                                    </div>
                                )}

                                {/* Venmo info */}
                                {paymentMethod === 'venmo' && (
                                    <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-medium text-blue-300">Pay via Venmo to @{VENMO_HANDLE}</p>
                                        <a
                                            href={`https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Open Venmo — ${cartTotal.toFixed(2)}
                                        </a>
                                        <p className="text-xs text-muted-foreground">
                                            Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via the link above or search @{VENMO_HANDLE} in Venmo.
                                        </p>
                                    </div>
                                )}

                                <Button
                                    className="w-full shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                                    size="lg"
                                    onClick={() => {
                                        if (paymentMethod === 'card') {
                                            setShowCheckoutConfirm(true);
                                        } else {
                                            handleCheckout();
                                        }
                                    }}
                                    disabled={checkout.isPending || placingOrder || cart.length === 0}
                                >
                                    {(checkout.isPending || placingOrder) ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : paymentMethod === 'card' ? (
                                        <CreditCard className="h-4 w-4 mr-2" />
                                    ) : (
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                    )}
                                    {paymentMethod === 'card'
                                        ? `Pay with Card — $${cartTotal.toFixed(2)}`
                                        : `Place Order — $${cartTotal.toFixed(2)}`
                                    }
                                </Button>
                            </div>
                        ) : (
                            /* Order placed confirmation (non-card) */
                            <div className="text-center space-y-3 py-4">
                                <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                                    <Check className="h-6 w-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="font-semibold text-emerald-400">Order Placed!</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Send <strong>${cartTotal.toFixed(2)}</strong> via{' '}
                                        {paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo'}
                                        {paymentMethod === 'zelle' && (
                                            <> to <strong>{ZELLE_EMAIL}</strong></>
                                        )}
                                        {paymentMethod === 'venmo' && (
                                            <> to <strong>@{VENMO_HANDLE}</strong></>
                                        )}
                                    </p>
                                </div>
                                {paymentMethod === 'zelle' && (
                                    <Button variant="outline" size="sm" onClick={copyZelleEmail}>
                                        {copiedZelle ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                        Copy Zelle Email
                                    </Button>
                                )}
                                {paymentMethod === 'venmo' && (
                                    <a
                                        href={`https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <Button variant="outline" size="sm">
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            Open Venmo to Pay
                                        </Button>
                                    </a>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setOrderPlaced(false);
                                        setPaymentMethod('card');
                                    }}
                                >
                                    Start New Order
                                </Button>
                            </div>
                        )}
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

            {/* Floating cart pill — fixed bottom */}
            <AnimatePresence>
                {cart.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 40 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="fixed bottom-20 left-4 right-4 z-30 max-w-lg mx-auto"
                    >
                        <Button
                            className="w-full h-14 rounded-2xl shadow-xl shadow-primary/25 text-base font-semibold"
                            size="lg"
                            onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                            <ShoppingCart className="h-5 w-5 mr-2" />
                            <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                            <span className="mx-2 opacity-40">|</span>
                            <span>${cartTotal.toFixed(2)}</span>
                            <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Protocol detail Sheet */}
            <Sheet open={!!selectedProtocol} onOpenChange={(open) => { if (!open) setSelectedProtocol(null); }}>
                <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
                    {selectedProtocol && (() => {
                        const { template, matched } = selectedProtocol;
                        const Icon = ICON_MAP[template.icon] || Package;
                        const bundlePrice = matched.reduce((sum: number, p: any) => sum + getClientPrice(p), 0);
                        // Deduplicate for display, track quantities
                        const uniqueMatched = [...new Map(matched.map((p: any) => [p.id, p])).values()] as any[];
                        const qtyMap: Record<string, number> = {};
                        matched.forEach((p: any) => { qtyMap[p.id] = (qtyMap[p.id] || 0) + 1; });
                        const allInCart = uniqueMatched.length > 0 && uniqueMatched.every((p: any) => {
                            const inCart = cart.find(c => c.peptide_id === p.id);
                            return inCart && inCart.quantity >= (qtyMap[p.id] || 1);
                        });

                        return (
                            <>
                                <SheetHeader className="pb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <Icon className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <SheetTitle className="text-xl font-bold tracking-tight text-left">
                                                {template.name}
                                            </SheetTitle>
                                            <p className="text-sm text-muted-foreground mt-0.5">{template.description}</p>
                                        </div>
                                    </div>
                                </SheetHeader>

                                <div className="space-y-4 pb-6">
                                    {/* Each peptide in the protocol */}
                                    <p className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider">What's Included</p>
                                    <div className="space-y-3">
                                        {uniqueMatched.map((p: any) => {
                                            const qty = qtyMap[p.id] || 1;
                                            const price = getClientPrice(p) * qty;
                                            const knowledge = PROTOCOL_KNOWLEDGE[p.name];
                                            return (
                                                <div key={p.id} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <p className="font-semibold text-sm">{qty > 1 ? `${qty}x ` : ''}{p.name}</p>
                                                        <span className="text-sm font-bold text-primary">${price.toFixed(2)}</span>
                                                    </div>
                                                    {knowledge && (
                                                        <>
                                                            <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">
                                                                {knowledge.description}
                                                            </p>
                                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground/50">
                                                                <span>Dose: {knowledge.defaultDoseAmount} {knowledge.defaultDoseUnit}</span>
                                                                <span>Frequency: {knowledge.defaultFrequency}</span>
                                                                <span>Timing: {knowledge.defaultTiming}</span>
                                                                <span>Route: {knowledge.administrationRoute}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                    {!knowledge && p.description && (
                                                        <p className="text-xs text-muted-foreground/70 leading-relaxed line-clamp-3">
                                                            {p.description}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Total + Add All */}
                                    <div className="border-t pt-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground text-sm">Bundle Total</span>
                                            <span className="text-2xl font-bold text-primary">${bundlePrice.toFixed(2)}</span>
                                        </div>
                                        {allInCart ? (
                                            <div className="flex items-center justify-center gap-2 py-3 text-emerald-400 font-medium">
                                                <Check className="h-5 w-5" />
                                                All items in cart
                                            </div>
                                        ) : (
                                            <Button
                                                size="lg"
                                                className="w-full h-14 rounded-xl text-base font-semibold shadow-md shadow-primary/20"
                                                onClick={() => {
                                                    matched.forEach((p: any) => addToCart(p));
                                                }}
                                            >
                                                <Plus className="h-5 w-5 mr-2" />
                                                Add All to Cart — ${bundlePrice.toFixed(2)}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* Product detail Sheet */}
            <Sheet open={!!selectedPeptide} onOpenChange={(open) => { if (!open) setSelectedPeptide(null); }}>
                <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
                    {selectedPeptide && (() => {
                        const price = getClientPrice(selectedPeptide);
                        const retail = Number(selectedPeptide.retail_price || 0);
                        const hasDiscount = assignedRep && price < retail;
                        const inCart = cart.find(i => i.peptide_id === selectedPeptide.id);

                        return (
                            <>
                                <SheetHeader className="pb-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield className="h-4 w-4 text-emerald-400" />
                                        <span className="text-xs text-emerald-400 font-medium">Research Grade</span>
                                    </div>
                                    <SheetTitle className="text-2xl font-bold tracking-tight text-left">
                                        {selectedPeptide.name}
                                    </SheetTitle>
                                </SheetHeader>

                                <div className="space-y-5 pb-6">
                                    {/* Description */}
                                    {selectedPeptide.description && (
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {selectedPeptide.description}
                                        </p>
                                    )}

                                    {/* Price */}
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-3xl font-bold text-primary">${price.toFixed(2)}</span>
                                        {hasDiscount && (
                                            <span className="text-lg text-muted-foreground line-through">${retail.toFixed(2)}</span>
                                        )}
                                        {hasDiscount && (
                                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
                                                {Math.round((1 - price / retail) * 100)}% off
                                            </Badge>
                                        )}
                                    </div>

                                    {/* Quantity + Add to cart */}
                                    {inCart ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-center gap-4 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-11 w-11 rounded-xl"
                                                    onClick={() => updateQuantity(selectedPeptide.id, -1)}
                                                >
                                                    <Minus className="h-5 w-5" />
                                                </Button>
                                                <span className="text-2xl font-bold w-12 text-center">{inCart.quantity}</span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-11 w-11 rounded-xl"
                                                    onClick={() => updateQuantity(selectedPeptide.id, 1)}
                                                >
                                                    <Plus className="h-5 w-5" />
                                                </Button>
                                            </div>
                                            <p className="text-center text-sm text-muted-foreground">
                                                Subtotal: <span className="font-semibold text-foreground">${(price * inCart.quantity).toFixed(2)}</span>
                                            </p>
                                        </div>
                                    ) : (
                                        <Button
                                            size="lg"
                                            className="w-full h-14 rounded-xl text-base font-semibold shadow-md shadow-primary/20"
                                            onClick={() => addToCart(selectedPeptide)}
                                        >
                                            <Plus className="h-5 w-5 mr-2" />
                                            Add to Cart — ${price.toFixed(2)}
                                        </Button>
                                    )}

                                    {/* Storage info */}
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5">
                                        <p className="text-xs font-medium text-muted-foreground/80">Storage & Handling</p>
                                        <p className="text-xs text-muted-foreground/60">
                                            Store unreconstituted vials at room temperature or refrigerated. After reconstitution, store refrigerated (2-8°C) and use within 30 days.
                                        </p>
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </SheetContent>
            </Sheet>
        </div>
    );
}
