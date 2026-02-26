import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/ai-utils';
import { logger } from '@/lib/logger';

export type OnboardingMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

const AGENT_API_URL = import.meta.env.VITE_ONBOARDING_AGENT_URL || 'https://agent.thepeptideai.com';

export function useOnboardingChat() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<OnboardingMessage[]>([]);

  // Load chat history from onboarding_messages table
  const { data: dbMessages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['onboarding-chat', profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return [];
      const { data, error } = await supabase
        .from('onboarding_messages')
        .select('id, role, content, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as OnboardingMessage[];
    },
    enabled: !!profile?.org_id,
  });

  const messages: OnboardingMessage[] = [
    ...dbMessages,
    ...optimisticMessages,
  ];

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${AGENT_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || body.error || `Agent error (${res.status})`);
      }

      return await res.json() as { reply: string; message_id?: string };
    },
    retry: 1,
    retryDelay: 2000,
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['onboarding-chat', profile?.org_id] });
    },
    onError: (error) => {
      logger.error('Onboarding chat error:', error);
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
    if (!profile?.org_id) return;
    const { error } = await supabase
      .from('onboarding_messages')
      .delete()
      .eq('org_id', profile.org_id);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to clear chat', description: error.message });
      return;
    }
    setOptimisticMessages([]);
    queryClient.invalidateQueries({ queryKey: ['onboarding-chat', profile?.org_id] });
  }, [profile?.org_id, queryClient, toast]);

  return {
    messages,
    sendMessage,
    clearChat,
    isLoading: sendMutation.isPending,
    isLoadingHistory,
  };
}
