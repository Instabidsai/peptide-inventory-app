import { useState, useEffect, useCallback } from 'react';
import { Sparkles, MessageSquare, X } from 'lucide-react';
import { AIChatInterface } from '@/components/ai/AIChatInterface';
import { ClientRequestModal } from '@/components/client/ClientRequestModal';

type WidgetState = 'closed' | 'menu' | 'ai-chat';

export function FloatingHelpWidget() {
    const [state, setState] = useState<WidgetState>('closed');
    const [modalOpen, setModalOpen] = useState(false);

    const close = useCallback(() => setState('closed'), []);

    // Escape key closes any open state
    useEffect(() => {
        if (state === 'closed') return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [state, close]);

    return (
        <>
            {/* FAB Button — offset above bottom nav + safe area */}
            {state === 'closed' && (
                <button
                    onClick={() => setState('menu')}
                    className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 h-14 w-14 rounded-full bg-gradient-premium text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                    aria-label="Get help"
                >
                    <Sparkles className="h-6 w-6" />
                </button>
            )}

            {/* Menu Popover */}
            {state === 'menu' && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
                        onClick={close}
                    />
                    {/* Menu card */}
                    <div className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom,0px))] right-4 z-50 w-64 rounded-2xl bg-card border border-border/60 shadow-overlay p-3 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
                        <div className="flex items-center justify-between px-1 pb-1">
                            <span className="text-sm font-semibold">How can we help?</span>
                            <button
                                onClick={close}
                                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                aria-label="Close menu"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Ask AI option */}
                        <button
                            onClick={() => setState('ai-chat')}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/[0.08] border border-primary/[0.15] hover:border-primary/[0.3] hover:bg-primary/[0.12] transition-all text-left group"
                        >
                            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                                <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Ask Peptide AI</p>
                                <p className="text-[11px] text-muted-foreground/60">Instant answers about peptides</p>
                            </div>
                        </button>

                        {/* Message Office option */}
                        <button
                            onClick={() => {
                                setModalOpen(true);
                                setState('closed');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-accent-secondary/[0.08] border border-accent-secondary/[0.15] hover:border-accent-secondary/[0.3] hover:bg-accent-secondary/[0.12] transition-all text-left group"
                        >
                            <div className="h-9 w-9 rounded-xl bg-accent-secondary/15 flex items-center justify-center shrink-0 group-hover:bg-accent-secondary/25 transition-colors">
                                <MessageSquare className="h-4 w-4 text-accent-secondary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Message the Office</p>
                                <p className="text-[11px] text-muted-foreground/60">Talk to our team directly</p>
                            </div>
                        </button>
                    </div>
                </>
            )}

            {/* AI Chat Panel */}
            {state === 'ai-chat' && (
                <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[420px] h-[100dvh] sm:h-[600px] sm:bottom-4 sm:right-4 sm:rounded-2xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-overlay flex flex-col overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                    {/* Close button overlay — 44px touch target */}
                    <button
                        onClick={close}
                        className="absolute top-2.5 right-2.5 z-10 h-9 w-9 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 active:scale-90 transition-all"
                        aria-label="Close AI chat"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Reuse the full AI chat interface */}
                    <div className="flex-1 overflow-hidden [&>div]:h-full [&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
                        <AIChatInterface />
                    </div>
                </div>
            )}

            {/* Office Message Modal */}
            <ClientRequestModal
                open={modalOpen}
                onOpenChange={setModalOpen}
            />
        </>
    );
}
