import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useVendorMessages, useSendVendorMessage } from '@/hooks/use-vendor-messages';
import { useTenants } from '@/hooks/use-tenants';
import { toast } from '@/hooks/use-toast';
import { Send, MessageSquare, Megaphone, Wrench, CreditCard, Mail } from 'lucide-react';
import { format } from 'date-fns';

interface OrgJoin { name: string }
interface VendorMessage {
    id: string;
    subject: string;
    body: string;
    message_type: string;
    to_org_id: string | null;
    is_read: boolean;
    created_at: string;
    org: OrgJoin | null;
}

const typeIcons: Record<string, React.ElementType> = {
    announcement: Megaphone,
    direct: Mail,
    maintenance: Wrench,
    billing: CreditCard,
};

const typeColors: Record<string, string> = {
    announcement: 'bg-blue-500/10 text-blue-500',
    direct: 'bg-purple-500/10 text-purple-500',
    maintenance: 'bg-orange-500/10 text-orange-500',
    billing: 'bg-green-500/10 text-green-500',
};

function ComposeDialog() {
    const { data: tenants } = useTenants();
    const send = useSendVendorMessage();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({
        to_org_id: '' as string | null,
        subject: '',
        body: '',
        message_type: 'announcement',
    });

    const handleSend = async () => {
        if (!form.subject || !form.body) {
            toast({ title: 'Missing fields', description: 'Subject and body are required', variant: 'destructive' });
            return;
        }

        try {
            await send.mutateAsync({
                to_org_id: form.to_org_id === 'all' ? null : form.to_org_id,
                subject: form.subject,
                body: form.body,
                message_type: form.message_type,
            });
            toast({ title: 'Sent', description: form.to_org_id === 'all' ? 'Broadcast sent to all tenants' : 'Message sent' });
            setForm({ to_org_id: '', subject: '', body: '', message_type: 'announcement' });
            setOpen(false);
        } catch (err: unknown) {
            toast({ title: 'Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button><Send className="h-4 w-4 mr-2" /> Compose</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Compose Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Recipient</Label>
                            <Select value={form.to_org_id || 'all'} onValueChange={v => setForm(f => ({ ...f, to_org_id: v }))}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue placeholder="All tenants" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Tenants (Broadcast)</SelectItem>
                                    {(tenants || []).map(t => (
                                        <SelectItem key={t.org_id} value={t.org_id}>{t.brand_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={form.message_type} onValueChange={v => setForm(f => ({ ...f, message_type: v }))}>
                                <SelectTrigger className="text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="announcement">Announcement</SelectItem>
                                    <SelectItem value="direct">Direct</SelectItem>
                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                    <SelectItem value="billing">Billing</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Subject</Label>
                        <Input
                            value={form.subject}
                            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                            placeholder="Message subject..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Body</Label>
                        <Textarea
                            value={form.body}
                            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                            placeholder="Write your message..."
                            rows={6}
                        />
                    </div>
                    <Button onClick={handleSend} className="w-full" disabled={send.isPending}>
                        {send.isPending ? 'Sending...' : 'Send Message'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function VendorMessages() {
    const { data: messages, isLoading } = useVendorMessages();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Tenant Communication</h1>
                    <p className="text-sm text-muted-foreground mt-1">Send announcements, updates, and direct messages to tenants</p>
                </div>
                <ComposeDialog />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Sent Messages</CardTitle>
                    <CardDescription>Recent messages sent to tenants</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
                    ) : !messages?.length ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
                            <p className="font-medium">No messages sent yet</p>
                            <p className="text-sm">Click "Compose" to send your first message</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(messages as VendorMessage[]).map((m) => {
                                const Icon = typeIcons[m.message_type] || MessageSquare;
                                return (
                                    <div key={m.id} className="p-4 border rounded-lg">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3">
                                                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium text-sm">{m.subject}</p>
                                                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{m.body}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                                                <Badge className={`text-[10px] ${typeColors[m.message_type] || ''}`}>
                                                    {m.message_type}
                                                </Badge>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {format(new Date(m.created_at), 'MMM d, h:mm a')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px]">
                                                {m.to_org_id ? m.org?.name || 'Direct' : 'All Tenants'}
                                            </Badge>
                                            {m.is_read && (
                                                <Badge className="bg-green-500/10 text-green-500 text-[10px]">Read</Badge>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
