import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-primary/90 to-primary text-primary-foreground shadow-[0_2px_10px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-primary hover:to-primary/90 hover:shadow-[0_4px_15px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-all duration-200 border-none",
        premium: "relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-emerald-600 text-white shadow-[0_4px_20px_rgba(16,185,129,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_6px_25px_rgba(16,185,129,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] hover:-translate-y-[2px] active:scale-[0.97] border-none shimmer-bg transition-all duration-300",
        destructive: "bg-gradient-to-b from-destructive/90 to-destructive text-destructive-foreground shadow-[0_2px_10px_rgba(220,38,38,0.2),inset_0_1px_0_rgba(255,255,255,0.15)] hover:from-destructive hover:to-destructive/90 hover:shadow-[0_4px_15px_rgba(220,38,38,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.97] transition-all duration-200 border-none",
        outline: "border-2 border-primary/20 bg-background/50 backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-primary/5 hover:text-primary hover:border-primary/40 hover:shadow-[0_4px_15px_rgba(16,185,129,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] active:scale-[0.97] transition-all duration-200",
        secondary: "bg-secondary/80 text-secondary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-secondary hover:shadow-[0_4px_15px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)] hover:text-foreground active:scale-[0.97] transition-all duration-200 border-none backdrop-blur-sm",
        ghost: "hover:bg-primary/10 hover:text-primary active:scale-[0.97] transition-all duration-200",
        link: "text-primary underline-offset-4 hover:underline active:scale-[0.97] transition-all duration-200",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 rounded-lg px-4",
        lg: "h-12 rounded-lg px-8",
        icon: "h-11 w-11",
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
