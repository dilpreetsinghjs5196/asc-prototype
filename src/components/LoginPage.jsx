import React, { useState } from 'react';
import { db } from '../lib/supabase';
import './LoginPage.css';
import {
  ShieldCheck,
  Stethoscope,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Sun,
  Moon,
  CheckCircle2,
  Building2
} from 'lucide-react';

export default function LoginPage({ onLogin, theme, setTheme }) {
  const [role, setRole] = useState('admin'); // 'admin' | 'surgeon'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await db.login({ email, password, role });
      if (onLogin) {
        onLogin(result.user, result.role);
      }
    } catch (err) {
      console.error('Login error:', err);
      let errorMsg = err?.message;
      if (!errorMsg || errorMsg === '{}' || typeof errorMsg !== 'string') {
        errorMsg = err?.error_description || (typeof err === 'string' ? err : 'Invalid email or password. Please verify your credentials.');
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoRole, demoEmail, demoPass) => {
    setRole(demoRole);
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="login-page-wrapper">
      {/* Decorative ambient lights */}
      <div className="login-bg-glow-1"></div>
      <div className="login-bg-glow-2"></div>
      <div className="login-grid-pattern"></div>

      {/* Theme toggle in top right */}
      {setTheme && (
        <button
          className="login-theme-btn"
          onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
          type="button"
          title="Toggle Color Scheme"
        >
          {theme === 'dark' ? <Moon size={15} color="#60a5fa" /> : <Sun size={15} color="#f59e0b" />}
          <span>{theme === 'dark' ? 'Dark' : 'Light'} Mode</span>
        </button>
      )}

      <div className="login-card">
        {/* Brand header */}
        <div className="login-brand">
          <div className="login-brand-icon">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="login-brand-title">ASC Command Center</h1>
            <p className="login-brand-subtitle">Clinical & Financial Platform</p>
          </div>
        </div>

        {/* Intro */}
        <div className="login-intro">
          <h2>Secure Portal Login</h2>
          <p>Select your authorized role to sign in to your dashboard.</p>
        </div>

        {/* Role Switcher Tabs */}
        <div className="login-role-tabs">
          <button
            type="button"
            className={`login-role-tab-btn ${role === 'admin' ? 'active' : ''}`}
            onClick={() => {
              setRole('admin');
              setError(null);
            }}
          >
            <ShieldCheck size={16} />
            Administrator
          </button>
          <button
            type="button"
            className={`login-role-tab-btn ${role === 'surgeon' ? 'active' : ''}`}
            onClick={() => {
              setRole('surgeon');
              setError(null);
            }}
          >
            <Stethoscope size={16} />
            Surgeon Portal
          </button>
        </div>

        {/* Role badge indicator */}
        <div style={{ textAlign: 'center' }}>
          {role === 'admin' ? (
            <span className="login-role-badge badge-admin">
              <ShieldCheck size={14} /> Full ASC Executive & Management Access
            </span>
          ) : (
            <span className="login-role-badge badge-surgeon">
              <Stethoscope size={14} /> Dedicated Attending Surgeon Access
            </span>
          )}
        </div>

        {/* Error notification */}
        {error && (
          <div className="login-error-alert">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit}>
          <div className="login-form-group">
            <label className="login-label" htmlFor="login-email">
              {role === 'admin' ? 'Administrator Email' : 'Surgeon Email'}
            </label>
            <div className="login-input-wrapper">
              <Mail size={16} className="login-input-icon" />
              <input
                id="login-email"
                type="email"
                className="login-input"
                placeholder={role === 'admin' ? 'admin@asc.com' : 'surgeon@hospital.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="login-form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="login-label" htmlFor="login-password">
                Password
              </label>
              {role === 'surgeon' && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Default: surgeon123
                </span>
              )}
            </div>
            <div className="login-input-wrapper">
              <Lock size={16} className="login-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to {role === 'admin' ? 'ASC Command Center' : 'Surgeon Portal'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Demo Quick Access Helper */}
        <div className="login-demo-section">
          <div className="login-demo-title">
            <span>Fast Prototype Demo Logins</span>
          </div>
          <div className="login-demo-chips">
            <button
              type="button"
              className="login-demo-chip"
              onClick={() => handleQuickDemo('admin', 'admin@asc.com', 'admin123')}
            >
              <div>
                <div className="login-demo-chip-name">👑 ASC Administrator</div>
                <div className="login-demo-chip-email">admin@asc.com</div>
              </div>
              <span className="login-demo-chip-tag badge-admin">Fill Admin</span>
            </button>

            <button
              type="button"
              className="login-demo-chip"
              onClick={() => handleQuickDemo('surgeon', 'prysi@hospital.com', 'surgeon123')}
            >
              <div>
                <div className="login-demo-chip-name">🩺 Dr. Mark Prysi</div>
                <div className="login-demo-chip-email">prysi@hospital.com</div>
              </div>
              <span className="login-demo-chip-tag badge-surgeon">Fill Surgeon</span>
            </button>

            <button
              type="button"
              className="login-demo-chip"
              onClick={() => handleQuickDemo('surgeon', 'burmiester@hospital.com', 'surgeon123')}
            >
              <div>
                <div className="login-demo-chip-name">🩺 Dr. Cliff Burmiester</div>
                <div className="login-demo-chip-email">burmiester@hospital.com</div>
              </div>
              <span className="login-demo-chip-tag badge-surgeon">Fill Surgeon</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="login-footer-info">
          <CheckCircle2 size={13} color="#10b981" />
          <span>Role-Based Protected Session • Ambulatory Surgery Network</span>
        </div>
      </div>
    </div>
  );
}
