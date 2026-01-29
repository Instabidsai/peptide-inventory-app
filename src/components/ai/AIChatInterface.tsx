
import React, { useState, useRef, useEffect } from 'react';
import { useAI } from '@/hooks/use-ai';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Loader2, Send, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export const AIChatInterface = () => {
    const { messages, sendMessage, isLoading } = useAI();
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleSend = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-4xl mx-auto border rounded-xl bg-background shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <h3 className="font-semibold text-sm">Health Intelligence</h3>
                    <p className="text-xs text-muted-foreground">Powered by PeptideAI & Dr. Bochman</p>
                </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex w-full gap-2 px-2",
                                msg.role === 'user' ? "justify-end" : "justify-start"
                            )}
                        >
                            {msg.role === 'assistant' && (
                                <Avatar className="h-8 w-8 mt-1 border">
                                    <AvatarImage src="/ai-avatar.png" />
                                    <AvatarFallback className="bg-primary/10 text-primary"><Bot size={16} /></AvatarFallback>
                                </Avatar>
                            )}

                            <div
                                className={cn(
                                    "p-3 rounded-2xl max-w-[80%] text-sm",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-tr-none"
                                        : "bg-muted text-foreground rounded-tl-none"
                                )}
                            >
                                {msg.content}
                                <div className={cn("text-[10px] mt-1 opacity-70", msg.role === 'user' ? "text-primary-foreground" : "text-muted-foreground")}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>

                            {msg.role === 'user' && (
                                <Avatar className="h-8 w-8 mt-1 border">
                                    <AvatarFallback className="bg-muted text-muted-foreground"><User size={16} /></AvatarFallback>
                                </Avatar>
                            )}
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start gap-2 px-2">
                            <Avatar className="h-8 w-8 border">
                                <AvatarFallback className="bg-primary/10"><Bot size={16} /></AvatarFallback>
                            </Avatar>
                            <div className="bg-muted p-3 rounded-2xl rounded-tl-none text-sm flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="text-muted-foreground text-xs">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 border-t bg-background flex gap-2">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about your protocol, logs, or peptides..."
                    className="flex-1"
                    disabled={isLoading}
                />
                <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="sr-only">Send</span>
                </Button>
            </form>
        </div>
    );
};
