import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, Folder } from "lucide-react";

interface Theme {
    id: string;
    name: string;
    description: string | null;
    icon?: string;
    color?: string;
    is_general?: boolean;
}

interface TopicGridProps {
    themes: Theme[];
    getResourceCount: (themeId: string | null) => number;
    onThemeClick: (theme: Theme) => void;
}

export function TopicGrid({ themes, getResourceCount, onThemeClick }: TopicGridProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Browse by Topic</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map((theme) => {
                    const count = getResourceCount(theme.is_general ? null : theme.id);
                    const accentColor = theme.color || '#10b981';

                    return (
                        <Card
                            key={theme.id}
                            className="group cursor-pointer hover:border-primary/50 transition-all duration-200"
                            onClick={() => onThemeClick(theme)}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div
                                    className="p-2 rounded-lg transition-colors"
                                    style={{
                                        backgroundColor: `${accentColor}20`,
                                    }}
                                >
                                    <Folder
                                        className="h-5 w-5 transition-colors"
                                        style={{ color: accentColor }}
                                    />
                                </div>
                                <Badge
                                    variant="secondary"
                                    className="font-mono text-xs"
                                    style={{
                                        backgroundColor: `${accentColor}20`,
                                        color: accentColor
                                    }}
                                >
                                    {count}
                                </Badge>
                            </CardHeader>

                            <CardContent className="pt-2">
                                <h3 className="font-semibold text-base mb-1 group-hover:text-primary transition-colors">
                                    {theme.name}
                                </h3>
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                    {theme.description || 'Explore resources and research.'}
                                </p>
                            </CardContent>

                            <CardFooter className="pt-0">
                                <Button
                                    variant="ghost"
                                    className="w-full justify-between p-0 h-auto text-sm text-muted-foreground group-hover:text-primary"
                                >
                                    Open Folder
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
