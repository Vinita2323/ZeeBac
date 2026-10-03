import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleBackToLogin = () => {
    if (window.location.pathname.startsWith('/admin')) {
      window.location.href = '/admin/login';
    } else if (window.location.pathname.startsWith('/vendor')) {
      window.location.href = '/vendor-app/login';
    } else {
      window.location.href = '/login';
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white font-body-lg text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto text-3xl">
              ⚠️
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white mb-2">Something went wrong</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                An unexpected error occurred while loading this page. Please refresh or return to login.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs text-rose-300 font-mono text-left break-all select-all">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm tracking-wide transition-all cursor-pointer border border-slate-700"
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleBackToLogin}
                className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm tracking-wide transition-all cursor-pointer shadow-lg shadow-purple-600/30"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
