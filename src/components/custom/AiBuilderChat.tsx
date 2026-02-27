import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Send, Wand2, Bot, User, Database, LayoutDashboard,
  Zap, FileBarChart, Package, Users, Shield, Sparkles, ChevronRight,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const CATEGORIES = [
  {
    label: 'Data & Fields',
    icon: Database,
    suggestions: [
      'Add a "Priority" field to contacts',
      'Create a suppliers entity with name, email, and lead time',
      'Add a lot number field to inventory items',
    ],
  },
  {
    label: 'Dashboards',
    icon: LayoutDashboard,
    suggestions: [
      'Build a revenue-by-peptide dashboard',
      'Show total orders on my dashboard with daily trends',
      'Create a client retention dashboard',
    ],
  },
  {
    label: 'Automations',
    icon: Zap,
    suggestions: [
      'Alert me when inventory drops below 200 units',
      'Auto-email clients when their order ships',
      'Notify team when a COA expires in 30 days',
    ],
  },
  {
    label: 'Reports',
    icon: FileBarChart,
    suggestions: [
      'Generate a monthly compliance report',
      'Break down revenue by sales rep this quarter',
      'Show expiring lots by peptide for the next 90 days',
    ],
  },
  {
    label: 'Modules',
    icon: Package,
    suggestions: [
      'Create a Protocols module for dosing schedules',
      'Build a supplier management module',
      'Add a batch tracking module with COA upload',
    ],
  },
  {
    label: 'Client Portal',
    icon: Users,
    suggestions: [
      'Let clients view their order history in the portal',
      'Add a dosing schedule viewer for clients',
      'Enable clients to request refills from the portal',
    ],
  },
];

export function AiBuilderChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data, error } = await invokeEdgeFunction<{ reply: string; tool_calls?: { name: string; arguments: Record<string, unknown> }[] }>('ai-builder', { message, history });
      if (error) throw new Error(error.message);
      return data!;
    },
    onSuccess: (data) => {
      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', content: data.reply },
      ]);
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      queryClient.invalidateQueries({ queryKey: ['custom-entities'] });
      queryClient.invalidateQueries({ queryKey: ['custom-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['custom-entity-records'] });
    },
  });

  const handleSend = (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sendMutation.isPending) return;

    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: msg },
    ]);
    setInput('');
    setActiveCategory(null);
    sendMutation.mutate(msg);
  };

  return (
    <Card className="flex flex-col h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.03] to-transparent">
        <div className="relative">
          <Wand2 className="h-5 w-5 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
        <span className="font-semibold">AI Builder</span>
        <Badge variant="secondary" className="text-xs">Beta</Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <Shield className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Changes are reversible</span>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {/* Empty state with categorized suggestions */}
        {!messages.length && (
          <div className="flex flex-col items-center text-center text-muted-foreground py-6">
            <div className="relative mb-5">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
              <div className="relative bg-primary/10 rounded-full p-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
            </div>
            <p className="text-base font-semibold text-foreground mb-1">What should we build?</p>
            <p className="text-xs max-w-sm mb-6">
              I create custom fields, entities, dashboards, automations, reports, and entire modules.
              Pick a category or describe what you need.
            </p>

            {/* Category grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 w-full max-w-lg mb-4">
              {CATEGORIES.map((cat, i) => (
                <button
                  key={cat.label}
                  onClick={() => setActiveCategory(activeCategory === i ? null : i)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-all text-xs ${
                    activeCategory === i
                      ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                      : 'border-border/40 hover:border-primary/30 hover:bg-primary/5 text-muted-foreground'
                  }`}
                >
                  <cat.icon className="h-4 w-4" />
                  <span className="leading-tight text-[10px] sm:text-xs">{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Suggestions for active category */}
            <AnimatePresence mode="wait">
              {activeCategory !== null && (
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-lg space-y-1.5"
                >
                  {CATEGORIES[activeCategory].suggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => handleSend(suggestion)}
                      className="w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all group text-sm"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors">{suggestion}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Default quick prompts when no category selected */}
            {activeCategory === null && (
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {[
                  'Add a "Priority" field to contacts',
                  'Show total orders on my dashboard',
                  'Alert me when inventory is low',
                  'Create a Protocols module',
                ].map(suggestion => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="text-xs hover:border-primary/40 hover:bg-primary/5"
                    onClick={() => handleSend(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-foreground/70" />
                </div>
              )}
            </motion.div>
          ))}

          {/* Building indicator with animated steps */}
          {sendMutation.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5 justify-start"
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted rounded-xl rounded-bl-sm px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Building</span>
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ...
                  </motion.span>
                </div>
              </div>
            </motion.div>
          )}

          {sendMutation.isError && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-destructive/10 text-destructive rounded-xl px-4 py-2.5 text-sm">
                Error: {(sendMutation.error as Error).message}
              </div>
            </motion.div>
          )}
        </div>
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input area */}
      <CardContent className="p-3 sm:p-4 pt-2 border-t border-border/60 bg-background/50">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Describe what you want to build..."
            disabled={sendMutation.isPending}
            className="flex-1 h-11"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            disabled={!input.trim() || sendMutation.isPending}
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
