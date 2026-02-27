import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { GlassCard } from '@/components/ui/glass-card';
import {
    ShoppingCart,
    Plus,
    Minus,
    CreditCard,
    Loader2,
    ExternalLink,
    Check,
    Copy,
    Banknote,
    Smartphone,
} from 'lucide-react';
import type { CartItem, PaymentMethod } from './types';

interface CartSummaryProps {
    cart: CartItem[];
    cartTotal: number;
    itemCount: number;
    shippingAddress: string;
    onShippingAddressChange: (address: string) => void;
    notes: string;
    onNotesChange: (notes: string) => void;
    paymentMethod: PaymentMethod;
    onPaymentMethodChange: (method: PaymentMethod) => void;
    orderPlaced: boolean;
    onOrderPlacedReset: () => void;
    placingOrder: boolean;
    checkoutPending: boolean;
    zelleEmail: string;
    venmoHandle: string;
    copiedZelle: boolean;
    onCopyZelle: () => void;
    onCheckout: () => void;
    onShowCheckoutConfirm: () => void;
    updateQuantity: (peptideId: string, delta: number) => void;
    cartRef: React.RefObject<HTMLDivElement>;
}

export function CartSummary({
    cart,
    cartTotal,
    itemCount,
    shippingAddress,
    onShippingAddressChange,
    notes,
    onNotesChange,
    paymentMethod,
    onPaymentMethodChange,
    orderPlaced,
    onOrderPlacedReset,
    placingOrder,
    checkoutPending,
    zelleEmail,
    venmoHandle,
    copiedZelle,
    onCopyZelle,
    onCheckout,
    onShowCheckoutConfirm,
    updateQuantity,
    cartRef,
}: CartSummaryProps) {
    return (
        <AnimatePresence>
        {cart.length > 0 && (
            <motion.div
                ref={cartRef}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
            <GlassCard className="border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden">
                {/* Gradient accent at top */}
                <div className="h-[2px] bg-gradient-brand-r" />
                <CardHeader className="pb-2 pt-5">
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-lg shadow-primary/20">
                            <ShoppingCart className="h-4 w-4 text-white" />
                        </div>
                        Your Order
                    </CardTitle>
                    <CardDescription className="ml-12">
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
                        <label htmlFor="cart-shipping" className="text-sm font-semibold">Shipping Address</label>
                        <Textarea
                            id="cart-shipping"
                            placeholder="Enter your shipping address..."
                            value={shippingAddress}
                            onChange={e => onShippingAddressChange(e.target.value)}
                            rows={2}
                        />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label htmlFor="cart-notes" className="text-sm font-semibold">Notes (optional)</label>
                        <Input
                            id="cart-notes"
                            placeholder="Any special instructions..."
                            value={notes}
                            onChange={e => onNotesChange(e.target.value)}
                        />
                    </div>

                    {/* Payment Method Selection */}
                    {!orderPlaced ? (
                        <div className="space-y-3">
                            <span className="text-sm font-semibold">Payment Method</span>
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
                                        onClick={() => onPaymentMethodChange(m.id)}
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
                                        <code className="flex-1 text-sm font-mono bg-card/50 rounded-lg px-2 py-1 border border-border/60 truncate">
                                            {zelleEmail}
                                        </code>
                                        <Button variant="outline" size="sm" onClick={onCopyZelle} className="shrink-0" aria-label="Copy Zelle email">
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
                                    <p className="text-xs font-medium text-blue-300">Pay via Venmo to @{venmoHandle}</p>
                                    <a
                                        href={`https://venmo.com/${venmoHandle}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        Open Venmo — ${cartTotal.toFixed(2)}
                                    </a>
                                    <p className="text-xs text-muted-foreground">
                                        Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via the link above or search @{venmoHandle} in Venmo.
                                    </p>
                                </div>
                            )}

                            <Button
                                className="w-full shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                                size="lg"
                                onClick={() => {
                                    if (paymentMethod === 'card') {
                                        onShowCheckoutConfirm();
                                    } else {
                                        onCheckout();
                                    }
                                }}
                                disabled={checkoutPending || placingOrder || cart.length === 0}
                            >
                                {(checkoutPending || placingOrder) ? (
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
                            <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
                                <Check className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <p className="font-semibold text-primary">Order Placed!</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Send <strong>${cartTotal.toFixed(2)}</strong> via{' '}
                                    {paymentMethod === 'zelle' ? 'Zelle' : paymentMethod === 'cashapp' ? 'Cash App' : 'Venmo'}
                                    {paymentMethod === 'zelle' && (
                                        <> to <strong>{zelleEmail}</strong></>
                                    )}
                                    {paymentMethod === 'venmo' && (
                                        <> to <strong>@{venmoHandle}</strong></>
                                    )}
                                </p>
                            </div>
                            {paymentMethod === 'zelle' && (
                                <Button variant="outline" size="sm" onClick={onCopyZelle}>
                                    {copiedZelle ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                    Copy Zelle Email
                                </Button>
                            )}
                            {paymentMethod === 'venmo' && (
                                <a
                                    href={`https://venmo.com/${venmoHandle}?txn=pay&amount=${cartTotal.toFixed(2)}&note=Order`}
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
                                onClick={onOrderPlacedReset}
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
    );
}
