import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCcw } from 'lucide-react';
import { supabase } from '@/integrations/sb_client/client';
import { useUpdateContact, type Contact } from '@/hooks/use-contacts';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface ClientPortalCardProps {
    contact: Contact;
}

export function ClientPortalCard({ contact }: ClientPortalCardProps) {
    const updateContact = useUpdateContact();
    const [inviteTier, setInviteTier] = useState<'family' | 'network' | 'public'>('family');
    const [inviteLink, setInviteLink] = useState<string>('');
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);
    const [linkEmail, setLinkEmail] = useState('');

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const input = document.createElement('input');
            input.value = text;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        toast({ title: 'Copied to clipboard' });
    };

    const handleGenerateInvite = async () => {
        setIsGeneratingLink(true);
        setInviteLink('');
        try {
            const { data, error } = await supabase.functions.invoke('invite-user', {
                body: {
                    email: contact?.email,
                    contact_id: contact?.id,
                    tier: inviteTier,
                    redirect_origin: `${window.location.origin}/update-password`
                }
            });

            if (error) throw error;

            if (data?.action_link) {
                setInviteLink(data.action_link);
                toast({ title: 'Invite Link Generated', description: 'Copy and send this link to the client.' });
                updateContact.mutate({ id: contact!.id, tier: inviteTier });
            } else {
                throw new Error(data?.error || 'No link returned');
            }

        } catch (err) {
            logger.error('Invite failed:', err);
            const errMsg = err instanceof Error ? err.message : String(err);
            if (errMsg?.includes('FunctionsFetchError') || errMsg?.includes('Failed to send request')) {
                toast({
                    variant: 'destructive',
                    title: 'Function Not Deployed',
                    description: 'Please run: npx tsx scripts/invite_user_local.ts ' + contact?.email,
                    duration: 10000
                });
            } else {
                let errorDetails = errMsg;
                const errObj = err as Record<string, unknown>;
                if (errObj.context && typeof errObj.context === 'object') {
                    errorDetails = JSON.stringify(errObj.context) || errMsg;
                }

                toast({
                    variant: 'destructive',
                    title: 'System Error',
                    description: `Details: ${errorDetails}. (Time: ${new Date().toLocaleTimeString('en-US')})`,
                    duration: 10000
                });
            }
        } finally {
            setIsGeneratingLink(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Client Portal Access
                    <Badge variant={contact.linked_user_id ? 'outline' : 'outline'} className={contact.linked_user_id ? 'bg-green-500/15 text-green-500 border-green-500/30' : ''}>
                        {contact.linked_user_id ? 'Active (Linked)' : 'Not Active'}
                    </Badge>
                </CardTitle>
                <CardDescription>
                    Generate a secure invite link to give this contact access to their Regimen Dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!contact.email ? (
                    <div className="flex flex-col gap-2 p-4 bg-amber-900/20 rounded-lg border border-amber-900/50">
                        <div className="text-amber-200 text-sm font-medium">Contact Missing Email</div>
                        <p className="text-amber-200/80 text-xs">An email is required to create a client portal account.</p>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter client email..."
                                value={linkEmail}
                                onChange={(e) => setLinkEmail(e.target.value)}
                                className="border-amber-900/50 focus-visible:ring-amber-900"
                            />
                            <Button size="sm" disabled={updateContact.isPending} onClick={() => {
                                if (linkEmail) updateContact.mutate({ id: contact.id, email: linkEmail });
                            }}>
                                {updateContact.isPending ? 'Saving...' : 'Save Email'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
                        <div className="space-y-2">
                            <Label>Access Tier</Label>
                            <Select value={inviteTier} onValueChange={(v) => setInviteTier(v as typeof inviteTier)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="family">Family (Free)</SelectItem>
                                    <SelectItem value="network">Network</SelectItem>
                                    <SelectItem value="public">Standard</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            onClick={handleGenerateInvite}
                            disabled={isGeneratingLink}
                            className="w-full"
                            variant={contact.invite_link ? "outline" : "default"}
                        >
                            {isGeneratingLink ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    Re-generate Public Invite Link
                                </>
                            )}
                        </Button>

                        {(inviteLink || contact.invite_link) && (
                            <div className="col-span-full mt-2">
                                <Label>Invite Link {contact.invite_link ? '(Saved)' : '(New)'}</Label>
                                <div className="flex gap-2 mt-1">
                                    <code className="flex-1 p-2.5 bg-muted/50 rounded-lg border border-border/40 text-xs break-all font-mono">
                                        {inviteLink || contact.invite_link}
                                    </code>
                                    <Button variant="secondary" size="sm" onClick={() => copyToClipboard(inviteLink || contact.invite_link!)}>
                                        Copy
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    This link is saved. You can copy and send it to the client anytime.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
