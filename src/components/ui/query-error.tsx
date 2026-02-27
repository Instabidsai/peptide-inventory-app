import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface QueryErrorProps {
    message?: string;
    onRetry?: () => void;
}

export function QueryError({ message = "Failed to load data.", onRetry }: QueryErrorProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            role="alert"
            aria-live="assertive"
            className="flex flex-col items-center justify-center py-14 text-center"
        >
            <motion.div
                className="p-4 rounded-2xl bg-destructive/[0.08] ring-1 ring-destructive/15 mb-4"
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            >
                <AlertTriangle className="h-7 w-7 text-destructive/70" />
            </motion.div>
            <p className="font-semibold text-sm text-muted-foreground tracking-tight">{message}</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Please check your connection and try again.</p>
            {onRetry && (
                <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onRetry}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try Again
                </Button>
            )}
        </motion.div>
    );
}
