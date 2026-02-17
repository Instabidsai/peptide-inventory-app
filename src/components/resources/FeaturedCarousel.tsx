import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useState, useEffect } from "react";

interface FeaturedResource {
    id: string;
    title: string;
    description: string | null;
    type: string;
    thumbnailUrl?: string | null;
}

interface FeaturedCarouselProps {
    resources: FeaturedResource[];
    onResourceClick: (resource: FeaturedResource) => void;
}

export function FeaturedCarousel({ resources, onResourceClick }: FeaturedCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Auto-rotate every 5 seconds
    useEffect(() => {
        if (resources.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % resources.length);
        }, 5000);

        return () => clearInterval(timer);
    }, [resources.length]);

    if (resources.length === 0) return null;

    const current = resources[currentIndex];

    const goToPrev = () => {
        setCurrentIndex((prev) => (prev - 1 + resources.length) % resources.length);
    };

    const goToNext = () => {
        setCurrentIndex((prev) => (prev + 1) % resources.length);
    };

    return (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
            <CardContent className="p-0">
                <div className="relative aspect-[21/9] md:aspect-[3/1]">
                    {/* Background Image/Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />

                    {current.thumbnailUrl && (
                        <img
                            src={current.thumbnailUrl}
                            alt={current.title}
                            className="absolute inset-0 w-full h-full object-cover opacity-40"
                        />
                    )}

                    {/* Content */}
                    <div className="relative z-20 h-full flex flex-col justify-center p-6 md:p-8 max-w-2xl">
                        <Badge className="w-fit mb-3 bg-primary/20 text-primary border-primary/30">
                            Featured Research
                        </Badge>

                        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold mb-2 line-clamp-2">
                            {current.title}
                        </h2>

                        <p className="text-sm md:text-base text-muted-foreground mb-4 line-clamp-2">
                            {current.description || "Explore the latest research and findings."}
                        </p>

                        <Button
                            onClick={() => onResourceClick(current)}
                            className="w-fit gap-2"
                        >
                            {current.type === 'video' && <Play className="h-4 w-4" />}
                            Watch Now
                        </Button>
                    </div>

                    {/* Navigation Arrows */}
                    {resources.length > 1 && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Previous resource"
                                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-background/50 hover:bg-background/80"
                                onClick={goToPrev}
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Next resource"
                                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-background/50 hover:bg-background/80"
                                onClick={goToNext}
                            >
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </>
                    )}

                    {/* Dots Indicator */}
                    {resources.length > 1 && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                            {resources.map((r, idx) => (
                                <button
                                    key={r.id}
                                    onClick={() => setCurrentIndex(idx)}
                                    className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex
                                            ? 'bg-primary w-6'
                                            : 'bg-muted-foreground/50 hover:bg-muted-foreground'
                                        }`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
