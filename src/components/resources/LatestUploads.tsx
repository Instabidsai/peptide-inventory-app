import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Video, FileText, BookOpen, Download, ChevronRight } from "lucide-react";

interface Resource {
    id: string;
    title: string;
    type: string;
    created_at: string;
}

interface LatestUploadsProps {
    resources: Resource[];
    onResourceClick: (resource: Resource) => void;
    onViewAll?: () => void;
}

export function LatestUploads({ resources, onResourceClick, onViewAll }: LatestUploadsProps) {
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'video': return <Video className="h-4 w-4 text-red-400" />;
            case 'guide': return <BookOpen className="h-4 w-4 text-blue-400" />;
            case 'pdf': return <Download className="h-4 w-4 text-orange-400" />;
            default: return <FileText className="h-4 w-4 text-primary" />;
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    if (resources.length === 0) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Latest Uploads</h2>
                </div>
                <p className="text-sm text-muted-foreground text-center py-4">
                    No resources uploaded yet.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Latest Uploads</h2>
                </div>
                {onViewAll && (
                    <Button variant="ghost" size="sm" onClick={onViewAll} className="text-muted-foreground">
                        View All <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                )}
            </div>

            <div className="space-y-2">
                {resources.map((resource) => (
                    <button
                        key={resource.id}
                        onClick={() => onResourceClick(resource)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg bg-card/50 hover:bg-card border border-transparent hover:border-primary/30 transition-all text-left"
                    >
                        <div className="p-2 rounded-md bg-muted/50">
                            {getTypeIcon(resource.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{resource.title}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(resource.created_at)}</p>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs shrink-0">
                            {resource.type}
                        </Badge>
                    </button>
                ))}
            </div>
        </div>
    );
}
