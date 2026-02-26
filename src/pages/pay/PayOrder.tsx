import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CreditCard, CheckCircle2, Package, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export default function PayOrder() {
    const { orderId } = useParams<{ orderId: string }>();
    const [paying, setPaying] = useState(false);
    const [copied, setCopied] = useState(false);

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

            window.location.href = checkout_url;
        } catch (err: any) {
            alert(err.message || 'Payment failed. Please try again.');
            setPaying(false);
        }
    };

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

                {/* Payment Options */}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <h2 className="font-semibold">Payment Options</h2>

                        {/* Card Payment */}
                        <div className="space-y-2">
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handlePayWithCard}
                                disabled={paying}
                            >
                                {paying ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Redirecting to payment...
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="mr-2 h-4 w-4" />
                                        Pay ${cardTotal.toFixed(2)} with Card
                                    </>
                                )}
                            </Button>
                            <div className="text-xs text-muted-foreground text-center space-y-0.5">
                                <p>Includes 3% processing fee (${cardFee.toFixed(2)})</p>
                                <p>Avoid the fee — pay with Zelle, Cash App, or Venmo below</p>
                            </div>
                        </div>

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

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Secure checkout powered by PsiFi
                </p>
            </div>
        </div>
    );
}
