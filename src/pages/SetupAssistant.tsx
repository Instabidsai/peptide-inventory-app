import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { useOnboardingChat, type OnboardingMessage, type Attachment } from '@/hooks/use-onboarding-chat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Bot, Send, Loader2, User, ArrowRight, Sparkles, Paperclip, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = '.csv,.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls';

const QUICK_ACTIONS = [
  'Import my peptide catalog',
  'Set up payment methods',
  'Configure my branding',
  'Connect Stripe',
  'Set up the client portal',
  'Configure partner commissions',
];

const WELCOME_MESSAGE: OnboardingMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Welcome to ThePeptideAI! I'm your **Setup Assistant** — I'll help you get your business up and running.

Here's what we can set up together:
1. **Import your peptide catalog** — add products from a list or describe what you sell
2. **Set up payment methods** — Venmo, Zelle, or Stripe
3. **Configure your branding** — colors, logo, tagline
4. **Connect integrations** — email, calendar, Stripe
5. **Set up your client portal** — store, messaging, resources
6. **Configure partner commissions** — tiers and percentages

Where would you like to start? Or just tell me what you need!`,
  created_at: new Date().toISOString(),
};

export default function SetupAssistant() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { messages, sendMessage, uploadFile, isLoading, isLoadingHistory } = useOnboardingChat();
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => {
      if (f.size > MAX_FILE_SIZE) {
        toast({ variant: 'destructive', title: `${f.name} is too large`, description: 'Max file size is 10MB.' });
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...valid]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0) || isLoading || isUploading) return;

    let attachments: Attachment[] | undefined;
    if (pendingFiles.length > 0) {
      setIsUploading(true);
      try {
        attachments = await Promise.all(pendingFiles.map(f => uploadFile(f)));
      } catch (err) {
        toast({ variant: 'destructive', title: 'Upload failed', description: (err as Error).message });
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    const text = input.trim() || `Uploaded ${pendingFiles.map(f => f.name).join(', ')}`;
    sendMessage(text, attachments);
    setInput('');
    setPendingFiles([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleQuickAction = (action: string) => {
    if (isLoading) return;
    sendMessage(action);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-sm">Setup Assistant</h1>
              <p className="text-[10px] text-muted-foreground">
                {profile?.full_name ? `Setting up for ${profile.full_name}` : 'Configure your business'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/', { replace: true })}
            className="text-muted-foreground"
          >
            Skip for now <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <ScrollArea className="flex-1 px-4 py-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full gap-3",
                    msg.role === 'user' ? "justify-end" : "justify-start",
                    msg.id.startsWith('opt-') && "opacity-70"
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "p-3.5 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                      msg.role === 'user'
                        ? "bg-primary text-white rounded-tr-sm"
                        : "bg-white text-gray-900 border border-gray-200 rounded-tl-sm shadow-sm"
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-gray-900 prose-p:text-gray-900 prose-li:text-gray-900 prose-strong:text-gray-900">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    )}
                    <div className={cn(
                      "text-[10px] mt-1.5 opacity-50",
                      msg.role === 'user' ? "text-white" : "text-gray-500"
                    )}>
                      {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-white border border-gray-200 shadow-sm p-3.5 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:150ms]" />
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:300ms]" />
                    </div>
                    <span className="text-muted-foreground/50 text-xs">Setting things up...</span>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </ScrollArea>

        {/* Quick action chips */}
        {messages.length === 0 && !isLoading && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 justify-center">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                onClick={() => handleQuickAction(action)}
                className="px-3 py-1.5 text-xs rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border/50 bg-card/80 backdrop-blur-sm shrink-0">
          {pendingFiles.length > 0 && (
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
              {pendingFiles.map((file, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1">
                  <Paperclip className="h-3 w-3" />
                  {file.name}
                  <button type="button" onClick={() => removePendingFile(i)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={handleSend} className="p-4 flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isLoading || isUploading}
              className="h-11 w-11 rounded-xl shrink-0"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
              <span className="sr-only">Attach file</span>
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me what you'd like to set up..."
              className="flex-1 h-11 rounded-xl text-sm"
              disabled={isLoading || isUploading}
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || isUploading || (!input.trim() && pendingFiles.length === 0)}
              className="h-11 w-11 rounded-xl shrink-0"
            >
              {isLoading || isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
