
import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Mail, Scan, CheckCircle2, XCircle, Clock, AlertTriangle,
    Zap, Bot, Megaphone, Activity, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
    useAutomationModules,
    usePaymentQueue,
    usePendingPaymentCount,
    useApprovePayment,
    useRejectPayment,
    useTriggerScan,
    useToggleAutomation,
    type PaymentQueueItem,
} from '@/hooks/use-payment-queue';

// ── Helpers ────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
    venmo: 'Venmo',
    cashapp: 'CashApp',
    zelle: 'Zelle',
};

const CONFIDENCE_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    high: { variant: 'default', label: 'High' },
    medium: { variant: 'secondary', label: 'Medium' },
    low: { variant: 'destructive', label: 'Low' },
};

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    pending: { variant: 'outline', label: 'Pending' },
    auto_posted: { variant: 'default', label: 'Auto-posted' },
    approved: { variant: 'default', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
    skipped: { variant: 'secondary', label: 'Skipped' },
};

// ── Main Component ─────────────────────────────────────────────────

export default function Automations() {
    const { data: modules, isLoading: modulesLoading } = useAutomationModules();
    const { data: pendingCount } = usePendingPaymentCount();
    const triggerScan = useTriggerScan();
    const toggleAutomation = useToggleAutomation();

    const [historyFilter, setHistoryFilter] = useState<string>('all');
    const [showHistory, setShowHistory] = useState(false);

    const paymentScanner = modules?.find(m => m.module_type === 'payment_scanner');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
                <p className="text-muted-foreground">AI-powered modules that run your business on autopilot.</p>
            </div>

            {/* Module Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Payment Scanner — Active */}
                <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-emerald-500/10 rounded-lg">
                                    <Mail className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">Payment Scanner</CardTitle>
                                    <CardDescription className="text-xs">Gmail auto-detect</CardDescription>
                                </div>
                            </div>
                            {modulesLoading ? (
                                <Skeleton className="h-5 w-10" />
                            ) : (
                                <Switch
                                    checked={paymentScanner?.enabled ?? false}
                                    onCheckedChange={(checked) =>
                                        toggleAutomation.mutate({ moduleType: 'payment_scanner', enabled: checked })
                                    }
                                />
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {paymentScanner?.last_run_at && (
                            <p className="text-xs text-muted-foreground">
                                Last scan: {format(new Date(paymentScanner.last_run_at), 'MMM d, h:mm a')}
                                {' · '}{paymentScanner.run_count} total runs
                            </p>
                        )}
                        {(pendingCount ?? 0) > 0 && (
                            <div className="flex items-center gap-1.5 text-sm text-amber-500">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {pendingCount} pending review
                            </div>
                        )}
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={() => triggerScan.mutate()}
                            disabled={triggerScan.isPending}
                        >
                            <Scan className="mr-2 h-3.5 w-3.5" />
                            {triggerScan.isPending ? 'Scanning...' : 'Scan Now'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Future modules — placeholders */}
                <Card className="opacity-50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Bot className="h-5 w-5 text-blue-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">AI Builder</CardTitle>
                                <CardDescription className="text-xs">App customization</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Badge variant="secondary">Coming Soon</Badge>
                    </CardContent>
                </Card>

                <Card className="opacity-50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <Megaphone className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">Outreach</CardTitle>
                                <CardDescription className="text-xs">Automated follow-ups</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Badge variant="secondary">Coming Soon</Badge>
                    </CardContent>
                </Card>

                <Card className="opacity-50">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Activity className="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                                <CardTitle className="text-base">Monitoring</CardTitle>
                                <CardDescription className="text-xs">Alerts & health</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Badge variant="secondary">Coming Soon</Badge>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Review Section */}
            <PendingReviewSection />

            {/* History Section */}
            <Card>
                <CardHeader
                    className="cursor-pointer"
                    onClick={() => setShowHistory(!showHistory)}
                >
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Processing History</CardTitle>
                        <div className="flex items-center gap-2">
                            {showHistory && (
                                <Select value={historyFilter} onValueChange={setHistoryFilter}>
                                    <SelectTrigger className="w-[140px] h-8" onClick={e => e.stopPropagation()}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="auto_posted">Auto-posted</SelectItem>
                                        <SelectItem value="approved">Approved</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                    </div>
                </CardHeader>
                {showHistory && <HistoryTable statusFilter={historyFilter} />}
            </Card>
        </div>
    );
}

// ── Pending Review Sub-Component ──────────────────────────────────

function PendingReviewSection() {
    const { data: pending, isLoading, isError, refetch } = usePaymentQueue('pending');
    const approvePayment = useApprovePayment();
    const rejectPayment = useRejectPayment();
    const [editItem, setEditItem] = useState<PaymentQueueItem | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editMethod, setEditMethod] = useState('');

    if (isLoading) return (
        <Card>
            <CardHeader><CardTitle>Pending Review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </CardContent>
        </Card>
    );

    if (isError) return <QueryError message="Failed to load payment queue." onRetry={() => refetch()} />;

    if (!pending?.length) return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Pending Review
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground text-center py-4">
                    No payments pending review. All clear!
                </p>
            </CardContent>
        </Card>
    );

    const handleApprove = (item: PaymentQueueItem) => {
        if (!item.matched_movement_id) {
            // If no movement matched, open edit dialog
            setEditItem(item);
            setEditAmount(String(item.amount));
            setEditMethod(item.payment_method);
            return;
        }
        approvePayment.mutate({
            queueItemId: item.id,
            movementId: item.matched_movement_id,
            amount: item.amount,
            paymentMethod: item.payment_method,
            paymentDate: item.email_date || new Date().toISOString(),
        });
    };

    const handleEditApprove = () => {
        if (!editItem?.matched_movement_id) return;
        approvePayment.mutate({
            queueItemId: editItem.id,
            movementId: editItem.matched_movement_id,
            amount: Number(editAmount) || editItem.amount,
            paymentMethod: editMethod || editItem.payment_method,
            paymentDate: editItem.email_date || new Date().toISOString(),
        });
        setEditItem(null);
    };

    return (
        <>
            <Card className="border-amber-500/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-amber-500" />
                        Pending Review ({pending.length})
                    </CardTitle>
                    <CardDescription>Payments detected from email that need your confirmation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Method</TableHead>
                                <TableHead>Sender</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Matched Contact</TableHead>
                                <TableHead>Confidence</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pending.map(item => {
                                const conf = CONFIDENCE_BADGE[item.confidence] || CONFIDENCE_BADGE.low;
                                return (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">
                                                {METHOD_LABELS[item.payment_method] || item.payment_method}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">{item.sender_name || 'Unknown'}</TableCell>
                                        <TableCell className="font-bold">${Number(item.amount).toFixed(2)}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {item.email_date ? format(new Date(item.email_date), 'MMM d, h:mm a') : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {item.contacts?.name ? (
                                                <span className="text-emerald-500">{item.contacts.name}</span>
                                            ) : (
                                                <span className="text-muted-foreground italic">No match</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={conf.variant}>{conf.label}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right space-x-2">
                                            {item.matched_movement_id ? (
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="bg-emerald-600 hover:bg-emerald-700"
                                                    onClick={() => handleApprove(item)}
                                                    disabled={approvePayment.isPending}
                                                >
                                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                                    Approve
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setEditItem(item);
                                                        setEditAmount(String(item.amount));
                                                        setEditMethod(item.payment_method);
                                                    }}
                                                >
                                                    Edit & Match
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive"
                                                onClick={() => rejectPayment.mutate({ queueItemId: item.id })}
                                                disabled={rejectPayment.isPending}
                                            >
                                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                                Reject
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit & Approve Dialog */}
            <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Payment Details</DialogTitle>
                    </DialogHeader>
                    {editItem && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 bg-muted rounded-lg text-sm">
                                <p><strong>From:</strong> {editItem.sender_name || 'Unknown'}</p>
                                <p><strong>Subject:</strong> {editItem.email_subject}</p>
                                <p className="text-muted-foreground mt-1 text-xs">{editItem.email_snippet}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Amount ($)</Label>
                                    <Input
                                        type="number"
                                        value={editAmount}
                                        onChange={e => setEditAmount(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Method</Label>
                                    <Select value={editMethod} onValueChange={setEditMethod}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="venmo">Venmo</SelectItem>
                                            <SelectItem value="cashapp">CashApp</SelectItem>
                                            <SelectItem value="zelle">Zelle</SelectItem>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="card">Card</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            {editItem.matched_movement_id ? (
                                <Button className="w-full" onClick={handleEditApprove} disabled={approvePayment.isPending}>
                                    {approvePayment.isPending ? 'Posting...' : 'Approve & Post Payment'}
                                </Button>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground p-3 border border-dashed rounded-lg">
                                    No matching movement found. Go to Movements to manually create one, then come back to approve.
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

// ── History Sub-Component ─────────────────────────────────────────

function HistoryTable({ statusFilter }: { statusFilter: string }) {
    const filter = statusFilter === 'all' ? undefined : statusFilter;
    const { data: items, isLoading, isError, refetch } = usePaymentQueue(filter);

    // For history, exclude pending items if viewing "all"
    const historyItems = statusFilter === 'all'
        ? items?.filter(i => i.status !== 'pending')
        : items;

    if (isLoading) return (
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
    );

    if (isError) return (
        <CardContent><QueryError message="Failed to load history." onRetry={() => refetch()} /></CardContent>
    );

    if (!historyItems?.length) return (
        <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">No processed payments yet.</p>
        </CardContent>
    );

    return (
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Sender</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Processed</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {historyItems.map(item => {
                        const st = STATUS_BADGE[item.status] || STATUS_BADGE.pending;
                        return (
                            <TableRow key={item.id} className={item.status === 'rejected' ? 'opacity-50' : ''}>
                                <TableCell>
                                    <Badge variant={st.variant}>{st.label}</Badge>
                                </TableCell>
                                <TableCell className="capitalize">
                                    {METHOD_LABELS[item.payment_method] || item.payment_method}
                                </TableCell>
                                <TableCell>{item.sender_name || '—'}</TableCell>
                                <TableCell className="font-medium">${Number(item.amount).toFixed(2)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                    {item.email_date ? format(new Date(item.email_date), 'MMM d') : '—'}
                                </TableCell>
                                <TableCell>{item.contacts?.name || '—'}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                    {item.auto_posted_at
                                        ? format(new Date(item.auto_posted_at), 'MMM d, h:mm a')
                                        : item.reviewed_at
                                            ? format(new Date(item.reviewed_at), 'MMM d, h:mm a')
                                            : '—'}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </CardContent>
    );
}
