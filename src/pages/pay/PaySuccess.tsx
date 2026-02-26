import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, Loader2, Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';

export default function PaySuccess() {
    const { orderId } = useParams<{ orderId: string }>();
    const pollCountRef = useRef(0);
    const [showConfetti, setShowConfetti] = useState(false);

    const { data: order, refetch } = useQuery({
        queryKey: ['pay_success_order', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            pollCountRef.current++;
            const { data, error } = await supabase
                .from('sales_orders')
                .select('id, total_amount, payment_status, psifi_status, status')
                .eq('id', orderId)
                .maybeSingle();
            if (error) throw error;
            return data;
        },
        enabled: !!orderId,
        refetchInterval: (query) => {
            const d = query?.state?.data;
            if (d?.payment_status === 'paid' || d?.psifi_status === 'complete') return false;
            if (pollCountRef.current >= 40) return false;
            return 3000;
        },
    });

    const isPaid = order?.payment_status === 'paid' || order?.psifi_status === 'complete';
    const timedOut = pollCountRef.current >= 40 && !isPaid;

    useEffect(() => {
        if (!isPaid || showConfetti) return;
        setShowConfetti(true);
        import('canvas-confetti').then(({ default: confetti }) => {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#10b981', '#3b82f6', '#8b5cf6'] });
        }).catch(() => {});
    }, [isPaid, showConfetti]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <Card className="max-w-md w-full overflow-hidden">
                <div className={`h-2 ${isPaid ? 'bg-green-500' : 'bg-amber-400'}`} />
                <CardContent className="pt-8 pb-6 text-center space-y-4">
                    {isPaid ? (
                        <>
                            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                                <CheckCircle2 className="h-10 w-10 text-green-500" />
                            </div>
                            <h1 className="text-2xl font-bold">Payment Successful!</h1>
                            <p className="text-muted-foreground">
                                Your payment of <span className="font-semibold text-foreground">${Number(order?.total_amount || 0).toFixed(2)}</span> has been confirmed.
                            </p>
                            <p className="text-sm text-muted-foreground">
                                You'll receive a confirmation and your order will be processed shortly.
                            </p>
                        </>
                    ) : timedOut ? (
                        <>
                            <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                                <Clock className="h-10 w-10 text-amber-500" />
                            </div>
                            <h1 className="text-2xl font-bold">Payment Processing</h1>
                            <p className="text-muted-foreground">
                                Your payment is still being confirmed. You'll receive a confirmation email once it's complete.
                            </p>
                            <Button variant="outline" size="sm" onClick={() => { pollCountRef.current = 0; refetch(); }}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Check Again
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
                                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                            </div>
                            <h1 className="text-2xl font-bold">Confirming Payment...</h1>
                            <p className="text-muted-foreground">
                                We're confirming your payment with the processor. This usually takes a few seconds.
                            </p>
                        </>
                    )}

                    {order && (
                        <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
                            <Package className="h-4 w-4" />
                            <span>Order #{order.id.slice(0, 8)}</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
