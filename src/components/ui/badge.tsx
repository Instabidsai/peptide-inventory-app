import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.15)] hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-destructive/80",
        success: "border-transparent bg-emerald-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-emerald-600/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
