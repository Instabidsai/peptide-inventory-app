import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useOnboardingChat, type OnboardingMessage, type Attachment } from '@/hooks/use-onboarding-chat';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Bot, Send, Loader2, User, Paperclip, X } from 'lucide-react';

const WELCOME_MESSAGE: OnboardingMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Welcome to ThePeptideAI! I'm your **Setup Assistant** — I'll build out your entire business platform.\n\nTo get you set up in under 2 minutes: **what's your website URL?** I'll pull your branding, every product, and prices automatically.",
  created_at: new Date().toISOString(),
};

export default function SetupAssistant() {
  const { profile, organization } = useAuth();
  const { messages, isLoading, isSending, sendMessage, uploadFile } = useOnboardingChat();
  const [input, setInput] = useState('');
  const [pendingFile, setPendingFile] = useState<{ file: File; name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;

    let attachments: Attachment[] | undefined;

    if (pendingFile) {
      const att = await uploadFile(pendingFile.file);
      if (att) attachments = [att];
      setPendingFile(null);
    }

    sendMessage(text, attachments);
    setInput('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile({ file, name: file.name });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-bold text-lg">Setup Assistant</h1>
          <p className="text-xs text-muted-foreground">
            {organization?.name || 'Setting up your business'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 pr-2">
        <div className="space-y-4 py-4">
          {displayMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const isThinking = msg.content === '...';

            return (
              <div
                key={msg.id}
                className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}
              >
                {!isUser && (
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    'rounded-2xl px-4 py-3 max-w-[80%] text-sm',
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border border-border/50',
                  )}
                >
                  {isThinking ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-muted-foreground">Thinking...</span>
                    </div>
                  ) : (
                    <ReactMarkdown
                      className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2"
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>

                {isUser && (
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Pending file chip */}
      {pendingFile && (
        <div className="flex items-center gap-2 px-2 py-1">
          <span className="text-xs bg-muted px-2 py-1 rounded-md flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {pendingFile.name}
            <button onClick={() => setPendingFile(null)} className="ml-1 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 pt-3 border-t">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.pdf,.jpg,.jpeg,.png,.webp,.xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={isSending}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={isSending}
          autoFocus
        />
        <Button type="submit" disabled={!input.trim() || isSending} className="shrink-0">
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
