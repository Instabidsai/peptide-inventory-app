import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgInvoices, TenantInvoice } from '@/hooks/use-tenant-invoices';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { format } from 'date-fns';
import { DollarSign, Clock, CheckCircle2, AlertTriangle, Ban, Receipt } from 'lucide-react';

function InvoiceStatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'paid':
            return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
        case 'pending':
            return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
        case 'overdue':
            return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
        case 'waived':
            return <Badge variant="secondary"><Ban className="h-3 w-3 mr-1" />Waived</Badge>;
        default:
            return <Badge variant="outline">{status}</Badge>;
    }
}

export default function BillingHistory() {
    const { organization } = useAuth();
    const { data: invoices, isLoading } = useOrgInvoices(organization?.id);
    const { zelle_email, venmo_handle, cashapp_handle } = useTenantConfig();

    const hasPaymentInfo = zelle_email || venmo_handle || cashapp_handle;

    const totalOwed = (invoices || [])
        .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
        .reduce((sum, inv) => sum + inv.amount_cents, 0);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Billing History</h1>

            {/* Outstanding balance */}
            {totalOwed > 0 && (
                <Card className="border-yellow-500/30 bg-yellow-500/5">
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-lg bg-yellow-500/10 p-2.5">
                            <DollarSign className="h-5 w-5 text-yellow-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-yellow-600">${(totalOwed / 100).toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">Total outstanding balance</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Payment instructions */}
            {hasPaymentInfo && totalOwed > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Receipt className="h-4 w-4" /> Payment Instructions
                        </CardTitle>
                        <CardDescription>Send your monthly payment using any of the methods below</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {zelle_email && (
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Zelle</p>
                                    <p className="text-sm font-medium break-all">{zelle_email}</p>
                                </div>
                            )}
                            {venmo_handle && (
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Venmo</p>
                                    <p className="text-sm font-medium">{venmo_handle}</p>
                                </div>
                            )}
                            {cashapp_handle && (
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">CashApp</p>
                                    <p className="text-sm font-medium">{cashapp_handle}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Invoice table */}
            <Card>
                <CardHeader>
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>Your monthly SaaS invoices and payment status</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : !invoices?.length ? (
                        <p className="text-sm text-muted-foreground py-4">No invoices yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead>Paid</TableHead>
                                        <TableHead>Method</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map(inv => (
                                        <TableRow key={inv.id}>
                                            <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                                            <TableCell className="text-xs">{format(new Date(inv.period_start), 'MMM yyyy')}</TableCell>
                                            <TableCell className="text-right font-medium">${(inv.amount_cents / 100).toFixed(2)}</TableCell>
                                            <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                                            <TableCell className="text-xs">{format(new Date(inv.due_date), 'MMM d, yyyy')}</TableCell>
                                            <TableCell className="text-xs">{inv.paid_at ? format(new Date(inv.paid_at), 'MMM d, yyyy') : '—'}</TableCell>
                                            <TableCell className="text-xs capitalize">{inv.payment_method || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
