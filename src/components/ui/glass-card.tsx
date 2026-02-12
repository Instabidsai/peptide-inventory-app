
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

// Assuming we want a card that looks like glass
const GlassCard = forwardRef<HTMLDivElement, React.ComponentProps<typeof Card>>(({ className, ...props }, ref) => (
    <Card
        ref={ref}
        className={cn(
            "bg-white/40 dark:bg-black/40 backdrop-blur-md border-white/20 dark:border-white/10 shadow-xl",
            className
        )}
        {...props}
    />
));
GlassCard.displayName = "GlassCard";

export { GlassCard, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
