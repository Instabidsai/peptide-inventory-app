import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import {
    Loader2, MessageSquare, Plus, Send, ArrowLeft, ChevronRight,
    Clock, User, Pin
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type Topic = {
    id: string;
    title: string;
    content: string | null;
    theme_id: string | null;
    user_id: string;
    is_pinned: boolean;
    message_count: number;
    last_activity_at: string;
    created_at: string;
};

type Message = {
    id: string;
    topic_id: string;
    user_id: string;
    content: string;
    parent_id: string | null;
    created_at: string;
    profiles?: { full_name: string | null } | null;
};

export default function CommunityForum() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [viewMode, setViewMode] = useState<'list' | 'topic'>('list');
    const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
    const [newTopicOpen, setNewTopicOpen] = useState(false);
    const [newTopicTitle, setNewTopicTitle] = useState("");
    const [newTopicContent, setNewTopicContent] = useState("");
    const [replyContent, setReplyContent] = useState("");

    // Fetch topics
    const { data: topics, isLoading: loadingTopics } = useQuery({
        queryKey: ['discussion-topics'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('discussion_topics')
                .select('*')
                .order('is_pinned', { ascending: false })
                .order('last_activity_at', { ascending: false });
            if (error) throw error;
            return data as Topic[];
        }
    });

    // Fetch messages for selected topic
    const { data: messages, isLoading: loadingMessages } = useQuery({
        queryKey: ['discussion-messages', selectedTopic?.id],
        enabled: !!selectedTopic,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('discussion_messages')
                .select('*, profiles:user_id(full_name)')
                .eq('topic_id', selectedTopic!.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data as Message[];
        }
    });

    // Create topic mutation
    const createTopic = useMutation({
        mutationFn: async () => {
            if (!user?.id) throw new Error("Not logged in");
            const { data, error } = await supabase
                .from('discussion_topics')
                .insert({
                    title: newTopicTitle,
                    content: newTopicContent,
                    user_id: user.id
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['discussion-topics'] });
            setNewTopicOpen(false);
            setNewTopicTitle("");
            setNewTopicContent("");
            toast.success("Topic created!");
            setSelectedTopic(data);
            setViewMode('topic');
        },
        onError: () => toast.error("Failed to create topic")
    });

    // Post message mutation
    const postMessage = useMutation({
        mutationFn: async () => {
            if (!user?.id || !selectedTopic) throw new Error("Missing data");
            const { error } = await supabase
                .from('discussion_messages')
                .insert({
                    topic_id: selectedTopic.id,
                    user_id: user.id,
                    content: replyContent
                });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['discussion-messages', selectedTopic?.id] });
            queryClient.invalidateQueries({ queryKey: ['discussion-topics'] });
            setReplyContent("");
            toast.success("Reply posted!");
        },
        onError: () => toast.error("Failed to post reply")
    });

    const formatTimeAgo = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US');
    };

    const handleTopicClick = (topic: Topic) => {
        setSelectedTopic(topic);
        setViewMode('topic');
    };

    const handleBack = () => {
        setSelectedTopic(null);
        setViewMode('list');
    };

    if (loadingTopics) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-8">
            {/* TOPIC LIST VIEW */}
            {viewMode === 'list' && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" aria-label="Back to resources" onClick={() => navigate('/resources')}>
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight">Community Forum</h1>
                                <p className="text-sm text-muted-foreground">
                                    Discuss peptide research with the community
                                </p>
                            </div>
                        </div>

                        <Dialog open={newTopicOpen} onOpenChange={setNewTopicOpen}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus className="h-4 w-4" /> New Topic
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Start a Discussion</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 pt-4">
                                    <Input
                                        placeholder="Topic title"
                                        value={newTopicTitle}
                                        onChange={(e) => setNewTopicTitle(e.target.value)}
                                    />
                                    <Textarea
                                        placeholder="Share your question or thoughts..."
                                        value={newTopicContent}
                                        onChange={(e) => setNewTopicContent(e.target.value)}
                                        rows={4}
                                    />
                                    <Button
                                        onClick={() => createTopic.mutate()}
                                        disabled={!newTopicTitle.trim() || createTopic.isPending}
                                        className="w-full"
                                    >
                                        {createTopic.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Topic"}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {/* Topics List */}
                    <div className="space-y-2">
                        {topics?.length === 0 ? (
                            <Card className="bg-card/50">
                                <CardContent className="py-12 text-center">
                                    <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                                    <h3 className="font-medium mb-2">No discussions yet</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Be the first to start a conversation!
                                    </p>
                                    <Button onClick={() => setNewTopicOpen(true)} className="gap-2">
                                        <Plus className="h-4 w-4" /> Start a Topic
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : (
                            topics?.map((topic) => (
                                <Card
                                    key={topic.id}
                                    className="cursor-pointer hover:border-primary/50 transition-colors"
                                    onClick={() => handleTopicClick(topic)}
                                >
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {topic.is_pinned && (
                                                        <Pin className="h-3 w-3 text-primary" />
                                                    )}
                                                    <h3 className="font-semibold truncate">{topic.title}</h3>
                                                </div>
                                                {topic.content && (
                                                    <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                                                        {topic.content}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <MessageSquare className="h-3 w-3" />
                                                        {topic.message_count} replies
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {formatTimeAgo(topic.last_activity_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* TOPIC DETAIL VIEW */}
            {viewMode === 'topic' && selectedTopic && (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" aria-label="Back to forum list" onClick={handleBack}>
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl font-bold truncate">{selectedTopic.title}</h1>
                            <p className="text-sm text-muted-foreground">
                                {selectedTopic.message_count} replies • Started {formatTimeAgo(selectedTopic.created_at)}
                            </p>
                        </div>
                    </div>

                    {/* Original Post */}
                    {selectedTopic.content && (
                        <Card className="bg-primary/5 border-primary/20">
                            <CardContent className="p-4">
                                <p className="text-sm whitespace-pre-wrap">{selectedTopic.content}</p>
                                <p className="text-xs text-muted-foreground mt-3">
                                    Posted {formatTimeAgo(selectedTopic.created_at)}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    <Separator />

                    {/* Messages */}
                    <div className="space-y-4">
                        <h3 className="font-semibold flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Replies ({messages?.length || 0})
                        </h3>

                        {loadingMessages ? (
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        ) : messages?.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                                No replies yet. Be the first to respond!
                            </p>
                        ) : (
                            messages?.map((message) => (
                                <Card key={message.id} className="bg-card/50">
                                    <CardContent className="p-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                                <User className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-sm font-medium">{message.profiles?.full_name || 'Community Member'}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatTimeAgo(message.created_at)}
                                                    </span>
                                                </div>
                                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>

                    {/* Reply Input */}
                    <Card className="sticky bottom-20 lg:bottom-4 bg-background border-primary/20">
                        <CardContent className="p-4">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (replyContent.trim()) postMessage.mutate();
                                }}
                                className="flex gap-2"
                            >
                                <Textarea
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    placeholder="Write a reply..."
                                    className="min-h-[44px] max-h-[120px] resize-none"
                                    rows={1}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    aria-label="Post reply"
                                    disabled={!replyContent.trim() || postMessage.isPending}
                                >
                                    {postMessage.isPending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
