import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { usePeptides, type Peptide } from '@/hooks/use-peptides';
import { useContacts } from '@/hooks/use-contacts';
// Admin/rep-only page: uses useCreateSalesOrder (client-supplied prices are intentional for custom tier pricing)
import { useCreateSalesOrder } from '@/hooks/use-sales-orders';
import { useProfile, useRepProfile } from '@/hooks/use-profiles'; // Updated import
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Search, Plus, ShoppingCart, Trash2, User, ChevronRight, Eye, Check, ChevronsUpDown, Truck, MapPin, Users, ToggleLeft, ToggleRight, DollarSign, Percent } from 'lucide-react';
import { supabase } from '@/integrations/sb_client/client';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    PopoverTrigger as PopoverTriggerOriginal,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CartItem {
    peptide: Peptide;
    quantity: number;
    unitPrice: number;
    basePrice: number;
    commissionRate: number; // Added
}

interface CommissionChainEntry {
    profileId: string;
    name: string;
    tier: string;
    type: 'direct' | 'second_tier_override' | 'third_tier_override';
    defaultRate: number;
    mode: 'percentage' | 'flat' | 'none';
    value: number;
}

export default function NewOrder() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const previewRepId = searchParams.get('preview_rep_id');
    const { data: peptides } = usePeptides();
    const { data: contacts } = useContacts();

    // Logic: Use preview profile if ID exists, otherwise use logged-in user profile
    const { data: myProfile } = useProfile();
    const { data: previewProfile } = useRepProfile(previewRepId);

    const activeProfile = previewRepId ? previewProfile : myProfile;
    const isPreviewMode = !!previewRepId;

    const createOrder = useCreateSalesOrder();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedContactId, setSelectedContactId] = useState<string>('');
    const [cart, setCart] = useState<CartItem[]>([]);

    const [notes, setNotes] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'ship' | 'local_pickup'>('ship');
    const [openCombobox, setOpenCombobox] = useState(false);
    const [commissionEnabled, setCommissionEnabled] = useState(true);
    const [commissionChain, setCommissionChain] = useState<CommissionChainEntry[]>([]);

    const location = useLocation();

    // Auto-select contact if passed via ?contact_id= query param
    const prefillContactId = searchParams.get('contact_id');
    useEffect(() => {
        if (prefillContactId && contacts && !selectedContactId) {
            const match = contacts.find(c => c.id === prefillContactId);
            if (match) setSelectedContactId(match.id);
        }
    }, [prefillContactId, contacts]);

    // Auto-fill shipping address from selected contact
    useEffect(() => {
        if (selectedContactId && contacts) {
            const contact = contacts.find(c => c.id === selectedContactId);
            if (contact?.address && !shippingAddress) {
                setShippingAddress(contact.address);
            }
        }
    }, [selectedContactId, contacts]);

    // Helper to get consistent Base Cost
    // Uses the rep's pricing_mode to match PartnerStore pricing logic:
    //   - 'cost_plus': avgCost + cost_plus_markup
    //   - 'percentage' (default): avgCost * price_multiplier
    const getBaseCost = (peptide: Peptide, profile: { pricing_mode?: string; cost_plus_markup?: number; price_multiplier?: number } | null | undefined) => {
        const avgCost = (peptide.avg_cost && peptide.avg_cost > 0) ? peptide.avg_cost : (peptide.retail_price || 10.50);
        const pricingMode = profile?.pricing_mode || 'percentage';
        if (pricingMode === 'cost_plus') {
            const markup = Number(profile?.cost_plus_markup) || 0;
            return Math.round((avgCost + markup) * 100) / 100;
        }
        // percentage mode: avgCost * price_multiplier
        const multiplier = Number(profile?.price_multiplier) || 1.0;
        return Math.round((avgCost * multiplier) * 100) / 100;
    };

    // Helper to generate Pricing Tiers
    const getPricingTiers = (peptide: Peptide, baseCost: number, isPartner: boolean = false) => {
        const retail = peptide.retail_price || 0;
        // Raw avg cost (before any rep multiplier) — for Partner tier
        const rawAvgCost = (peptide.avg_cost && peptide.avg_cost > 0) ? peptide.avg_cost : baseCost;
        const partnerPrice = Math.round(rawAvgCost * 2 * 100) / 100;

        // Define Tiers
        const tiers = [
            { label: 'Cost', price: baseCost, commRate: 0.00, variant: 'outline' as const },
            // Partner tier: 2x raw avg cost, 0% commission — only shown for partner contacts
            ...(isPartner ? [{ label: 'Partner', price: partnerPrice, commRate: 0.00, variant: 'outline' as const }] : []),
            { label: '2x', price: baseCost * 2, commRate: 0.00, variant: 'secondary' as const },
            { label: '3x', price: baseCost * 3, commRate: 0.10, variant: 'secondary' as const },
            { label: 'MSRP', price: retail, commRate: 0.10, variant: 'default' as const },
        ];

        // Filter: Hide any tier where Price > MSRP (unless it IS the MSRP tier or Partner)
        // Also ensure MSRP > 0 to show it
        return tiers.filter(t => {
            if (t.label === 'MSRP') return retail > 0;
            if (t.label === 'Partner') return true; // always show partner tier when present
            if (retail > 0 && t.price > retail) return false;
            return true;
        });
    };

    // Handle Prefill from Admin Requests
    useEffect(() => {
        const state = location.state as { prefill?: { email?: string; peptideId?: string; quantity?: number; notes?: string } } | null;
        if (state?.prefill && contacts && peptides) {
            const { email, peptideId, quantity, notes: prefillNotes } = state.prefill;

            if (email) {
                const contact = contacts.find(c => c.email?.toLowerCase() === email.toLowerCase());
                if (contact) setSelectedContactId(contact.id);
            }

            if (peptideId && quantity > 0) {
                const peptide = peptides.find(p => p.id === peptideId);
                if (peptide) {
                    setCart(prev => {
                        if (prev.some(i => i.peptide.id === peptideId)) return prev;

                        const baseCost = getBaseCost(peptide, activeProfile);
                        const prefillIsPartner = contacts?.find(c => c.email?.toLowerCase() === email?.toLowerCase())?.type === 'partner';
                        const tiers = getPricingTiers(peptide, baseCost, prefillIsPartner);
                        const msrpTier = prefillIsPartner
                            ? (tiers.find(t => t.label === 'Partner') || tiers[0])
                            : (tiers.find(t => t.label === 'MSRP') || tiers[0]);

                        return [{
                            peptide,
                            quantity: quantity,
                            unitPrice: msrpTier.price,
                            basePrice: baseCost,
                            commissionRate: msrpTier.commRate
                        }];
                    });
                }
            }

            if (prefillNotes) setNotes(prev => prev ? prev : prefillNotes);
        }
    }, [location.state, contacts, peptides, activeProfile]);

    const activePeptides = peptides?.filter(p => p.active) || [];

    const filteredPeptides = activePeptides.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedContact = contacts?.find(c => c.id === selectedContactId);
    const isPartnerOrder = selectedContact?.type === 'partner';

    // Auto-apply Partner pricing when a partner contact is selected
    useEffect(() => {
        if (isPartnerOrder && cart.length > 0) {
            setCart(prev => prev.map(item => {
                const rawAvgCost = (item.peptide.avg_cost && item.peptide.avg_cost > 0)
                    ? item.peptide.avg_cost
                    : item.basePrice;
                const partnerPrice = Math.round(rawAvgCost * 2 * 100) / 100;
                return { ...item, unitPrice: partnerPrice, commissionRate: 0 };
            }));
        }
    }, [isPartnerOrder]);

    // Fetch commission chain when contact changes
    useEffect(() => {
        if (!selectedContactId) {
            setCommissionChain([]);
            return;
        }

        const fetchChain = async () => {
            const { data: contact } = await supabase
                .from('contacts')
                .select('assigned_rep_id')
                .eq('id', selectedContactId)
                .single();

            if (!contact?.assigned_rep_id) {
                setCommissionChain([]);
                return;
            }

            const chain: CommissionChainEntry[] = [];

            const { data: rep } = await supabase
                .from('profiles')
                .select('id, full_name, commission_rate, parent_rep_id, partner_tier')
                .eq('id', contact.assigned_rep_id)
                .single();

            if (rep) {
                const rate = rep.commission_rate != null ? Number(rep.commission_rate) : 0.10;
                chain.push({
                    profileId: rep.id,
                    name: rep.full_name || 'Unknown Rep',
                    tier: rep.partner_tier || 'standard',
                    type: 'direct',
                    defaultRate: rate,
                    mode: 'percentage',
                    value: rate * 100,
                });

                if (rep.parent_rep_id) {
                    const { data: parent } = await supabase
                        .from('profiles')
                        .select('id, full_name, commission_rate, parent_rep_id, partner_tier')
                        .eq('id', rep.parent_rep_id)
                        .single();

                    if (parent) {
                        const parentRate = parent.commission_rate != null ? Number(parent.commission_rate) : 0.05;
                        chain.push({
                            profileId: parent.id,
                            name: parent.full_name || 'Unknown',
                            tier: parent.partner_tier || 'standard',
                            type: 'second_tier_override',
                            defaultRate: parentRate,
                            mode: 'percentage',
                            value: parentRate * 100,
                        });

                        if (parent.parent_rep_id) {
                            const { data: gp } = await supabase
                                .from('profiles')
                                .select('id, full_name, commission_rate, partner_tier')
                                .eq('id', parent.parent_rep_id)
                                .single();

                            if (gp) {
                                const gpRate = gp.commission_rate != null ? Number(gp.commission_rate) : 0.03;
                                chain.push({
                                    profileId: gp.id,
                                    name: gp.full_name || 'Unknown',
                                    tier: gp.partner_tier || 'standard',
                                    type: 'third_tier_override',
                                    defaultRate: gpRate,
                                    mode: 'percentage',
                                    value: gpRate * 100,
                                });
                            }
                        }
                    }
                }
            }

            setCommissionChain(chain);
        };

        fetchChain();
    }, [selectedContactId]);

    // Handle adding to cart
    const addToCart = (peptide: Peptide) => {
        const baseCost = getBaseCost(peptide, activeProfile);
        const tiers = getPricingTiers(peptide, baseCost, isPartnerOrder);
        // Partners default to Partner tier; others default to MSRP
        const defaultTier = isPartnerOrder
            ? (tiers.find(t => t.label === 'Partner') || tiers[0])
            : (tiers.find(t => t.label === 'MSRP') || tiers[tiers.length - 1]);

        setCart(prev => {
            const existing = prev.find(item => item.peptide.id === peptide.id);
            if (existing) {
                return prev.map(item =>
                    item.peptide.id === peptide.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, {
                peptide,
                quantity: 1,
                unitPrice: defaultTier.price,
                basePrice: baseCost,
                commissionRate: defaultTier.commRate
            }];
        });
    };

    const updateQuantity = (id: string, qty: number) => {
        if (qty < 1) return;
        setCart(prev => prev.map(item => item.peptide.id === id ? { ...item, quantity: qty } : item));
    };

    const updatePrice = (id: string, price: number, commRate: number) => {
        if (price < 0) return;
        setCart(prev => prev.map(item => item.peptide.id === id ? { ...item, unitPrice: price, commissionRate: commRate } : item));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.peptide.id !== id));
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    // Calculate total commission — chain-based when chain exists, per-item rates otherwise
    const totalCommission = commissionEnabled
        ? (commissionChain.length > 0
            ? commissionChain.reduce((sum, entry) => {
                if (entry.mode === 'none') return sum;
                const amount = entry.mode === 'percentage'
                    ? (entry.value / 100) * cartTotal
                    : entry.value;
                return sum + Math.max(0, Math.round(amount * 100) / 100);
            }, 0)
            : cart.reduce((sum, item) => sum + (item.unitPrice * item.commissionRate * item.quantity), 0)
        )
        : 0;

    const handleSubmit = async () => {
        if (!selectedContactId || cart.length === 0) return;

        // Build manual commission entries when chain is active
        const manualCommissions = commissionEnabled && commissionChain.length > 0
            ? commissionChain.filter(e => {
                if (e.mode === 'none') return false;
                const amt = e.mode === 'percentage' ? (e.value / 100) * cartTotal : e.value;
                return amt > 0;
            }).map(entry => ({
                profile_id: entry.profileId,
                amount: Math.round(
                    (entry.mode === 'percentage' ? (entry.value / 100) * cartTotal : entry.value) * 100
                ) / 100,
                commission_rate: entry.mode === 'percentage'
                    ? entry.value / 100
                    : (cartTotal > 0 ? entry.value / cartTotal : 0),
                type: entry.type,
            }))
            : undefined;

        try {
            await createOrder.mutateAsync({
                client_id: selectedContactId,
                status: 'submitted',
                notes: notes,
                shipping_address: deliveryMethod === 'ship' ? (shippingAddress || selectedContact?.address || undefined) : undefined,
                delivery_method: deliveryMethod,
                items: cart.map(item => ({
                    peptide_id: item.peptide.id,
                    quantity: item.quantity,
                    unit_price: item.unitPrice
                })),
                commission_amount: totalCommission,
                manual_commissions: manualCommissions,
                payment_status: isPartnerOrder ? 'commission_offset' : undefined,
                payment_method: isPartnerOrder ? 'commission_offset' : undefined,
            });
            navigate('/sales');
        } catch (error) {
            console.error("Failed to create order", error);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] lg:flex-row gap-6">
            {isPreviewMode && (
                <div className="absolute top-16 left-0 right-0 z-50 px-6 pointer-events-none">
                    <Alert className="bg-amber-500/15 border-amber-500/30 text-amber-400 pointer-events-auto shadow-md max-w-2xl mx-auto">
                        <Eye className="h-4 w-4" />
                        <AlertTitle>Admin Preview Mode</AlertTitle>
                        <AlertDescription>
                            Viewing as <strong>{activeProfile?.full_name}</strong>. Prices reflect their specific multiplier (x{activeProfile?.price_multiplier || 1}).
                            <Button variant="link" size="sm" className="px-2 h-auto text-amber-400 underline" onClick={() => navigate('/admin/reps')}>
                                Exit Preview
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* Left: Product Catalog */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden pt-12 lg:pt-0">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 pb-20">
                    {filteredPeptides.map((peptide) => {
                        const inCart = cart.find(i => i.peptide.id === peptide.id);
                        const stock = peptide.stock_count || 0;
                        const baseCost = getBaseCost(peptide, activeProfile);
                        const tiers = getPricingTiers(peptide, baseCost, isPartnerOrder);
                        const defaultPrice = isPartnerOrder
                            ? (tiers.find(t => t.label === 'Partner')?.price || tiers[0].price)
                            : (tiers.find(t => t.label === 'MSRP')?.price || tiers[tiers.length - 1].price);

                        return (
                            <Card key={peptide.id} className={`cursor-pointer transition-all hover:border-primary ${inCart ? 'border-primary bg-primary/5' : ''}`} onClick={() => addToCart(peptide)}>
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-base font-semibold">{peptide.name}</CardTitle>
                                        <Badge variant={stock > 0 ? "outline" : "destructive"}>
                                            {stock} in stock
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                        {peptide.description || "No description"}
                                    </p>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-muted-foreground">{peptide.sku}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-green-700">${defaultPrice.toFixed(0)}</span>
                                            <Button size="sm" variant="secondary" className="h-8">
                                                Add <Plus className="ml-1 h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>

            {/* Right: Cart / Checkout */}
            <Card className="w-full lg:w-[400px] flex flex-col h-full border-l rounded-none shadow-xl">
                <CardHeader className="border-b bg-muted/20">
                    <CardTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Current Order
                    </CardTitle>
                    {activeProfile && (
                        <p className="text-xs text-muted-foreground">
                            {activeProfile?.pricing_mode === 'cost_plus'
                                ? `Pricing: Avg Cost + $${Number(activeProfile?.cost_plus_markup) || 0} markup`
                                : `Pricing: Avg Cost x ${activeProfile?.price_multiplier || 1}`
                            }
                        </p>
                    )}
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-3">
                        <label className="text-sm font-semibold flex items-center gap-2">
                            <User className="h-4 w-4" /> Customer
                        </label>
                        <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Customer" />
                            </SelectTrigger>
                            <SelectContent>
                                {contacts?.map(contact => (
                                    <SelectItem key={contact.id} value={contact.id}>
                                        {contact.name} {contact.email ? `(${contact.email})` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {selectedContact && (
                            <div className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-lg border border-border/40">
                                {selectedContact.address || "No address on file"}
                            </div>
                        )}
                        {isPartnerOrder && (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/30">
                                <Users className="h-4 w-4 text-violet-400 shrink-0" />
                                <div>
                                    <p className="text-xs font-semibold text-violet-400">Partner Pricing Active</p>
                                    <p className="text-[10px] text-violet-400/70">All items set to 2x cost (avg cost × 2)</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <label className="text-sm font-semibold">Add Product</label>
                        <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={openCombobox}
                                    className="w-full justify-between"
                                    disabled={!selectedContactId}
                                >
                                    Select product...
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0">
                                <Command>
                                    <CommandInput placeholder="Search peptides..." />
                                    <CommandList>
                                        <CommandEmpty>No peptide found.</CommandEmpty>
                                        <CommandGroup>
                                            {activePeptides.map((peptide) => (
                                                <CommandItem
                                                    key={peptide.id}
                                                    value={peptide.name}
                                                    onSelect={() => {
                                                        addToCart(peptide);
                                                        setOpenCombobox(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            cart.some(item => item.peptide.id === peptide.id) ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col">
                                                        <span>{peptide.name}</span>
                                                        <span className="text-xs text-muted-foreground">{peptide.stock_count || 0} in stock</span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-4">
                        {cart.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Cart is empty
                            </div>
                        ) : (
                            cart.map(item => {
                                const tiers = getPricingTiers(item.peptide, item.basePrice, isPartnerOrder);

                                return (
                                    <div key={item.peptide.id} className="flex flex-col gap-2 p-3 border border-border/60 rounded-lg bg-card">
                                        <div className="flex justify-between items-start">
                                            <span className="font-medium">{item.peptide.name}</span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.peptide.id)} aria-label={`Remove ${item.peptide.name} from cart`}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center border border-border/60 rounded-lg">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" aria-label="Decrease quantity" onClick={() => updateQuantity(item.peptide.id, item.quantity - 1)}>-</Button>
                                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" aria-label="Increase quantity" onClick={() => updateQuantity(item.peptide.id, item.quantity + 1)}>+</Button>
                                            </div>

                                            <div className="flex items-center border border-border/60 rounded-lg">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" aria-label="Decrease price" onClick={() => updatePrice(item.peptide.id, Math.max(0, Math.round(item.unitPrice) - 1), item.commissionRate)}>-</Button>
                                                <span className="w-14 text-center text-sm font-medium">${Math.round(item.unitPrice)}</span>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" aria-label="Increase price" onClick={() => updatePrice(item.peptide.id, Math.round(item.unitPrice) + 1, item.commissionRate)}>+</Button>
                                            </div>

                                            <div className="w-16 text-right font-medium">
                                                ${(item.quantity * item.unitPrice).toFixed(0)}
                                            </div>
                                        </div>

                                        {/* Calculated commission display — hidden when chain-based */}
                                        {commissionEnabled && commissionChain.length === 0 && (
                                            <div className="text-right text-xs text-muted-foreground">
                                                Comm: ${(item.unitPrice * item.commissionRate * item.quantity).toFixed(2)} ({(item.commissionRate * 100).toFixed(0)}%)
                                            </div>
                                        )}

                                        {/* Suggested Pricing Badges */}
                                        <div className="flex flex-wrap gap-2 mt-1 justify-end">
                                            <div className="text-xs text-muted-foreground self-center mr-1">Tiers:</div>
                                            {tiers.map(tier => (
                                                <Badge
                                                    key={tier.label}
                                                    variant={tier.label === 'Partner' ? 'default' : tier.variant}
                                                    className={cn(
                                                        "cursor-pointer transition-colors",
                                                        item.unitPrice === tier.price
                                                            ? 'ring-2 ring-primary ring-offset-1'
                                                            : 'hover:bg-muted',
                                                        tier.label === 'Partner' && 'bg-violet-600 hover:bg-violet-700 text-white'
                                                    )}
                                                    onClick={() => updatePrice(item.peptide.id, tier.price, tier.commRate)}
                                                >
                                                    {tier.label}: ${tier.price.toFixed(0)}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-sm font-semibold">Delivery Method</label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant={deliveryMethod === 'ship' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setDeliveryMethod('ship')}
                                >
                                    <Truck className="mr-2 h-4 w-4" /> Ship
                                </Button>
                                <Button
                                    type="button"
                                    variant={deliveryMethod === 'local_pickup' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setDeliveryMethod('local_pickup')}
                                >
                                    <MapPin className="mr-2 h-4 w-4" /> Local Pickup
                                </Button>
                            </div>
                        </div>
                        {deliveryMethod === 'ship' && (
                            <div className="space-y-1">
                                <label className="text-sm font-semibold">Shipping Address</label>
                                <Textarea
                                    placeholder="Enter shipping address if different..."
                                    value={shippingAddress}
                                    onChange={e => setShippingAddress(e.target.value)}
                                    className="min-h-[60px]"
                                />
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-sm font-semibold">Notes</label>
                            <Textarea
                                placeholder="Order notes..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="min-h-[60px]"
                            />
                        </div>
                    </div>

                    <Separator />

                    <div
                        className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                            commissionEnabled
                                ? "bg-green-500/10 border-green-500/30"
                                : "bg-muted/50 border-border/60"
                        )}
                        onClick={() => setCommissionEnabled(!commissionEnabled)}
                    >
                        <div>
                            <p className="text-sm font-semibold">Commission</p>
                            <p className="text-xs text-muted-foreground">
                                {commissionEnabled ? "Commissions will be paid on this order" : "No commissions on this order"}
                            </p>
                        </div>
                        {commissionEnabled
                            ? <ToggleRight className="h-6 w-6 text-green-500" />
                            : <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                        }
                    </div>

                    {/* Commission Chain — who gets paid */}
                    {commissionEnabled && commissionChain.length > 0 && (
                        <div className="space-y-3 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Commission Breakdown</p>
                            {commissionChain.map((entry, idx) => {
                                const isNone = entry.mode === 'none';
                                const calcAmount = isNone ? 0
                                    : entry.mode === 'percentage'
                                        ? Math.round((entry.value / 100) * cartTotal * 100) / 100
                                        : Math.round(entry.value * 100) / 100;
                                const calcPct = entry.mode === 'flat' && cartTotal > 0
                                    ? ((entry.value / cartTotal) * 100).toFixed(1)
                                    : null;

                                return (
                                    <div key={entry.profileId} className={cn(
                                        "flex flex-col gap-1.5 p-2.5 rounded-md border transition-all",
                                        isNone
                                            ? "bg-muted/30 border-border/30 opacity-60"
                                            : "bg-background border-border/40"
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className={cn("text-sm font-medium", isNone && "line-through")}>{entry.name}</span>
                                                <Badge variant="outline" className="text-[10px] h-5">
                                                    {entry.type === 'direct' ? 'Direct' : entry.type === 'second_tier_override' ? '2nd Tier' : '3rd Tier'}
                                                </Badge>
                                            </div>
                                            {isNone
                                                ? <span className="text-xs font-semibold text-muted-foreground">NONE</span>
                                                : <span className="text-sm font-bold text-green-600">${calcAmount.toFixed(2)}</span>
                                            }
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex border rounded-md overflow-hidden">
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "px-2 py-1 text-xs transition-colors",
                                                        entry.mode === 'percentage'
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted hover:bg-muted/80"
                                                    )}
                                                    onClick={() => {
                                                        setCommissionChain(prev => prev.map((e, i) =>
                                                            i === idx ? { ...e, mode: 'percentage', value: e.defaultRate * 100 } : e
                                                        ));
                                                    }}
                                                >
                                                    <Percent className="h-3 w-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "px-2 py-1 text-xs transition-colors",
                                                        entry.mode === 'flat'
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted hover:bg-muted/80"
                                                    )}
                                                    onClick={() => {
                                                        const flatDefault = Math.round(entry.defaultRate * cartTotal * 100) / 100;
                                                        setCommissionChain(prev => prev.map((e, i) =>
                                                            i === idx ? { ...e, mode: 'flat', value: flatDefault } : e
                                                        ));
                                                    }}
                                                >
                                                    <DollarSign className="h-3 w-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        "px-2 py-1 text-xs transition-colors font-semibold",
                                                        entry.mode === 'none'
                                                            ? "bg-destructive text-destructive-foreground"
                                                            : "bg-muted hover:bg-muted/80"
                                                    )}
                                                    onClick={() => {
                                                        setCommissionChain(prev => prev.map((e, i) =>
                                                            i === idx ? { ...e, mode: 'none', value: 0 } : e
                                                        ));
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                            {!isNone && (
                                                <>
                                                    <div className="relative flex-1">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step={entry.mode === 'percentage' ? '0.5' : '0.01'}
                                                            value={entry.value}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                setCommissionChain(prev => prev.map((e2, i) =>
                                                                    i === idx ? { ...e2, value: val } : e2
                                                                ));
                                                            }}
                                                            className="h-8 text-right pr-8"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                            {entry.mode === 'percentage' ? '%' : '$'}
                                                        </span>
                                                    </div>
                                                    {calcPct && (
                                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">({calcPct}%)</span>
                                                    )}
                                                </>
                                            )}
                                            {isNone && (
                                                <span className="text-xs text-muted-foreground italic">No commission for this person</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex justify-between text-sm font-bold pt-1 border-t border-green-500/20">
                                <span>Total Commission</span>
                                <span className="text-green-600">${totalCommission.toFixed(2)}</span>
                            </div>
                        </div>
                    )}

                </CardContent>

                <CardFooter className="flex flex-col border-t bg-muted/20 p-4 gap-4">
                    <div className="flex justify-between w-full text-lg font-bold">
                        <span>Total</span>
                        <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    {totalCommission > 0 && (
                        <div className="flex justify-between w-full text-sm text-green-600 font-medium">
                            <span>Est. Commission</span>
                            <span>+${totalCommission.toFixed(2)}</span>
                        </div>
                    )}
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={!selectedContactId || cart.length === 0 || createOrder.isPending}
                        onClick={handleSubmit}
                    >
                        {createOrder.isPending ? "Processing..." : (
                            <>Create Order <ChevronRight className="ml-2 h-4 w-4" /></>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div >
    );
}
