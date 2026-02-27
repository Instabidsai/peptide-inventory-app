import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CreditCard, CheckCircle2, Package, Copy, Check, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';

export default function PayOrder() {
    const { orderId } = useParams<{ orderId: string }>();
    const [searchParams] = useSearchParams();
    const processorParam = searchParams.get('processor');
    const queryClient = useQueryClient();

    const [paying, setPaying] = useState(false);
    const [payingPaygate, setPayingPaygate] = useState(false);
    const [copied, setCopied] = useState(false);
    const [autoTriggered, setAutoTriggered] = useState(false);

    // Popup + polling state
    const [waitingForPayment, setWaitingForPayment] = useState(false);
    const [activeProcessor, setActiveProcessor] = useState<'psifi' | 'paygate365' | null>(null);
    const popupRef = useRef<Window | null>(null);
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

    // Cleanup polling + popup on unmount
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
            setWaitingForPayment(false);
            setActiveProcessor(null);
            setPaying(false);
            setPayingPaygate(false);
            popupRef.current?.close();
        }
    }, [isPaid]);

    const openCheckoutPopup = useCallback((url: string) => {
        const w = 520, h = 720;
        const left = Math.max(0, (screen.width - w) / 2);
        const top = Math.max(0, (screen.height - h) / 2);
        const popup = window.open(
            url,
            'PaymentCheckout',
            `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );
        popupRef.current = popup;
        return popup;
    }, []);

    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);

        pollRef.current = setInterval(async () => {
            // Check if popup was closed by the user
            if (popupRef.current && popupRef.current.closed) {
                clearInterval(pollRef.current!);
                pollRef.current = null;
                setWaitingForPayment(false);
                setActiveProcessor(null);
                setPaying(false);
                setPayingPaygate(false);
                // Do one final check in case payment completed right as they closed
                queryClient.invalidateQueries({ queryKey: ['public_pay_order', orderId] });
                return;
            }

            // Poll order payment status
            try {
                const { data } = await supabase
                    .from('sales_orders')
                    .select('payment_status')
                    .eq('id', orderId!)
                    .maybeSingle();

                if (data?.payment_status === 'paid') {
                    clearInterval(pollRef.current!);
                    pollRef.current = null;
                    popupRef.current?.close();
                    // Refresh the order data to trigger the isPaid state
                    queryClient.invalidateQueries({ queryKey: ['public_pay_order', orderId] });
                }
            } catch {
                // Silently retry on next interval
            }
        }, 3000);
    }, [orderId, queryClient]);

    const cancelWaiting = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        popupRef.current?.close();
        setWaitingForPayment(false);
        setActiveProcessor(null);
        setPaying(false);
        setPayingPaygate(false);
    };

    const handlePayWithCard = async () => {
        if (!orderId) return;
        setPaying(true);
        try {
            const response = await fetch('/api/checkout/create-public-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.psifi_error || err.error || `Payment failed (${response.status})`);
            }

            const { checkout_url } = await response.json();
            if (!checkout_url) throw new Error('No checkout URL received');

            openCheckoutPopup(checkout_url);
            setWaitingForPayment(true);
            setActiveProcessor('psifi');
            startPolling();
        } catch (err: any) {
            alert(err.message || 'Payment failed. Please try again.');
            setPaying(false);
        }
    };

    const handlePayWithPaygate365 = async () => {
        if (!orderId) return;
        setPayingPaygate(true);
        try {
            const response = await fetch('/api/checkout/create-paygate-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Payment failed (${response.status})`);
            }

            const { checkout_url } = await response.json();
            if (!checkout_url) throw new Error('No checkout URL received');

            openCheckoutPopup(checkout_url);
            setWaitingForPayment(true);
            setActiveProcessor('paygate365');
            startPolling();
        } catch (err: any) {
            alert(err.message || 'Payment failed. Please try again.');
            setPayingPaygate(false);
        }
    };

    // Auto-trigger specific processor when ?processor= param is present
    useEffect(() => {
        if (!order || isPaid || isCancelled || autoTriggered) return;
        if (processorParam === 'psifi') {
            setAutoTriggered(true);
            handlePayWithCard();
        } else if (processorParam === 'paygate365') {
            setAutoTriggered(true);
            handlePayWithPaygate365();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order, processorParam, autoTriggered]);

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

                {/* Waiting for Payment Overlay */}
                {waitingForPayment && (
                    <Card className="border-primary/30 bg-primary/5">
                        <CardContent className="pt-6 pb-5 text-center space-y-4">
                            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                            <div className="space-y-1">
                                <h2 className="text-lg font-semibold">Completing Payment...</h2>
                                <p className="text-sm text-muted-foreground">
                                    Finish paying in the checkout window.
                                    {activeProcessor === 'psifi' && ' (PsiFi)'}
                                    {activeProcessor === 'paygate365' && ' (PayGate365)'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    This page will update automatically when payment is confirmed.
                                </p>
                            </div>
                            <div className="flex gap-2 justify-center">
                                <Button variant="outline" size="sm" onClick={() => {
                                    // Re-open popup if it was closed/blocked
                                    if (!popupRef.current || popupRef.current.closed) {
                                        if (activeProcessor === 'psifi') handlePayWithCard();
                                        else if (activeProcessor === 'paygate365') handlePayWithPaygate365();
                                    } else {
                                        popupRef.current.focus();
                                    }
                                }}>
                                    Reopen Checkout Window
                                </Button>
                                <Button variant="ghost" size="sm" onClick={cancelWaiting}>
                                    <X className="mr-1 h-3.5 w-3.5" /> Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

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

                        <div className="flex justify-between items-center">
                            <span className="font-semibold">Total Due</span>
                            <span className="text-2xl font-bold text-primary">
                                ${total.toFixed(2)}
                            </span>
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

                {/* Payment Options — hidden when waiting */}
                {!waitingForPayment && (
                    <Card>
                        <CardContent className="pt-6 space-y-4">
                            <h2 className="font-semibold">Pay with Card</h2>
                            <p className="text-xs text-muted-foreground -mt-2">
                                Includes 3% processing fee (${cardFee.toFixed(2)})
                            </p>

                            {/* PsiFi Card Payment */}
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handlePayWithCard}
                                disabled={paying || payingPaygate}
                            >
                                {paying ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Opening checkout...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Pay ${cardTotal.toFixed(2)} — PsiFi
                                    </>
                                )}
                            </Button>

                            {/* PayGate365 Card Payment */}
                            <Button
                                className="w-full"
                                size="lg"
                                variant="outline"
                                onClick={handlePayWithPaygate365}
                                disabled={payingPaygate || paying}
                            >
                                {payingPaygate ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Opening checkout...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Pay ${cardTotal.toFixed(2)} — PayGate365
                                    </>
                                )}
                            </Button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <Separator className="w-full" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-card px-2 text-muted-foreground">or pay manually</span>
                                </div>
                            </div>

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

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Secure checkout powered by PsiFi &amp; PayGate365
                </p>
            </div>
        </div>
    );
}
