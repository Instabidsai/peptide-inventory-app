
import { useState } from 'react';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/ui/query-error';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
    Mail,
    Scan,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    Bot,
    Megaphone,
    Activity,
    ChevronDown,
    ChevronUp,
    SkipForward,
    Search,
    Sparkles,
    UserCheck,
    Lightbulb,
    Bug,
    HelpCircle,
    MessageCircle,
} from 'lucide-react';
import {
    useAutomationModules,
    usePaymentQueue,
    usePendingPaymentCount,
    useApprovePayment,
    useRejectPayment,
    useSkipPayment,
    useReassignContact,
    useAcceptAiSuggestion,
    useTriggerScan,
    useToggleAutomation,
    type PaymentQueueItem,
} from '@/hooks/use-payment-queue';

// ── Helpers ────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
    venmo: 'Venmo',
    cashapp: 'CashApp',
    zelle: 'Zelle',
    psifi: 'PsiFi',
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
    const [showSuggestions, setShowSuggestions] = useState(false);

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
                                        <SelectItem value="skipped">Skipped</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                    </div>
                </CardHeader>
                {showHistory && <HistoryTable statusFilter={historyFilter} />}
            </Card>

            {/* Partner Suggestions */}
            <Card>
                <CardHeader
                    className="cursor-pointer"
                    onClick={() => setShowSuggestions(!showSuggestions)}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-400" />
                            <CardTitle className="text-lg">Partner Suggestions</CardTitle>
                        </div>
                        {showSuggestions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    <CardDescription>Feature requests and issue reports from partners via AI chat.</CardDescription>
                </CardHeader>
                {showSuggestions && <PartnerSuggestionsTable />}
            </Card>
        </div>
    );
}

// ── Pending Review Sub-Component ──────────────────────────────────

function PendingReviewSection() {
    const { organization } = useAuth();
    const orgId = organization?.id;
    const { data: pending, isLoading, isError, refetch } = usePaymentQueue('pending');
    const approvePayment = useApprovePayment();
    const rejectPayment = useRejectPayment();
    const skipPayment = useSkipPayment();
    const reassignContact = useReassignContact();
    const acceptAiSuggestion = useAcceptAiSuggestion();
    const [editItem, setEditItem] = useState<PaymentQueueItem | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editMethod, setEditMethod] = useState('');
    const [contactSearchOpen, setContactSearchOpen] = useState(false);
    const [contactSearch, setContactSearch] = useState('');

    // Contact search query for the combobox
    const { data: searchResults } = useQuery({
        queryKey: ['contact_search_automations', contactSearch, orgId],
        queryFn: async () => {
            const { data } = await supabase
                .from('contacts')
                .select('id, name, company')
                .eq('org_id', orgId!)
                .ilike('name', `%${contactSearch}%`)
                .limit(10);
            return data || [];
        },
        enabled: contactSearch.length >= 2 && !!orgId,
    });

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

    const handleContactSelect = (contactId: string, contactName: string) => {
        if (!editItem?.sender_name) return;
        reassignContact.mutate({
            queueItemId: editItem.id,
            contactId,
            senderName: editItem.sender_name,
        });
        setContactSearchOpen(false);
        setContactSearch('');
        // Keep dialog open — it will refresh with the new contact match
    };

    const handleAcceptAi = (item: PaymentQueueItem) => {
        if (!item.ai_suggested_contact_id || !item.sender_name) return;
        acceptAiSuggestion.mutate({
            queueItemId: item.id,
            aiContactId: item.ai_suggested_contact_id,
            senderName: item.sender_name,
        });
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
                                            ) : item.ai_contact?.name ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                                                    <span className="text-blue-400">{item.ai_contact.name}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-400 border-blue-400/30">AI</Badge>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic">No match</span>
                                            )}
                                            {item.ai_reasoning && !item.contacts?.name && (
                                                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate" title={item.ai_reasoning}>
                                                    {item.ai_reasoning}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={conf.variant}>{conf.label}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Accept AI suggestion (one-click) */}
                                                {!item.contacts?.name && item.ai_contact?.name && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-blue-400 border-blue-400/30 hover:bg-blue-400/10"
                                                        onClick={() => handleAcceptAi(item)}
                                                        disabled={acceptAiSuggestion.isPending}
                                                        title={`Accept AI match: ${item.ai_contact.name}`}
                                                    >
                                                        <UserCheck className="mr-1 h-3.5 w-3.5" />
                                                        Accept AI
                                                    </Button>
                                                )}

                                                {/* Approve (if movement matched) or Edit & Match */}
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
                                                        <Search className="mr-1 h-3.5 w-3.5" />
                                                        Match
                                                    </Button>
                                                )}

                                                {/* Skip button */}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-muted-foreground hover:text-foreground"
                                                    onClick={() => skipPayment.mutate({ queueItemId: item.id })}
                                                    disabled={skipPayment.isPending}
                                                    title="Skip — not a real payment"
                                                >
                                                    <SkipForward className="h-3.5 w-3.5" />
                                                </Button>

                                                {/* Reject button */}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive"
                                                    onClick={() => rejectPayment.mutate({ queueItemId: item.id })}
                                                    disabled={rejectPayment.isPending}
                                                    title="Reject"
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit & Match Dialog — with contact search */}
            <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) { setEditItem(null); setContactSearch(''); setContactSearchOpen(false); } }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Match Payment to Contact</DialogTitle>
                    </DialogHeader>
                    {editItem && (
                        <div className="space-y-4 py-2">
                            {/* Email info */}
                            <div className="p-3 bg-muted rounded-lg text-sm">
                                <p><strong>From:</strong> {editItem.sender_name || 'Unknown'}</p>
                                <p><strong>Subject:</strong> {editItem.email_subject}</p>
                                <p className="text-muted-foreground mt-1 text-xs">{editItem.email_snippet}</p>
                            </div>

                            {/* AI suggestion banner */}
                            {editItem.ai_contact?.name && !editItem.contacts?.name && (
                                <div className="flex items-center justify-between p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-blue-400" />
                                        <div>
                                            <p className="text-sm font-medium text-blue-400">AI suggests: {editItem.ai_contact.name}</p>
                                            {editItem.ai_reasoning && (
                                                <p className="text-xs text-muted-foreground">{editItem.ai_reasoning}</p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-blue-400 border-blue-400/30"
                                        onClick={() => { handleAcceptAi(editItem); setEditItem(null); }}
                                        disabled={acceptAiSuggestion.isPending}
                                    >
                                        <UserCheck className="mr-1 h-3.5 w-3.5" />
                                        Accept
                                    </Button>
                                </div>
                            )}

                            {/* Contact search combobox */}
                            <div className="space-y-2">
                                <Label>Search Contact</Label>
                                <Popover open={contactSearchOpen} onOpenChange={setContactSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="w-full justify-start text-muted-foreground">
                                            <Search className="mr-2 h-4 w-4" />
                                            {editItem.contacts?.name || 'Search by name...'}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0" align="start">
                                        <Command shouldFilter={false}>
                                            <CommandInput
                                                placeholder="Type a name..."
                                                value={contactSearch}
                                                onValueChange={setContactSearch}
                                            />
                                            <CommandList>
                                                <CommandEmpty>
                                                    {contactSearch.length < 2 ? 'Type at least 2 characters...' : 'No contacts found.'}
                                                </CommandEmpty>
                                                <CommandGroup>
                                                    {searchResults?.map(c => (
                                                        <CommandItem
                                                            key={c.id}
                                                            value={c.id}
                                                            onSelect={() => handleContactSelect(c.id, c.name)}
                                                        >
                                                            <div>
                                                                <span className="font-medium">{c.name}</span>
                                                                {c.company && (
                                                                    <span className="text-xs text-muted-foreground ml-2">{c.company}</span>
                                                                )}
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Amount + method */}
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
                                            <SelectItem value="psifi">PsiFi</SelectItem>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="card">Card</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Approve or no-movement message */}
                            {editItem.matched_movement_id ? (
                                <Button className="w-full" onClick={handleEditApprove} disabled={approvePayment.isPending}>
                                    {approvePayment.isPending ? 'Posting...' : 'Approve & Post Payment'}
                                </Button>
                            ) : editItem.contacts?.name ? (
                                <div className="text-center text-sm text-amber-500 p-3 border border-amber-500/20 rounded-lg">
                                    Contact matched but no unpaid movement found. Create a movement for this contact first.
                                </div>
                            ) : (
                                <div className="text-center text-sm text-muted-foreground p-3 border border-dashed rounded-lg">
                                    Search for a contact above to match this payment.
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

// ── Partner Suggestions Sub-Component ─────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: typeof Lightbulb; label: string; color: string }> = {
    feature: { icon: Lightbulb, label: 'Feature', color: 'text-amber-400' },
    bug: { icon: Bug, label: 'Bug', color: 'text-red-400' },
    question: { icon: HelpCircle, label: 'Question', color: 'text-blue-400' },
    other: { icon: MessageCircle, label: 'Other', color: 'text-muted-foreground' },
};

const SUGGESTION_STATUS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    new: { variant: 'outline', label: 'New' },
    reviewed: { variant: 'secondary', label: 'Reviewed' },
    implemented: { variant: 'default', label: 'Implemented' },
    dismissed: { variant: 'destructive', label: 'Dismissed' },
};

interface PartnerSuggestion {
    id: string;
    org_id: string;
    partner_id: string;
    suggestion_text: string;
    category: string;
    status: string;
    admin_notes: string | null;
    created_at: string;
    profiles?: { full_name: string | null } | null;
}

function PartnerSuggestionsTable() {
    const { organization } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [editingSuggestion, setEditingSuggestion] = useState<PartnerSuggestion | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editNotes, setEditNotes] = useState('');

    const { data: suggestions, isLoading, isError, refetch } = useQuery({
        queryKey: ['partner_suggestions', organization?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('partner_suggestions')
                .select('*, profiles:partner_id(full_name)')
                .eq('org_id', organization!.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            return data as PartnerSuggestion[];
        },
        enabled: !!organization?.id,
    });

    const updateSuggestion = useMutation({
        mutationFn: async ({ id, status, admin_notes }: { id: string; status: string; admin_notes: string }) => {
            const { error } = await supabase
                .from('partner_suggestions')
                .update({ status, admin_notes })
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['partner_suggestions'] });
            toast({ title: 'Suggestion updated' });
            setEditingSuggestion(null);
        },
        onError: (err: Error) => {
            toast({ variant: 'destructive', title: 'Update failed', description: err.message });
        },
    });

    if (isLoading) return (
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
    );

    if (isError) return (
        <CardContent><QueryError message="Failed to load suggestions." onRetry={() => refetch()} /></CardContent>
    );

    if (!suggestions?.length) return (
        <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
                No partner suggestions yet. Partners can submit ideas through their AI chat.
            </p>
        </CardContent>
    );

    return (
        <>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="max-w-[300px]">Suggestion</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {suggestions.map(s => {
                            const cat = CATEGORY_CONFIG[s.category] || CATEGORY_CONFIG.other;
                            const st = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.new;
                            const CatIcon = cat.icon;
                            return (
                                <TableRow key={s.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-1.5">
                                            <CatIcon className={`h-3.5 w-3.5 ${cat.color}`} />
                                            <span className="text-xs">{cat.label}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {s.profiles?.full_name || 'Unknown'}
                                    </TableCell>
                                    <TableCell className="max-w-[300px]">
                                        <p className="text-sm truncate" title={s.suggestion_text}>
                                            {s.suggestion_text}
                                        </p>
                                        {s.admin_notes && (
                                            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={s.admin_notes}>
                                                Note: {s.admin_notes}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={st.variant}>{st.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {format(new Date(s.created_at), 'MMM d, h:mm a')}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setEditingSuggestion(s);
                                                setEditStatus(s.status);
                                                setEditNotes(s.admin_notes || '');
                                            }}
                                        >
                                            Review
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>

            {/* Edit Suggestion Dialog */}
            <Dialog open={!!editingSuggestion} onOpenChange={(open) => { if (!open) setEditingSuggestion(null); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Review Suggestion</DialogTitle>
                    </DialogHeader>
                    {editingSuggestion && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 bg-muted rounded-lg text-sm">
                                <p className="font-medium">{editingSuggestion.profiles?.full_name || 'Unknown Partner'}</p>
                                <p className="text-xs text-muted-foreground mb-2">
                                    {format(new Date(editingSuggestion.created_at), 'MMM d, yyyy h:mm a')}
                                </p>
                                <p className="whitespace-pre-wrap">{editingSuggestion.suggestion_text}</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select value={editStatus} onValueChange={setEditStatus}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">New</SelectItem>
                                        <SelectItem value="reviewed">Reviewed</SelectItem>
                                        <SelectItem value="implemented">Implemented</SelectItem>
                                        <SelectItem value="dismissed">Dismissed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Admin Notes</Label>
                                <Textarea
                                    value={editNotes}
                                    onChange={e => setEditNotes(e.target.value)}
                                    placeholder="Add internal notes about this suggestion..."
                                    rows={3}
                                />
                            </div>

                            <Button
                                className="w-full"
                                onClick={() => updateSuggestion.mutate({
                                    id: editingSuggestion.id,
                                    status: editStatus,
                                    admin_notes: editNotes,
                                })}
                                disabled={updateSuggestion.isPending}
                            >
                                {updateSuggestion.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
