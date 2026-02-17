
import { useAIKnowledge } from '@/hooks/use-ai-knowledge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
    X, FileText, Image, Loader2, CheckCircle2, AlertCircle,
    Brain, Beaker, Pill, Activity, Zap, BookOpen, ChevronDown,
    Heart, Target, Shield, Syringe, FlaskConical, Stethoscope,
    TrendingUp, TrendingDown, Minus,
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

const PROFILE_SECTIONS: { key: string; label: string; icon: typeof Heart; color: string; emptyText: string }[] = [
    { key: 'conditions', label: 'Conditions', icon: Stethoscope, color: 'text-red-400', emptyText: 'No conditions recorded' },
    { key: 'goals', label: 'Goals', icon: Target, color: 'text-emerald-400', emptyText: 'No goals set' },
    { key: 'medications', label: 'Medications', icon: Pill, color: 'text-blue-400', emptyText: 'No medications' },
    { key: 'allergies', label: 'Allergies', icon: Shield, color: 'text-orange-400', emptyText: 'No allergies' },
    { key: 'supplements', label: 'Supplements', icon: FlaskConical, color: 'text-purple-400', emptyText: 'No supplements' },
];

const FILE_ICONS: Record<string, typeof FileText> = {
    pdf: FileText,
    jpg: Image,
    jpeg: Image,
    png: Image,
    webp: Image,
};

function getLabFlag(value: string): 'high' | 'low' | 'normal' {
    const lower = value.toLowerCase();
    if (lower.includes('(h)') || lower.includes('high') || lower.includes('(h,')) return 'high';
    if (lower.includes('(l)') || lower.includes('low') || lower.includes('(l,')) return 'low';
    return 'normal';
}

function formatLabKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function PeptideAIKnowledgePanel({ open, onClose }: PeptideAIKnowledgePanelProps) {
    const { documents, insights, healthProfile, isLoading } = useAIKnowledge();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['profile']));

    if (!open) return null;

    // Group insights by category
    const groupedInsights: Record<string, typeof insights> = {};
    for (const insight of insights) {
        if (!groupedInsights[insight.category]) groupedInsights[insight.category] = [];
        groupedInsights[insight.category].push(insight);
    }

    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const hasProfile = healthProfile && (
        (healthProfile.conditions as string[])?.length > 0 ||
        (healthProfile.goals as string[])?.length > 0 ||
        (healthProfile.medications as string[])?.length > 0 ||
        (healthProfile.allergies as string[])?.length > 0 ||
        (healthProfile.supplements as string[])?.length > 0 ||
        (healthProfile.lab_values && Object.keys(healthProfile.lab_values as object).length > 0) ||
        healthProfile.notes
    );

    const labEntries = healthProfile?.lab_values
        ? Object.entries(healthProfile.lab_values as Record<string, string>)
        : [];

    const profileFieldCount = PROFILE_SECTIONS.reduce((count, s) => {
        const items = healthProfile?.[s.key as keyof typeof healthProfile] as string[] | undefined;
        return count + (items?.length || 0);
    }, 0) + labEntries.length;

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
                        <div>
                            <h2 className="font-semibold text-sm">AI Knowledge Base</h2>
                            <p className="text-[10px] text-muted-foreground/50">
                                {profileFieldCount} data points · {insights.length} insights · {documents.length} docs
                            </p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Close knowledge panel" onClick={onClose} className="h-7 w-7 rounded-lg">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <ScrollArea className="h-[calc(100vh-52px)]">
                    <div className="p-4 space-y-3">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
                            </div>
                        ) : (
                            <>
                                {/* ── Health Profile (Always First, Prominent) ── */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('profile')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Heart className="h-3.5 w-3.5 text-rose-400" />
                                            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                                Health Profile
                                            </h3>
                                            {hasProfile && (
                                                <span className="text-[9px] font-medium text-emerald-400/70 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                                                    ACTIVE
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSections.has('profile') && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSections.has('profile') && (
                                        <div className="space-y-3 mt-1">
                                            {!hasProfile ? (
                                                <div className="text-center py-6">
                                                    <div className="h-10 w-10 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-2">
                                                        <Heart className="h-5 w-5 text-muted-foreground/30" />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground/40">
                                                        No health profile yet.
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground/30 mt-1">
                                                        Tell Peptide AI about your conditions, goals,<br />medications, and it will build your profile.
                                                    </p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Profile fields as cards */}
                                                    {PROFILE_SECTIONS.map(({ key, label, icon: Icon, color }) => {
                                                        const items = healthProfile?.[key as keyof typeof healthProfile] as string[] | undefined;
                                                        if (!items?.length) return null;
                                                        return (
                                                            <div key={key} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-2.5">
                                                                <div className="flex items-center gap-1.5 mb-2">
                                                                    <Icon className={cn("h-3 w-3", color)} />
                                                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {items.map((item) => (
                                                                        <span
                                                                            key={item}
                                                                            className={cn(
                                                                                "text-[11px] px-2 py-0.5 rounded-full border text-foreground/80",
                                                                                key === 'allergies'
                                                                                    ? "bg-orange-500/10 border-orange-500/20 text-orange-300"
                                                                                    : key === 'goals'
                                                                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                                                                        : "bg-white/[0.04] border-white/[0.06]"
                                                                            )}
                                                                        >
                                                                            {item}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Lab Values — styled like a real lab report */}
                                                    {labEntries.length > 0 && (
                                                        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-2.5">
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <Activity className="h-3 w-3 text-amber-400" />
                                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                                                                    Lab Values
                                                                </span>
                                                                <span className="text-[9px] text-muted-foreground/30 ml-auto">
                                                                    {labEntries.length} markers
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {labEntries.map(([key, value]) => {
                                                                    const flag = getLabFlag(value);
                                                                    return (
                                                                        <div
                                                                            key={key}
                                                                            className={cn(
                                                                                "flex items-center justify-between py-1 px-2 rounded-lg text-xs",
                                                                                flag === 'high' && "bg-red-500/[0.06]",
                                                                                flag === 'low' && "bg-amber-500/[0.06]",
                                                                            )}
                                                                        >
                                                                            <div className="flex items-center gap-1.5">
                                                                                {flag === 'high' ? (
                                                                                    <TrendingUp className="h-3 w-3 text-red-400" />
                                                                                ) : flag === 'low' ? (
                                                                                    <TrendingDown className="h-3 w-3 text-amber-400" />
                                                                                ) : (
                                                                                    <Minus className="h-3 w-3 text-muted-foreground/30" />
                                                                                )}
                                                                                <span className="text-muted-foreground/70">{formatLabKey(key)}</span>
                                                                            </div>
                                                                            <span className={cn(
                                                                                "font-medium tabular-nums",
                                                                                flag === 'high' && "text-red-400",
                                                                                flag === 'low' && "text-amber-400",
                                                                            )}>
                                                                                {value}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Notes */}
                                                    {healthProfile?.notes && (
                                                        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-2.5">
                                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Notes</span>
                                                            <p className="text-xs text-muted-foreground/60 mt-1 whitespace-pre-line">{healthProfile.notes}</p>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </section>

                                {/* ── Documents ── */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('documents')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-3.5 w-3.5 text-blue-400" />
                                            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                                Documents ({documents.length})
                                            </h3>
                                        </div>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSections.has('documents') && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSections.has('documents') && (
                                        <div className="space-y-2 mt-1">
                                            {documents.length === 0 ? (
                                                <p className="text-xs text-muted-foreground/40 py-2">
                                                    No documents uploaded yet. Use the paperclip in chat to upload lab results, bloodwork, or health records.
                                                </p>
                                            ) : (
                                                documents.map((doc) => {
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

                                {/* ── Learned Insights ── */}
                                <section>
                                    <button
                                        onClick={() => toggleSection('insights')}
                                        className="flex items-center justify-between w-full py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Syringe className="h-3.5 w-3.5 text-emerald-400" />
                                            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                                                Learned Insights ({insights.length})
                                            </h3>
                                        </div>
                                        <ChevronDown className={cn(
                                            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform",
                                            expandedSections.has('insights') && "rotate-180"
                                        )} />
                                    </button>
                                    {expandedSections.has('insights') && (
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
                                                                <span className="text-[9px] text-muted-foreground/30 ml-auto">
                                                                    {items.length}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1.5 pl-4">
                                                                {items.map((insight) => (
                                                                    <div
                                                                        key={insight.id}
                                                                        className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.03]"
                                                                    >
                                                                        <p className="text-xs font-medium">{insight.title}</p>
                                                                        <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-2">
                                                                            {insight.content}
                                                                        </p>
                                                                        <span className="text-[9px] text-muted-foreground/30 mt-1 block">
                                                                            {insight.source === 'document' ? 'From document' : 'From conversation'}
                                                                            {' · '}
                                                                            {format(new Date(insight.created_at), 'MMM d')}
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
                            </>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
