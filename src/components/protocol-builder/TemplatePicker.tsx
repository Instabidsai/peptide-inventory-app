import { PROTOCOL_TEMPLATES, type ProtocolTemplate } from '@/data/protocol-knowledge';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ElementType> = {
    Heart, TrendingUp, Flame, Brain, Moon, Sparkles, LayoutGrid,
};

const CATEGORY_COLORS: Record<string, string> = {
    healing: 'border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-500/5',
    gh_stack: 'border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/5',
    weight_loss: 'border-orange-500/30 hover:border-orange-500/60 hover:bg-orange-500/5',
    cognitive: 'border-violet-500/30 hover:border-violet-500/60 hover:bg-violet-500/5',
    sleep: 'border-indigo-500/30 hover:border-indigo-500/60 hover:bg-indigo-500/5',
    anti_aging: 'border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5',
    full: 'border-primary/30 hover:border-primary/60 hover:bg-primary/5',
};

const ICON_COLORS: Record<string, string> = {
    healing: 'text-rose-500',
    gh_stack: 'text-emerald-500',
    weight_loss: 'text-orange-500',
    cognitive: 'text-violet-500',
    sleep: 'text-indigo-500',
    anti_aging: 'text-amber-500',
    full: 'text-primary',
};

interface TemplatePickerProps {
    onSelect: (templateName: string) => void;
    activeItemCount: number;
}

export function TemplatePicker({ onSelect, activeItemCount }: TemplatePickerProps) {
    return (
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-3 pb-2">
                {PROTOCOL_TEMPLATES.map((template) => {
                    const IconComponent = ICON_MAP[template.icon] || Sparkles;
                    const colorClass = CATEGORY_COLORS[template.category] || '';
                    const iconColor = ICON_COLORS[template.category] || 'text-muted-foreground';

                    return (
                        <button
                            key={template.name}
                            onClick={() => onSelect(template.name)}
                            className={cn(
                                'flex-shrink-0 flex flex-col items-start gap-1.5 p-3 rounded-xl border bg-card/50 transition-all duration-200 text-left min-w-[160px] max-w-[200px] hover:shadow-md hover:scale-[1.02]',
                                colorClass,
                            )}
                        >
                            <div className="flex items-center gap-2 w-full">
                                <IconComponent className={cn('h-4 w-4 flex-shrink-0', iconColor)} />
                                <span className="text-sm font-semibold truncate">{template.name}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground whitespace-normal leading-tight line-clamp-2">
                                {template.description}
                            </p>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {template.peptideNames.length} peptide{template.peptideNames.length !== 1 ? 's' : ''}
                            </Badge>
                        </button>
                    );
                })}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    );
}
