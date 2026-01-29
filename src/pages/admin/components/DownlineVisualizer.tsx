
import React from 'react';
import { PartnerNode } from '@/hooks/use-partner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, User, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface TreeNodeProps {
    node: PartnerNode;
    allNodes: PartnerNode[];
    level: number;
}

const TreeNode = ({ node, allNodes, level }: TreeNodeProps) => {
    const [isExpanded, setIsExpanded] = React.useState(true);
    const navigate = useNavigate();

    // Find direct children of this node
    // Logic: A node is a child if its path includes this node's ID at the end (or length logic?)
    // The RPC returns `path` as an array of IDs.
    // A child's path will be [..., parent_id, child_id].
    // So child.path.length === node.path.length + 1 AND child.path[last-1] === node.id

    // Actually, logic is simpler: child.path[level of node] === node.id 
    // And child.depth === node.depth + 1

    const children = allNodes.filter(n => n.depth === node.depth + 1 && n.path[n.path.length - 2] === node.id);
    const hasChildren = children.length > 0;

    return (
        <div className="select-none">
            <div
                className={cn(
                    "flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border",
                    level > 0 && "ml-6"
                )}
                onClick={() => navigate(`/admin/partners/${node.id}`)}
            >
                <div
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                >
                    {hasChildren && (
                        isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    )}
                </div>

                <div className="flex-1 flex items-center gap-3">
                    <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center",
                        node.partner_tier === 'senior' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                            node.partner_tier === 'director' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                        <User className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                            {node.full_name}
                            <Badge variant="outline" className="text-[10px] h-4 px-1">{node.partner_tier}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-3">
                            <span>Vol: ${Number(node.total_sales).toFixed(2)}</span>
                            <span>Depth: {node.depth}</span>
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && children.map(child => (
                <TreeNode key={child.id} node={child} allNodes={allNodes} level={level + 1} />
            ))}
        </div>
    );
};

export default function DownlineVisualizer({ data }: { data: PartnerNode[] }) {
    if (!data || data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                <Network className="h-8 w-8 mb-2 opacity-50" />
                <p>No network data found.</p>
            </div>
        );
    }

    // Find root nodes (depth 1 relative to the query root, or just the lowest depth in the set)
    const minDepth = Math.min(...data.map(n => n.depth));
    const roots = data.filter(n => n.depth === minDepth);

    return (
        <div className="space-y-1">
            {roots.map(root => (
                <TreeNode key={root.id} node={root} allNodes={data} level={0} />
            ))}
        </div>
    );
}
