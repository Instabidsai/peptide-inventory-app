
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const GlassCard = forwardRef<HTMLDivElement, React.ComponentProps<typeof Card>>(({ className, ...props }, ref) => (
    <Card
        ref={ref}
        className={cn(
            "relative overflow-hidden rounded-2xl",
            // Elevated glass surface
            "bg-gradient-to-br from-muted/50 via-muted/30 to-muted/20",
            "backdrop-blur-2xl",
            // Multi-layer border for depth
            "border border-border/60",
            "ring-1 ring-inset ring-border/50",
            // Deep layered shadow for "popping off the page"
            "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.15),0_12px_24px_-4px_rgba(0,0,0,0.2),0_24px_48px_-8px_rgba(0,0,0,0.15)]",
            // Smooth transitions + hover lift
            "transition-all duration-300 ease-out",
            "hover:shadow-[0_8px_12px_-2px_rgba(0,0,0,0.2),0_20px_36px_-6px_rgba(0,0,0,0.25),0_32px_64px_-12px_rgba(0,0,0,0.2)] hover:-translate-y-0.5",
            className
        )}
        {...props}
    />
));
GlassCard.displayName = "GlassCard";

export { GlassCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
