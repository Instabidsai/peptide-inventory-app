import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Video, FileText, BookOpen, Download, Eye } from "lucide-react";

interface ResourceCardProps {
    id: string;
    title: string;
    description: string | null;
    type: string;
    thumbnailUrl?: string | null;
    viewCount?: number;
    durationSeconds?: number | null;
    onClick?: () => void;
}

export function ResourceCard({
    title,
    description,
    type,
    thumbnailUrl,
    viewCount = 0,
    durationSeconds,
    onClick
}: ResourceCardProps) {
    const getTypeIcon = () => {
        switch (type) {
            case 'video': return <Video className="h-4 w-4" />;
            case 'guide': return <BookOpen className="h-4 w-4" />;
            case 'pdf': return <Download className="h-4 w-4" />;
            default: return <FileText className="h-4 w-4" />;
        }
    };

    const getTypeBadgeColor = () => {
        switch (type) {
            case 'video': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'guide': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
            case 'pdf': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            default: return 'bg-primary/20 text-primary border-primary/30';
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Card
            className="group cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 overflow-hidden"
            onClick={onClick}
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-gradient-to-br from-card to-muted overflow-hidden">
                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="p-4 rounded-full bg-primary/10">
                            {getTypeIcon()}
                        </div>
                    </div>
                )}

                {/* Duration badge for videos */}
                {type === 'video' && durationSeconds && (
                    <Badge className="absolute bottom-2 right-2 bg-black/70 text-white text-xs">
                        {formatDuration(durationSeconds)}
                    </Badge>
                )}

                {/* Type badge */}
                <Badge className={`absolute top-2 left-2 ${getTypeBadgeColor()} capitalize`}>
                    {getTypeIcon()}
                    <span className="ml-1">{type}</span>
                </Badge>
            </div>

            <CardHeader className="pb-2">
                <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                    {title}
                </h3>
            </CardHeader>

            <CardContent className="pt-0 pb-2">
                <p className="text-xs text-muted-foreground line-clamp-2">
                    {description || "View resource for more details."}
                </p>
            </CardContent>

            <CardFooter className="pt-0 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    <span>{viewCount.toLocaleString()} views</span>
                </div>
            </CardFooter>
        </Card>
    );
}
