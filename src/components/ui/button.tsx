import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-primary/90 to-primary text-primary-foreground shadow-btn hover:from-primary hover:to-primary/90 hover:shadow-btn-hover active:scale-[0.97] border-none",
        premium: "relative overflow-hidden bg-gradient-premium text-white shadow-[0_4px_20px_hsl(var(--primary)/0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_6px_25px_hsl(var(--primary)/0.4),inset_0_1px_0_rgba(255,255,255,0.3)] hover:-translate-y-[1px] active:scale-[0.97] border-none shimmer-bg duration-300",
        destructive: "bg-gradient-to-b from-destructive/90 to-destructive text-destructive-foreground shadow-[0_2px_10px_rgba(239,68,68,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-destructive hover:to-destructive/90 hover:shadow-[0_4px_15px_rgba(239,68,68,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] border-none",
        outline: "border border-primary/20 bg-background/50 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:bg-primary/5 hover:text-primary hover:border-primary/40 hover:shadow-[0_2px_8px_hsl(var(--primary)/0.12)] active:scale-[0.97]",
        secondary: "bg-secondary/80 text-secondary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:bg-secondary hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:text-foreground active:scale-[0.97] border-none backdrop-blur-sm",
        ghost: "hover:bg-primary/10 hover:text-primary active:scale-[0.97]",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-lg px-3.5 text-[13px]",
        lg: "h-12 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
