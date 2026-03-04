import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAllSubscriptions, useBillingEvents, calculateMRR, BillingEvent } from '@/hooks/use-subscription';
import {
    useAllInvoices,
    useMarkInvoicePaid,
    useWaiveInvoice,
    useGenerateMonthlyInvoices,
    useAutoMarkOverdue,
    computeInvoiceStats,
    TenantInvoice,
} from '@/hooks/use-tenant-invoices';
import { BillingStatusBadge, StatCard } from './vendor-shared';
import { CreditCard, DollarSign, Clock, AlertTriangle, FileText, Receipt, Ban, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

// ── Invoice status badge ─────────────────────────────────────────────────
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

export default function VendorBilling() {
    const { toast } = useToast();
    const navigate = useNavigate();

    // ── Subscriptions tab data ───────────────────────────────────────────
    const { data: subscriptions, isLoading: subsLoading } = useAllSubscriptions();
    const { data: billingEvents, isLoading: eventsLoading } = useBillingEvents();

    const activeCount = (subscriptions || []).filter(s => s.status === 'active').length;
    const trialingCount = (subscriptions || []).filter(s => s.status === 'trialing').length;
    const pastDueCount = (subscriptions || []).filter(s => s.status === 'past_due').length;
    const mrr = calculateMRR(subscriptions || []);

    // ── Invoices tab data ────────────────────────────────────────────────
    const [statusFilter, setStatusFilter] = useState('all');
    const { data: invoices, isLoading: invoicesLoading } = useAllInvoices(statusFilter);
    const markPaid = useMarkInvoicePaid();
    const waiveInvoice = useWaiveInvoice();
    const generateInvoices = useGenerateMonthlyInvoices();
    const autoMarkOverdue = useAutoMarkOverdue();

    const stats = computeInvoiceStats(invoices || []);

    // ── Mark Paid dialog state ───────────────────────────────────────────
    const [payDialogOpen, setPayDialogOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<TenantInvoice | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('zelle');
    const [paymentReference, setPaymentReference] = useState('');

    // ── Waive dialog state ───────────────────────────────────────────────
    const [waiveDialogOpen, setWaiveDialogOpen] = useState(false);
    const [waiveInvoiceTarget, setWaiveInvoiceTarget] = useState<TenantInvoice | null>(null);
    const [waiveNotes, setWaiveNotes] = useState('');

    // Auto-mark overdue on first load
    useEffect(() => {
        autoMarkOverdue.mutate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────
    const handleGenerate = () => {
        generateInvoices.mutate({}, {
            onSuccess: (result) => {
                toast({
                    title: 'Invoices Generated',
                    description: `Created ${result.created} invoice(s), skipped ${result.skipped} (already exist).`,
                });
            },
            onError: (err: Error) => {
                toast({ title: 'Error', description: err.message, variant: 'destructive' });
            },
        });
    };

    const handleMarkPaid = () => {
        if (!selectedInvoice) return;
        markPaid.mutate(
            { invoiceId: selectedInvoice.id, payment_method: paymentMethod, payment_reference: paymentReference || undefined },
            {
                onSuccess: () => {
                    toast({ title: 'Invoice Marked Paid', description: `${selectedInvoice.invoice_number} marked as paid via ${paymentMethod}.` });
                    setPayDialogOpen(false);
                    setSelectedInvoice(null);
                    setPaymentReference('');
                },
                onError: (err: Error) => {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                },
            },
        );
    };

    const handleWaive = () => {
        if (!waiveInvoiceTarget) return;
        waiveInvoice.mutate(
            { invoiceId: waiveInvoiceTarget.id, notes: waiveNotes || undefined },
            {
                onSuccess: () => {
                    toast({ title: 'Invoice Waived', description: `${waiveInvoiceTarget.invoice_number} has been waived.` });
                    setWaiveDialogOpen(false);
                    setWaiveInvoiceTarget(null);
                    setWaiveNotes('');
                },
                onError: (err: Error) => {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                },
            },
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold">Billing & Subscriptions</h1>

            <Tabs defaultValue="invoices" className="space-y-6">
                <TabsList>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                    <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                </TabsList>

                {/* ═══════════════════════════════════════════════════════════
                    INVOICES TAB
                   ═══════════════════════════════════════════════════════════ */}
                <TabsContent value="invoices" className="space-y-6">
                    {/* Stat cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard
                            label="Outstanding"
                            value={`$${(stats.outstanding_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                            icon={DollarSign}
                        />
                        <StatCard
                            label="Collected This Month"
                            value={`$${(stats.collected_this_month_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                            icon={Receipt}
                        />
                        <StatCard label="Overdue" value={stats.overdue_count} icon={AlertTriangle} />
                        <StatCard label="Pending" value={stats.pending_count} icon={Clock} />
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Invoices</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="waived">Waived</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button onClick={handleGenerate} disabled={generateInvoices.isPending}>
                            <FileText className="h-4 w-4 mr-2" />
                            {generateInvoices.isPending ? 'Generating...' : "Generate This Month's Invoices"}
                        </Button>
                    </div>

                    {/* Invoice table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoices</CardTitle>
                            <CardDescription>Manual billing invoices for tenant SaaS fees (Zelle / Venmo / CashApp)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {invoicesLoading ? (
                                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                            ) : !invoices?.length ? (
                                <p className="text-sm text-muted-foreground py-4">
                                    No invoices yet. Click "Generate This Month's Invoices" to create invoices for all active tenants with a monthly rate set.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tenant</TableHead>
                                                <TableHead>Invoice #</TableHead>
                                                <TableHead>Period</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Due Date</TableHead>
                                                <TableHead>Paid</TableHead>
                                                <TableHead>Method</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invoices.map(inv => (
                                                <TableRow key={inv.id}>
                                                    <TableCell
                                                        className="font-medium cursor-pointer hover:underline"
                                                        onClick={() => navigate(`/vendor/tenant/${inv.org_id}`)}
                                                    >
                                                        {inv.org?.name || inv.org_id.slice(0, 8) + '...'}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {format(new Date(inv.period_start), 'MMM yyyy')}
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        ${(inv.amount_cents / 100).toFixed(2)}
                                                    </TableCell>
                                                    <TableCell><InvoiceStatusBadge status={inv.status} /></TableCell>
                                                    <TableCell className="text-xs">
                                                        {format(new Date(inv.due_date), 'MMM d, yyyy')}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {inv.paid_at ? format(new Date(inv.paid_at), 'MMM d') : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs capitalize">
                                                        {inv.payment_method || '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {(inv.status === 'pending' || inv.status === 'overdue') && (
                                                            <div className="flex gap-1 justify-end">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setSelectedInvoice(inv);
                                                                        setPayDialogOpen(true);
                                                                    }}
                                                                >
                                                                    Mark Paid
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setWaiveInvoiceTarget(inv);
                                                                        setWaiveDialogOpen(true);
                                                                    }}
                                                                >
                                                                    Waive
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ═══════════════════════════════════════════════════════════
                    SUBSCRIPTIONS TAB (existing content)
                   ═══════════════════════════════════════════════════════════ */}
                <TabsContent value="subscriptions" className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard label="MRR" value={`$${(mrr / 100).toFixed(0)}`} icon={DollarSign} />
                        <StatCard label="Active" value={activeCount} icon={CreditCard} />
                        <StatCard label="Trialing" value={trialingCount} icon={Clock} />
                        <StatCard label="Past Due" value={pastDueCount} icon={AlertTriangle} />
                    </div>

                    {/* Active Subscriptions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Subscriptions</CardTitle>
                            <CardDescription>All tenant subscriptions and their current status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {subsLoading ? (
                                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                            ) : !subscriptions?.length ? (
                                <p className="text-sm text-muted-foreground py-4">No subscriptions yet</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tenant</TableHead>
                                                <TableHead>Plan</TableHead>
                                                <TableHead>Period</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Stripe Customer</TableHead>
                                                <TableHead>Renews</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {subscriptions.map(s => (
                                                <TableRow
                                                    key={s.id}
                                                    className="cursor-pointer hover:bg-muted/50"
                                                    onClick={() => navigate(`/vendor/tenant/${s.org_id}`)}
                                                >
                                                    <TableCell className="font-medium">{s.org?.name || s.org_id.slice(0, 8) + '...'}</TableCell>
                                                    <TableCell>{s.plan?.display_name || 'Unknown'}</TableCell>
                                                    <TableCell className="capitalize">{s.billing_period}</TableCell>
                                                    <TableCell><BillingStatusBadge status={s.status} /></TableCell>
                                                    <TableCell className="font-mono text-xs">{s.stripe_customer_id || '—'}</TableCell>
                                                    <TableCell className="text-xs">
                                                        {s.current_period_end ? format(new Date(s.current_period_end), 'MMM d, yyyy') : '—'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Billing Events */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Billing Events</CardTitle>
                            <CardDescription>Stripe webhook events across all tenants</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {eventsLoading ? (
                                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                            ) : !billingEvents?.length ? (
                                <p className="text-sm text-muted-foreground py-4">No billing events recorded</p>
                            ) : (
                                <div className="max-h-[400px] overflow-y-auto space-y-2">
                                    {(billingEvents as BillingEvent[]).map((e) => (
                                        <div key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <Badge
                                                    variant={e.event_type.includes('failed') ? 'destructive' : 'outline'}
                                                    className="text-[10px]"
                                                >
                                                    {e.event_type}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">{e.org?.name || '—'}</span>
                                                {e.amount_cents != null && (
                                                    <span className="font-medium">${(e.amount_cents / 100).toFixed(2)}</span>
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                {format(new Date(e.created_at), 'MMM d, h:mm a')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ═══════════════════════════════════════════════════════════════
                MARK PAID DIALOG
               ═══════════════════════════════════════════════════════════════ */}
            <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark Invoice as Paid</DialogTitle>
                        <DialogDescription>
                            {selectedInvoice && (
                                <>
                                    {selectedInvoice.invoice_number} &mdash; {selectedInvoice.org?.name || 'Unknown Tenant'} &mdash;{' '}
                                    <strong>${(selectedInvoice.amount_cents / 100).toFixed(2)}</strong>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Payment Method</Label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="zelle">Zelle</SelectItem>
                                    <SelectItem value="venmo">Venmo</SelectItem>
                                    <SelectItem value="cashapp">CashApp</SelectItem>
                                    <SelectItem value="wire">Wire Transfer</SelectItem>
                                    <SelectItem value="check">Check</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Reference / Transaction ID (optional)</Label>
                            <Input
                                placeholder="e.g. Zelle confirmation #, Venmo @handle"
                                value={paymentReference}
                                onChange={e => setPaymentReference(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleMarkPaid} disabled={markPaid.isPending}>
                            {markPaid.isPending ? 'Saving...' : 'Confirm Payment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ═══════════════════════════════════════════════════════════════
                WAIVE INVOICE DIALOG
               ═══════════════════════════════════════════════════════════════ */}
            <Dialog open={waiveDialogOpen} onOpenChange={setWaiveDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Waive Invoice</DialogTitle>
                        <DialogDescription>
                            {waiveInvoiceTarget && (
                                <>
                                    This will mark {waiveInvoiceTarget.invoice_number} ({waiveInvoiceTarget.org?.name || 'Unknown'}) as waived.
                                    The tenant will not owe this amount.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label>Reason (optional)</Label>
                        <Input
                            placeholder="e.g. First month free, credit applied"
                            value={waiveNotes}
                            onChange={e => setWaiveNotes(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWaiveDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleWaive} disabled={waiveInvoice.isPending}>
                            {waiveInvoice.isPending ? 'Waiving...' : 'Waive Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
