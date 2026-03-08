import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassCard } from '@/components/ui/glass-card';
import { AddressAutocomplete } from './AddressAutocomplete';
import {
    ShoppingCart,
    Plus,
    Minus,
    Loader2,
    ExternalLink,
    Check,
    Copy,
    Banknote,
    Smartphone,
    Coins,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CartItem, PaymentMethod } from './types';
import type { CryptoWallet } from '@/hooks/use-tenant-config';

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
    checkoutPending?: boolean;
    zelleEmail: string;
    venmoHandle: string;
    cashappHandle: string;
    cryptoWallets?: CryptoWallet[];
    selectedCryptoWalletId?: string;
    onSelectCryptoWallet?: (walletId: string) => void;
    copiedZelle: boolean;
    onCopyZelle: () => void;
    onCheckout: () => void;
    updateQuantity: (peptideId: string, delta: number) => void;
    cartRef: React.RefObject<HTMLDivElement>;
    highlight?: boolean;
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
    cashappHandle,
    cryptoWallets,
    selectedCryptoWalletId,
    onSelectCryptoWallet,
    copiedZelle,
    onCopyZelle,
    onCheckout,
    updateQuantity,
    cartRef,
    highlight,
}: CartSummaryProps) {
    const { toast } = useToast();
    const [venmoOpening, setVenmoOpening] = React.useState(false);
    const [copiedCrypto, setCopiedCrypto] = React.useState(false);

    const enabledWallets = (cryptoWallets || []).filter(w => w.enabled && w.address);
    const selectedWallet = enabledWallets.find(w => w.id === selectedCryptoWalletId) || enabledWallets[0];

    const copyCryptoAddress = async () => {
        if (!selectedWallet) return;
        try {
            await navigator.clipboard.writeText(selectedWallet.address);
        } catch {
            const input = document.createElement('input');
            input.value = selectedWallet.address;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedCrypto(true);
        setTimeout(() => setCopiedCrypto(false), 2000);
        toast({ title: 'Wallet address copied!' });
    };

    const openVenmo = () => {
        if (venmoOpening) return;
        setVenmoOpening(true);
        setTimeout(() => setVenmoOpening(false), 3000);
        const handle = (venmoHandle || '').replace(/^@/, '');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${cartTotal.toFixed(2)}&note=Order`;
        } else {
            const url = `https://venmo.com/${encodeURIComponent(handle)}`;
            const w = window.open(url, '_blank');
            if (!w) window.location.href = url;
        }
        toast({
            title: 'Opening Venmo...',
            description: `Send $${cartTotal.toFixed(2)} to @${venmoHandle}.`,
        });
    };

    // Auto-reset cart 8 seconds after order is placed
    React.useEffect(() => {
        if (!orderPlaced) return;
        const timer = setTimeout(() => onOrderPlacedReset(), 8000);
        return () => clearTimeout(timer);
    }, [orderPlaced, onOrderPlacedReset]);

    const getMethodLabel = (method: PaymentMethod) => {
        if (method === 'zelle') return 'Zelle';
        if (method === 'cashapp') return 'Cash App';
        if (method === 'venmo') return 'Venmo';
        if (method === 'crypto' && selectedWallet) return `${selectedWallet.type} (${selectedWallet.chain})`;
        return 'Crypto';
    };

    return (
        <AnimatePresence>
        {(cart.length > 0 || orderPlaced) && (
            <motion.div
                ref={cartRef}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
            <GlassCard className={`border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden transition-shadow duration-500 ${highlight ? 'ring-2 ring-primary/40 shadow-primary/30' : ''}`}>
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
                    {/* Cart items, total, shipping, notes — hidden after order placed */}
                    {!orderPlaced && (
                        <>
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

                            <div className="border-t pt-3 flex justify-between items-center">
                                <span className="text-muted-foreground">Total</span>
                                <span className="text-xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                            </div>

                            <AddressAutocomplete
                                value={shippingAddress}
                                onChange={onShippingAddressChange}
                                disabled={orderPlaced}
                            />

                            <div className="space-y-2">
                                <label htmlFor="cart-notes" className="text-sm font-semibold">Notes (optional)</label>
                                <Input
                                    id="cart-notes"
                                    placeholder="Any special instructions..."
                                    value={notes}
                                    onChange={e => onNotesChange(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* Payment Method Selection */}
                    {!orderPlaced ? (
                        <div className="space-y-3">
                            <span className="text-sm font-semibold">Payment Method</span>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { id: 'zelle' as PaymentMethod, label: 'Zelle', icon: Banknote },
                                    { id: 'cashapp' as PaymentMethod, label: 'Cash App', icon: Smartphone },
                                    { id: 'venmo' as PaymentMethod, label: 'Venmo', icon: Smartphone },
                                    ...(enabledWallets.length > 0
                                        ? [{ id: 'crypto' as PaymentMethod, label: 'Crypto', icon: Coins }]
                                        : []),
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
                                    <p className="text-xs font-medium text-green-300">Pay via Cash App to {cashappHandle || '$cashtag'}</p>
                                    <a
                                        href={`https://cash.app/${cashappHandle?.replace('@', '$')}/${cartTotal.toFixed(2)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm font-medium text-green-400 hover:underline"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        Open Cash App — ${cartTotal.toFixed(2)}
                                    </a>
                                    <p className="text-xs text-muted-foreground">
                                        Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> via the link above or search {cashappHandle || 'our Cash App'} in the Cash App.
                                    </p>
                                </div>
                            )}

                            {/* Venmo info */}
                            {paymentMethod === 'venmo' && (
                                <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-medium text-blue-300">Pay via Venmo to @{venmoHandle}</p>
                                    <button
                                        type="button"
                                        onClick={openVenmo}
                                        disabled={venmoOpening}
                                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-400 hover:underline disabled:opacity-50"
                                    >
                                        {venmoOpening ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                                        {venmoOpening ? 'Opening Venmo...' : `Open Venmo App — $${cartTotal.toFixed(2)}`}
                                    </button>
                                    <p className="text-xs text-muted-foreground">
                                        Tap above to open the Venmo app. If it doesn't open, search <strong>@{venmoHandle}</strong> in Venmo and send <strong>${cartTotal.toFixed(2)}</strong>.
                                    </p>
                                </div>
                            )}

                            {/* Crypto info */}
                            {paymentMethod === 'crypto' && selectedWallet && (
                                <div className="bg-amber-950/30 border border-amber-800 rounded-lg p-3 space-y-2">
                                    <p className="text-xs font-medium text-amber-300">
                                        Send {selectedWallet.type} on {selectedWallet.chain} to:
                                    </p>

                                    {/* Wallet selector if multiple wallets */}
                                    {enabledWallets.length > 1 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {enabledWallets.map(w => (
                                                <Button
                                                    key={w.id}
                                                    variant={selectedWallet.id === w.id ? 'default' : 'outline'}
                                                    size="sm"
                                                    className="text-xs h-7 px-2"
                                                    onClick={() => onSelectCryptoWallet?.(w.id)}
                                                >
                                                    {w.type} ({w.chain})
                                                </Button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 text-xs font-mono bg-card/50 rounded-lg px-2 py-1 border border-border/60 truncate">
                                            {selectedWallet.address}
                                        </code>
                                        <Button variant="outline" size="sm" onClick={copyCryptoAddress} className="shrink-0" aria-label="Copy wallet address">
                                            {copiedCrypto ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                        </Button>
                                    </div>

                                    <div className="bg-amber-900/20 rounded-md px-2 py-1.5 border border-amber-800/30">
                                        <p className="text-xs text-amber-200 font-medium">
                                            <Coins className="h-3 w-3 inline mr-1" />
                                            {selectedWallet.type} on {selectedWallet.chain} network
                                        </p>
                                    </div>

                                    <p className="text-xs text-muted-foreground">
                                        Place your order, then send <strong>${cartTotal.toFixed(2)}</strong> worth of {selectedWallet.type} to the address above. We'll confirm when received.
                                    </p>
                                </div>
                            )}

                            <Button
                                className="w-full shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
                                size="lg"
                                onClick={onCheckout}
                                disabled={placingOrder || cart.length === 0}
                            >
                                {placingOrder ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                )}
                                {`Place Order — $${cartTotal.toFixed(2)}`}
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
                                    {getMethodLabel(paymentMethod)}
                                    {paymentMethod === 'zelle' && (
                                        <> to <strong>{zelleEmail}</strong></>
                                    )}
                                    {paymentMethod === 'venmo' && (
                                        <> to <strong>@{venmoHandle}</strong></>
                                    )}
                                    {paymentMethod === 'cashapp' && (
                                        <> to <strong>{cashappHandle}</strong></>
                                    )}
                                </p>
                                {paymentMethod === 'crypto' && selectedWallet && (
                                    <div className="mt-2 space-y-1.5">
                                        <p className="text-xs font-medium text-amber-400">
                                            <Coins className="h-3 w-3 inline mr-1" />
                                            {selectedWallet.type} on {selectedWallet.chain}
                                        </p>
                                        <div className="flex items-center gap-2 justify-center">
                                            <code className="text-xs font-mono bg-card/50 rounded-lg px-2 py-1 border border-border/60 max-w-[220px] truncate">
                                                {selectedWallet.address}
                                            </code>
                                            <Button variant="outline" size="sm" onClick={copyCryptoAddress} className="shrink-0 h-7">
                                                {copiedCrypto ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {paymentMethod === 'zelle' && (
                                <Button variant="outline" size="sm" onClick={onCopyZelle}>
                                    {copiedZelle ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                    Copy Zelle Email
                                </Button>
                            )}
                            {paymentMethod === 'venmo' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={openVenmo}
                                    disabled={venmoOpening}
                                >
                                    {venmoOpening ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ExternalLink className="h-3 w-3 mr-1" />}
                                    {venmoOpening ? 'Opening...' : 'Open Venmo App to Pay'}
                                </Button>
                            )}
                            {paymentMethod === 'cashapp' && (
                                <a
                                    href={`https://cash.app/${cashappHandle?.replace('@', '$')}/${cartTotal.toFixed(2)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Button variant="outline" size="sm">
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Open Cash App to Pay
                                    </Button>
                                </a>
                            )}
                            {paymentMethod === 'crypto' && selectedWallet && (
                                <Button variant="outline" size="sm" onClick={copyCryptoAddress}>
                                    {copiedCrypto ? <Check className="h-3 w-3 mr-1 text-green-500" /> : <Copy className="h-3 w-3 mr-1" />}
                                    Copy Wallet Address
                                </Button>
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
