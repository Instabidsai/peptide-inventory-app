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

export type Attachment = {
  url: string;
  name: string;
  type: string;
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
    mutationFn: async ({ message, attachments }: { message: string; attachments?: Attachment[] }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90_000); // 90s timeout

      const body: Record<string, unknown> = { message };
      if (attachments?.length) body.attachments = attachments;

      let res: Response;
      try {
        res = await fetch(`${AGENT_API_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          throw new Error('The AI took too long to respond. Please try again.');
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || body.error || `Agent error (${res.status})`);
      }

      return await res.json() as { reply: string; message_id?: string };
    },
    retry: (failureCount, error) => {
      // Don't retry network errors (server unreachable) — only retry server errors
      const msg = (error as Error)?.message?.toLowerCase() ?? '';
      if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed'))
        return false;
      return failureCount < 1;
    },
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

  const sendMessage = useCallback((text: string, attachments?: Attachment[]) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const displayContent = attachments?.length
      ? `${trimmed}\n\n📎 ${attachments.map(a => a.name).join(', ')}`
      : trimmed;

    setOptimisticMessages(prev => [
      ...prev,
      {
        id: `opt-${crypto.randomUUID()}`,
        role: 'user',
        content: displayContent,
        created_at: new Date().toISOString(),
      },
    ]);
    sendMutation.mutate({ message: trimmed, attachments });
  }, [sendMutation]);

  const uploadFile = useCallback(async (file: File): Promise<Attachment> => {
    if (!user?.id) throw new Error('Not authenticated');
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('onboarding-uploads')
      .upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;

    const { data: urlData } = await supabase.storage
      .from('onboarding-uploads')
      .createSignedUrl(path, 3600); // 1 hour expiry
    if (!urlData?.signedUrl) throw new Error('Failed to generate signed URL');

    return { url: urlData.signedUrl, name: file.name, type: file.type };
  }, [user?.id]);

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
    uploadFile,
    clearChat,
    isLoading: sendMutation.isPending,
    isLoadingHistory,
  };
}
