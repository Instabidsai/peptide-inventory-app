import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link2, Copy, Check } from 'lucide-react';

/** Only Senior partners can recruit new partners */
const CAN_RECRUIT_TIERS = ['senior'];

interface ReferralLinkCardProps {
    profileId: string | undefined;
    /** Current partner's tier — only senior+ can see the partner recruitment link */
    partnerTier?: string;
    /** Current user's role — admins always see both links */
    userRole?: string;
}

export function ReferralLinkCard({ profileId, partnerTier, userRole }: ReferralLinkCardProps) {
    const [copiedType, setCopiedType] = useState<string | null>(null);

    if (!profileId) return null;

    const customerUrl = `${window.location.origin}/#/auth?ref=${profileId}`;
    const partnerUrl = `${window.location.origin}/#/auth?ref=${profileId}&role=partner`;
    const canRecruit = userRole === 'admin' || userRole === 'super_admin' || CAN_RECRUIT_TIERS.includes(partnerTier || '');

    const handleCopy = async (url: string, type: string) => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
        }
        setCopiedType(type);
        setTimeout(() => setCopiedType(null), 2000);
    };

    return (
        <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
            <CardContent className="py-4 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                        <Link2 className="h-5 w-5 text-violet-400" />
                    </div>
                    <p className="text-sm font-semibold">Your Referral {canRecruit ? 'Links' : 'Link'}</p>
                </div>
                <div className="flex items-center gap-2 pl-2">
                    <span className="text-xs font-medium text-emerald-400 w-20 shrink-0">Customer:</span>
                    <p className="flex-1 text-xs text-muted-foreground truncate">{customerUrl}</p>
                    <Button variant="outline" size="sm"
                        className={copiedType === 'cust' ? 'border-emerald-500/30 text-emerald-400' : 'border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300'}
                        onClick={() => handleCopy(customerUrl, 'cust')}>
                        {copiedType === 'cust' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                    </Button>
                </div>
                {canRecruit && (
                    <div className="flex items-center gap-2 pl-2">
                        <span className="text-xs font-medium text-violet-400 w-20 shrink-0">Partner:</span>
                        <p className="flex-1 text-xs text-violet-300/70 truncate">{partnerUrl}</p>
                        <Button variant="outline" size="sm"
                            className={copiedType === 'partner' ? 'border-emerald-500/30 text-emerald-400' : 'border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300'}
                            onClick={() => handleCopy(partnerUrl, 'partner')}>
                            {copiedType === 'partner' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
