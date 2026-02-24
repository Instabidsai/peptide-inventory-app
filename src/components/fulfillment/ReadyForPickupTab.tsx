import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    MapPin, HandMetal, CheckCircle, ExternalLink, Undo2,
} from 'lucide-react';
import type { ReadyForPickupTabProps } from './types';

export default function ReadyForPickupTab({
    orders,
    isOrderBusy,
    navigate,
    onMarkPickedUp,
    onMoveToLabelShip,
    onMoveToPickPack,
}: ReadyForPickupTabProps) {
    if (orders.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center">
                    <HandMetal className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-lg font-semibold text-muted-foreground">No orders waiting for pickup</p>
                    <p className="text-sm text-muted-foreground">Local pickup orders will appear here after fulfillment.</p>
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
                        <Card className="border-orange-500/30">
                            <CardContent className="p-4">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-orange-500/10">
                                            <MapPin className="h-5 w-5 text-orange-500" />
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
                                        <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
                                            <MapPin className="h-3 w-3 mr-1" /> Local Pickup
                                        </Badge>
                                        <Button
                                            className="bg-green-600 hover:bg-green-700"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => onMarkPickedUp(order.id)}
                                        >
                                            {busy ? 'Updating...' : 'Picked Up'}
                                            <CheckCircle className="ml-1 h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-blue-500/40 text-blue-400"
                                            disabled={busy}
                                            onClick={() => onMoveToLabelShip(order.id)}
                                        >
                                            <Undo2 className="mr-1 h-3 w-3" /> Label & Ship
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
