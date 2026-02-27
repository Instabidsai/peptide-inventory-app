import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Copy, Check } from 'lucide-react';
import type { PartnerNode } from './types';

interface TeamReferralLinksProps {
    downline: PartnerNode[];
}

export function TeamReferralLinks({ downline }: TeamReferralLinksProps) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const partners = downline.filter(d => !d.isClient && d.depth === 1);

    if (partners.length === 0) return null;

    const handleCopy = async (url: string, key: string) => {
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
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    return (
        <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-purple-500/5">
            <CardContent className="py-4 space-y-4">
                <p className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-violet-400" />
                    Team Referral Links
                </p>
                {partners.map(p => {
                    const custUrl = `${window.location.origin}/#/auth?ref=${p.id}`;
                    return (
                        <div key={p.id} className="pl-4 space-y-1.5 border-l-2 border-violet-500/20">
                            <p className="text-sm font-medium">{p.full_name}</p>
                            <div className="flex items-center gap-2">
                                <p className="flex-1 text-[11px] text-muted-foreground truncate">{custUrl}</p>
                                <Button variant="outline" size="sm"
                                    className={copiedKey === `${p.id}-c` ? 'border-primary/30 text-primary' : 'border-primary/30 hover:bg-primary/10 hover:text-primary/80'}
                                    onClick={() => handleCopy(custUrl, `${p.id}-c`)}>
                                    {copiedKey === `${p.id}-c` ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
