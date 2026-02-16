import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export type AdminMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export function useAdminAI() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<AdminMessage[]>([]);

  // Load chat history
  const { data: dbMessages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['admin-chat', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('admin_chat_messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as AdminMessage[];
    },
    enabled: !!user?.id,
  });

  const messages: AdminMessage[] = [
    ...dbMessages,
    ...optimisticMessages,
  ];

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('admin-ai-chat', {
        body: { message },
      });
      if (error) throw error;
      return data as { reply: string };
    },
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['admin-chat', user?.id] });
      // Refresh data the AI might have changed
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['peptides'] });
    },
    onError: () => {
      setOptimisticMessages(prev => [
        ...prev.filter(m => m.role === 'user'),
        {
          id: `err-${crypto.randomUUID()}`,
          role: 'assistant',
          content: "Sorry, something went wrong. Please try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    },
  });

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setOptimisticMessages(prev => [
      ...prev,
      {
        id: `opt-${crypto.randomUUID()}`,
        role: 'user',
        content: trimmed,
        created_at: new Date().toISOString(),
      },
    ]);
    sendMutation.mutate(trimmed);
  }, [sendMutation]);

  const clearChat = useCallback(async () => {
    if (!user?.id) return;
    await supabase
      .from('admin_chat_messages')
      .delete()
      .eq('user_id', user.id);
    setOptimisticMessages([]);
    queryClient.invalidateQueries({ queryKey: ['admin-chat', user?.id] });
  }, [user?.id, queryClient]);

  return {
    messages,
    sendMessage,
    clearChat,
    isLoading: sendMutation.isPending,
    isLoadingHistory,
  };
}
