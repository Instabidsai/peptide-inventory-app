import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/sb_client/client';
import { logger } from '@/lib/logger';

const AGENT_API_URL = import.meta.env.VITE_ONBOARDING_AGENT_URL || '';

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

export function useOnboardingChat() {
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<OnboardingMessage[]>([]);

  const orgId = profile?.org_id;

  // Load conversation history from DB
  const { data: dbMessages = [], isLoading } = useQuery({
    queryKey: ['onboarding-chat', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('onboarding_messages')
        .select('id, role, content, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as OnboardingMessage[];
    },
    enabled: !!orgId,
  });

  const messages: OnboardingMessage[] = [...dbMessages, ...optimisticMessages];

  const sendMutation = useMutation({
    mutationFn: async ({ message, attachments }: { message: string; attachments?: Attachment[] }) => {
      if (!session?.access_token) throw new Error('Not authenticated');
      if (!AGENT_API_URL) throw new Error('Agent API URL not configured');

      const resp = await fetch(`${AGENT_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, attachments }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || body.error || `Agent returned ${resp.status}`);
      }

      return resp.json() as Promise<{ reply: string; message_id: string }>;
    },
    onSuccess: () => {
      setOptimisticMessages([]);
      queryClient.invalidateQueries({ queryKey: ['onboarding-chat', orgId] });
    },
    onError: (err: Error) => {
      setOptimisticMessages([]);
      logger.error('Onboarding chat error', err);
      toast({
        title: 'Message failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const sendMessage = useCallback(
    (text: string, attachments?: Attachment[]) => {
      const trimmed = text.trim();
      if (!trimmed || sendMutation.isPending) return;

      const now = new Date().toISOString();
      setOptimisticMessages([
        { id: `opt-user-${Date.now()}`, role: 'user', content: trimmed, created_at: now },
        { id: `opt-thinking-${Date.now()}`, role: 'assistant', content: '...', created_at: now },
      ]);

      sendMutation.mutate({ message: trimmed, attachments });
    },
    [sendMutation],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<Attachment | null> => {
      if (!session?.user?.id) return null;

      const MAX_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        toast({ title: 'File too large', description: 'Maximum file size is 10MB.', variant: 'destructive' });
        return null;
      }

      const ext = file.name.split('.').pop() || 'bin';
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('onboarding-uploads')
        .upload(path, file, { upsert: false });

      if (uploadError) {
        logger.error('Upload failed', uploadError);
        toast({ title: 'Upload failed', description: uploadError.message, variant: 'destructive' });
        return null;
      }

      const { data: urlData } = await supabase.storage
        .from('onboarding-uploads')
        .createSignedUrl(path, 3600);

      if (!urlData?.signedUrl) {
        toast({ title: 'Upload failed', description: 'Could not create file URL.', variant: 'destructive' });
        return null;
      }

      return { url: urlData.signedUrl, name: file.name, type: file.type };
    },
    [session, toast],
  );

  return {
    messages,
    isLoading,
    isSending: sendMutation.isPending,
    sendMessage,
    uploadFile,
  };
}
