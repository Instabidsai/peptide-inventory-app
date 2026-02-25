
import React from 'react';
import { PartnerNode } from '@/hooks/use-partner';
import {
    ChevronRight,
    ChevronDown,
    User,
    Network,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

// Tier color config
const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    senior: {
        bg: 'bg-amber-900/20',
        text: 'text-amber-400',
        border: 'border-amber-500/40',
    },
    referral: {
        bg: 'bg-sky-900/20',
        text: 'text-sky-400',
        border: 'border-sky-500/40',
    },
    standard: {
        bg: 'bg-slate-800/50',
        text: 'text-slate-300',
        border: 'border-slate-600/40',
    },
    preferred: {
        bg: 'bg-sky-900/20',
        text: 'text-sky-400',
        border: 'border-sky-500/40',
    },
    client: {
        bg: 'bg-blue-900/20',
        text: 'text-blue-400',
        border: 'border-blue-500/40',
    },
};

function getTierStyle(tier: string) {
    return tierColors[tier?.toLowerCase()] || tierColors.standard;
}

interface TreeNodeProps {
    node: PartnerNode;
    allNodes: PartnerNode[];
    level: number;
    isLast: boolean;
}

const TreeNode = ({ node, allNodes, level, isLast }: TreeNodeProps) => {
    const [isExpanded, setIsExpanded] = React.useState(true);
    const navigate = useNavigate();
    const isClient = node.isClient === true;
    const style = getTierStyle(isClient && node.contactType === 'preferred' ? 'preferred' : node.partner_tier);

    // Find direct children — clients (blue) listed first, then partner downline
    const children = allNodes
        .filter(n => n.parent_rep_id === node.id)
        .sort((a, b) => {
            if (a.isClient && !b.isClient) return -1;
            if (!a.isClient && b.isClient) return 1;
            return 0;
        });
    const hasChildren = children.length > 0;

    const handleClick = () => {
        if (isClient) {
            // Extract real contact ID from "client-{uuid}" format
            const contactId = node.id.replace('client-', '');
            navigate(`/admin/contacts/${contactId}`);
        } else {
            navigate(`/admin/partners/${node.id}`);
        }
    };

    return (
        <div className="relative">
            {/* Vertical connector line from parent */}
            {level > 0 && (
                <div
                    className="absolute left-4 top-0 w-px bg-border"
                    style={{ height: '20px', transform: 'translateX(-1px)' }}
                />
            )}

            {/* Horizontal connector */}
            {level > 0 && (
                <div
                    className="absolute left-4 top-5 h-px bg-border"
                    style={{ width: '16px' }}
                />
            )}

            {/* Node card */}
            <div
                className={cn(
                    "relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200",
                    "border border-border/60 hover:shadow-card hover:shadow-black/10",
                    style.border,
                    style.bg,
                    level > 0 && "ml-8"
                )}
                onClick={handleClick}
            >
                {/* Expand/collapse toggle */}
                <div
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                >
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )
                    ) : (
                        <User className={cn("h-3.5 w-3.5", style.text)} />
                    )}
                </div>

                {/* Avatar */}
                <div className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center font-semibold text-sm",
                    style.bg,
                    style.text,
                    "border",
                    style.border
                )}>
                    {node.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{node.full_name || 'Unnamed'}</span>
                        <Badge
                            variant="outline"
                            className={cn(
                                "text-[10px] h-4 px-1.5 capitalize",
                                style.text,
                                style.border,
                            )}
                        >
                            {isClient ? (node.contactType || 'customer') : (node.partner_tier || 'standard')}
                        </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
                        {node.email && <span className="truncate max-w-[150px]">{node.email}</span>}
                    </div>
                </div>

                {/* Stats - only show for reps */}
                {!isClient && (
                    <div className="flex items-center gap-4 text-xs">
                        <div className="text-center">
                            <div className="text-muted-foreground">Commission</div>
                            <div className={cn("font-semibold", style.text)}>
                                {((node.commission_rate || 0) * 100).toFixed(0)}%
                            </div>
                        </div>
                        {hasChildren && (
                            <div className="text-center">
                                <div className="text-muted-foreground">Downline</div>
                                <div className="font-semibold flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {children.length}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Children */}
            {isExpanded && hasChildren && (
                <div className="relative">
                    {/* Vertical line connecting children */}
                    <div
                        className={cn("absolute w-px bg-border", level > 0 ? "left-12" : "left-4")}
                        style={{
                            top: '0',
                            bottom: '20px',
                        }}
                    />
                    <div className={cn("space-y-1 mt-1", level > 0 ? "ml-8" : "")}>
                        {children.map((child, idx) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                allNodes={allNodes}
                                level={level + 1}
                                isLast={idx === children.length - 1}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default function DownlineVisualizer({ data }: { data: PartnerNode[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                <Network className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">No network data found.</p>
                <p className="text-xs text-muted-foreground mt-1">Promote clients or add partners to build the hierarchy.</p>
            </div>
        );
    }

    // Find root nodes (no parent or parent not in this dataset)
    const nodeIds = new Set(data.map(n => n.id));
    const roots = data.filter(n => !n.parent_rep_id || !nodeIds.has(n.parent_rep_id));

    // Summary stats
    const totalPartners = data.length;
    const byTier = data.reduce((acc, n) => {
        const tier = n.partner_tier || 'standard';
        acc[tier] = (acc[tier] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-muted/30 border text-xs">
                <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{totalPartners} Partners</span>
                </div>
                {Object.entries(byTier).map(([tier, count]) => {
                    const s = getTierStyle(tier);
                    return (
                        <div key={tier} className="flex items-center gap-1.5">
                            <div className={cn("h-2 w-2 rounded-full", s.border, "border-2")} />
                            <span className="capitalize text-muted-foreground">{tier}: {count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Tree */}
            <div className="space-y-1">
                {roots.map((root, idx) => (
                    <TreeNode
                        key={root.id}
                        node={root}
                        allNodes={data}
                        level={0}
                        isLast={idx === roots.length - 1}
                    />
                ))}
            </div>
        </div>
    );
}
