import React from 'react';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';
import { TIER_INFO, type PartnerNode, type DownlineClient } from './types';

interface NetworkTreeProps {
    rootName: string;
    rootTier: string;
    rootProfileId: string | null;
    partners: PartnerNode[];
    clients: DownlineClient[];
}

export function NetworkTree({ rootName, rootTier, rootProfileId, partners, clients }: NetworkTreeProps) {
    // Exclude contacts who are also partners in the downline
    const partnerIds = new Set(partners.map(p => p.id));
    const partnerNames = new Set(partners.map(p => p.full_name?.toLowerCase()).filter(Boolean));
    const filteredClients = clients.filter(c =>
        !partnerIds.has(c.id) && !partnerNames.has(c.name?.toLowerCase())
    );

    // Group clients by assigned rep
    const clientsByRep = new Map<string, DownlineClient[]>();
    filteredClients.forEach(c => {
        if (c.assigned_rep_id) {
            const list = clientsByRep.get(c.assigned_rep_id) || [];
            list.push(c);
            clientsByRep.set(c.assigned_rep_id, list);
        }
    });

    // Derive parent from the path array returned by the RPC
    const getParentId = (p: PartnerNode): string | null => {
        if (p.path && p.path.length >= 2) return p.path[p.path.length - 2];
        return null; // depth 1 nodes are direct children of root
    };

    const renderClientRow = (client: DownlineClient, indent: number) => (
        <div
            key={client.id}
            className="flex items-center gap-2 py-1.5 border-l-2 border-muted/40"
            style={{ paddingLeft: indent * 20 + 8 }}
        >
            <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <span className="text-sm text-foreground/80 truncate">{client.name}</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-blue-500/30 text-blue-400 shrink-0">
                Customer
            </Badge>
        </div>
    );

    const renderPartnerRow = (partner: PartnerNode, indent: number) => (
        <div
            className="flex items-center justify-between py-2 border-l-2 border-primary/30"
            style={{ paddingLeft: indent * 20 + 8 }}
        >
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">
                    {TIER_INFO[partner.partner_tier]?.emoji || '\u{1F948}'}
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                        {partner.full_name || partner.email}
                    </p>
                    <p className="text-xs text-primary/70 capitalize">
                        {TIER_INFO[partner.partner_tier]?.label || 'Partner'}
                    </p>
                </div>
            </div>
            <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-medium">
                    ${Number(partner.total_sales).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Sales</p>
            </div>
        </div>
    );

    const renderBranch = (parentId: string | null, indent: number): React.ReactNode => {
        const childPartners = parentId === null
            ? partners.filter(p => p.depth === 1)
            : partners.filter(p => getParentId(p) === parentId);

        return (
            <>
                {childPartners.map(partner => {
                    const partnerClients = clientsByRep.get(partner.id) || [];
                    return (
                        <React.Fragment key={partner.id}>
                            {renderPartnerRow(partner, indent)}
                            {partnerClients.map(client => renderClientRow(client, indent + 1))}
                            {renderBranch(partner.id, indent + 1)}
                        </React.Fragment>
                    );
                })}
            </>
        );
    };

    const rootClients = rootProfileId ? (clientsByRep.get(rootProfileId) || []) : [];

    return (
        <div className="space-y-0.5">
            {/* Root node (the logged-in partner) */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 mb-1">
                <span className="text-base">{TIER_INFO[rootTier]?.emoji || '\u2B50'}</span>
                <div>
                    <p className="text-sm font-semibold">{rootName}</p>
                    <p className="text-xs text-primary/70 capitalize">{TIER_INFO[rootTier]?.label || 'Partner'}</p>
                </div>
            </div>

            {/* Root's own direct customers */}
            {rootClients.length > 0 && (
                <div className="ml-3 mb-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2 py-1">
                        My Customers ({rootClients.length})
                    </p>
                    {rootClients.map(client => renderClientRow(client, 1))}
                </div>
            )}

            {/* Partners + their customers */}
            {partners.length > 0 && (
                <div className="ml-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pl-2 py-1">
                        Team Partners ({partners.filter(p => p.depth === 1).length})
                    </p>
                    {renderBranch(null, 1)}
                </div>
            )}
        </div>
    );
}
