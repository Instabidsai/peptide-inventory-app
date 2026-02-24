import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Package, Truck, CheckCircle, Printer,
    MapPin, AlertCircle, ExternalLink, Copy,
    AlertTriangle, RefreshCw, Undo2, ArrowRight, Store,
} from 'lucide-react';
import { getTrackingUrl } from '@/lib/tracking';
import type { LabelShipTabProps } from './types';

export default function LabelShipTab({
    orders,
    merchantOrgs,
    orderRates,
    selectedRates,
    isOrderBusy,
    navigate,
    onGetRates,
    onSelectRate,
    onBuyLabel,
    onCancelRates,
    onPrintLabel,
    onMarkPrinted,
    onMarkShipped,
    onMarkDelivered,
    onMoveToPickPack,
    onPrintPackingSlip,
    toast,
}: LabelShipTabProps) {
    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <Truck className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-lg font-semibold text-muted-foreground">Nothing to ship</p>
                    <p className="text-sm text-muted-foreground">Fulfill orders in the "Pick & Pack" tab first.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {orders.map((order, index) => {
                const busy = isOrderBusy(order.id);
                const hasError = order.shipping_status === 'error';

                return (
                    <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                        <Card className={hasError ? 'border-red-500/40' : 'border-blue-500/30'}>
                            <CardHeader className="pb-3">
                                <div className="flex flex-col sm:flex-row justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${hasError ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
                                            {hasError ? (
                                                <AlertTriangle className="h-5 w-5 text-red-500" />
                                            ) : (
                                                <Package className="h-5 w-5 text-blue-500" />
                                            )}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">
                                                Order #{order.id.slice(0, 8)}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground">
                                                {order.contacts?.name} — {format(new Date(order.created_at), 'MMM d')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {hasError ? (
                                            <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                                                <AlertTriangle className="h-3 w-3 mr-1" /> Label Error
                                            </Badge>
                                        ) : (
                                            <>
                                                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                                    <CheckCircle className="h-3 w-3 mr-1" /> Fulfilled
                                                </Badge>
                                                {order.shipping_status && order.shipping_status !== 'error' && (
                                                    <Badge variant="outline" className={
                                                        order.shipping_status === 'label_created' ? 'bg-blue-900/20 text-blue-400 border-blue-500/40' :
                                                        order.shipping_status === 'printed' ? 'bg-indigo-900/20 text-indigo-400 border-indigo-500/40' : ''
                                                    }>
                                                        {order.shipping_status.replace('_', ' ')}
                                                    </Badge>
                                                )}
                                            </>
                                        )}
                                        {order.is_supplier_order && (
                                            <Badge variant="outline" className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                                                <Store className="h-3 w-3 mr-1" />
                                                {merchantOrgs?.[order.source_org_id!] || 'Dropship'}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Shipping Error */}
                                {hasError && order.shipping_error && (
                                    <div className="bg-red-900/20 border border-red-500/40 p-3 rounded-lg text-sm text-red-400">
                                        <strong>Error:</strong> {order.shipping_error}
                                    </div>
                                )}

                                {/* Shipping Address */}
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                    <p className="text-sm">
                                        {order.shipping_address || <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No address — add in order details</span>}
                                    </p>
                                </div>

                                {/* Items summary */}
                                <div className="flex flex-wrap gap-2">
                                    {order.sales_order_items?.map(item => (
                                        <Badge key={item.id} variant="secondary" className="text-xs">
                                            {item.quantity}x {item.peptides?.name}
                                        </Badge>
                                    ))}
                                </div>

                                {/* Tracking Info */}
                                {order.tracking_number && (
                                    <div className="bg-muted/30 p-3 rounded-lg space-y-1">
                                        <p className="text-xs text-muted-foreground">Tracking Number</p>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={getTrackingUrl(order.carrier, order.tracking_number)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-mono bg-muted/50 px-3 py-1.5 rounded-lg flex-1 text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                            >
                                                {order.tracking_number}
                                            </a>
                                            <Button variant="ghost" size="icon" aria-label="Copy tracking number" className="h-7 w-7 shrink-0"
                                                onClick={() => {
                                                    navigator.clipboard.writeText(order.tracking_number!);
                                                    toast({ title: 'Tracking number copied' });
                                                }}>
                                                <Copy className="h-3 w-3" />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            via {order.carrier || 'Unknown'}
                                            {order.shipping_cost ? ` — $${Number(order.shipping_cost).toFixed(2)}` : ''}
                                        </p>
                                    </div>
                                )}

                                {/* -- 3-Step Label Flow -- */}

                                {/* STEP 1: Get Rates (no label yet, no rates fetched) */}
                                {!order.tracking_number && !orderRates[order.id]?.length && (
                                    <Button
                                        className={`w-full ${hasError ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                                        size="lg"
                                        disabled={busy || !order.shipping_address}
                                        onClick={() => onGetRates(order.id)}
                                    >
                                        {busy ? (
                                            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Fetching Rates...</>
                                        ) : hasError ? (
                                            <><RefreshCw className="mr-2 h-4 w-4" /> Retry — Get New Rates</>
                                        ) : (
                                            <><Truck className="mr-2 h-4 w-4" /> Get Shipping Rates</>
                                        )}
                                    </Button>
                                )}

                                {/* STEP 2: Rate Selection + Buy */}
                                {!order.tracking_number && orderRates[order.id]?.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold flex items-center gap-2">
                                            <Truck className="h-4 w-4" /> Select Shipping Rate
                                        </h4>
                                        <div className="grid gap-2">
                                            {orderRates[order.id].map((rate) => {
                                                const isSelected = selectedRates[order.id] === rate.object_id;
                                                return (
                                                    <div
                                                        key={rate.object_id}
                                                        onClick={() => onSelectRate(order.id, rate.object_id)}
                                                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer border transition-all ${
                                                            isSelected
                                                                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                                                                : 'border-muted hover:border-blue-500/40 bg-muted/30'
                                                        }`}
                                                    >
                                                        <div>
                                                            <p className="font-medium text-sm">
                                                                {rate.provider} {rate.servicelevel_name}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {rate.estimated_days
                                                                    ? `${rate.estimated_days} day${rate.estimated_days > 1 ? 's' : ''}`
                                                                    : rate.duration_terms || 'Delivery time varies'}
                                                            </p>
                                                        </div>
                                                        <p className={`text-lg font-bold ${isSelected ? 'text-blue-400' : ''}`}>
                                                            ${parseFloat(rate.amount).toFixed(2)}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Buy Label button */}
                                        {selectedRates[order.id] && (
                                            <Button
                                                className="w-full bg-green-600 hover:bg-green-700"
                                                size="lg"
                                                disabled={busy}
                                                onClick={() => onBuyLabel(order.id)}
                                            >
                                                {busy ? 'Purchasing Label...' : (
                                                    <>Buy Label — ${parseFloat(
                                                        orderRates[order.id].find(r => r.object_id === selectedRates[order.id])?.amount || '0'
                                                    ).toFixed(2)}</>
                                                )}
                                            </Button>
                                        )}

                                        {/* Cancel link */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full text-xs text-muted-foreground"
                                            onClick={() => onCancelRates(order.id)}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                )}

                                {/* STEP 3: Post-Purchase Actions (label exists) */}
                                {order.tracking_number && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                        {/* Print Label */}
                                        {order.label_url && (
                                            <Button
                                                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                                                size="lg"
                                                onClick={() => onPrintLabel(order.label_url!)}
                                            >
                                                <Printer className="mr-2 h-4 w-4" /> Print Label
                                            </Button>
                                        )}

                                        {/* Confirm Printed */}
                                        {order.shipping_status === 'label_created' && (
                                            <Button
                                                variant="outline"
                                                disabled={busy}
                                                onClick={() => onMarkPrinted(order.id)}
                                            >
                                                <CheckCircle className="mr-2 h-4 w-4" /> Confirm Printed
                                            </Button>
                                        )}

                                        {/* Mark Shipped */}
                                        {(order.shipping_status === 'label_created' || order.shipping_status === 'printed') && (
                                            <Button
                                                className="flex-1 bg-amber-600 hover:bg-amber-700"
                                                size="lg"
                                                disabled={busy}
                                                onClick={() => onMarkShipped(order.id)}
                                            >
                                                {busy ? 'Updating...' : 'Mark as Shipped'}
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Utility buttons (always visible) */}
                                <div className="flex gap-2 pt-1 flex-wrap">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-green-500/40 text-green-500"
                                        disabled={busy}
                                        onClick={() => onMarkDelivered(order.id)}
                                    >
                                        <CheckCircle className="mr-1 h-3 w-3" /> Already Done
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-amber-500/40 text-amber-400"
                                        disabled={busy}
                                        onClick={() => onMoveToPickPack(order.id)}
                                    >
                                        <Undo2 className="mr-1 h-3 w-3" /> Pick & Pack
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onPrintPackingSlip(order)}
                                    >
                                        <Printer className="mr-2 h-4 w-4" /> Slip
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => navigate(`/sales/${order.id}`)}
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </>
    );
}
