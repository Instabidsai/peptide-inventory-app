
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useAuth } from '@/contexts/AuthContext';

export function useAIKnowledge() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // Documents
    const { data: documents = [], isLoading: isLoadingDocs } = useQuery({
        queryKey: ['ai-documents', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data } = await supabase
                .from('ai_documents')
                .select('id, file_name, file_type, status, summary, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            return data || [];
        },
        enabled: !!user?.id,
    });

    // Learned insights
    const { data: insights = [], isLoading: isLoadingInsights } = useQuery({
        queryKey: ['ai-insights', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];
            const { data } = await supabase
                .from('ai_learned_insights')
                .select('id, category, title, content, source, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);
            return data || [];
        },
        enabled: !!user?.id,
    });

    // Health profile
    const { data: healthProfile, isLoading: isLoadingProfile } = useQuery({
        queryKey: ['ai-health-profile', user?.id],
        queryFn: async () => {
            if (!user?.id) return null;
            const { data } = await supabase
                .from('ai_health_profiles')
                .select('*')
                .eq('user_id', user.id)
                .single();
            return data;
        },
        enabled: !!user?.id,
    });

    // Upload document
    const uploadDocument = useMutation({
        mutationFn: async (file: File) => {
            if (!user?.id) throw new Error('Not authenticated');

            const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
            const storagePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

            // Upload to storage
            const { error: uploadError } = await supabase.storage
                .from('health-documents')
                .upload(storagePath, file);

            if (uploadError) throw uploadError;

            // Create document record
            const { data: doc, error: docError } = await supabase
                .from('ai_documents')
                .insert({
                    user_id: user.id,
                    file_name: file.name,
                    file_type: file.type,
                    storage_path: storagePath,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (docError) throw docError;

            // Trigger processing
            await supabase.functions.invoke('process-health-document', {
                body: { document_id: doc.id },
            });

            return doc;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-documents', user?.id] });
            // Also refresh insights and profile since processing may add to them
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['ai-insights', user?.id] });
                queryClient.invalidateQueries({ queryKey: ['ai-health-profile', user?.id] });
            }, 10000); // Refresh after 10s to give processing time
        },
    });

    // Refresh all knowledge data (called after each chat message)
    const refreshKnowledge = () => {
        // Small delay to let background extraction complete
        setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['ai-insights', user?.id] });
            queryClient.invalidateQueries({ queryKey: ['ai-health-profile', user?.id] });
            queryClient.invalidateQueries({ queryKey: ['ai-documents', user?.id] });
        }, 3000);
    };

    return {
        documents,
        insights,
        healthProfile,
        isLoading: isLoadingDocs || isLoadingInsights || isLoadingProfile,
        uploadDocument,
        refreshKnowledge,
    };
}
