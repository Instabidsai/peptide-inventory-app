import { Card, CardContent } from '@/components/ui/card';
import { CircleDot, CreditCard, Package, MapPin, Truck, Printer, CheckCircle } from 'lucide-react';

interface OrderProgressTimelineProps {
    order: any;
}

export function OrderProgressTimeline({ order }: OrderProgressTimelineProps) {
    if (order.status === 'cancelled') return null;

    return (
        <Card className="overflow-hidden">
            <CardContent className="py-4">
                <div className="flex items-center justify-between">
                    {(order.delivery_method === 'local_pickup' ? [
                        { label: 'Created', done: true, icon: CircleDot },
                        { label: order.payment_status === 'commission_offset' ? 'Offset' : 'Paid', done: order.payment_status === 'paid' || order.payment_status === 'commission_offset', icon: CreditCard },
                        { label: 'Fulfilled', done: order.status === 'fulfilled', icon: Package },
                        { label: 'Picked Up', done: order.shipping_status === 'delivered', icon: MapPin },
                    ] : [
                        { label: 'Created', done: true, icon: CircleDot },
                        { label: order.payment_status === 'commission_offset' ? 'Offset' : 'Paid', done: order.payment_status === 'paid' || order.payment_status === 'commission_offset', icon: CreditCard },
                        { label: 'Fulfilled', done: order.status === 'fulfilled', icon: Package },
                        { label: 'Label', done: !!order.tracking_number, icon: Truck },
                        { label: 'Printed', done: ['printed', 'in_transit', 'delivered'].includes(order.shipping_status || ''), icon: Printer },
                        { label: 'Delivered', done: order.shipping_status === 'delivered', icon: CheckCircle },
                    ]).map((step, i, arr) => (
                        <div key={step.label} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center gap-1">
                                <div className={`flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors ${step.done
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-muted-foreground/30 text-muted-foreground/50'
                                    }`}>
                                    <step.icon className="h-4 w-4" />
                                </div>
                                <span className={`text-xs font-semibold ${step.done ? 'text-green-600' : 'text-muted-foreground'}`}>
                                    {step.label}
                                </span>
                            </div>
                            {i < arr.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-2 mt-[-14px] ${step.done ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
