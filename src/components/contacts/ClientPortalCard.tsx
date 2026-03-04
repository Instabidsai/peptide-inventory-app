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
import { Loader2, RefreshCcw, Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/sb_client/client';
import { useUpdateContact, type Contact } from '@/hooks/use-contacts';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface ClientPortalCardProps {
    contact: Contact;
}

function buildWelcomeEmailHtml(brandName: string, inviteLink: string, customerName?: string): string {
    const greeting = customerName ? `Hi ${customerName},` : 'Welcome!';
    return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a2e;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h2 style="margin: 0; color: #7c3aed;">${brandName}</h2>
  </div>
  <p style="font-size: 16px; line-height: 1.6;">${greeting}</p>
  <p style="font-size: 16px; line-height: 1.6;">
    Your personalized peptide regimen portal is ready. Track your doses, view your protocol calendar, monitor supply levels, and reorder when you're running low — all in one place.
  </p>
  <div style="text-align: center; margin: 32px 0;">
    <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
      Access Your Portal
    </a>
  </div>
  <div style="background: #f3f0ff; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="font-size: 14px; color: #555; margin: 0 0 8px 0; font-weight: 600;">What you can do:</p>
    <ul style="font-size: 14px; color: #555; margin: 0; padding-left: 20px; line-height: 1.8;">
      <li>View your dosing calendar &amp; protocol</li>
      <li>Track daily doses with one tap</li>
      <li>Monitor your supply levels</li>
      <li>Reorder when running low</li>
    </ul>
  </div>
  <p style="font-size: 12px; color: #999; text-align: center;">
    This link expires in 7 days. If you need a new link, contact your provider.
  </p>
</body>
</html>`.trim();
}

export function ClientPortalCard({ contact }: ClientPortalCardProps) {
    const updateContact = useUpdateContact();
    const [inviteTier, setInviteTier] = useState<'family' | 'network' | 'public'>('family');
    const [inviteLink, setInviteLink] = useState<string>('');
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);
    const [linkEmail, setLinkEmail] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

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
            const { data, error } = await supabase.rpc('generate_invite_link', {
                p_contact_id: contact!.id,
                p_tier: inviteTier,
                p_redirect_origin: window.location.origin,
                p_target_org_id: contact.org_id || null,
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.message || 'No link returned');

            if (data.action_link) {
                setInviteLink(data.action_link);
                setEmailSent(false);
                toast({ title: 'Invite Link Generated', description: 'Copy and send this link to the client.' });
                updateContact.mutate({ id: contact!.id, tier: inviteTier });
            } else {
                toast({ title: 'Portal Access', description: data.message || 'Client already has access.' });
            }
        } catch (err) {
            logger.error('Invite failed:', err);
            const errMsg = (err as any)?.message || String(err);
            {
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

    const handleSendWelcomeEmail = async () => {
        const link = inviteLink || contact.invite_link;
        if (!link || !contact.email) return;

        setIsSendingEmail(true);
        try {
            const html = buildWelcomeEmailHtml(
                'Your Peptide Portal',
                link,
                contact.name || undefined,
            );

            const { error } = await supabase.functions.invoke('send-email', {
                body: {
                    to: contact.email,
                    subject: 'Your Peptide Regimen Portal is Ready',
                    html,
                },
            });

            if (error) throw error;

            setEmailSent(true);
            toast({ title: 'Welcome Email Sent', description: `Email sent to ${contact.email}` });
        } catch (err) {
            logger.error('Welcome email failed:', err);
            toast({
                variant: 'destructive',
                title: 'Email Failed',
                description: (err as any)?.message || 'Could not send welcome email. Try again.',
            });
        } finally {
            setIsSendingEmail(false);
        }
    };

    const activeLink = inviteLink || contact.invite_link;
    const canSendEmail = !!activeLink && !!contact.email;

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
                    Generate a secure invite link to give this customer access to their Regimen Dashboard.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!contact.email ? (
                    <div className="flex flex-col gap-2 p-4 bg-amber-900/20 rounded-lg border border-amber-900/50">
                        <div className="text-amber-200 text-sm font-medium">Customer Missing Email</div>
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
                                    {contact.invite_link ? 'Re-generate Invite Link' : 'Generate Invite Link'}
                                </>
                            )}
                        </Button>

                        {activeLink && (
                            <div className="col-span-full mt-2">
                                <Label>Invite Link {contact.invite_link ? '(Saved)' : '(New)'}</Label>
                                <div className="flex gap-2 mt-1">
                                    <code className="flex-1 p-2.5 bg-muted/50 rounded-lg border border-border/40 text-xs break-all font-mono">
                                        {activeLink}
                                    </code>
                                    <Button variant="secondary" size="sm" onClick={() => copyToClipboard(activeLink)}>
                                        Copy
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    This link is saved. You can copy and send it to the client anytime.
                                </p>
                            </div>
                        )}

                        {canSendEmail && (
                            <div className="col-span-full">
                                <Button
                                    onClick={handleSendWelcomeEmail}
                                    disabled={isSendingEmail}
                                    variant={emailSent ? "outline" : "default"}
                                    className="w-full"
                                >
                                    {isSendingEmail ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending...
                                        </>
                                    ) : emailSent ? (
                                        <>
                                            <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                            Welcome Email Sent
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="mr-2 h-4 w-4" />
                                            Send Welcome Email to {contact.email}
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
