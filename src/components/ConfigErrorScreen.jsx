import React from 'react';

/**
 * Diagnostic Fatal Error Screen rendered when mandatory environment configuration is missing or invalid.
 * Prevents application mount and silent degradation.
 */
export default function ConfigErrorScreen({ error }) {
  const isProd = Boolean(
    import.meta.env.PROD ||
    import.meta.env.VITE_APP_ENV === 'production'
  );

  const missingKeys = error?.missingKeys || [];
  const errorMessage = error?.message || 'Configuration validation failed.';
  const correlationId = 'err-config-init-failed';

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '640px',
        width: '100%',
        backgroundColor: '#1e293b',
        border: '1px solid #ef4444',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.75rem' }}>⚠️</span>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#f87171' }}>
            ASCANALYST Configuration Error
          </h1>
        </div>

        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          The application cannot start because mandatory environment configuration is missing or invalid.
        </p>

        {!isProd ? (
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem'
          }}>
            <p style={{ fontWeight: 600, color: '#cbd5e1', margin: '0 0 0.5rem 0' }}>
              Development Diagnostic Details:
            </p>
            <p style={{ color: '#fca5a5', margin: '0 0 0.75rem 0', fontFamily: 'monospace' }}>
              {errorMessage}
            </p>

            {missingKeys.length > 0 && (
              <div style={{ marginBottom: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>Missing Variables:</span>
                <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0, color: '#fca5a5', fontFamily: 'monospace' }}>
                  {missingKeys.map(k => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ borderTop: '1px solid #334155', paddingTop: '0.75rem', color: '#94a3b8' }}>
              <strong>Remediation Steps:</strong>
              <ol style={{ margin: '0.25rem 0 0 1.25rem', padding: 0, lineHeight: 1.6 }}>
                <li>Copy <code>.env.example</code> to <code>.env</code> or <code>.env.development.local</code></li>
                <li>Populate the required Supabase connection parameters</li>
                <li>Restart the development server (<code>npm run dev</code>)</li>
              </ol>
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
            fontSize: '0.875rem'
          }}>
            <p style={{ color: '#cbd5e1', margin: '0 0 0.5rem 0' }}>
              Production initialization failed. Safe defaults prevent running with unvalidated parameters.
            </p>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.8rem', fontFamily: 'monospace' }}>
              Error Code: ERR_CONFIG_INIT_FAILED | Correlation ID: {correlationId}
            </p>
          </div>
        )}

        <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
          ASCANALYST Enterprise Healthcare Architecture • 45 CFR § 164.312
        </div>
      </div>
    </div>
  );
}
