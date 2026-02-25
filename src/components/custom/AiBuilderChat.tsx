import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Wand2 } from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function AiBuilderChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke('ai-builder', {
        body: { message, history },
      });
      if (error) throw error;
      return data as { reply: string; tool_calls?: { name: string; arguments: Record<string, unknown> }[] };
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.reply },
      ]);
      // Invalidate custom data queries since AI may have created new entities/fields
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      queryClient.invalidateQueries({ queryKey: ['custom-entities'] });
      queryClient.invalidateQueries({ queryKey: ['custom-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['custom-entity-records'] });
    },
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;

    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: msg },
    ]);
    setInput('');
    sendMutation.mutate(msg);
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <div className="flex items-center gap-2 p-4 border-b border-border/60">
        <Wand2 className="h-5 w-5 text-primary" />
        <span className="font-semibold">AI Builder</span>
        <Badge variant="secondary" className="text-xs">Beta</Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        {!messages.length && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12">
            <Wand2 className="h-10 w-10 mb-4 text-primary/50" />
            <p className="text-sm font-medium mb-2">Tell me what you need</p>
            <p className="text-xs max-w-sm">
              I can add custom fields, create new data entities, build dashboard widgets,
              set up automations, and generate reports. Just describe what you want.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                'Add a "Priority" field to contacts',
                'Create a suppliers entity',
                'Show total orders on my dashboard',
                'Alert me when inventory is low',
              ].map(suggestion => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setInput(suggestion);
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {sendMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Building...
              </div>
            </div>
          )}

          {sendMutation.isError && (
            <div className="flex justify-start">
              <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-2.5 text-sm">
                Error: {(sendMutation.error as Error).message}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef} />
      </ScrollArea>

      <CardContent className="p-4 pt-2 border-t border-border/60">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Describe what you want to build..."
            disabled={sendMutation.isPending}
            className="flex-1"
          />
          <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || sendMutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
