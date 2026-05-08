'use client';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  pageIndex: number;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="mx-auto mb-4 border border-dashed border-red-500 bg-red-500/10"
          style={{ width: 595, height: 842 }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <p className="text-red-400 font-bold mb-2">Page {this.props.pageIndex + 1} failed to render</p>
            <p className="text-text-secondary text-xs mb-4">{this.state.error}</p>
            <button
              className="px-3 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/40"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}