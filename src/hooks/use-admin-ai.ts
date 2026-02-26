import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/ai-utils';
import { logger } from '@/lib/logger';

export type AdminMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

const ADMIN_DATA_KEYS = [
  'contacts', 'sales_orders', 'peptides', 'orders', 'lots',
  'bottles', 'movements', 'commissions', 'expenses', 'protocols',
  'requests', 'financial-metrics',
];

export function useAdminAI() {
  const { user } = useAuth();
  const { toast } = useToast();
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
      // In dev mode, use Vite proxy to bypass Supabase gateway CORS restrictions
      if (import.meta.env.DEV) {
        const makeRequest = async (token: string) => {
          const res = await fetch('/functions/v1/admin-ai-chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ message }),
          });
          return res;
        };

        let session = (await supabase.auth.getSession()).data.session;
        if (!session) throw new Error('Not authenticated');
        let res = await makeRequest(session.access_token);

        // Retry once with refreshed token on auth failure
        if (res.status === 401) {
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (!refreshData.session) throw new Error('Session expired — please sign in again');
          res = await makeRequest(refreshData.session.access_token);
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(body.error || `Edge function error (${res.status})`);
        }
        return await res.json() as { reply: string };
      }
      // Production: use wrapper with auto token-refresh
      const { data, error } = await invokeEdgeFunction<{ reply: string }>('admin-ai-chat', { message });
      if (error) throw new Error(error.message);
      return data!;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['admin-chat', user?.id] });
      // Batch-invalidate admin data after a short delay (AI response may trigger DB changes)
      setTimeout(() => {
        for (const key of ADMIN_DATA_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }, 500);
    },
    onError: (error) => {
      logger.error('Admin AI chat error:', error);
      const friendly = friendlyError(error);
      setOptimisticMessages(prev => [
        ...prev.filter(m => m.role === 'user'),
        {
          id: `err-${crypto.randomUUID()}`,
          role: 'assistant',
          content: friendly,
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
    const { error } = await supabase
      .from('admin_chat_messages')
      .delete()
      .eq('user_id', user.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to clear chat', description: error.message });
      return;
    }
    setOptimisticMessages([]);
    queryClient.invalidateQueries({ queryKey: ['admin-chat', user?.id] });
  }, [user?.id, queryClient, toast]);

  return {
    messages,
    sendMessage,
    clearChat,
    isLoading: sendMutation.isPending,
    isLoadingHistory,
  };
}
