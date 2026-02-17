import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Loader2, Send, Paperclip, User, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AudioRecorder } from "@/components/ui/AudioRecorder";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Types
interface ReplyAttachment {
    type: string;
    url: string;
    name?: string;
}

interface Reply {
    id: string;
    request_id: string;
    user_id: string;
    message: string;
    attachments: ReplyAttachment[];
    created_at: string;
    is_internal: boolean;
    sender?: {
        full_name: string | null;
        role: string;
    };
}

interface MessageThreadProps {
    requestId: string;
    userRole: 'admin' | 'client';
    className?: string;
}

export function MessageThread({ requestId, userRole, className }: MessageThreadProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [newMessage, setNewMessage] = useState("");
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isInternal, setIsInternal] = useState(false); // Only for admins

    // Fetch Replies
    const { data: replies, isLoading } = useQuery({
        queryKey: ['request-replies', requestId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('request_replies')
                .select(`
                    *,
                    sender:profiles!user_id(full_name, role)
                `)
                .eq('request_id', requestId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data as Reply[];
        },
        refetchInterval: 5000
    });

    // 2. Fetch Request Details (for Context)
    const { data: requestContext } = useQuery({
        queryKey: ['request-details', requestId],
        queryFn: async () => {
            const { data } = await supabase.from('client_requests').select('context_type, context_id').eq('id', requestId).single();
            return data;
        },
        enabled: !!requestId
    });

    // Send Reply Mutation
    const sendReplyMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("No user");

            const attachments: ReplyAttachment[] = [];

            // Upload Voice Blob if exists
            if (voiceBlob) {
                const fileName = `voice_${Date.now()}.webm`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('messaging-attachments')
                    .upload(`${user.id}/${fileName}`, voiceBlob);

                if (uploadError) throw uploadError;

                const { data: publicUrlData } = supabase.storage
                    .from('messaging-attachments')
                    .getPublicUrl(`${user.id}/${fileName}`);

                attachments.push({
                    type: 'voice',
                    url: publicUrlData.publicUrl,
                    name: 'Voice Note'
                });
            }

            const { error } = await supabase.from('request_replies').insert({
                request_id: requestId,
                user_id: user.id,
                message: newMessage,
                attachments: attachments,
                is_internal: isInternal
            });

            if (error) throw error;
        },
        onSuccess: () => {
            setNewMessage("");
            setVoiceBlob(null);
            queryClient.invalidateQueries({ queryKey: ['request-replies', requestId] });
            toast.success("Message sent");
            // Scroll to bottom
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        },
        onError: (err) => {
            console.error(err);
            toast.error("Failed to send message");
        }
    });

    // Auto-scroll on new messages
    useEffect(() => {
        if (replies) {
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [replies]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() && !voiceBlob) return;
        sendReplyMutation.mutate();
    };

    if (isLoading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className={cn("flex flex-col h-[500px] border rounded-md bg-background", className)}>
            {/* Context Banner */}
            {requestContext && requestContext.context_type && (
                <div className="bg-secondary/30 text-xs px-4 py-2 border-b flex items-center gap-2 text-muted-foreground">
                    <span className="font-semibold text-foreground">Referring to:</span>
                    <span className="capitalize">{requestContext.context_type.replace('_', ' ')}</span>
                    <span className="font-mono bg-background px-1 rounded border">#{requestContext.context_id?.substring(0, 8)}...</span>
                </div>
            )}

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {replies?.length === 0 && (
                        <div className="text-center text-muted-foreground text-sm py-8">
                            No messages yet. Start the conversation!
                        </div>
                    )}

                    {replies?.map((reply) => {
                        const isMe = reply.user_id === user?.id;
                        const isFromAdmin = reply.sender?.role !== 'customer'; // Assuming roles: customer vs admin/employee

                        // Hide internal notes from clients
                        if (reply.is_internal && userRole === 'client') return null;

                        return (
                            <div key={reply.id} className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}>
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback className={cn(isFromAdmin ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")}>
                                        {reply.sender?.full_name?.[0] || <User className="h-4 w-4" />}
                                    </AvatarFallback>
                                </Avatar>

                                <div className={cn(
                                    "flex flex-col max-w-[80%] rounded-lg p-3 text-sm",
                                    isMe
                                        ? "bg-primary text-primary-foreground ml-12"
                                        : "bg-muted text-foreground mr-12",
                                    reply.is_internal && "bg-yellow-50 border border-yellow-200 text-yellow-900"
                                )}>
                                    {/* Header */}
                                    <div className="flex items-center gap-2 mb-1 justify-between text-xs opacity-70">
                                        <span className="font-semibold">{reply.sender?.full_name || 'Unknown'}</span>
                                        <span>{format(new Date(reply.created_at), 'h:mm a')}</span>
                                    </div>

                                    {/* Internal Badge */}
                                    {reply.is_internal && (
                                        <div className="flex items-center gap-1 text-xs font-bold text-yellow-600 mb-1">
                                            <ShieldAlert className="h-3 w-3" /> Internal Note
                                        </div>
                                    )}

                                    {/* Content */}
                                    <p className="whitespace-pre-wrap">{reply.message}</p>

                                    {/* Attachments */}
                                    {reply.attachments?.map((att) => (
                                        <div key={att.url} className="mt-2 text-xs">
                                            {att.type === 'voice' && (
                                                <audio controls src={att.url} className="w-full h-8" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-4 border-t bg-muted/20">
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">

                    {/* Voice Recorder Integration */}
                    <div className="flex items-center justify-between">
                        <AudioRecorder onRecordingComplete={(blob) => setVoiceBlob(blob)} />

                        {userRole === 'admin' && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Internal Note?</span>
                                <input
                                    type="checkbox"
                                    checked={isInternal}
                                    onChange={(e) => setIsInternal(e.target.checked)}
                                    className="h-4 w-4"
                                />
                            </div>
                        )}
                    </div>

                    {/* Visual indicator that voice is attached */}
                    {voiceBlob && (
                        <div className="flex items-center gap-2 p-2 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                            <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                            Voice Message Ready to Send
                            <button type="button" onClick={() => setVoiceBlob(null)} className="ml-auto hover:underline">Remove</button>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder={voiceBlob ? "Add a text caption..." : "Type a message..."}
                            className="min-h-[60px] resize-none"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                        />
                        <Button type="submit" size="icon" aria-label="Send message" className="h-[60px] w-[60px]" disabled={sendReplyMutation.isPending || (!newMessage.trim() && !voiceBlob)}>
                            {sendReplyMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
