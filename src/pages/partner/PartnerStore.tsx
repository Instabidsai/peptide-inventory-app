import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckout } from '@/hooks/use-checkout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

export default function PartnerStore() {
    const { user, profile } = useAuth();
    const checkout = useCheckout();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

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
        const retail = Number(peptide.retail_price || peptide.avg_cost || 0);
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
                retailPrice: Number(peptide.retail_price || peptide.avg_cost || 0),
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

    // Checkout handler — creates order + redirects to PsiFi payment
    const handleCheckout = () => {
        if (!partnerProfile) return;
        if (cart.length === 0) return;

        const orgId = (partnerProfile as any).org_id;
        if (!orgId) return;

        checkout.mutate({
            org_id: orgId,
            client_id: null, // Self-order
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
                        {tierInfo.discount}
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
                            {filtered.map(peptide => {
                                const retail = Number((peptide as any).retail_price || (peptide as any).avg_cost || 0);
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

                                    {/* Checkout with Payment */}
                                    <Button
                                        className="w-full"
                                        size="lg"
                                        onClick={handleCheckout}
                                        disabled={checkout.isPending || cart.length === 0}
                                    >
                                        {checkout.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <CreditCard className="h-4 w-4 mr-2" />
                                        )}
                                        Checkout — ${cartTotal.toFixed(2)}
                                    </Button>
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
                                <span className="font-semibold"> {tierInfo.discount}</span> all items.
                                {priceMultiplier < 1 && (
                                    <span> (Price multiplier: {priceMultiplier}×)</span>
                                )}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
