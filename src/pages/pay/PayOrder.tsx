import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CreditCard, CheckCircle2, Package, Copy, Check, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function PayOrder() {
    const { orderId } = useParams<{ orderId: string }>();
    const queryClient = useQueryClient();

    const [copied, setCopied] = useState(false);
    const [showManual, setShowManual] = useState(false);

    // Card checkout state
    const [payingCard, setPayingCard] = useState(false);
    const [waitingForPayment, setWaitingForPayment] = useState(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { data: order, isLoading, error } = useQuery({
        queryKey: ['public_pay_order', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    id, total_amount, status, payment_status, created_at,
                    org_id,
                    sales_order_items (
                        id, quantity, unit_price,
                        peptides (id, name)
                    )
                `)
                .eq('id', orderId)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!orderId,
    });

    // Fetch org name for branding
    const { data: org } = useQuery({
        queryKey: ['public_org', order?.org_id],
        queryFn: async () => {
            if (!order?.org_id) return null;
            const { data } = await supabase
                .from('organizations')
                .select('name')
                .eq('id', order.org_id)
                .maybeSingle();
            return data;
        },
        enabled: !!order?.org_id,
    });

    const isPaid = order?.payment_status === 'paid';
    const isCancelled = order?.status === 'cancelled';
    const total = Number(order?.total_amount || 0);
    const CARD_FEE_RATE = 0.03;
    const cardFee = Math.round(total * CARD_FEE_RATE * 100) / 100;
    const cardTotal = Math.round((total + cardFee) * 100) / 100;

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    // Stop polling when payment detected
    useEffect(() => {
        if (isPaid && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, [isPaid]);

    // Poll for payment completion while checkout is active
    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await supabase
                    .from('sales_orders')
                    .select('payment_status')
                    .eq('id', orderId!)
                    .maybeSingle();
                if (data?.payment_status === 'paid') {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                    queryClient.invalidateQueries({ queryKey: ['public_pay_order', orderId] });
                }
            } catch {
                // Silently retry on next interval
            }
        }, 3000);
    }, [orderId, queryClient]);

    // Open PayGate365 checkout → goes directly to Stripe card form (no provider selection)
    const handlePayWithCard = useCallback(async () => {
        if (!orderId || payingCard) return;
        setPayingCard(true);
        setCheckoutError(null);
        try {
            const response = await fetch('/api/checkout/create-paygate-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Failed to start checkout (${response.status})`);
            }
            const { checkout_url } = await response.json();
            if (!checkout_url) throw new Error('No checkout URL received');
            // Open directly to Stripe card form in new tab
            window.open(checkout_url, '_blank');
            setWaitingForPayment(true);
            startPolling();
        } catch (err: any) {
            setCheckoutError(err.message || 'Failed to start payment');
        } finally {
            setPayingCard(false);
        }
    }, [orderId, payingCard, startPolling]);

    const copyOrderId = () => {
        if (orderId) {
            navigator.clipboard.writeText(orderId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!order || error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-8 pb-6 text-center space-y-3">
                        <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
                        <h1 className="text-xl font-bold">Order Not Found</h1>
                        <p className="text-sm text-muted-foreground">
                            This payment link may be invalid or the order may have been removed.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isPaid) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <Card className="max-w-md w-full overflow-hidden">
                    <div className="h-2 bg-green-500" />
                    <CardContent className="pt-8 pb-6 text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-bold">Payment Complete</h1>
                        <p className="text-muted-foreground">
                            This order has already been paid. Thank you!
                        </p>
                        <div className="text-sm text-muted-foreground">
                            Total: <span className="font-semibold text-foreground">${total.toFixed(2)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isCancelled) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-8 pb-6 text-center space-y-3">
                        <Package className="h-12 w-12 mx-auto text-muted-foreground/40" />
                        <h1 className="text-xl font-bold">Order Cancelled</h1>
                        <p className="text-sm text-muted-foreground">
                            This order has been cancelled and can no longer be paid.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background px-4 py-8">
            <div className="max-w-lg mx-auto space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold">{org?.name || 'Invoice'}</h1>
                    <p className="text-muted-foreground text-sm">Payment requested</p>
                </div>

                {/* Order Summary */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Order Summary
                            </h2>
                            <Badge variant="secondary">Unpaid</Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                            {order.sales_order_items?.map((item: any) => (
                                <div key={item.id} className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        {item.peptides?.name || 'Item'} &times; {item.quantity}
                                    </span>
                                    <span className="font-medium">
                                        ${(item.unit_price * item.quantity).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <Separator />

                        <div className="space-y-1">
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Subtotal</span>
                                <span>${total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                                <span>Processing fee (3%)</span>
                                <span>${cardFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <span className="font-semibold">Total</span>
                                <span className="text-2xl font-bold text-primary">
                                    ${cardTotal.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Order ID */}
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                            <span className="text-xs text-muted-foreground">Order:</span>
                            <code className="text-xs font-mono flex-1 truncate">{order.id}</code>
                            <button
                                onClick={copyOrderId}
                                className="shrink-0 p-1 rounded hover:bg-muted"
                                aria-label="Copy order ID"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* Card Payment — one click to Stripe form */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        {waitingForPayment ? (
                            <div className="text-center py-6 space-y-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                <div className="space-y-1">
                                    <p className="font-semibold">Waiting for payment...</p>
                                    <p className="text-sm text-muted-foreground">
                                        Complete your card payment in the tab that just opened.
                                        This page will update automatically.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handlePayWithCard}
                                >
                                    Reopen payment page
                                </Button>
                            </div>
                        ) : (
                            <>
                                <Button
                                    className="w-full h-14 text-lg"
                                    onClick={handlePayWithCard}
                                    disabled={payingCard}
                                >
                                    {payingCard ? (
                                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    ) : (
                                        <CreditCard className="h-5 w-5 mr-2" />
                                    )}
                                    {payingCard ? 'Opening...' : `Pay $${cardTotal.toFixed(2)} with Card`}
                                </Button>

                                {checkoutError && (
                                    <p className="text-sm text-center text-destructive">{checkoutError}</p>
                                )}

                                <p className="text-xs text-center text-muted-foreground">
                                    Visa, Mastercard, Apple Pay, Google Pay accepted.
                                    Opens secure payment form.
                                </p>
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Alternative payment options — collapsed */}
                <div className="space-y-3">
                    <button
                        onClick={() => setShowManual(!showManual)}
                        className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                    >
                        <ChevronDown className={`h-4 w-4 transition-transform ${showManual ? 'rotate-180' : ''}`} />
                        {showManual ? 'Hide' : 'Other payment methods'}
                    </button>

                    {showManual && (
                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                {/* Manual Payment Methods */}
                                <div className="space-y-3 text-sm">
                                    <div className="p-3 rounded-lg border space-y-1">
                                        <p className="font-medium">Zelle</p>
                                        <p className="text-muted-foreground">
                                            Send payment via Zelle, then notify your sales rep to confirm.
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg border space-y-1">
                                        <p className="font-medium">Cash App</p>
                                        <p className="text-muted-foreground">
                                            Send payment via Cash App, then notify your sales rep to confirm.
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg border space-y-1">
                                        <p className="font-medium">Venmo</p>
                                        <p className="text-muted-foreground">
                                            Send payment via Venmo, then notify your sales rep to confirm.
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg border space-y-1">
                                        <p className="font-medium">Wire Transfer</p>
                                        <p className="text-muted-foreground">
                                            Contact your sales rep for wire transfer details.
                                        </p>
                                    </div>
                                </div>

                                <p className="text-xs text-center text-muted-foreground pt-2">
                                    For manual payments, your rep will confirm receipt and update the order.
                                    Reference Order #{order.id.slice(0, 8)} in your payment.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Secure payment processing
                </p>
            </div>
        </div>
    );
}
