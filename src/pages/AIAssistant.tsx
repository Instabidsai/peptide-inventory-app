import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdminAI, type AdminMessage } from '@/hooks/use-admin-ai';
import { usePartnerAI, type PartnerMessage } from '@/hooks/use-partner-ai';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Bot, Send, Loader2, User, Trash2, Copy, Check, MessageCircle, Paperclip, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Message = AdminMessage | PartnerMessage;

// --- Quick action chips per role tier ---
const ADMIN_QUICK_ACTIONS = [
  'Check stock levels',
  'Low stock report',
  'Create a new order',
  'Financial summary',
  'Dashboard stats',
  'List recent orders',
  'Top sellers this month',
  'List all partners',
];

const STAFF_QUICK_ACTIONS = [
  'Check stock levels',
  'Low stock report',
  'Create a new order',
  'Dashboard stats',
  'List recent orders',
  'Top sellers this month',
  'Submit a suggestion',
  'Report an issue',
];

const SENIOR_PARTNER_QUICK_ACTIONS = [
  'Check stock levels',
  'My commissions',
  'My clients',
  'My orders',
  'Product catalog',
  'Submit a suggestion',
  'Report an issue',
];

const PARTNER_QUICK_ACTIONS = [
  'Check stock levels',
  'My commissions',
  'My orders',
  'Product catalog',
];

export default function AIAssistant() {
  const { profile, userRole } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Typewriter state
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typedLength, setTypedLength] = useState(0);
  const prevMessageCountRef = useRef(0);
  const wasLoadingRef = useRef(false);

  // File upload state
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [parsedFileContent, setParsedFileContent] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const role = userRole?.role || profile?.role;
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isStaff = role === 'staff';
  const isAdminOrStaff = isAdmin || isStaff;
  const isSeniorPartner = role === 'sales_rep' && !profile?.parent_rep_id;

  const adminAI = useAdminAI();
  const partnerAI = usePartnerAI();

  const ai = isAdminOrStaff ? adminAI : partnerAI;
  const { messages, sendMessage, clearChat, isLoading, isLoadingHistory } = ai;

  // Select quick actions by tier
  const quickActions = isAdmin
    ? ADMIN_QUICK_ACTIONS
    : isStaff
      ? STAFF_QUICK_ACTIONS
      : isSeniorPartner
        ? SENIOR_PARTNER_QUICK_ACTIONS
        : PARTNER_QUICK_ACTIONS;

  // Labels
  const assistantLabel = isAdmin
    ? 'Admin Assistant'
    : isStaff
      ? 'Operations Assistant'
      : 'Partner Assistant';

  const assistantSub = isAdmin
    ? 'Full access — orders, contacts, inventory'
    : isStaff
      ? 'Orders, inventory, reports + suggestions'
      : isSeniorPartner
        ? 'Stock, commissions, clients, suggestions'
        : 'Stock, commissions, orders';

  // Auto-scroll on new content
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [messages, isLoading, typedLength]);

  // Detect new AI messages and start typewriter
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.id !== 'welcome') {
        setTypingMessageId(lastMsg.id);
        setTypedLength(0);
      }
    }
    wasLoadingRef.current = isLoading;
    prevMessageCountRef.current = messages.length;
  }, [isLoading, messages]);

  // Typewriter character-by-character animation
  useEffect(() => {
    if (!typingMessageId) return;
    const msg = messages.find(m => m.id === typingMessageId);
    if (!msg) { setTypingMessageId(null); return; }

    if (typedLength >= msg.content.length) {
      setTypingMessageId(null);
      return;
    }

    const charsPerTick = msg.content.length > 300 ? 4 : msg.content.length > 150 ? 3 : 2;
    const timer = setTimeout(() => {
      setTypedLength(prev => Math.min(prev + charsPerTick, msg.content.length));
    }, 18);

    return () => clearTimeout(timer);
  }, [typingMessageId, typedLength, messages]);

  // Auto-resize textarea to fit content (max ~4 lines)
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ACCEPTED_TYPES = '.csv,.xlsx,.xls,.docx,.txt';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB.' });
      return;
    }

    setAttachedFile(file);
    setIsParsingFile(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text();
        setParsedFileContent(text);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheets = workbook.SheetNames.map((name) => {
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
          return `--- Sheet: ${name} ---\n${csv}`;
        });
        setParsedFileContent(sheets.join('\n\n'));
      } else if (ext === 'docx') {
        const mammoth = await import('mammoth');
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        setParsedFileContent(result.value);
      } else {
        toast({ variant: 'destructive', title: 'Unsupported file type', description: `File type .${ext} is not supported.` });
        setAttachedFile(null);
        setParsedFileContent(null);
      }
    } catch (err) {
      console.error('File parse error:', err);
      toast({ variant: 'destructive', title: 'Failed to parse file', description: (err as Error).message });
      setAttachedFile(null);
      setParsedFileContent(null);
    } finally {
      setIsParsingFile(false);
    }
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    setParsedFileContent(null);
  };

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input, parsedFileContent ?? undefined, attachedFile?.name);
    setInput('');
    setAttachedFile(null);
    setParsedFileContent(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    if (isLoading) return;
    sendMessage(action);
    requestAnimationFrame(() => textareaRef.current?.focus());
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

  const skipTypewriter = () => {
    if (typingMessageId) {
      const msg = messages.find(m => m.id === typingMessageId);
      if (msg) setTypedLength(msg.content.length);
    }
  };

  // Typewriter helpers
  const getDisplayContent = (msg: Message) => {
    if (msg.id === typingMessageId) return msg.content.slice(0, typedLength);
    return msg.content;
  };
  const isTypewriting = (msg: Message) => msg.id === typingMessageId;

  return (
    <div className="flex h-[calc(100dvh-5rem-2rem)] md:h-[calc(100dvh-5rem-3rem)] lg:h-[calc(100dvh-5rem-4rem)] gap-4">
      {/* Left sidebar — quick actions */}
      <div className="hidden lg:flex flex-col w-56 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-sm">{assistantLabel}</h2>
            <p className="text-[10px] text-muted-foreground">{assistantSub}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1">
            Quick Actions
          </p>
          {quickActions.map((action) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {action}
            </button>
          ))}
        </div>

        <div className="mt-auto pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Clear conversation
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all messages. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearChat}>Clear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col bg-card/95 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-[0_0_30px_hsl(var(--primary)/0.06)] overflow-hidden min-w-0">
        {/* Terminal-style header */}
        <div className="px-4 py-2.5 border-b border-border/40 bg-background/60 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-muted-foreground ml-1 font-mono">{assistantLabel}</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[10px] text-primary font-mono">LIVE</span>
            </div>
            {/* Mobile clear button */}
            <div className="lg:hidden">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground" aria-label="Clear chat history">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all messages.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearChat}>Clear</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 md:px-6 py-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {/* Animated starter section when no messages */}
              {messages.length === 0 && !isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-8 space-y-5"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center"
                  >
                    <MessageCircle className="h-7 w-7 text-primary" />
                  </motion.div>
                  <div className="text-center space-y-1">
                    <motion.p
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="font-semibold text-sm"
                    >
                      Hey! I'm your {assistantLabel.toLowerCase()}
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="text-xs text-muted-foreground"
                    >
                      {assistantSub}
                    </motion.p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-md">
                    {quickActions.slice(0, 4).map((q, i) => (
                      <motion.div
                        key={q}
                        initial={{ opacity: 0, scale: 0.9, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 400, damping: 25 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full text-xs h-8 px-3 border-border bg-muted/60 hover:bg-muted hover:border-primary/30 transition-colors"
                          onClick={() => handleQuickAction(q)}
                        >
                          {q}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              <AnimatePresence mode="popLayout">
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    className={cn(
                      "flex w-full gap-2.5 group/msg",
                      msg.role === 'user' ? "justify-end" : "justify-start",
                      msg.id.startsWith('opt-') && "opacity-70"
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/15">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}

                    <div
                      className={cn(
                        "p-3.5 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted/70 border border-border/60 rounded-tl-sm",
                        isTypewriting(msg) && "cursor-pointer"
                      )}
                      onClick={isTypewriting(msg) ? skipTypewriter : undefined}
                      title={isTypewriting(msg) ? "Click to skip animation" : undefined}
                    >
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-primary prose-code:text-primary/80 prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
                          <ReactMarkdown>{getDisplayContent(msg)}</ReactMarkdown>
                          {isTypewriting(msg) && (
                            <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                      {!isTypewriting(msg) && (
                        <div className={cn(
                          "flex items-center gap-2 mt-1.5",
                          msg.role === 'user' ? "justify-end" : "justify-between"
                        )}>
                          <span className={cn(
                            "text-[10px] opacity-50",
                            msg.role === 'user' ? "text-primary-foreground" : "text-muted-foreground"
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
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Enhanced thinking dots with scale animation */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="flex gap-2.5"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/15">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted/70 border border-border/60 p-3.5 rounded-2xl rounded-tl-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary/70"
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

        {/* Mobile quick actions */}
        <div className="lg:hidden px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
          {quickActions.slice(0, 4).map((action) => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
              className="shrink-0 px-3 py-1.5 text-xs rounded-full border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {action}
            </button>
          ))}
        </div>

        {/* Input — auto-expanding textarea */}
        <form onSubmit={handleSend} className="p-3 md:p-4 border-t border-border/40 bg-background/60 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
          {/* Attached file chip */}
          {attachedFile && (
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary">
                <Paperclip className="h-3 w-3" />
                {attachedFile.name}
                {isParsingFile && <Loader2 className="h-3 w-3 animate-spin" />}
                <button type="button" onClick={removeAttachedFile} className="ml-0.5 hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />
            {isAdminOrStaff && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isParsingFile}
                className="h-11 w-11 rounded-xl shrink-0 text-muted-foreground hover:text-primary"
                title="Attach a file (CSV, Excel, Word, TXT)"
              >
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Attach file</span>
              </Button>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isAdminOrStaff
                ? "Create orders, add contacts, check stock, run reports..."
                : "Ask about protocols, check stock, view commissions..."
              }
              rows={1}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none rounded-xl bg-muted/40 border border-border/60 text-sm placeholder:text-muted-foreground/60 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim() || isParsingFile}
              className="h-11 w-11 rounded-xl shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
