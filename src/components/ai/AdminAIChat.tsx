import React, { useState, useRef, useEffect } from 'react';
import { useAdminAI, type AdminMessage } from '@/hooks/use-admin-ai';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { MessageSquare, X, Send, Loader2, Bot, User, Trash2 } from 'lucide-react';

export function AdminAIChat() {
  const { profile, userRole } = useAuth();
  const { messages, sendMessage, clearChat, isLoading, isLoadingHistory } = useAdminAI();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Only show for admin/staff (check both profile.role and user_roles.role)
  const role = userRole?.role || profile?.role;
  if (role !== 'admin' && role !== 'staff') return null;

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const welcomeMessage: AdminMessage = {
    id: 'welcome',
    role: 'assistant',
    content: "Hey! I'm your admin assistant. I can create contacts, build orders, check inventory & pricing, and pull up stats. Just tell me what you need — like \"new client John Smith john@email.com, wants 2 BPC-157 at MSRP, ship to 123 Main St Miami FL 33101\".",
    created_at: new Date().toISOString(),
  };

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Open admin AI chat"
        >
          <MessageSquare className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[420px] h-[100dvh] sm:h-[600px] sm:bottom-4 sm:right-4 sm:rounded-2xl bg-background border border-border/50 shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border/50 bg-card flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Admin Assistant</h3>
                <p className="text-[10px] text-muted-foreground">Orders, contacts, inventory</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                title="Clear chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {displayMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex w-full gap-2",
                      msg.role === 'user' ? "justify-end" : "justify-start",
                      msg.id.startsWith('opt-') && "opacity-70"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "p-3 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted/50 border border-border/50 text-foreground rounded-tl-sm"
                      )}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      <div className={cn(
                        "text-[10px] mt-1.5 opacity-50",
                        msg.role === 'user' ? "text-primary-foreground" : "text-muted-foreground"
                      )}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {msg.role === 'user' && (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="bg-muted/50 border border-border/50 p-3 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:150ms]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:300ms]" />
                      </div>
                      <span className="text-muted-foreground/50 text-xs">Working on it...</span>
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-border/50 bg-card flex gap-2 shrink-0">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Create orders, add contacts, check stock..."
              className="flex-1 h-10 rounded-xl text-sm"
              disabled={isLoading}
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              className="h-10 w-10 rounded-xl shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
