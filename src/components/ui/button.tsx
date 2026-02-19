import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-tight ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-btn hover:bg-primary/90 hover:shadow-btn-hover hover:-translate-y-[1px]",
        destructive: "bg-destructive text-destructive-foreground shadow-btn hover:bg-destructive/90 hover:shadow-[0_2px_8px_rgba(153,27,27,0.3)] hover:-translate-y-[1px]",
        outline: "border border-input bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-accent/10 hover:text-accent-foreground hover:border-primary/40",
        secondary: "bg-secondary text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.15)] hover:bg-secondary/80 hover:shadow-[0_2px_6px_rgba(0,0,0,0.2)]",
        ghost: "hover:bg-accent/80 hover:text-accent-foreground hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        link: "text-primary underline-offset-4 hover:underline",
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
