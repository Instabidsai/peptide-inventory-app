import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card/95 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-overlay group-[.toaster]:rounded-xl group-[.toaster]:ring-1 group-[.toaster]:ring-inset group-[.toaster]:ring-border/50",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:font-semibold",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg",
          success: "group-[.toaster]:!border-primary/30 group-[.toaster]:!shadow-[0_8px_30px_hsl(var(--primary)/0.12)]",
          error: "group-[.toaster]:!border-red-500/30 group-[.toaster]:!shadow-[0_8px_30px_rgba(239,68,68,0.12)]",
          warning: "group-[.toaster]:!border-amber-500/30 group-[.toaster]:!shadow-[0_8px_30px_rgba(245,158,11,0.12)]",
          info: "group-[.toaster]:!border-blue-500/30 group-[.toaster]:!shadow-[0_8px_30px_rgba(59,130,246,0.12)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
