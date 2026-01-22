import { Button } from "@/components/ui/button";
import { Video, FileText, BookOpen, Download, LayoutGrid } from "lucide-react";

type ResourceType = 'all' | 'video' | 'article' | 'pdf' | 'guide';

interface TypeFiltersProps {
    selectedType: ResourceType;
    onTypeChange: (type: ResourceType) => void;
    counts?: Record<ResourceType, number>;
}

const typeConfig: { type: ResourceType; label: string; icon: React.ReactNode }[] = [
    { type: 'all', label: 'All', icon: <LayoutGrid className="h-4 w-4" /> },
    { type: 'video', label: 'Videos', icon: <Video className="h-4 w-4" /> },
    { type: 'article', label: 'Articles', icon: <FileText className="h-4 w-4" /> },
    { type: 'pdf', label: 'PDFs', icon: <Download className="h-4 w-4" /> },
    { type: 'guide', label: 'Guides', icon: <BookOpen className="h-4 w-4" /> },
];

export function TypeFilters({ selectedType, onTypeChange, counts }: TypeFiltersProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {typeConfig.map(({ type, label, icon }) => {
                const isSelected = type === selectedType;
                const count = counts?.[type];

                return (
                    <Button
                        key={type}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => onTypeChange(type)}
                        className={`gap-2 ${isSelected ? '' : 'bg-card/50 border-border/50 hover:bg-card'}`}
                    >
                        {icon}
                        {label}
                        {count !== undefined && (
                            <span className={`text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                ({count})
                            </span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
}

export type { ResourceType };
