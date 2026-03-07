import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, Package, Copy, Check, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function PayOrder() {
    const { orderId } = useParams<{ orderId: string }>();
    const queryClient = useQueryClient();

    const [copied, setCopied] = useState(false);

    const { data: order, isLoading, error } = useQuery({
        queryKey: ['public_pay_order', orderId],
        queryFn: async () => {
            if (!orderId) return null;
            const { data, error: fetchError } = await supabase
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
            if (fetchError) throw fetchError;
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

    // Fetch tenant payment config (Zelle email, Venmo handle, etc.)
    const { data: tenantConfig } = useQuery({
        queryKey: ['public_tenant_config', order?.org_id],
        queryFn: async () => {
            if (!order?.org_id) return null;
            const { data } = await supabase
                .from('tenant_config')
                .select('zelle_email, venmo_handle, cashapp_handle, primary_color, brand_name, logo_url')
                .eq('org_id', order.org_id)
                .maybeSingle();
            return data;
        },
        enabled: !!order?.org_id,
    });

    // Apply tenant brand color to this page
    useEffect(() => {
        const hex = tenantConfig?.primary_color;
        if (!hex) return;
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            const rn = r / 255, gn = g / 255, bn = b / 255;
            h = max === rn / 1 ? 0 : 0; // fallback
            if (rn === max) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
            else if (gn === max) h = ((bn - rn) / d + 2) * 60;
            else h = ((rn - gn) / d + 4) * 60;
        }
        const hsl = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
        document.documentElement.style.setProperty('--primary', hsl);
        return () => { document.documentElement.style.removeProperty('--primary'); };
    }, [tenantConfig?.primary_color]);

    const [selectedManualMethod, setSelectedManualMethod] = useState<string | null>(null);
    const [confirmingManual, setConfirmingManual] = useState(false);

    const isPaid = order?.payment_status === 'paid';
    const isPendingVerification = order?.payment_status === 'pending_verification';
    const isCancelled = order?.status === 'cancelled';
    const total = Number(order?.total_amount || 0);

    const handleManualPaymentSelected = async (method: string) => {
        if (!orderId) return;
        setSelectedManualMethod(method);
        setConfirmingManual(true);
        try {
            await supabase
                .from('sales_orders')
                .update({
                    payment_status: 'pending_verification',
                    payment_method: method,
                })
                .eq('id', orderId);
            queryClient.invalidateQueries({ queryKey: ['public_pay_order', orderId] });
        } catch {
            // Non-critical — the status will still show in admin
        } finally {
            setConfirmingManual(false);
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

    if (isPendingVerification) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background px-4">
                <Card className="max-w-md w-full overflow-hidden">
                    <div className="h-2 bg-amber-500" />
                    <CardContent className="pt-8 pb-6 text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                            <Clock className="h-10 w-10 text-amber-500" />
                        </div>
                        <h1 className="text-2xl font-bold">Payment Pending Verification</h1>
                        <p className="text-muted-foreground">
                            {order?.payment_method
                                ? `Your ${order.payment_method} payment is being verified.`
                                : 'Your payment is being verified.'}
                            {' '}Your order will be processed once payment is confirmed.
                        </p>
                        <div className="text-sm text-muted-foreground">
                            Total: <span className="font-semibold text-foreground">${total.toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Reference Order #{order?.id?.slice(0, 8)} in your payment.
                        </p>
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
                    <h1 className="text-2xl font-bold">{tenantConfig?.brand_name || org?.name || 'Invoice'}</h1>
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
                            <h2 className="font-semibold">Payment Methods</h2>

                            {/* Manual Payment Methods */}
                            <div className="space-y-3 text-sm">
                                <p className="text-xs text-muted-foreground">
                                    Select your payment method below, then send payment. Your order will be marked as pending until verified.
                                </p>
                                {([
                                    ...(tenantConfig?.zelle_email ? [{ method: 'Zelle' as const, destination: tenantConfig.zelle_email }] : []),
                                    ...(tenantConfig?.cashapp_handle ? [{ method: 'Cash App' as const, destination: tenantConfig.cashapp_handle }] : []),
                                    ...(tenantConfig?.venmo_handle ? [{ method: 'Venmo' as const, destination: tenantConfig.venmo_handle }] : []),
                                    { method: 'Wire Transfer' as const, destination: null as string | null },
                                ]).map(({ method, destination }) => (
                                        <button
                                            key={method}
                                            onClick={() => handleManualPaymentSelected(method)}
                                            disabled={confirmingManual}
                                            className="w-full p-3 rounded-lg border border-border/60 hover:border-primary/50 hover:bg-primary/10 transition-colors text-left space-y-1 disabled:opacity-50"
                                        >
                                            <p className="font-semibold text-foreground">{method}</p>
                                            {destination ? (
                                                <p className="text-xs text-foreground/70">
                                                    Send to: <span className="font-semibold text-primary">{destination}</span>
                                                </p>
                                            ) : (
                                                <p className="text-xs text-foreground/70">
                                                    {method === 'Wire Transfer'
                                                        ? 'Contact your sales rep for wire transfer details.'
                                                        : `I'll pay via ${method} — mark as pending verification.`}
                                                </p>
                                            )}
                                        </button>
                                ))}
                            </div>

                            <p className="text-xs text-center text-muted-foreground pt-2">
                                Reference Order #{order.id.slice(0, 8)} in your payment.
                            </p>
                        </CardContent>
                    </Card>

                {/* Footer */}
                <p className="text-xs text-center text-muted-foreground">
                    Secure checkout
                </p>
            </div>
        </div>
    );
}
