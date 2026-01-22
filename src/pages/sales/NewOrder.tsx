import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Search, Plus, ShoppingCart, Trash2, User, ChevronRight, Eye } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CartItem {
    peptide: Peptide;
    quantity: number;
    unitPrice: number;
    basePrice: number; // Keep track of base for reference
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

    const activePeptides = peptides?.filter(p => p.active) || [];

    const filteredPeptides = activePeptides.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedContact = contacts?.find(c => c.id === selectedContactId);

    // Calculate Price based on Active Profile Multiplier
    const getRepPrice = (peptide: Peptide) => {
        // Default to 1.0 multiplier if not found
        const multiplier = activeProfile?.price_multiplier || 1.0;
        // Retrieve base price (assuming retail_price column added, fallback to 0)
        const basePrice = (peptide as any).retail_price || 0;
        return basePrice * multiplier;
    };

    // Handle adding to cart
    const addToCart = (peptide: Peptide) => {
        const price = getRepPrice(peptide);

        setCart(prev => {
            const existing = prev.find(item => item.peptide.id === peptide.id);
            if (existing) {
                return prev.map(item =>
                    item.peptide.id === peptide.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { peptide, quantity: 1, unitPrice: price, basePrice: (peptide as any).retail_price || 0 }];
        });
    };

    const updateQuantity = (id: string, qty: number) => {
        if (qty < 1) return;
        setCart(prev => prev.map(item => item.peptide.id === id ? { ...item, quantity: qty } : item));
    };

    const updatePrice = (id: string, price: number) => {
        if (price < 0) return;
        setCart(prev => prev.map(item => item.peptide.id === id ? { ...item, unitPrice: price } : item));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.peptide.id !== id));
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const handleSubmit = async () => {
        if (!selectedContactId || cart.length === 0) return;

        try {
            await createOrder.mutateAsync({
                client_id: selectedContactId,
                status: 'submitted',
                notes: notes,
                shipping_address: shippingAddress || selectedContact?.address || undefined,
                items: cart.map(item => ({
                    peptide_id: item.peptide.id,
                    quantity: item.quantity,
                    unit_price: item.unitPrice
                }))
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
                    <Alert className="bg-amber-100 border-amber-300 text-amber-900 pointer-events-auto shadow-md max-w-2xl mx-auto">
                        <Eye className="h-4 w-4" />
                        <AlertTitle>Admin Preview Mode</AlertTitle>
                        <AlertDescription>
                            Viewing as <strong>{activeProfile?.full_name}</strong>. Prices reflect their specific multiplier (x{activeProfile?.price_multiplier || 1}).
                            <Button variant="link" size="sm" className="px-2 h-auto text-amber-900 underline" onClick={() => navigate('/admin/reps')}>
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
                        const price = getRepPrice(peptide);

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
                                            <span className="font-bold text-green-700">${price.toFixed(0)}</span>
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
                    {activeProfile?.price_multiplier !== 1 && (
                        <p className="text-xs text-muted-foreground">
                            Pricing Multiplier: x{activeProfile?.price_multiplier} active
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

                    <div className="space-y-4">
                        {cart.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Cart is empty
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.peptide.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-card">
                                    <div className="flex justify-between items-start">
                                        <span className="font-medium">{item.peptide.name}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.peptide.id)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center border rounded-md">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-r-none" onClick={() => updateQuantity(item.peptide.id, item.quantity - 1)}>-</Button>
                                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-l-none" onClick={() => updateQuantity(item.peptide.id, item.quantity + 1)}>+</Button>
                                        </div>

                                        <div className="flex-1">
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updatePrice(item.peptide.id, parseFloat(e.target.value) || 0)}
                                                    className="pl-5 h-8 text-right"
                                                    placeholder="Price"
                                                />
                                            </div>
                                        </div>

                                        <div className="w-16 text-right font-medium">
                                            ${(item.quantity * item.unitPrice).toFixed(0)}
                                        </div>
                                    </div>
                                    {/* Show base price comparison if different significantly */}
                                </div>
                            ))
                        )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Shipping Address</label>
                            <Textarea
                                placeholder="Enter shipping address if different..."
                                value={shippingAddress}
                                onChange={e => setShippingAddress(e.target.value)}
                                className="min-h-[60px]"
                            />
                        </div>
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
