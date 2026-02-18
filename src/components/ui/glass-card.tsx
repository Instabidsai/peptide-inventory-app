
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const GlassCard = forwardRef<HTMLDivElement, React.ComponentProps<typeof Card>>(({ className, ...props }, ref) => (
    <Card
        ref={ref}
        className={cn(
            "relative overflow-hidden",
            "bg-white/[0.04] backdrop-blur-xl",
            "border border-white/[0.08]",
            "shadow-[0_8px_32px_rgba(0,0,0,0.12)]",
            "ring-1 ring-inset ring-white/[0.05]",
            "transition-all duration-300 ease-out",
            className
        )}
        {...props}
    />
));
GlassCard.displayName = "GlassCard";

export { GlassCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
