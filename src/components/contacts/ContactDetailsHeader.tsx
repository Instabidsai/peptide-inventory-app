import { memo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Star } from 'lucide-react';
import { format } from 'date-fns';
import { useUpdateContact, type Contact, type ContactType } from '@/hooks/use-contacts';
import { useAuth } from '@/contexts/AuthContext';
import type { OrderStats } from './types';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ContactDetailsHeaderProps {
    contact: Contact;
    orderStats: OrderStats | null | undefined;
}

function ContactDetailsHeaderBase({ contact, orderStats }: ContactDetailsHeaderProps) {
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const updateContact = useUpdateContact();
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [upgradeDiscount, setUpgradeDiscount] = useState('10');
    const canEdit = userRole?.role === 'admin' || userRole?.role === 'staff' || userRole?.role === 'sales_rep';

    const handleUpgrade = async () => {
        await updateContact.mutateAsync({
            id: contact.id,
            type: 'preferred' as ContactType,
            discount_percent: Number(upgradeDiscount) || 0,
        });
        setShowUpgrade(false);
        setUpgradeDiscount('10');
    };

    return (
        <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Customers
            </Button>
            <nav className="flex items-center text-sm text-muted-foreground">
                <Link to="/contacts" className="hover:text-foreground transition-colors">Customers</Link>
                <span className="mx-2">/</span>
                <span className="text-foreground font-medium">{contact.name}</span>
            </nav>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{contact.name}</h1>
                    <div className="flex items-center gap-2 mt-2">
                        {contact.type === 'preferred' ? (
                            <Badge className="text-md px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white">
                                <Star className="h-3.5 w-3.5 mr-1 fill-current" /> Preferred
                            </Badge>
                        ) : (
                            <Badge variant={contact.type === 'customer' ? 'default' : 'secondary'} className="text-md px-3 py-1 capitalize">
                                {contact.type}
                            </Badge>
                        )}
                        {contact.source === 'woocommerce' && (
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                Website Customer
                            </Badge>
                        )}
                        {contact.type === 'preferred' && contact.discount_percent != null && contact.discount_percent > 0 && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                {contact.discount_percent}% off
                            </Badge>
                        )}
                    </div>
                </div>
                {canEdit && contact.type === 'customer' && (
                    <Button
                        variant="outline"
                        className="text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => setShowUpgrade(true)}
                    >
                        <Star className="h-4 w-4 mr-2" /> Upgrade to Preferred
                    </Button>
                )}
            </div>

            {/* Upgrade Confirmation */}
            <AlertDialog open={showUpgrade} onOpenChange={(open) => { setShowUpgrade(open); if (!open) setUpgradeDiscount('10'); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Upgrade to Preferred Customer?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Upgrade "{contact.name}" to a Preferred Customer with a special discount on their orders.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-2">
                        <label htmlFor="upgrade-discount" className="text-sm font-medium">Discount Percentage</label>
                        <input
                            id="upgrade-discount"
                            type="number"
                            min="0"
                            max="100"
                            value={upgradeDiscount}
                            onChange={(e) => setUpgradeDiscount(e.target.value)}
                            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="e.g. 10"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleUpgrade}
                            disabled={updateContact.isPending}
                            className="bg-amber-600 text-white hover:bg-amber-700"
                        >
                            {updateContact.isPending ? 'Upgrading...' : 'Upgrade'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
