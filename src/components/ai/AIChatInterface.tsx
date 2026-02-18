
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAI } from '@/hooks/use-ai';
import { useAIKnowledge } from '@/hooks/use-ai-knowledge';
import { PeptideAIKnowledgePanel } from './PeptideAIKnowledgePanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Bot, User, Sparkles, Plus, Paperclip, Brain, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';

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
    const [input, setInput] = useState('');
    const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    }, [messages, isLoading]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
        requestAnimationFrame(() => inputRef.current?.focus());
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

    // Count docs being processed
    const processingCount = documents.filter((d) => d.status === 'pending' || d.status === 'processing').length;

    return (
        <>
            <div className="flex flex-col h-[600px] w-full max-w-4xl mx-auto rounded-2xl bg-background/80 backdrop-blur-md border border-white/[0.06] shadow-xl overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm">Peptide AI</h3>
                            <p className="text-[10px] text-muted-foreground/60">Protocol Consultant</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Open knowledge panel"
                            onClick={() => setKnowledgePanelOpen(true)}
                            className="h-8 w-8 rounded-xl text-muted-foreground/60 hover:text-foreground relative"
                        >
                            <Brain className="h-4 w-4" />
                            {processingCount > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center">
                                    <span className="text-[8px] font-bold text-white">{processingCount}</span>
                                </div>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={startNewConversation}
                            className="h-8 px-2.5 rounded-xl text-xs text-muted-foreground/60 hover:text-foreground"
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            New
                        </Button>
                    </div>
                </div>

                {/* Messages Area */}
                <ScrollArea className="flex-1 px-4 py-3">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Starter questions when conversation is empty */}
                            {messages.length === 0 && !isLoading && (
                                <div className="flex flex-col items-center justify-center py-8 space-y-5">
                                    <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                        <MessageCircle className="h-7 w-7 text-emerald-400" />
                                    </div>
                                    <div className="text-center space-y-1">
                                        <p className="font-semibold text-sm">How can I help?</p>
                                        <p className="text-xs text-muted-foreground/60">Ask me anything about your peptides and protocols</p>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                                        {STARTER_QUESTIONS.map((q) => (
                                            <Button
                                                key={q}
                                                variant="outline"
                                                size="sm"
                                                className="rounded-full text-xs h-8 px-3 border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]"
                                                onClick={() => { sendMessage(q); }}
                                            >
                                                {q}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={cn(
                                        "flex w-full gap-2",
                                        msg.role === 'user' ? "justify-end" : "justify-start",
                                        msg.isOptimistic && msg.role === 'user' && "opacity-70"
                                    )}
                                >
                                    {msg.role === 'assistant' && (
                                        <Avatar className="h-7 w-7 mt-1 shrink-0 border border-white/[0.06]">
                                            <AvatarImage src="/ai-avatar.png" />
                                            <AvatarFallback className="bg-emerald-500/10 text-emerald-400"><Bot size={14} /></AvatarFallback>
                                        </Avatar>
                                    )}

                                    <div
                                        className={cn(
                                            "p-3 rounded-2xl max-w-[80%] text-sm leading-relaxed",
                                            msg.role === 'user'
                                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                                : "bg-white/[0.04] border border-white/[0.06] text-foreground rounded-tl-sm"
                                        )}
                                    >
                                        {msg.role === 'assistant' ? (
                                            <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-strong:text-emerald-300">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className="whitespace-pre-wrap">{msg.content}</div>
                                        )}
                                        <div className={cn(
                                            "text-[10px] mt-1.5 opacity-50",
                                            msg.role === 'user' ? "text-primary-foreground" : "text-muted-foreground"
                                        )}>
                                            {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>

                                    {msg.role === 'user' && (
                                        <Avatar className="h-7 w-7 mt-1 shrink-0 border border-white/[0.06]">
                                            <AvatarFallback className="bg-white/[0.04] text-muted-foreground"><User size={14} /></AvatarFallback>
                                        </Avatar>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start gap-2">
                                    <Avatar className="h-7 w-7 border border-white/[0.06]">
                                        <AvatarFallback className="bg-emerald-500/10 text-emerald-400"><Bot size={14} /></AvatarFallback>
                                    </Avatar>
                                    <div className="bg-white/[0.04] border border-white/[0.06] p-3 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse [animation-delay:150ms]" />
                                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400/60 animate-pulse [animation-delay:300ms]" />
                                        </div>
                                        <span className="text-muted-foreground/50 text-xs">Researching...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={scrollRef} />
                        </div>
                    )}
                </ScrollArea>

                {/* Input Area */}
                <form onSubmit={handleSend} className="p-3 border-t border-white/[0.06] bg-white/[0.02] flex gap-2">
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
                        className="h-10 w-10 rounded-xl text-muted-foreground/40 hover:text-foreground shrink-0"
                    >
                        {uploadDocument.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Paperclip className="h-4 w-4" />
                        )}
                    </Button>
                    <Input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about protocols, symptoms, bloodwork..."
                        className="flex-1 h-10 rounded-xl bg-white/[0.04] border-white/[0.06] text-sm placeholder:text-muted-foreground/40"
                        disabled={isLoading}
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

            {/* Knowledge Panel */}
            <PeptideAIKnowledgePanel
                open={knowledgePanelOpen}
                onClose={() => setKnowledgePanelOpen(false)}
            />
        </>
    );
};
