
import { useState } from 'react';
import { supabase } from '@/integrations/sb_client/client';

type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
};

export const useAI = () => {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: "Hello! I'm your Peptide Health Intelligence. I can help analyze your protocols, logs, and answer questions based on Dr. Bochman's research. How can I help today?",
            timestamp: new Date()
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async (content: string) => {
        // 1. Add User Message
        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            console.log('🧠 Sending to AI...');
            const { data, error } = await supabase.functions.invoke('chat-with-ai', {
                body: { message: content }
            });

            if (error) throw error;

            const aiMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.reply || "I'm sorry, I couldn't generate a response.",
                timestamp: new Date()
            };

            setMessages(prev => [...prev, aiMsg]);
        } catch (err) {
            console.error('AI Error:', err);
            const errorMsg: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: "I'm having trouble connecting to my brain right now. Please try again later.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        messages,
        sendMessage,
        isLoading
    };
};
