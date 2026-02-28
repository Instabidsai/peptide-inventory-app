import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { usePartnerAI, type PartnerMessage } from '@/hooks/use-partner-ai';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { MessageSquare, X, Send, Loader2, Bot, User, Trash2, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function PartnerAIChat() {
  const { profile, userRole } = useAuth();
  const { messages, sendMessage, clearChat, isLoading, isLoadingHistory } = usePartnerAI();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const pos = position ?? { x: rect.left, y: rect.top };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.origX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy));
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  // Only show for sales_rep (partners)
  const role = userRole?.role || profile?.role;

  // Auto-scroll on new messages (must be before early return for hooks rules)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  if (role !== 'sales_rep') return null;

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleCopy = async (content: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  const welcomeMessage: PartnerMessage = {
    id: 'welcome',
    role: 'assistant',
    content: "Hey! I'm your partner assistant. I can help you with:\n\n- **Product info** — peptides, protocols, dosing\n- **Your commissions** — check earnings and status\n- **Your clients** — view your assigned contacts\n- **Stock levels** — what's available to sell\n- **Resources** — educational materials\n- **Suggestions** — submit ideas or report issues\n\nWhat can I help with?",
    created_at: new Date().toISOString(),
  };

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

  return (
    <>
      {/* Floating button */}
      {!open && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-white shadow-overlay hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Open partner AI chat"
        >
          <MessageSquare className="h-6 w-6" />
        </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
              "fixed z-50 w-full sm:w-[420px] h-[100dvh] sm:h-[600px] sm:rounded-2xl bg-card border border-border/60 shadow-overlay flex flex-col overflow-hidden",
              !position && "bottom-0 right-0 sm:bottom-4 sm:right-4"
            )}
            style={position ? { left: position.x, top: position.y } : { paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header — drag handle */}
            <div
              className="px-4 py-3 border-b border-border/50 bg-card flex items-center justify-between shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={() => setPosition(null)}
            >
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Partner Assistant</h3>
                  <p className="text-[10px] text-muted-foreground">Protocols, stock, commissions</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1.5 mr-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                  </span>
                  <span className="text-[9px] text-primary font-mono">LIVE</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear chat"
                      className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                      title="Clear chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all messages in this conversation. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearChat}>Clear</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close chat"
                  onClick={() => { setOpen(false); setPosition(null); }}
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
                  <AnimatePresence mode="popLayout">
                    {displayMessages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className={cn(
                          "flex w-full gap-2 group/msg",
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
                              ? "bg-primary text-white rounded-tr-sm"
                              : "bg-muted/70 border border-border/60 text-foreground rounded-tl-sm"
                          )}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          )}
                          <div className={cn(
                            "flex items-center gap-2 mt-1.5",
                            msg.role === 'user' ? "justify-end" : "justify-between"
                          )}>
                            <span className={cn(
                              "text-[10px] opacity-50",
                              msg.role === 'user' ? "text-white" : "text-muted-foreground"
                            )}>
                              {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {msg.role === 'assistant' && msg.id !== 'welcome' && (
                              <button
                                onClick={() => handleCopy(msg.content, msg.id)}
                                className="opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md hover:bg-muted"
                                aria-label="Copy response"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="h-3 w-3 text-primary" />
                                ) : (
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        {msg.role === 'user' && (
                          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="flex justify-start gap-2"
                    >
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="bg-muted/70 border border-border/60 p-3 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-foreground/60"
                              animate={{
                                opacity: [0.3, 1, 0.3],
                                scale: [0.85, 1.2, 0.85],
                              }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                delay: i * 0.15,
                                ease: 'easeInOut',
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-muted-foreground text-xs">Working on it...</span>
                      </div>
                    </motion.div>
                  )}
                  <div ref={scrollRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input */}
            <form onSubmit={handleSend} className="p-3 border-t border-border/50 bg-card flex gap-2 shrink-0">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about protocols, check stock, suggest features..."
                className="flex-1 h-10 rounded-xl text-sm"
                disabled={isLoading}
                autoFocus
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !input.trim()}
                className="h-10 w-10 rounded-xl shrink-0 bg-primary hover:bg-primary/90"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
