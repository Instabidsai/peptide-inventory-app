import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { XCircle, ArrowLeft, RefreshCw, ShieldCheck, Copy, Check, CreditCard, Globe, HelpCircle } from 'lucide-react';
import { trackCheckoutCancelled } from '@/lib/funnel-tracker';

export default function CheckoutCancel() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId');
    const [copied, setCopied] = useState(false);

    useEffect(() => { trackCheckoutCancelled(orderId); }, []);

    const copyOrderId = () => {
        if (orderId) {
            navigator.clipboard.writeText(orderId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

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
                    </p>
                    <div className="flex items-center justify-center gap-2 text-xs text-primary">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Your items are still saved — you can try again anytime</span>
                    </div>
                </CardContent>
            </Card>

            {/* Full Order ID with copy */}
            {orderId && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                    <span className="text-xs text-muted-foreground/60">Order ID:</span>
                    <code className="text-xs font-mono flex-1 truncate">{orderId}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Copy order ID" onClick={copyOrderId}>
                        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground/50" />}
                    </Button>
                </div>
            )}

            {/* Troubleshooting tips */}
            <Card>
                <CardContent className="pt-5 pb-4 space-y-3">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        Having trouble?
                    </h2>
                    <div className="space-y-2.5 text-xs text-muted-foreground">
                        <div className="flex items-start gap-2.5">
                            <CreditCard className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Check that your card details are correct and the card isn't expired</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Try disabling your ad blocker or using a different browser</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>Your bank may have blocked the transaction — try contacting them</span>
                        </div>
                    </div>
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
