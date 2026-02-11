import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass-card';
import {
    ShoppingCart,
    Package,
    Plus,
    Minus,
    CheckCircle2,
    Loader2,
    Search,
    Info,
} from 'lucide-react';

interface CartItem {
    peptide_id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function ClientStore() {
    const { user } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [cart, setCart] = useState<CartItem[]>([]);
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Get all active peptides
    const { data: peptides, isLoading } = useQuery({
        queryKey: ['client_store_peptides'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('peptides')
                .select('*')
                .eq('active', true)
                .order('name');
            if (error) throw error;
            return data as any[];
        },
    });

    // Get the assigned rep for this client (for commission tracking)
    const { data: assignedRep } = useQuery({
        queryKey: ['client_assigned_rep', contact?.id],
        queryFn: async () => {
            if (!contact?.id) return null;
            // The contact's assigned_to field links to a profile
            const contactData = contact as any;
            if (!contactData.assigned_to) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, commission_rate, price_multiplier, partner_tier')
                .eq('id', contactData.assigned_to)
                .single();
            return data;
        },
        enabled: !!contact?.id,
    });

    const addToCart = (peptide: any) => {
        const price = Number(peptide.retail_price || 0);
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
    const filteredPeptides = peptides?.filter((p: any) => {
        if (!searchQuery) return true;
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Submit order mutation
    const placeOrder = useMutation({
        mutationFn: async () => {
            if (!user?.id) throw new Error('Not authenticated');
            if (cart.length === 0) throw new Error('Cart is empty');

            // Get the user's org_id from their profile
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('id, org_id')
                .eq('user_id', user.id)
                .single();

            if (!userProfile) throw new Error('Profile not found');

            const orgId = (userProfile as any).org_id;
            if (!orgId) throw new Error('No organization found');

            // Create sales order
            const repId = assignedRep ? (assignedRep as any).id : null;
            const { data: order, error: orderError } = await (supabase as any)
                .from('sales_orders')
                .insert({
                    org_id: orgId,
                    client_id: contact?.id || null,
                    rep_id: repId,
                    status: 'pending',
                    total_amount: cartTotal,
                    commission_amount: 0, // Will be calculated by the system
                    shipping_address: shippingAddress || null,
                    notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}.\n${notes}`,
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // Create order items
            const items = cart.map(i => ({
                sales_order_id: order.id,
                peptide_id: i.peptide_id,
                quantity: i.quantity,
                unit_price: i.price,
            }));

            const { error: itemsError } = await (supabase as any)
                .from('sales_order_items')
                .insert(items);

            if (itemsError) throw itemsError;

            return order;
        },
        onSuccess: () => {
            toast({
                title: '🎉 Order placed!',
                description: `Your order for $${cartTotal.toFixed(2)} has been submitted. Your rep will process it shortly.`
            });
            setCart([]);
            setNotes('');
            setShippingAddress('');
            queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
        },
        onError: (error: Error) => {
            toast({ variant: 'destructive', title: 'Failed to place order', description: error.message });
        },
    });

    if (isLoadingContact) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
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
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                        {filteredPeptides?.map((peptide: any) => {
                            const price = Number(peptide.retail_price || 0);
                            const inCart = cart.find(i => i.peptide_id === peptide.id);

                            if (price <= 0) return null; // Skip items without a price

                            return (
                                <GlassCard key={peptide.id} className="hover:border-primary/30 transition-colors">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{peptide.name}</p>
                                                {peptide.sku && (
                                                    <p className="text-xs text-muted-foreground mt-0.5">SKU: {peptide.sku}</p>
                                                )}
                                                <p className="text-xl font-bold text-primary mt-1">
                                                    ${price.toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                {inCart ? (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => updateQuantity(peptide.id, -1)}
                                                        >
                                                            <Minus className="h-3 w-3" />
                                                        </Button>
                                                        <span className="w-6 text-center text-sm font-medium">
                                                            {inCart.quantity}
                                                        </span>
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-7 w-7"
                                                            onClick={() => updateQuantity(peptide.id, 1)}
                                                        >
                                                            <Plus className="h-3 w-3" />
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
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Cart Summary — Fixed Bottom Card */}
            {cart.length > 0 && (
                <GlassCard className="border-primary/20 shadow-lg">
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
                                            className="h-6 w-6"
                                            onClick={() => updateQuantity(item.peptide_id, -1)}
                                        >
                                            <Minus className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => updateQuantity(item.peptide_id, 1)}
                                        >
                                            <Plus className="h-3 w-3" />
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

                        {/* Place Order */}
                        <Button
                            className="w-full"
                            size="lg"
                            onClick={() => placeOrder.mutate()}
                            disabled={placeOrder.isPending || cart.length === 0}
                        >
                            {placeOrder.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            Place Order — ${cartTotal.toFixed(2)}
                        </Button>
                    </CardContent>
                </GlassCard>
            )}

            {/* Info card */}
            <Card className="bg-muted/30 border-muted">
                <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">
                            Orders are submitted to your assigned representative for processing.
                            You'll receive a notification once your order is confirmed and shipped.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
