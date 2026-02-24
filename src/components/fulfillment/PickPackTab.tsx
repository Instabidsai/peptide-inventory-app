import { motion } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    Package, Truck, Printer, MapPin, User,
    AlertCircle, PackageCheck, ClipboardList,
    ExternalLink, AlertTriangle, Store,
} from 'lucide-react';
import type { PickPackTabProps } from './types';

export default function PickPackTab({
    orders,
    stockCounts,
    merchantOrgs,
    isOrderBusy,
    navigate,
    onFulfill,
    onPrintPackingSlip,
}: PickPackTabProps) {
    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-lg font-semibold text-muted-foreground">All caught up!</p>
                    <p className="text-sm text-muted-foreground">No orders waiting to be picked.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {orders.map((order, index) => {
                const orderAge = formatDistanceToNow(new Date(order.created_at), { addSuffix: true });
                const ageMs = Date.now() - new Date(order.created_at).getTime();
                const isUrgent = ageMs > 48 * 60 * 60 * 1000; // > 2 days old
                const busy = isOrderBusy(order.id);

                return (
                    <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                        <Card className={isUrgent ? 'border-red-500/40' : 'border-amber-500/30'}>
                            <CardHeader className="pb-3">
                                <div className="flex flex-col sm:flex-row justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${isUrgent ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                                            <ClipboardList className={`h-5 w-5 ${isUrgent ? 'text-red-500' : 'text-amber-500'}`} />
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">
                                                Order #{order.id.slice(0, 8)}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground">
                                                {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                                                <span className={`ml-2 ${isUrgent ? 'text-red-400 font-medium' : ''}`}>
                                                    ({orderAge})
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isUrgent && (
                                            <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                                                <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                            </Badge>
                                        )}
                                        <Badge variant="outline" className={
                                            order.payment_status === 'paid' ? "bg-green-500/15 text-green-500 border-green-500/30" :
                                            order.payment_status === 'partial' ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                            order.payment_status === 'commission_offset' ? "bg-violet-500/15 text-violet-400 border-violet-500/30" :
                                            "bg-red-500/15 text-red-400 border-red-500/30"
                                        }>
                                            {order.payment_status === 'paid' ? 'Paid' : order.payment_status === 'partial' ? 'Partial' : order.payment_status === 'commission_offset' ? 'Product Offset' : 'Unpaid'}
                                        </Badge>
                                        {order.delivery_method === 'local_pickup' ? (
                                            <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                <MapPin className="h-3 w-3 mr-1" /> Pickup
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                                                <Truck className="h-3 w-3 mr-1" /> Ship
                                            </Badge>
                                        )}
                                        {order.order_source === 'woocommerce' && (
                                            <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/30">
                                                WC
                                            </Badge>
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
                                {/* Customer + Shipping */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="flex items-start gap-2">
                                        <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                        <div>
                                            <p className="font-medium">{order.contacts?.name || 'Unknown'}</p>
                                            <p className="text-sm text-muted-foreground">{order.contacts?.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                        <p className="text-sm">
                                            {order.shipping_address || <span className="text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> No address on file</span>}
                                        </p>
                                    </div>
                                </div>

                                <Separator />

                                {/* Pick List */}
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                        <Package className="h-4 w-4" /> Items to Pick
                                    </h4>
                                    <div className="space-y-2">
                                        {order.sales_order_items?.map(item => {
                                            const stock = stockCounts?.[item.peptide_id];
                                            const hasStock = stock && stock.count >= item.quantity;
                                            return (
                                                <div key={item.id} className="flex items-center justify-between bg-muted/30 p-3 rounded-lg">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${hasStock ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>
                                                            {item.quantity}
                                                        </div>
                                                        <span className="font-medium">{item.peptides?.name || 'Unknown Peptide'}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-sm font-medium ${hasStock ? 'text-green-500' : 'text-red-500'}`}>
                                                            {stock?.count ?? 0} in stock
                                                        </span>
                                                        {!hasStock && (
                                                            <p className="text-xs text-red-400">Insufficient!</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Notes */}
                                {order.notes && (
                                    <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-sm">
                                        <strong className="text-amber-400">Note:</strong> {order.notes}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                    <Button
                                        className="flex-1 bg-green-600 hover:bg-green-700"
                                        size="lg"
                                        disabled={busy}
                                        onClick={() => onFulfill(order)}
                                    >
                                        {busy ? 'Fulfilling...' : 'Fulfill Order'}
                                        <PackageCheck className="ml-2 h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => onPrintPackingSlip(order)}
                                    >
                                        <Printer className="mr-2 h-4 w-4" /> Packing Slip
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
