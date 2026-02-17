import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    CheckCircle2,
    Loader2,
    Package,
    ArrowRight,
    ShoppingBag,
    Clock,
} from 'lucide-react';

export default function CheckoutSuccess() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');
    const [showConfetti, setShowConfetti] = useState(false);

    // Poll order status to confirm payment via webhook
    const { data: order, isLoading } = useQuery({
        queryKey: ['checkout_order', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            const { data, error } = await supabase
                .from('sales_orders')
                .select(`
                    *,
                    contacts (id, name),
                    sales_order_items (
                        *,
                        peptides (id, name)
                    )
                `)
                .eq('id', orderId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!orderId,
        refetchInterval: (query) => {
            // Stop polling once we get a definitive status
            const d = query.state.data;
            if (d?.payment_status === 'paid' || d?.psifi_status === 'complete') {
                return false;
            }
            return 3000; // Poll every 3s
        },
    });

    const isPaid = order?.payment_status === 'paid' || order?.psifi_status === 'complete';
    const isPending = !isPaid && order?.psifi_status !== 'failed';

    // Trigger confetti on paid
    useEffect(() => {
        if (isPaid && !showConfetti) {
            setShowConfetti(true);
            // Dynamic import to avoid bundling if not needed
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#3b82f6', '#8b5cf6'],
                });
            }).catch(() => { /* silently fail if confetti not available */ });
        }
    }, [isPaid, showConfetti]);

    if (!orderId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <p className="text-muted-foreground">No order found.</p>
                <Button onClick={() => navigate('/store')}>Return to Store</Button>
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto py-12 px-4 space-y-6">
            {/* Status Card */}
            <Card className="overflow-hidden">
                <div className={`h-2 ${isPaid ? 'bg-green-500' : 'bg-amber-400'}`} />
                <CardContent className="pt-8 pb-6 text-center space-y-4">
                    {isPaid ? (
                        <>
                            <div className="flex justify-center">
                                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">
                                Payment Successful!
                            </h1>
                            <p className="text-muted-foreground">
                                Your order has been confirmed and will be processed shortly.
                            </p>
                        </>
                    ) : isPending ? (
                        <>
                            <div className="flex justify-center">
                                <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                                    <Clock className="h-10 w-10 text-amber-500 animate-pulse" />
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight">
                                Confirming Payment...
                            </h1>
                            <p className="text-muted-foreground">
                                We're confirming your payment with the processor. This usually takes a few seconds.
                            </p>
                            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold tracking-tight">
                                Payment Status Unknown
                            </h1>
                            <p className="text-muted-foreground">
                                We'll update you once we hear back from the payment processor.
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Order Summary */}
            {order && (
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Order Summary
                            </h2>
                            <Badge variant={isPaid ? 'default' : 'secondary'}>
                                {isPaid ? 'Paid' : 'Pending'}
                            </Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                            {order.sales_order_items?.map((item) => (
                                <div key={item.id} className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        {item.peptides?.name || 'Unknown'} × {item.quantity}
                                    </span>
                                    <span className="font-medium">
                                        ${(item.unit_price * item.quantity).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="border-t pt-3 flex justify-between items-center">
                            <span className="font-medium">Total</span>
                            <span className="text-lg font-bold text-primary">
                                ${Number(order.total_amount || 0).toFixed(2)}
                            </span>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Order ID: {order.id?.slice(0, 8)}...
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
                <Button
                    className="w-full"
                    onClick={() => navigate('/my-orders')}
                >
                    <ShoppingBag className="h-4 w-4 mr-2" />
                    View My Orders
                </Button>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/store')}
                >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Continue Shopping
                </Button>
            </div>
        </div>
    );
}
