import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
}

interface Props {
  children: React.ReactNode;
  /** Label shown in the error fallback, e.g. "Financial Overview" */
  section?: string;
}

/**
 * Lightweight error boundary for individual page sections.
 * If one section crashes, the rest of the page still works.
 */
export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-muted-foreground">
            {this.props.section ? `${this.props.section} failed to load.` : 'This section failed to load.'}
          </span>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 ml-auto text-xs font-medium text-primary hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
