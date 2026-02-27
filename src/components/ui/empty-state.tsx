import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <motion.div
        initial={{ y: 8 }}
        animate={{ y: [8, -4, 0] }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
        className="relative mb-6"
      >
        <div className="absolute inset-0 rounded-full bg-primary/5 blur-xl scale-150" />
        <div className="relative p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10">
          <Icon className="h-10 w-10 text-primary/40" />
        </div>
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="text-lg font-semibold text-muted-foreground"
      >
        {title}
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
        className="text-sm text-muted-foreground/60 mt-1 max-w-[280px] text-center"
      >
        {description}
      </motion.p>
      {action && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="mt-5"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
