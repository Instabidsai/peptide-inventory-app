
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';

export type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isOptimistic?: boolean;
};

function friendlyError(error: unknown): string {
    const msg = (error as any)?.message || String(error);
    const lower = msg.toLowerCase();
    if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed'))
        return "Looks like you're offline or the server is unreachable. Check your connection and try again.";
    if (lower.includes('timeout') || lower.includes('timed out'))
        return "The AI took too long to respond. Please try a shorter question or try again in a moment.";
    if (lower.includes('rate limit') || lower.includes('429'))
        return "Too many requests — please wait a few seconds and try again.";
    if (lower.includes('500') || lower.includes('internal server'))
        return "The AI service hit an internal error. This is usually temporary — try again shortly.";
    return `Something went wrong. Please try again. (${msg})`;
}

export const useAI = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [conversationId, setConversationId] = useState<string | null>(null);

    // Load most recent conversation + messages
    const { data: conversationData, isLoading: isLoadingHistory } = useQuery({
        queryKey: ['ai-conversation', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;

            // Get most recent conversation
            const { data: convo } = await supabase
                .from('ai_conversations')
                .select('id')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!convo) return { conversationId: null, messages: [] };

            // Load messages
            const { data: messages } = await supabase
                .from('ai_messages')
                .select('id, role, content, created_at')
                .eq('conversation_id', convo.id)
                .order('created_at', { ascending: true });

            return {
                conversationId: convo.id,
                messages: (messages || []).map((m) => ({
                    id: m.id,
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                    timestamp: new Date(m.created_at),
                })),
            };
        },
        enabled: !!user?.id,
    });

    // Set conversationId from loaded data
    const activeConversationId = conversationId || conversationData?.conversationId || null;

    const dbMessages: Message[] = conversationData?.messages || [];

    // Optimistic messages (shown before DB confirms)
    const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

    const messages: Message[] = dbMessages.length > 0 || optimisticMessages.length > 0
        ? [...dbMessages, ...optimisticMessages]
        : [{
            id: 'welcome',
            role: 'assistant' as const,
            content: "Hey! I'm Peptide AI — your protocol consultant. I know your current protocols, inventory, and health data. Ask me anything about your peptides, share symptoms, or upload bloodwork and I'll help you make sense of it all.",
            timestamp: new Date(),
        }];

    const sendMutation = useMutation({
        mutationFn: async (content: string) => {
            const { data, error } = await supabase.functions.invoke('chat-with-ai', {
                body: {
                    message: content,
                    conversation_id: activeConversationId,
                },
            });

            if (error) throw error;
            return data as { reply: string; conversation_id: string };
        },
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        onSuccess: (data) => {
            // Update conversation ID if new
            if (data.conversation_id) setConversationId(data.conversation_id);
            // Clear optimistic messages and refetch from DB
            setOptimisticMessages([]);
            queryClient.invalidateQueries({ queryKey: ['ai-conversation', user?.id] });
            // Refresh knowledge panel after AI processes the message
            // (background extraction needs a few seconds to complete)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['ai-insights', user?.id] });
                queryClient.invalidateQueries({ queryKey: ['ai-health-profile', user?.id] });
            }, 3000);
        },
        onError: (error) => {
            logger.error('AI chat error:', error);
            const friendly = friendlyError(error);
            // Replace optimistic messages with error
            setOptimisticMessages(prev => [
                ...prev.filter(m => m.role === 'user'),
                {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: friendly,
                    timestamp: new Date(),
                    isOptimistic: true,
                },
            ]);
        },
    });

    const sendMessage = (content: string) => {
        // Add optimistic user message
        setOptimisticMessages(prev => [
            ...prev,
            {
                id: `opt-${crypto.randomUUID()}`,
                role: 'user',
                content,
                timestamp: new Date(),
                isOptimistic: true,
            },
        ]);
        sendMutation.mutate(content);
    };

    const startNewConversation = async () => {
        if (!user?.id) return;
        const { data: newConvo } = await supabase
            .from('ai_conversations')
            .insert({ user_id: user.id })
            .select('id')
            .maybeSingle();

        if (newConvo) {
            setConversationId(newConvo.id);
            setOptimisticMessages([]);
            queryClient.invalidateQueries({ queryKey: ['ai-conversation', user?.id] });
        }
    };

    return {
        messages,
        sendMessage,
        isLoading: sendMutation.isPending,
        isLoadingHistory,
        conversationId: activeConversationId,
        startNewConversation,
    };
};
