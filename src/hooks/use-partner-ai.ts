import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/ai-utils';
import { logger } from '@/lib/logger';

export type PartnerMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

const PARTNER_DATA_KEYS = [
  'commissions', 'partner_downline', 'commission_stats',
  'partner_orders', 'partner_suggestions',
];

export function usePartnerAI() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<PartnerMessage[]>([]);

  // Load chat history
  const { data: dbMessages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['partner-chat', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('partner_chat_messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as PartnerMessage[];
    },
    enabled: !!user?.id,
  });

  const messages: PartnerMessage[] = [
    ...dbMessages,
    ...optimisticMessages,
  ];

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (import.meta.env.DEV) {
        const makeRequest = async (token: string) => {
          const res = await fetch('/functions/v1/partner-ai-chat', {
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
      const { data, error } = await invokeEdgeFunction<{ reply: string }>('partner-ai-chat', { message });
      if (error) throw new Error(error.message);
      return data!;
    },
    retry: (failureCount, error) => {
      if (/\b(401|403|unauthorized|expired|sign in)\b/i.test((error as Error)?.message || '')) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['partner-chat', user?.id] });
      setTimeout(() => {
        for (const key of PARTNER_DATA_KEYS) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }, 500);
    },
    onError: (error) => {
      logger.error('Partner AI chat error:', error);
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
      .from('partner_chat_messages')
      .delete()
      .eq('user_id', user.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to clear chat', description: error.message });
      return;
    }
    setOptimisticMessages([]);
    queryClient.invalidateQueries({ queryKey: ['partner-chat', user?.id] });
  }, [user?.id, queryClient, toast]);

  return {
    messages,
    sendMessage,
    clearChat,
    isLoading: sendMutation.isPending,
    isLoadingHistory,
  };
}
