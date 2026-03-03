import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, User, Mail, Phone } from 'lucide-react';

interface CustomerInfoCardProps {
    order: any;
}

export function CustomerInfoCard({ order }: CustomerInfoCardProps) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" /> Customer Info
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <div>
                    <div className="font-medium text-base">{order.contacts?.name || 'Unknown Contact'}</div>
                    <div className="text-muted-foreground flex items-center gap-2 mt-1">
                        <Mail className="h-3.5 w-3.5" />
                        {order.contacts?.email || 'No email provided'}
                    </div>
                    {order.contacts?.phone && (
                        <div className="text-muted-foreground flex items-center gap-2 mt-1">
                            <Phone className="h-3.5 w-3.5" />
                            {order.contacts.phone}
                        </div>
                    )}
                </div>

                {order.delivery_method !== 'local_pickup' && order.shipping_address && (
                    <div className="pt-3 border-t">
                        <div className="font-medium mb-1 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            Shipping Address
                        </div>
                        <div className="text-muted-foreground whitespace-pre-wrap pl-6">
                            {order.shipping_address}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
