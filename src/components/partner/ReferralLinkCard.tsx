import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link2, Copy, Check, ExternalLink, Tag } from 'lucide-react';

interface ReferralLinkCardProps {
    profileId: string | undefined;
    /** Current partner's tier — used as fallback when canRecruitOverride is not set */
    partnerTier?: string;
    /** Current user's role — admins always see both links */
    userRole?: string;
    /** Effective org_id — ensures signups land in the correct tenant (multi-tenancy) */
    orgId?: string | null;
    /** Per-person can_recruit flag from profile. null = use tier default */
    canRecruitOverride?: boolean | null;
    /** Short vanity slug for pretty URLs (e.g. "diego-feroni") */
    referralSlug?: string | null;
    /** Whether external referral links feature is enabled for this org */
    externalEnabled?: boolean;
    /** The org's external store URL (e.g. "https://pureuspeptides.com") */
    externalStoreUrl?: string | null;
    /** The partner's active discount code (e.g. "JOHN20") */
    discountCode?: string | null;
    /** The store platform — determines URL format */
    storePlatform?: 'woocommerce' | 'shopify' | null;
}

export function ReferralLinkCard({ profileId, partnerTier, userRole, orgId, canRecruitOverride, referralSlug, externalEnabled, externalStoreUrl, discountCode, storePlatform }: ReferralLinkCardProps) {
    const [copiedType, setCopiedType] = useState<string | null>(null);

    if (!profileId) return null;

    const origin = window.location.origin;
    const orgSuffix = orgId ? `&org=${orgId}` : '';
    // Short URLs when slug available, fallback to full /join? URLs
    const customerUrl = referralSlug
        ? `${origin}/r/${referralSlug}`
        : `${origin}/join?ref=${profileId}${orgSuffix}`;
    const partnerUrl = referralSlug
        ? `${origin}/r/${referralSlug}?p`
        : `${origin}/join?ref=${profileId}&role=partner&tier=standard${orgSuffix}`;
    // Admin/super_admin always can recruit. Otherwise use per-person flag, with tier-based fallback (senior = true).
    const canRecruit = userRole === 'admin' || userRole === 'super_admin'
        || (canRecruitOverride !== undefined && canRecruitOverride !== null ? canRecruitOverride : partnerTier === 'senior');

    // Build external URL when feature is enabled
    const externalUrl = externalEnabled && externalStoreUrl && discountCode
        ? storePlatform === 'shopify'
            ? `${externalStoreUrl.replace(/\/+$/, '')}/discount/${discountCode}`
            : `${externalStoreUrl.replace(/\/+$/, '')}/?coupon=${discountCode}`
        : null;

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

                {/* External store link (primary when enabled) */}
                {externalUrl && (
                    <>
                        <div className="flex items-center gap-2 pl-2">
                            <span className="text-xs font-medium text-emerald-400 w-20 shrink-0 flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" /> Store:
                            </span>
                            <p className="flex-1 text-xs text-muted-foreground truncate">{externalUrl}</p>
                            <Button variant="outline" size="sm"
                                className={copiedType === 'external' ? 'border-emerald-500/30 text-emerald-400' : 'border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400'}
                                onClick={() => handleCopy(externalUrl, 'external')}>
                                {copiedType === 'external' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 pl-2">
                            <span className="text-xs font-medium text-amber-400 w-20 shrink-0 flex items-center gap-1">
                                <Tag className="h-3 w-3" /> Code:
                            </span>
                            <p className="flex-1 text-xs font-mono text-amber-300/80">{discountCode}</p>
                            <Button variant="outline" size="sm"
                                className={copiedType === 'code' ? 'border-amber-500/30 text-amber-400' : 'border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400'}
                                onClick={() => handleCopy(discountCode!, 'code')}>
                                {copiedType === 'code' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                            </Button>
                        </div>
                    </>
                )}

                {/* Internal customer link */}
                <div className="flex items-center gap-2 pl-2">
                    <span className={`text-xs font-medium w-20 shrink-0 ${externalUrl ? 'text-muted-foreground' : 'text-primary'}`}>
                        {externalUrl ? 'App:' : 'Customer:'}
                    </span>
                    <p className={`flex-1 text-xs truncate ${externalUrl ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{customerUrl}</p>
                    <Button variant="outline" size="sm"
                        className={copiedType === 'cust' ? 'border-primary/30 text-primary' : 'border-primary/30 hover:bg-primary/10 hover:text-primary/80'}
                        onClick={() => handleCopy(customerUrl, 'cust')}>
                        {copiedType === 'cust' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                    </Button>
                </div>

                {/* External enabled but no discount code */}
                {externalEnabled && externalStoreUrl && !discountCode && (
                    <p className="text-[11px] text-muted-foreground/60 pl-2">
                        No coupon code assigned — using internal link. Ask your admin to create a discount code for you.
                    </p>
                )}

                {/* Partner link (always internal) */}
                {canRecruit && (
                    <div className="flex items-center gap-2 pl-2">
                        <span className="text-xs font-medium text-violet-400 w-20 shrink-0">Partner <span className="text-[10px] text-violet-300/60">(Std)</span>:</span>
                        <p className="flex-1 text-xs text-violet-300/70 truncate">{partnerUrl}</p>
                        <Button variant="outline" size="sm"
                            className={copiedType === 'partner' ? 'border-primary/30 text-primary' : 'border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300'}
                            onClick={() => handleCopy(partnerUrl, 'partner')}>
                            {copiedType === 'partner' ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
