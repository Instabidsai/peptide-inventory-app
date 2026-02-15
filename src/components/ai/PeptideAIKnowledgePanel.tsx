
import { useAIKnowledge } from '@/hooks/use-ai-knowledge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
    X, FileText, Image, Loader2, CheckCircle2, AlertCircle,
    Brain, Beaker, Pill, Activity, Zap, BookOpen, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useState } from 'react';

interface PeptideAIKnowledgePanelProps {
    open: boolean;
    onClose: () => void;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Brain; label: string; color: string }> = {
    research: { icon: Beaker, label: 'Research', color: 'text-blue-400' },
    protocol_note: { icon: Pill, label: 'Protocol Notes', color: 'text-emerald-400' },
    lab_interpretation: { icon: Activity, label: 'Lab Interpretations', color: 'text-amber-400' },
    side_effect: { icon: AlertCircle, label: 'Side Effects', color: 'text-orange-400' },
    interaction: { icon: Zap, label: 'Interactions', color: 'text-red-400' },
    recommendation: { icon: BookOpen, label: 'Recommendations', color: 'text-purple-400' },
};

const FILE_ICONS: Record<string, typeof FileText> = {
    pdf: FileText,
    jpg: Image,
    jpeg: Image,
    png: Image,
    webp: Image,
};

export function PeptideAIKnowledgePanel({ open, onClose }: PeptideAIKnowledgePanelProps) {
    const { documents, insights, healthProfile, isLoading } = useAIKnowledge();
    const [expandedSection, setExpandedSection] = useState<string | null>('documents');

    if (!open) return null;

    // Group insights by category
    const groupedInsights: Record<string, typeof insights> = {};
    for (const insight of insights) {
        if (!groupedInsights[insight.category]) groupedInsights[insight.category] = [];
        groupedInsights[insight.category].push(insight);
    }

    const toggleSection = (section: string) => {
        setExpandedSection(prev => prev === section ? null : section);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-sm bg-background/95 backdrop-blur-md border-l border-white/[0.06] shadow-2xl animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-emerald-400" />
                        <h2 className="font-semibold text-sm">AI Knowledge</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 rounded-lg">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <ScrollArea className="h-[calc(100vh-52px)]">
                    <div className="p-4 space-y-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                            </div>
                        ) : (
                            <>
                                {/* Documents Section */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('documents')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                            Documents ({documents.length})
                                        </h3>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSection === 'documents' && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSection === 'documents' && (
                                        <div className="space-y-2 mt-1">
                                            {documents.length === 0 ? (
                                                <p className="text-xs text-muted-foreground/40 py-2">
                                                    No documents uploaded yet. Use the paperclip in chat to upload lab results, bloodwork, or health records.
                                                </p>
                                            ) : (
                                                documents.map((doc: any) => {
                                                    const ext = doc.file_name.split('.').pop()?.toLowerCase() || '';
                                                    const Icon = FILE_ICONS[ext] || FileText;
                                                    return (
                                                        <div
                                                            key={doc.id}
                                                            className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                                                        >
                                                            <div className="h-8 w-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                                                                <Icon className="h-4 w-4 text-muted-foreground/60" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                                                                {doc.summary && (
                                                                    <p className="text-xs text-muted-foreground/50 mt-0.5 line-clamp-2">{doc.summary}</p>
                                                                )}
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    {doc.status === 'completed' ? (
                                                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                                    ) : doc.status === 'failed' ? (
                                                                        <AlertCircle className="h-3 w-3 text-red-400" />
                                                                    ) : (
                                                                        <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                                                    )}
                                                                    <span className="text-[10px] text-muted-foreground/40">
                                                                        {doc.status === 'completed' ? 'Processed' : doc.status === 'failed' ? 'Failed' : 'Processing...'}
                                                                        {' · '}
                                                                        {format(new Date(doc.created_at), 'MMM d')}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </section>

                                {/* Learned Insights Section */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('insights')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                            Learned Insights ({insights.length})
                                        </h3>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSection === 'insights' && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSection === 'insights' && (
                                        <div className="space-y-3 mt-1">
                                            {Object.keys(groupedInsights).length === 0 ? (
                                                <p className="text-xs text-muted-foreground/40 py-2">
                                                    No insights yet. As you chat with Peptide AI, it will automatically save research findings and observations here.
                                                </p>
                                            ) : (
                                                Object.entries(groupedInsights).map(([category, items]) => {
                                                    const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.research;
                                                    const CategoryIcon = config.icon;
                                                    return (
                                                        <div key={category}>
                                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                                <CategoryIcon className={cn("h-3 w-3", config.color)} />
                                                                <span className="text-[11px] font-semibold text-muted-foreground/70">
                                                                    {config.label}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1.5 pl-4">
                                                                {items.map((insight: any) => (
                                                                    <div
                                                                        key={insight.id}
                                                                        className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.03]"
                                                                    >
                                                                        <p className="text-xs font-medium">{insight.title}</p>
                                                                        <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-2">
                                                                            {insight.content}
                                                                        </p>
                                                                        <span className="text-[9px] text-muted-foreground/30 mt-1 block">
                                                                            {insight.source} · {format(new Date(insight.created_at), 'MMM d')}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </section>

                                {/* Health Profile Section */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('profile')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                            Health Profile
                                        </h3>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSection === 'profile' && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSection === 'profile' && (
                                        <div className="space-y-2.5 mt-1">
                                            {!healthProfile ? (
                                                <p className="text-xs text-muted-foreground/40 py-2">
                                                    No health profile yet. Tell Peptide AI about your conditions, goals, medications, and it will build your profile automatically.
                                                </p>
                                            ) : (
                                                <>
                                                    <ProfileField label="Conditions" items={healthProfile.conditions as string[]} />
                                                    <ProfileField label="Goals" items={healthProfile.goals as string[]} />
                                                    <ProfileField label="Medications" items={healthProfile.medications as string[]} />
                                                    <ProfileField label="Allergies" items={healthProfile.allergies as string[]} />
                                                    <ProfileField label="Supplements" items={healthProfile.supplements as string[]} />
                                                    {healthProfile.lab_values && Object.keys(healthProfile.lab_values as object).length > 0 && (
                                                        <div>
                                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Lab Values</span>
                                                            <div className="mt-1 space-y-0.5">
                                                                {Object.entries(healthProfile.lab_values as Record<string, string>).map(([k, v]) => (
                                                                    <div key={k} className="flex justify-between text-xs">
                                                                        <span className="text-muted-foreground/60">{k}</span>
                                                                        <span className="font-medium">{v}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {healthProfile.notes && (
                                                        <div>
                                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Notes</span>
                                                            <p className="text-xs text-muted-foreground/60 mt-0.5">{healthProfile.notes}</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}

function ProfileField({ label, items }: { label: string; items: string[] | null }) {
    if (!items?.length) return null;
    return (
        <div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">{label}</span>
            <div className="flex flex-wrap gap-1 mt-1">
                {items.map((item, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-foreground/80">
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}
