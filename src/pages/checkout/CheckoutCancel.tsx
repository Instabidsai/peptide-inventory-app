import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

export default function CheckoutCancel() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');

    return (
        <div className="max-w-lg mx-auto py-12 px-4 space-y-6">
            <Card className="overflow-hidden">
                <div className="h-2 bg-red-400" />
                <CardContent className="pt-8 pb-6 text-center space-y-4">
                    <div className="flex justify-center">
                        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
                            <XCircle className="h-10 w-10 text-red-400" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Payment Cancelled
                    </h1>
                    <p className="text-muted-foreground">
                        Your payment was not processed. No charges have been made.
                        Your order has been saved and you can try again anytime.
                    </p>
                    {orderId && (
                        <p className="text-xs text-muted-foreground">
                            Order ID: {orderId.slice(0, 8)}...
                        </p>
                    )}
                </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
                <Button
                    className="w-full"
                    onClick={() => navigate('/store')}
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                </Button>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate('/my-orders')}
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    View My Orders
                </Button>
            </div>
        </div>
    );
}
