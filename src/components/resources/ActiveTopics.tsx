import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Users, ChevronRight } from "lucide-react";

interface Topic {
    id: string;
    title: string;
    message_count: number;
    last_activity_at: string;
}

interface ActiveTopicsProps {
    topics: Topic[];
    onTopicClick?: (topic: Topic) => void;
    onJoinCommunity?: () => void;
}

export function ActiveTopics({ topics, onTopicClick, onJoinCommunity }: ActiveTopicsProps) {
    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} min ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    return (
        <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Active Topics
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Join Community CTA */}
                <Button onClick={onJoinCommunity} className="w-full gap-2">
                    <Users className="h-4 w-4" />
                    Join Community Forum
                </Button>

                {/* Topics List */}
                {topics.length > 0 ? (
                    <div className="space-y-2">
                        {topics.slice(0, 5).map((topic) => (
                            <button
                                key={topic.id}
                                onClick={() => onTopicClick?.(topic)}
                                className="w-full flex items-start justify-between p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{topic.title}</p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{topic.message_count} replies</span>
                                        <span>•</span>
                                        <span>{formatTimeAgo(topic.last_activity_at)}</span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No active discussions yet. Start a conversation!
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
