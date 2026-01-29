
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 m-4 border-2 border-red-500 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-200">
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                        Something went wrong in {this.props.name || 'Component'}
                    </h2>
                    <details className="whitespace-pre-wrap font-mono text-sm bg-white/50 dark:bg-black/50 p-4 rounded overflow-auto max-h-[400px]">
                        <summary className="cursor-pointer font-semibold mb-2">Error Details</summary>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}
