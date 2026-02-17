import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { usePeptides, type Peptide } from '@/hooks/use-peptides';
import { useContacts } from '@/hooks/use-contacts';
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
import { Search, Plus, ShoppingCart, Trash2, User, ChevronRight, Eye, Check, ChevronsUpDown, Truck, MapPin } from 'lucide-react';
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
    const getBaseCost = (peptide: Peptide, profile: any) => {
        const avgCost = (peptide.avg_cost && peptide.avg_cost > 0) ? peptide.avg_cost : ((peptide as any).retail_price || 10.50);
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
    const getPricingTiers = (peptide: Peptide, baseCost: number) => {
        const retail = (peptide as any).retail_price || 0;

        // Define Tiers
        const tiers = [
            { label: 'Cost', price: baseCost, commRate: 0.00, variant: 'outline' as const },
            { label: '2x', price: baseCost * 2, commRate: 0.05, variant: 'secondary' as const },
            { label: '3x', price: baseCost * 3, commRate: 0.10, variant: 'secondary' as const },
            { label: 'MSRP', price: retail, commRate: 0.15, variant: 'default' as const },
        ];

        // Filter: Hide any tier where Price > MSRP (unless it IS the MSRP tier)
        // Also ensure MSRP > 0 to show it
        return tiers.filter(t => {
            if (t.label === 'MSRP') return retail > 0;
            // If 3x breaks MSRP, hide it. 
            if (retail > 0 && t.price > retail) return false;
            return true;
        });
    };

    // Handle Prefill from Admin Requests
    useEffect(() => {
        const state = location.state as any;
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
                        // Default to MSRP for prefill? Or Cost? Let's use MSRP logic if safer, or just Cost if Admin request?
                        // Admin prefill usually implies "Send this to client". Let's default to MSRP (15%).
                        const tiers = getPricingTiers(peptide, baseCost);
                        const msrpTier = tiers.find(t => t.label === 'MSRP') || tiers[0];

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

    // Handle adding to cart
    const addToCart = (peptide: Peptide) => {
        const baseCost = getBaseCost(peptide, activeProfile);
        const tiers = getPricingTiers(peptide, baseCost);
        // Default to MSRP if available, else highest tier?
        // User wants to start high.
        const defaultTier = tiers.find(t => t.label === 'MSRP') || tiers[tiers.length - 1];

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

    // Calculate total commission based on line items
    // Comm = UnitPrice * CommRate * Qty
    const totalCommission = cart.reduce((sum, item) => sum + (item.unitPrice * item.commissionRate * item.quantity), 0);

    const handleSubmit = async () => {
        if (!selectedContactId || cart.length === 0) return;

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
                commission_amount: totalCommission // Send calculated commission
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
                        const tiers = getPricingTiers(peptide, baseCost);
                        const defaultPrice = tiers.find(t => t.label === 'MSRP')?.price || tiers[tiers.length - 1].price;

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
                            {(activeProfile as any)?.pricing_mode === 'cost_plus'
                                ? `Pricing: Avg Cost + $${Number((activeProfile as any)?.cost_plus_markup) || 0} markup`
                                : `Pricing: Avg Cost x ${activeProfile?.price_multiplier || 1}`
                            }
                        </p>
                    )}
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-3">
                        <label className="text-sm font-medium flex items-center gap-2">
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
                            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                {selectedContact.address || "No address on file"}
                            </div>
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <label className="text-sm font-medium">Add Product</label>
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
                                const tiers = getPricingTiers(item.peptide, item.basePrice);

                                return (
                                    <div key={item.peptide.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-card">
                                        <div className="flex justify-between items-start">
                                            <span className="font-medium">{item.peptide.name}</span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.peptide.id)} aria-label={`Remove ${item.peptide.name} from cart`}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center border rounded-md">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" aria-label="Decrease quantity" onClick={() => updateQuantity(item.peptide.id, item.quantity - 1)}>-</Button>
                                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" aria-label="Increase quantity" onClick={() => updateQuantity(item.peptide.id, item.quantity + 1)}>+</Button>
                                            </div>

                                            <div className="flex-1">
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={item.unitPrice}
                                                        onChange={(e) => {
                                                            const newPrice = parseFloat(e.target.value) || 0;
                                                            // Find closest tier to preserve commission rate
                                                            const closestTier = tiers.reduce((best, t) =>
                                                                Math.abs(t.price - newPrice) < Math.abs(best.price - newPrice) ? t : best
                                                            , tiers[0]);
                                                            updatePrice(item.peptide.id, newPrice, closestTier.commRate);
                                                        }}
                                                        className="pl-5 h-8 text-right"
                                                        placeholder="Price"
                                                    />
                                                </div>
                                            </div>

                                            <div className="w-16 text-right font-medium">
                                                ${(item.quantity * item.unitPrice).toFixed(0)}
                                            </div>
                                        </div>

                                        {/* Calculated commission display */}
                                        <div className="text-right text-xs text-muted-foreground">
                                            Comm: ${(item.unitPrice * item.commissionRate * item.quantity).toFixed(2)} ({item.commissionRate * 100}%)
                                        </div>

                                        {/* Suggested Pricing Badges */}
                                        <div className="flex flex-wrap gap-2 mt-1 justify-end">
                                            <div className="text-xs text-muted-foreground self-center mr-1">Tiers:</div>
                                            {tiers.map(tier => (
                                                <Badge
                                                    key={tier.label}
                                                    variant={tier.variant} // outline for Cost, secondary for 2x/3x, default for MSRP
                                                    className={`cursor-pointer transition-colors ${item.unitPrice === tier.price ? 'ring-2 ring-primary ring-offset-1' : 'hover:bg-muted'}`}
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
                            <label className="text-sm font-medium">Delivery Method</label>
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
                                <label className="text-sm font-medium">Shipping Address</label>
                                <Textarea
                                    placeholder="Enter shipping address if different..."
                                    value={shippingAddress}
                                    onChange={e => setShippingAddress(e.target.value)}
                                    className="min-h-[60px]"
                                />
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Notes</label>
                            <Textarea
                                placeholder="Order notes..."
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="min-h-[60px]"
                            />
                        </div>
                    </div>

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
