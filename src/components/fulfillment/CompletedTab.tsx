import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Truck, CheckCircle, MapPin, ExternalLink, Copy,
} from 'lucide-react';
import { getTrackingUrl } from '@/lib/tracking';
import type { CompletedTabProps } from './types';

export default function CompletedTab({
    orders,
    isOrderBusy,
    navigate,
    onMarkDelivered,
    toast,
}: CompletedTabProps) {
    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-lg font-semibold text-muted-foreground">No recent completions</p>
                    <p className="text-sm text-muted-foreground">Shipped and picked-up orders from the last 7 days will appear here.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {orders.map((order, index) => {
                const busy = isOrderBusy(order.id);

                return (
                    <motion.div
                        key={order.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                        <Card className={order.shipping_status === 'delivered' ? 'border-green-500/30 opacity-75' : 'border-emerald-500/30'}>
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${order.shipping_status === 'delivered' ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                                            {order.shipping_status === 'delivered' ? (
                                                <CheckCircle className="h-5 w-5 text-green-500" />
                                            ) : (
                                                <Truck className="h-5 w-5 text-amber-500" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-medium">{order.contacts?.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Order #{order.id.slice(0, 8)} —{' '}
                                                {order.sales_order_items?.map(i => `${i.quantity}x ${i.peptides?.name}`).join(', ')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {order.tracking_number && (
                                            <div className="flex items-center gap-1">
                                                <a
                                                    href={getTrackingUrl(order.carrier, order.tracking_number)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                                >
                                                    {order.tracking_number.length > 18
                                                        ? `${order.tracking_number.slice(0, 18)}...`
                                                        : order.tracking_number}
                                                </a>
                                                <Button variant="ghost" size="icon" aria-label="Copy tracking number" className="h-6 w-6"
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(order.tracking_number!);
                                                        toast({ title: 'Copied' });
                                                    }}>
                                                    <Copy className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        )}
                                        {order.delivery_method === 'local_pickup' ? (
                                            <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                                <MapPin className="h-3 w-3 mr-1" /> Picked Up
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className={
                                                order.shipping_status === 'delivered'
                                                    ? 'bg-green-500/15 text-green-500 border-green-500/30'
                                                    : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                                            }>
                                                {order.shipping_status === 'delivered' ? 'Delivered' : 'In Transit'}
                                            </Badge>
                                        )}

                                        {order.shipping_status === 'in_transit' && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-green-500/40 text-green-500"
                                                disabled={busy}
                                                onClick={() => onMarkDelivered(order.id)}
                                            >
                                                <CheckCircle className="mr-1 h-3 w-3" /> Delivered
                                            </Button>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="View order details"
                                            className="h-8 w-8"
                                            onClick={() => navigate(`/sales/${order.id}`)}
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </>
    );
}
