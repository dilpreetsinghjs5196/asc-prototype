import React from 'react';

/**
 * Enterprise Application Error Boundary.
 * Catches unhandled JavaScript errors anywhere in the component tree,
 * logs the diagnostic stack, and displays a resilient fallback UI instead of a white screen.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught unhandled application exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    try {
      localStorage.removeItem('caseLogSchedulerState');
      localStorage.removeItem('asc_active_tab');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '2rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            padding: '2rem',
            border: '1px solid #334155',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 700
              }}>
                !
              </div>
              <div>
                <h2 style={{ color: '#f8fafc', margin: 0, fontSize: '1.25rem' }}>
                  Application Render Notice
                </h2>
                <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem' }}>
                  A component error was caught safely without crashing the browser session.
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#090e17',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              overflowX: 'auto',
              marginBottom: '1.5rem',
              whiteSpace: 'pre-wrap',
              maxHeight: '240px',
              overflowY: 'auto'
            }}>
              <strong>{this.state.error?.name || 'Error'}:</strong> {this.state.error?.message || String(this.state.error)}
              {this.state.errorInfo?.componentStack && `\n\nComponent Stack:${this.state.errorInfo.componentStack}`}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Reload Interface
              </button>
              <button
                type="button"
                onClick={this.handleResetState}
                style={{
                  backgroundColor: '#334155',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Clear State Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
