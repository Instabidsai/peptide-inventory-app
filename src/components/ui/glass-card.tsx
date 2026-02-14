
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

// Assuming we want a card that looks like glass
const GlassCard = forwardRef<HTMLDivElement, React.ComponentProps<typeof Card>>(({ className, ...props }, ref) => (
    <Card
        ref={ref}
        className={cn(
            "bg-card/60 backdrop-blur-md border-white/[0.06] shadow-xl ring-1 ring-white/[0.03]",
            className
        )}
        {...props}
    />
));
GlassCard.displayName = "GlassCard";

export { GlassCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
