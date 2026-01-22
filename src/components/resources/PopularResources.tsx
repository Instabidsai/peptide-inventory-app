import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ResourceCard } from "./ResourceCard";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Resource {
    id: string;
    title: string;
    description: string | null;
    type: string;
    thumbnail_url?: string | null;
    view_count?: number;
    duration_seconds?: number | null;
}

interface PopularResourcesProps {
    resources: Resource[];
    onResourceClick: (resource: Resource) => void;
    onViewAll?: () => void;
}

export function PopularResources({ resources, onResourceClick, onViewAll }: PopularResourcesProps) {
    if (resources.length === 0) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Popular Resources</h2>
                </div>
                {onViewAll && (
                    <Button variant="ghost" size="sm" onClick={onViewAll} className="text-muted-foreground">
                        View All <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                )}
            </div>

            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex space-x-4 pb-4">
                    {resources.map((resource) => (
                        <div key={resource.id} className="w-[280px] shrink-0">
                            <ResourceCard
                                id={resource.id}
                                title={resource.title}
                                description={resource.description}
                                type={resource.type}
                                thumbnailUrl={resource.thumbnail_url}
                                viewCount={resource.view_count || 0}
                                durationSeconds={resource.duration_seconds}
                                onClick={() => onResourceClick(resource)}
                            />
                        </div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
        </div>
    );
}
