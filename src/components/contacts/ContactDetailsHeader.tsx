import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import type { Contact } from '@/hooks/use-contacts';
import type { OrderStats } from './types';

interface ContactDetailsHeaderProps {
    contact: Contact;
    orderStats: OrderStats | null | undefined;
}

function ContactDetailsHeaderBase({ contact, orderStats }: ContactDetailsHeaderProps) {
    const navigate = useNavigate();

    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Contacts
            </Button>
            <nav className="flex items-center text-sm text-muted-foreground">
                <Link to="/contacts" className="hover:text-foreground transition-colors">Contacts</Link>
                <span className="mx-2">/</span>
                <span className="text-foreground font-medium">{contact.name}</span>
            </nav>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{contact.name}</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <Badge variant={contact.type === 'customer' ? 'default' : 'secondary'} className="text-md px-3 py-1 capitalize">
                            {contact.type}
                        </Badge>
                        {contact.source === 'woocommerce' && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                Website Customer
                            </Badge>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer Stats */}
            {orderStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-primary">{orderStats.orderCount}</p>
                            <p className="text-xs text-muted-foreground">Total Orders</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold">${orderStats.totalSpend.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Lifetime Spend</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold">${orderStats.avgOrderValue.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Avg Order Value</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-muted-foreground">
                                {orderStats.lastOrderDate ? format(new Date(orderStats.lastOrderDate), 'MMM d') : '\u2014'}
                            </p>
                            <p className="text-xs text-muted-foreground">Last Order</p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </>
    );
}

export const ContactDetailsHeader = memo(ContactDetailsHeaderBase);
