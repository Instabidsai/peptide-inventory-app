import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueryErrorProps {
    message?: string;
    onRetry?: () => void;
}

export function QueryError({ message = "Failed to load data.", onRetry }: QueryErrorProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mb-3 text-destructive/60" />
            <p className="font-medium">{message}</p>
            {onRetry && (
                <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                    Try Again
                </Button>
            )}
        </div>
    );
}
