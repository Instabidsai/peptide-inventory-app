
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const GlassCard = forwardRef<HTMLDivElement, React.ComponentProps<typeof Card>>(({ className, ...props }, ref) => (
    <Card
        ref={ref}
        className={cn(
            "relative overflow-hidden rounded-2xl",
            // Elevated glass surface
            "bg-gradient-to-br from-white/[0.07] via-white/[0.04] to-white/[0.02]",
            "backdrop-blur-2xl",
            // Multi-layer border for depth
            "border border-white/[0.10]",
            "ring-1 ring-inset ring-white/[0.06]",
            // Deep layered shadow for "popping off the page"
            "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.15),0_12px_24px_-4px_rgba(0,0,0,0.2),0_24px_48px_-8px_rgba(0,0,0,0.15)]",
            // Smooth transitions
            "transition-all duration-300 ease-out",
            className
        )}
        {...props}
    />
));
GlassCard.displayName = "GlassCard";

export { GlassCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
