import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useValidatedCheckout } from '@/hooks/use-checkout';
import { useCreateValidatedOrder } from '@/hooks/use-sales-orders';
import { useToast } from '@/hooks/use-toast';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { CardContent } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';

import {
    StoreHeader,
    ProtocolBundles,
    ProductGrid,
    CartSummary,
    FloatingCartPill,
    CheckoutConfirmDialog,
    ProtocolDetailSheet,
    ProductDetailSheet,
    type CartItem,
    type PaymentMethod,
    type SelectedProtocol,
} from '@/components/store';
import { canSeePeptide, calculateClientPrice } from '@/components/store/utils';
import { MAX_ITEM_QTY } from '@/components/store/constants';

export default function ClientStore() {
    const { user, userRole, profile: authProfile } = useAuth();
    const { data: contact, isLoading: isLoadingContact } = useClientProfile();
    const checkout = useValidatedCheckout();
    const createOrder = useCreateValidatedOrder();
    const { toast } = useToast();
    const { zelle_email: ZELLE_EMAIL, venmo_handle: VENMO_HANDLE } = useTenantConfig();
    const [cart, setCart] = useState<CartItem[]>(() => {
        try {
            const saved = localStorage.getItem('peptide_cart');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
    const [selectedPeptide, setSelectedPeptide] = useState<any>(null);
    const [selectedProtocol, setSelectedProtocol] = useState<SelectedProtocol | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
    const [copiedZelle, setCopiedZelle] = useState(false);
    const [placingOrder, setPlacingOrder] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const cartRef = React.useRef<HTMLDivElement>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Persist cart to localStorage
    useEffect(() => {
        localStorage.setItem('peptide_cart', JSON.stringify(cart));
    }, [cart]);

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
            if (!contact.assigned_rep_id) return null;
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name, commission_rate, price_multiplier, partner_tier, pricing_mode, cost_plus_markup')
                .eq('id', contact.assigned_rep_id)
                .maybeSingle();
            return data;
        },
        enabled: !!contact?.id,
    });

    // Determine pricing profile: partners use their OWN profile settings,
    // customers use their own price_multiplier. assignedRep is for commission tracking only.
    const isPartner = contact?.type === 'partner';
    const pricingProfile = isPartner ? authProfile : assignedRep;
    const pricingMode = pricingProfile?.pricing_mode || 'percentage';

    // Fetch avg lot costs for cost-based pricing (cost_plus or cost_multiplier)
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
        enabled: isPartner && (pricingMode === 'cost_plus' || pricingMode === 'cost_multiplier'),
    });

    const getClientPrice = (peptide: { id: string; retail_price?: number | null }): number => {
        return calculateClientPrice(peptide, isPartner, authProfile, pricingProfile, lotCosts);
    };

    const addToCart = (peptide: { id: string; name: string; retail_price?: number | null }) => {
        const price = getClientPrice(peptide);
        setCart(prev => {
            const existing = prev.find(i => i.peptide_id === peptide.id);
            if (existing) {
                if (existing.quantity >= MAX_ITEM_QTY) {
                    toast({ title: 'Quantity limit reached', description: `Maximum ${MAX_ITEM_QTY} per item.` });
                    return prev;
                }
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
                const newQty = Math.min(MAX_ITEM_QTY, Math.max(0, i.quantity + delta));
                return { ...i, quantity: newQty };
            }).filter(i => i.quantity > 0)
        );
    };

    const cartTotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

    // Pre-fill cart from ?reorder= URL param (e.g. from SupplyOverview or SimpleVials)
    useEffect(() => {
        const reorderParam = searchParams.get('reorder');
        if (!reorderParam || !peptides?.length) return;
        try {
            const items: { peptide_name?: string; peptide_id?: string; quantity?: number }[] =
                JSON.parse(decodeURIComponent(reorderParam));
            const added: string[] = [];
            for (const item of items) {
                const product = peptides.find(p =>
                    p.id === item.peptide_id ||
                    (item.peptide_name && p.name?.toLowerCase().includes(item.peptide_name.toLowerCase()))
                );
                if (product) {
                    addToCart(product);
                    added.push(product.name);
                }
            }
            if (added.length) {
                toast({ title: 'Reorder items added', description: `${added.join(', ')} added to your cart.` });
            }
            // Clear the param so it doesn't re-trigger
            setSearchParams({}, { replace: true });
        } catch { /* ignore malformed param */ }
    }, [searchParams, peptides]);

    // Filter peptides by search query + visibility restrictions
    const filteredPeptides = peptides?.filter((p) => {
        if (!canSeePeptide(p, authProfile?.id, userRole?.role)) return false;
        if (!searchQuery) return true;
        return p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const copyZelleEmail = async () => {
        try {
            await navigator.clipboard.writeText(ZELLE_EMAIL);
        } catch {
            const input = document.createElement('input');
            input.value = ZELLE_EMAIL;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedZelle(true);
        setTimeout(() => setCopiedZelle(false), 2000);
    };

    // Card checkout -- validated server-side pricing + PsiFi payment redirect
    const handleCardCheckout = async () => {
        if (!user?.id) return;
        if (cart.length === 0) return;
        if (!shippingAddress.trim()) {
            toast({ variant: 'destructive', title: 'Shipping address required', description: 'Please enter a shipping address before checking out.' });
            return;
        }

        checkout.mutate({
            items: cart.map(i => ({
                peptide_id: i.peptide_id,
                quantity: i.quantity,
            })),
            shipping_address: shippingAddress || undefined,
            notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}.\n${notes}`,
        }, {
            onSuccess: () => { localStorage.removeItem('peptide_cart'); },
        });
    };

    // Non-card checkout -- server-validated pricing, creates order as awaiting payment
    const handleAlternativeCheckout = async () => {
        if (!contact?.id || cart.length === 0) return;
        if (!shippingAddress.trim()) {
            toast({ variant: 'destructive', title: 'Shipping address required', description: 'Please enter a shipping address before placing your order.' });
            return;
        }
        setPlacingOrder(true);

        const methodLabel = paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo';

        try {
            const result = await createOrder.mutateAsync({
                items: cart.map(i => ({
                    peptide_id: i.peptide_id,
                    quantity: i.quantity,
                })),
                shipping_address: shippingAddress || undefined,
                notes: `CLIENT ORDER — ${contact?.name || 'Unknown Client'}. Payment via ${methodLabel}.\n${notes}`,
                payment_method: paymentMethod,
            });
            setOrderPlaced(true);
            setCart([]);
            setNotes('');
            toast({ title: 'Order placed!', description: `Send $${result.total_amount.toFixed(2)} via ${methodLabel} to complete your order.` });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Order failed', description: (err as any)?.message || 'Unknown error' });
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
        <div className="space-y-8 pb-24">
            <StoreHeader
                priceMultiplier={Number(authProfile?.price_multiplier || 1)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {/* Protocol Bundles */}
            {!searchQuery && peptides && peptides.length > 0 && (
                <ProtocolBundles
                    peptides={peptides}
                    cart={cart}
                    isPartner={isPartner}
                    pricingMode={pricingMode}
                    getClientPrice={getClientPrice}
                    addToCart={addToCart}
                    onSelectProtocol={setSelectedProtocol}
                />
            )}

            {/* Product Grid */}
            <ProductGrid
                peptides={peptides}
                filteredPeptides={filteredPeptides}
                isLoading={isLoading}
                isError={isError}
                searchQuery={searchQuery}
                cart={cart}
                isPartner={isPartner}
                pricingMode={pricingMode}
                getClientPrice={getClientPrice}
                addToCart={addToCart}
                updateQuantity={updateQuantity}
                onSelectPeptide={setSelectedPeptide}
            />

            {/* Cart Summary */}
            <CartSummary
                cart={cart}
                cartTotal={cartTotal}
                itemCount={itemCount}
                shippingAddress={shippingAddress}
                onShippingAddressChange={setShippingAddress}
                notes={notes}
                onNotesChange={setNotes}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                orderPlaced={orderPlaced}
                onOrderPlacedReset={() => {
                    setOrderPlaced(false);
                    setPaymentMethod('card');
                }}
                placingOrder={placingOrder}
                checkoutPending={checkout.isPending}
                zelleEmail={ZELLE_EMAIL}
                venmoHandle={VENMO_HANDLE}
                copiedZelle={copiedZelle}
                onCopyZelle={copyZelleEmail}
                onCheckout={handleCheckout}
                onShowCheckoutConfirm={() => setShowCheckoutConfirm(true)}
                updateQuantity={updateQuantity}
                cartRef={cartRef as React.RefObject<HTMLDivElement>}
            />

            {/* Info card */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                <div className="h-7 w-7 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
                    <Info className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
                <p className="text-xs text-muted-foreground/40 leading-relaxed">
                    You'll be redirected to our secure payment processor to complete your order.
                    Once payment is confirmed, your order will be processed and shipped.
                </p>
            </div>

            {/* Checkout confirmation dialog */}
            <CheckoutConfirmDialog
                open={showCheckoutConfirm}
                onOpenChange={setShowCheckoutConfirm}
                itemCount={itemCount}
                cartTotal={cartTotal}
                onConfirm={handleCheckout}
            />

            {/* Floating cart pill */}
            <FloatingCartPill
                itemCount={itemCount}
                cartTotal={cartTotal}
                visible={cart.length > 0}
                onScrollToCart={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />

            {/* Protocol detail Sheet */}
            <ProtocolDetailSheet
                selectedProtocol={selectedProtocol}
                onClose={() => setSelectedProtocol(null)}
                cart={cart}
                isPartner={isPartner}
                pricingMode={pricingMode}
                getClientPrice={getClientPrice}
                addToCart={addToCart}
            />

            {/* Product detail Sheet */}
            <ProductDetailSheet
                selectedPeptide={selectedPeptide}
                onClose={() => setSelectedPeptide(null)}
                allPeptides={peptides}
                cart={cart}
                isPartner={isPartner}
                pricingMode={pricingMode}
                getClientPrice={getClientPrice}
                addToCart={addToCart}
                updateQuantity={updateQuantity}
                onSelectProtocol={setSelectedProtocol}
            />
        </div>
    );
}
