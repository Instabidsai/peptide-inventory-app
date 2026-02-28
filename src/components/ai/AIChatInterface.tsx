
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useAI } from '@/hooks/use-ai';
import { useAIKnowledge } from '@/hooks/use-ai-knowledge';
import { PeptideAIKnowledgePanel } from './PeptideAIKnowledgePanel';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Send, Bot, User, Plus, Paperclip, Brain, MessageCircle, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const STARTER_QUESTIONS = [
    "What should I take today?",
    "Explain my current protocol",
    "How do I reconstitute a vial?",
    "What are my peptide interactions?",
];

export const AIChatInterface = () => {
    const { messages, sendMessage, isLoading, isLoadingHistory, startNewConversation } = useAI();
    const { uploadDocument, documents } = useAIKnowledge();
    const { toast } = useToast();
    const { profile } = useAuth();
    const firstName = profile?.full_name?.split(' ')[0] || '';
    const [input, setInput] = useState('');
    const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Typewriter state
    const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
    const [typedLength, setTypedLength] = useState(0);
    const prevMessageCountRef = useRef(0);
    const wasLoadingRef = useRef(false);

    // Copy-to-clipboard state
    const [copiedId, setCopiedId] = useState<string | null>(null);

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

        // Adaptive speed: type faster for longer messages
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

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 10MB.' });
            return;
        }

        toast({ title: 'Uploading...', description: file.name });
        uploadDocument.mutate(file, {
            onSuccess: () => {
                toast({ title: 'Document uploaded', description: `${file.name} is being processed by Peptide AI.` });
            },
            onError: (err: Error) => {
                toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
            },
        });

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
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

    // Count docs being processed
    const processingCount = documents.filter((d) => d.status === 'pending' || d.status === 'processing').length;

    // Typewriter helpers
    const getDisplayContent = (msg: (typeof messages)[0]) => {
        if (msg.id === typingMessageId) return msg.content.slice(0, typedLength);
        return msg.content;
    };
    const isTypewriting = (msg: (typeof messages)[0]) => msg.id === typingMessageId;

    return (
        <>
            <div className="flex flex-col h-[min(600px,calc(100dvh-10rem))] w-full max-w-4xl mx-auto rounded-xl bg-card/95 backdrop-blur-xl border border-primary/20 shadow-[0_0_30px_hsl(var(--primary)/0.08)] overflow-hidden">
                {/* Terminal-style header matching landing page */}
                <div className="px-4 py-2.5 border-b border-border/40 bg-background/60 flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-xs text-muted-foreground ml-1 font-mono">Peptide AI</span>
                    <div className="ml-auto flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                            </span>
                            <span className="text-[10px] text-primary font-mono">LIVE</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Open knowledge panel"
                            onClick={() => setKnowledgePanelOpen(true)}
                            className="h-7 w-7 rounded-lg text-muted-foreground/60 hover:text-foreground relative"
                        >
                            <Brain className="h-3.5 w-3.5" />
                            {processingCount > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 flex items-center justify-center">
                                    <span className="text-[7px] font-bold text-white">{processingCount}</span>
                                </div>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={startNewConversation}
                            className="h-7 px-2 rounded-lg text-[10px] text-muted-foreground/60 hover:text-foreground"
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            New
                        </Button>
                    </div>
                </div>

                {/* Messages Area */}
                <ScrollArea className="flex-1 px-4 py-3">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Starter questions with staggered spring entrance */}
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
                                            How can I help{firstName ? `, ${firstName}` : ''}?
                                        </motion.p>
                                        <motion.p
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.25 }}
                                            className="text-xs text-muted-foreground"
                                        >
                                            Ask me anything about your peptides and protocols
                                        </motion.p>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                                        {STARTER_QUESTIONS.map((q, i) => (
                                            <motion.div
                                                key={q}
                                                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                                transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 400, damping: 25 }}
                                            >
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="rounded-full text-xs h-8 px-3 border-border bg-muted/60 hover:bg-muted hover:border-primary/40 transition-colors"
                                                    onClick={() => { sendMessage(q); }}
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
                                            msg.isOptimistic && msg.role === 'user' && "opacity-70"
                                        )}
                                    >
                                        {msg.role === 'assistant' && (
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/20 text-primary">
                                                <Bot className="w-3.5 h-3.5" />
                                            </div>
                                        )}

                                        <div
                                            className={cn(
                                                "p-3 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                                                msg.role === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                    : "bg-muted/70 border border-border/60 rounded-tl-sm",
                                                isTypewriting(msg) && "cursor-pointer"
                                            )}
                                            onClick={isTypewriting(msg) ? skipTypewriter : undefined}
                                            title={isTypewriting(msg) ? "Click to skip animation" : undefined}
                                        >
                                            {msg.role === 'assistant' ? (
                                                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-foreground prose-code:text-foreground/80 prose-code:bg-foreground/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg">
                                                    <ReactMarkdown>{getDisplayContent(msg)}</ReactMarkdown>
                                                    {isTypewriting(msg) && (
                                                        <span className="inline-block w-0.5 h-4 bg-foreground ml-0.5 animate-pulse align-middle" />
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
                                                        {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
                                                                <Copy className="h-3 w-3 text-muted-foreground/70" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {msg.role === 'user' && (
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-muted text-foreground">
                                                <User className="w-3.5 h-3.5" />
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
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-primary/20 text-primary">
                                        <Bot className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="bg-muted/70 border border-border/60 p-3 rounded-2xl rounded-tl-sm flex items-center gap-2">
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
                                        <span className="text-muted-foreground text-xs">Researching...</span>
                                    </div>
                                </motion.div>
                            )}
                            <div ref={scrollRef} />
                        </div>
                    )}
                </ScrollArea>

                {/* Input Area — auto-expanding textarea with Enter-to-send */}
                <form onSubmit={handleSend} className="p-3 border-t border-border/40 bg-background/60 flex items-end gap-2 shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Upload document"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadDocument.isPending}
                        className="h-10 w-10 rounded-xl text-muted-foreground/60 hover:text-foreground shrink-0"
                    >
                        {uploadDocument.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Paperclip className="h-4 w-4" />
                        )}
                    </Button>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about protocols, symptoms, bloodwork..."
                        rows={1}
                        className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl bg-muted/40 border border-border/60 text-sm placeholder:text-muted-foreground/60 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isLoading}
                    />
                    <TooltipProvider delayDuration={400}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={isLoading || !input.trim()}
                                    className="h-10 w-10 rounded-xl shrink-0"
                                >
                                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    <span className="sr-only">Send</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                <p>Send <kbd className="ml-1 inline-flex h-4 items-center rounded border border-border/50 px-1 font-mono text-[10px]">↵</kbd></p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </form>
            </div>

            {/* Knowledge Panel */}
            <PeptideAIKnowledgePanel
                open={knowledgePanelOpen}
                onClose={() => setKnowledgePanelOpen(false)}
            />
        </>
    );
};
