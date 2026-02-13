import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckout } from '@/hooks/use-checkout';
import { useCreateSalesOrder } from '@/hooks/use-sales-orders';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    ShoppingCart,
    Package,
    Tag,
    Percent,
    Plus,
    Minus,
    CreditCard,
    Loader2,
    Search,
    Copy,
    Check,
    Banknote,
    Smartphone,
    ExternalLink,
} from 'lucide-react';

// Tier config for display
const TIER_INFO: Record<string, { label: string; discount: string; color: string }> = {
    senior: { label: '🥇 Senior Partner', discount: '50% off', color: 'text-amber-500' },
    standard: { label: '🥈 Standard Partner', discount: '35% off', color: 'text-blue-500' },
    associate: { label: '🥉 Associate Partner', discount: '25% off', color: 'text-green-500' },
    executive: { label: '⭐ Executive', discount: '50% off', color: 'text-purple-500' },
};

interface CartItem {
    peptide_id: string;
    name: string;
    retailPrice: number;
    yourPrice: number;
    quantity: number;
}

type PaymentMethod = 'card' | 'zelle' | 'cashapp' | 'venmo';

const ZELLE_EMAIL = 'admin@nextgenresearchlabs.com';
const VENMO_HANDLE = 'PureUSPeptide';

export default function PartnerStore() {
    const { user, profile } = useAuth();
    const checkout = useCheckout();
    const createOrder = useCreateSalesOrder();
    const { toast } = useToast();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
    const [copiedZelle, setCopiedZelle] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);

    // Get partner's profile with pricing info
    const { data: partnerProfile } = useQuery({
        queryKey: ['partner_store_profile'],
        queryFn: async () => {
            if (!user?.id) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id, org_id, partner_tier, price_multiplier, commission_rate, full_name')
                .eq('user_id', user.id)
                .single();
            return data;
        },
        enabled: !!user?.id,
    });

    // Get all active peptides with pricing
    const { data: peptides, isLoading, isError } = useQuery({
        queryKey: ['partner_store_peptides'],
        queryFn: async () => {
            // Use select('*') and cast — generated types are stale and don't include retail_price
            const { data, error } = await (supabase as any)
                .from('peptides')
                .select('*')
                .eq('active', true)
                .order('name');
            if (error) throw error;
            return data as any[];
        },
    });

    const priceMultiplier = Number((partnerProfile as any)?.price_multiplier) || 1.0;
    const partnerTier = (partnerProfile as any)?.partner_tier || 'standard';
    const tierInfo = TIER_INFO[partnerTier] || TIER_INFO.standard;

    // Calculate discounted price
    const getPartnerPrice = (peptide: any): number => {
        const retail = Number(peptide.retail_price || 0);
        return Math.round(retail * priceMultiplier * 100) / 100;
    };

    const addToCart = (peptide: any) => {
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
                retailPrice: Number(peptide.retail_price || 0),
                yourPrice: getPartnerPrice(peptide),
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

    const cartTotal = cart.reduce((sum, i) => sum + (i.yourPrice * i.quantity), 0);
    const retailTotal = cart.reduce((sum, i) => sum + (i.retailPrice * i.quantity), 0);
    const totalSavings = retailTotal - cartTotal;

    const copyZelleEmail = () => {
        navigator.clipboard.writeText(ZELLE_EMAIL);
        setCopiedZelle(true);
        setTimeout(() => setCopiedZelle(false), 2000);
    };

    // Card checkout — existing PsiFi flow
    const handleCardCheckout = () => {
        if (!partnerProfile) return;
        const orgId = (partnerProfile as any).org_id;
        if (!orgId) return;

        checkout.mutate({
            org_id: orgId,
            client_id: null,
            rep_id: (partnerProfile as any).id,
            total_amount: cartTotal,
            shipping_address: shippingAddress || undefined,
            notes: `PARTNER SELF-ORDER (${partnerTier}) — ${(partnerProfile as any).full_name || 'Unknown'}.\n${notes}`,
            items: cart.map(i => ({
                peptide_id: i.peptide_id,
                name: i.name,
                quantity: i.quantity,
                unit_price: i.yourPrice,
            })),
        });
    };

    // Non-card checkout — creates order as awaiting payment
    const handleAlternativeCheckout = async () => {
        if (!partnerProfile || cart.length === 0) return;
        setPlacingOrder(true);

        const methodLabel = paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo';

        try {
            await createOrder.mutateAsync({
                client_id: (partnerProfile as any).id,
                items: cart.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                    unit_price: i.yourPrice,
                })),
                shipping_address: shippingAddress || undefined,
                notes: `PARTNER SELF-ORDER (${partnerTier}) — ${(partnerProfile as any).full_name || 'Unknown'}. Payment via ${methodLabel}.\n${notes}`,
                payment_method: paymentMethod,
            });
            setOrderPlaced(true);
            toast({ title: 'Order placed!', description: `Send $${cartTotal.toFixed(2)} via ${methodLabel} to complete your order.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Order failed', description: err.message });
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

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Partner Store</h1>
                    <p className="text-muted-foreground mt-1">
                        Order peptides at your partner discount
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-sm px-3 py-1 ${tierInfo.color}`}>
                        {tierInfo.label}
                    </Badge>
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                        <Percent className="h-3 w-3 mr-1" />
                        {Math.round((1 - priceMultiplier) * 100)}% off retail
                    </Badge>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Product Grid */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        Available Peptides
                    </h2>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search peptides..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : isError ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <p className="text-sm">Failed to load products. Please try refreshing the page.</p>
                        </div>
                    ) : (() => {
                        const filtered = peptides?.filter((p: any) => {
                            if (!searchQuery) return true;
                            const q = searchQuery.toLowerCase();
                            return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
                        }) || [];
                        if (filtered.length === 0) return (
                            <div className="text-center py-12 text-muted-foreground">
                                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                <p className="text-sm">{searchQuery ? 'No peptides match your search.' : 'No peptides available right now.'}</p>
                            </div>
                        );
                        return (
                        <div className="grid gap-4 sm:grid-cols-2">
                            {filtered.filter(p => Number(p.retail_price || 0) > 0).map(peptide => {
                                const retail = Number((peptide as any).retail_price || 0);
                                const yourPrice = getPartnerPrice(peptide);
                                const savings = retail - yourPrice;
                                const inCart = cart.find(i => i.peptide_id === peptide.id);

                                return (
                                    <Card key={peptide.id} className="bg-card border-border hover:border-primary/30 transition-colors">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="text-base">{peptide.name}</CardTitle>
                                                    {peptide.sku && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">SKU: {peptide.sku}</p>
                                                    )}
                                                </div>
                                                {inCart && (
                                                    <Badge variant="default" className="text-xs">
                                                        {inCart.quantity} in cart
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="flex items-end justify-between">
                                                <div>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl font-bold text-primary">
                                                            ${yourPrice.toFixed(2)}
                                                        </span>
                                                        {savings > 0 && (
                                                            <span className="text-sm text-muted-foreground line-through">
                                                                ${retail.toFixed(2)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {savings > 0 && (
                                                        <p className="text-xs text-green-500 mt-0.5">
                                                            You save ${savings.toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => addToCart(peptide)}
                                                    className="flex items-center gap-1"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    Add
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                        );
                    })()}
                </div>

                {/* Cart Sidebar */}
                <div className="space-y-4">
                    <Card className="bg-card border-border sticky top-4">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="h-5 w-5" />
                                Your Order
                            </CardTitle>
                            <CardDescription>
                                {cart.length === 0 ? 'Your cart is empty' : `${cart.reduce((s, i) => s + i.quantity, 0)} items`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {cart.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    Add peptides from the catalog to get started
                                </p>
                            ) : (
                                <>
                                    {/* Cart Items */}
                                    <div className="space-y-3">
                                        {cart.map(item => (
                                            <div key={item.peptide_id} className="flex items-center justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        ${item.yourPrice.toFixed(2)} each
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => updateQuantity(item.peptide_id, -1)}
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </Button>
                                                    <span className="w-8 text-center text-sm font-medium">
                                                        {item.quantity}
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => updateQuantity(item.peptide_id, 1)}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <span className="text-sm font-semibold w-16 text-right">
                                                    ${(item.yourPrice * item.quantity).toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Totals */}
                                    <div className="border-t pt-3 space-y-1">
                                        {totalSavings > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Retail Total</span>
                                                <span className="line-through text-muted-foreground">${retailTotal.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Your Total</span>
                                            <span className="text-lg font-bold text-primary">${cartTotal.toFixed(2)}</span>
                                        </div>
                                        {totalSavings > 0 && (
                                            <div className="flex justify-between text-sm">
                                                <span className="text-green-500">You Save</span>
                                                <span className="text-green-500 font-medium">${totalSavings.toFixed(2)}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Shipping */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Shipping Address</label>
                                        <Textarea
                                            placeholder="Enter shipping address..."
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
                                                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-medium text-purple-700 dark:text-purple-300">Send payment via Zelle to:</p>
                                                    <div className="flex items-center gap-2">
                                                        <code className="flex-1 text-sm font-mono bg-white dark:bg-background rounded px-2 py-1 border">
                                                            {ZELLE_EMAIL}
                                                        </code>
                                                        <Button variant="outline" size="sm" onClick={copyZelleEmail} className="shrink-0">
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
                                                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-medium text-green-700 dark:text-green-300">Pay via Cash App</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via Cash App. We'll confirm when received.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Venmo info */}
                                            {paymentMethod === 'venmo' && (
                                                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
                                                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Pay via Venmo to @{VENMO_HANDLE}</p>
                                                    <a
                                                        href={`https://venmo.com/${VENMO_HANDLE}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
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
                                                className="w-full"
                                                size="lg"
                                                onClick={handleCheckout}
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
                                        /* Order placed confirmation */
                                        <div className="text-center space-y-3 py-4">
                                            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                                                <Check className="h-6 w-6 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-green-600">Order Placed!</p>
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
                                                    setCart([]);
                                                    setNotes('');
                                                    setShippingAddress('');
                                                }}
                                            >
                                                Start New Order
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Savings summary card */}
                    <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20">
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Tag className="h-4 w-4 text-green-500" />
                                <span className="text-sm font-semibold text-green-500">Your Partner Discount</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                As a <span className={tierInfo.color}>{partnerTier}</span> partner, you get
                                <span className="font-semibold"> {Math.round((1 - priceMultiplier) * 100)}% off</span> all items.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
