import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildDebugReport, getDebugReportText } from '@/lib/debug';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
    if (import.meta.env.VITE_SENTRY_DSN) {
      void import('@/lib/sentry').then(({ captureException }) =>
        captureException(error, {
          componentStack: errorInfo.componentStack,
          debugReport: buildDebugReport(),
        })
      );
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, copied: false });
    window.location.reload();
  };

  handleCopyDebug = async (): Promise<void> => {
    const text = getDebugReportText();
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      } catch {
        // ignore
      }
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-secondary/20 border border-border rounded-[2rem] p-10 text-center space-y-6">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight">
                Something went wrong
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                An unexpected error occurred. Your data is safe in local storage.
              </p>
            </div>
            {this.state.error && (
              <div className="p-4 bg-background/50 rounded-xl text-left">
                <code className="text-xs text-destructive break-all">
                  {this.state.error.message}
                </code>
              </div>
            )}
            <Button
              variant="outline"
              onClick={this.handleCopyDebug}
              className="w-full h-12 rounded-xl font-bold"
            >
              {this.state.copied ? 'Copied debug report' : 'Copy debug report'}
            </Button>
            <Button
              onClick={this.handleReset}
              className="w-full h-12 rounded-xl font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
