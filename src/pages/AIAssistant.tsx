import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAdminAI, type AdminMessage } from '@/hooks/use-admin-ai';
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
import { Bot, Send, Loader2, User, Trash2 } from 'lucide-react';

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

// --- Welcome messages per role tier ---
const ADMIN_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your admin assistant. I can create contacts, build orders, check inventory & pricing, manage commissions, track finances, and more.\n\nTry a quick action from the sidebar, or just tell me what you need.",
  created_at: new Date().toISOString(),
};

const STAFF_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your operations assistant. I have full access to orders, contacts, inventory, and reporting.\n\nI can also **submit suggestions** and **report issues** directly to the admin — they'll show up in the Automations queue for review.\n\nTry a quick action or just tell me what you need.",
  created_at: new Date().toISOString(),
};

const SENIOR_PARTNER_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your partner assistant. As a senior partner, I can help you with:\n\n- **Product info** — peptides, protocols, dosing\n- **Your commissions** — check earnings and status\n- **Your clients** — view and manage your contacts\n- **Stock levels** — what's available to sell\n- **Suggestions** — submit feature ideas or report issues to admin\n\nTry a quick action or ask me anything.",
  created_at: new Date().toISOString(),
};

const PARTNER_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your partner assistant. I can help you with:\n\n- **Product info** — peptides, protocols, dosing\n- **Your commissions** — check earnings and status\n- **Stock levels** — what's available to sell\n- **Your orders** — view order history\n\nAsk me anything!",
  created_at: new Date().toISOString(),
};

export default function AIAssistant() {
  const { profile, userRole } = useAuth();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = userRole?.role || profile?.role;
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isAdminOrStaff = isAdmin || isStaff;
  const isSeniorPartner = role === 'sales_rep' && !profile?.parent_rep_id;

  const adminAI = useAdminAI();
  const partnerAI = usePartnerAI();

  const ai = isAdminOrStaff ? adminAI : partnerAI;
  const { messages, sendMessage, clearChat, isLoading, isLoadingHistory } = ai;

  // Select quick actions + welcome by tier
  const quickActions = isAdmin
    ? ADMIN_QUICK_ACTIONS
    : isStaff
      ? STAFF_QUICK_ACTIONS
      : isSeniorPartner
        ? SENIOR_PARTNER_QUICK_ACTIONS
        : PARTNER_QUICK_ACTIONS;

  const welcomeMessage = isAdmin
    ? ADMIN_WELCOME
    : isStaff
      ? STAFF_WELCOME
      : isSeniorPartner
        ? SENIOR_PARTNER_WELCOME
        : PARTNER_WELCOME;

  const displayMessages = messages.length > 0 ? messages : [welcomeMessage];

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

  // Accent colors: admin/staff = purple, partner = green
  const accentBg = isAdminOrStaff ? 'bg-primary' : 'bg-emerald-600';
  const accentBgLight = isAdminOrStaff ? 'bg-primary/10' : 'bg-emerald-600/10';
  const accentText = isAdminOrStaff ? 'text-primary' : 'text-emerald-500';
  const accentHover = isAdminOrStaff ? 'hover:bg-primary/80' : 'hover:bg-emerald-700';

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
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleQuickAction = (action: string) => {
    if (isLoading) return;
    sendMessage(action);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4">
      {/* Left sidebar — quick actions */}
      <div className="hidden lg:flex flex-col w-56 shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center", accentBgLight)}>
            <Bot className={cn("h-4 w-4", accentText)} />
          </div>
          <div>
            <h2 className="font-bold text-sm">
              {assistantLabel}
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {assistantSub}
            </p>
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
              className="w-full text-left px-3 py-2 text-sm rounded-lg border border-border/50 bg-card hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="flex-1 flex flex-col bg-card border border-border/60 rounded-2xl overflow-hidden min-w-0">
        {/* Mobile header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 lg:hidden">
          <div className="flex items-center gap-2">
            <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", accentBgLight)}>
              <Bot className={cn("h-3.5 w-3.5", accentText)} />
            </div>
            <span className="font-bold text-sm">
              {assistantLabel}
            </span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Clear chat history">
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

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 md:px-6 py-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
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
                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-1", accentBgLight)}>
                      <Bot className={cn("h-4 w-4", accentText)} />
                    </div>
                  )}
                  <div
                    className={cn(
                      "p-3.5 rounded-2xl max-w-[85%] text-sm leading-relaxed",
                      msg.role === 'user'
                        ? cn(accentBg, "text-white rounded-tr-sm", accentHover)
                        : "bg-muted/50 border border-border/50 text-foreground rounded-tl-sm"
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
                      "text-[10px] mt-1.5 opacity-50",
                      msg.role === 'user' ? "text-white" : "text-muted-foreground"
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
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", accentBgLight)}>
                    <Bot className={cn("h-4 w-4", accentText)} />
                  </div>
                  <div className="bg-muted/50 border border-border/50 p-3.5 rounded-2xl rounded-tl-sm text-sm flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", isAdminOrStaff ? "bg-primary/60" : "bg-emerald-500/60")} />
                      <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse [animation-delay:150ms]", isAdminOrStaff ? "bg-primary/60" : "bg-emerald-500/60")} />
                      <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse [animation-delay:300ms]", isAdminOrStaff ? "bg-primary/60" : "bg-emerald-500/60")} />
                    </div>
                    <span className="text-muted-foreground/50 text-xs">Working on it...</span>
                  </div>
                </div>
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
              className="shrink-0 px-3 py-1.5 text-xs rounded-full border border-border/50 bg-card hover:bg-muted/50 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {action}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-3 md:p-4 border-t border-border/50 bg-card flex gap-2 shrink-0">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isAdminOrStaff
              ? "Create orders, add contacts, check stock, run reports..."
              : "Ask about protocols, check stock, view commissions..."
            }
            className="flex-1 h-11 rounded-xl text-sm"
            disabled={isLoading}
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className={cn("h-11 w-11 rounded-xl shrink-0", accentBg, accentHover)}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
