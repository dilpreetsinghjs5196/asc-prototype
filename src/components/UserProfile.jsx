import React, { useState } from 'react';
import { db } from '../lib/supabase';
import './UserProfile.css';
import {
  User,
  Mail,
  Lock,
  Phone,
  Shield,
  Stethoscope,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Save,
  ArrowLeft,
  Eye,
  EyeOff,
  LogOut
} from 'lucide-react';

export default function UserProfile({ user, onUpdateUser, onBack, onLogout }) {
  const isSurgeon = user?.role === 'surgeon';

  // Extract initial names
  const initialFirstName = user?.firstname || (user?.name ? user.name.split(' ')[0] : 'Admin');
  const initialLastName = user?.lastname || (user?.name ? user.name.split(' ').slice(1).join(' ') : 'Director');

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || user?.surgeonData?.phone || '');
  const [specialty, setSpecialty] = useState(user?.specialty || user?.surgeonData?.specialty || 'General Surgery');
  const licenseNumber = user?.license_number || user?.surgeonData?.license_number || '';

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // States
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const getInitials = () => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (user?.name) return user.name.slice(0, 2).toUpperCase();
    return 'AD';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    // Validate email
    if (!email || !email.includes('@')) {
      setErrorMsg('Please provide a valid email address.');
      return;
    }

    // Validate password change
    if (newPassword) {
      if (newPassword.length < 6) {
        setErrorMsg('New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('New passwords do not match.');
        return;
      }
    }

    setSaving(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      if (isSurgeon) {
        // Update surgeon in database
        const surgeonId = user?.id || user?.surgeonData?.id;
        const updates = {
          firstname: firstName.trim(),
          lastname: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          specialty: specialty.trim()
        };
        if (newPassword) updates.password = newPassword.trim();

        await db.updateSurgeon(surgeonId, updates);

        const updatedUser = {
          ...user,
          name: `Dr. ${lastName.trim()} ${firstName.trim()}`.trim(),
          firstname: firstName.trim(),
          lastname: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          specialty: specialty.trim(),
          surgeonData: {
            ...(user.surgeonData || {}),
            ...updates
          }
        };

        db.saveSession(updatedUser);
        if (onUpdateUser) onUpdateUser(updatedUser);
        setSuccessMsg('Surgeon profile and credentials updated successfully!');
      } else {
        // Update admin in users table
        const adminId = user?.id || 1;
        const updates = {
          name: fullName,
          email: email.trim().toLowerCase()
        };
        if (newPassword) updates.password = newPassword.trim();

        await db.updateUser(adminId, updates);

        const updatedUser = {
          ...user,
          name: fullName,
          email: email.trim().toLowerCase()
        };

        db.saveSession(updatedUser);
        if (onUpdateUser) onUpdateUser(updatedUser);
        setSuccessMsg('Administrator credentials updated successfully!');
      }

      if (newPassword) {
        await db.updatePassword(newPassword.trim()).catch(() => {});
      }

      // Reset password fields
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error updating credentials:', err);
      setErrorMsg(err.message || 'Failed to update credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="user-profile-page">
      {/* Top action row */}
      {onBack && (
        <div>
          <button
            onClick={onBack}
            className="btn-header"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={15} />
            <span>Back to Dashboard</span>
          </button>
        </div>
      )}

      {/* Profile Overview Card */}
      <div className="profile-overview-card">
        <div className="profile-overview-left">
          <div className="profile-avatar-large">
            {getInitials()}
          </div>
          <div>
            <h2 className="profile-overview-name">
              {isSurgeon ? `Dr. ${lastName} ${firstName}` : `${firstName} ${lastName}`}
            </h2>
            <div className="profile-overview-meta">
              <span className={`profile-badge-role ${isSurgeon ? 'role-surgeon-badge' : ''}`}>
                {isSurgeon ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Stethoscope size={13} /> Attending Surgeon
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={13} /> ASC Administrator
                  </span>
                )}
              </span>
              <span className="profile-overview-email">{email}</span>
            </div>
          </div>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="btn-header"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="profile-alert-success">
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="profile-alert-error">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Content */}
      <form onSubmit={handleSave}>
        <div className="profile-content-grid">
          {/* Section 1: Personal & Account Details */}
          <div className="profile-section-card">
            <div className="profile-section-header">
              <div className="profile-section-icon">
                <User size={18} />
              </div>
              <div>
                <h3 className="profile-section-title">Personal & Contact Info</h3>
                <p className="profile-section-subtitle">Manage your personal identification details</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="profile-form-group">
                <label className="profile-form-label">First Name</label>
                <div className="profile-input-wrapper">
                  <User size={15} className="profile-input-icon" />
                  <input
                    type="text"
                    className="profile-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="profile-form-group">
                <label className="profile-form-label">Last Name</label>
                <div className="profile-input-wrapper">
                  <User size={15} className="profile-input-icon" />
                  <input
                    type="text"
                    className="profile-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-form-label">Email Address (Login ID)</label>
              <div className="profile-input-wrapper">
                <Mail size={15} className="profile-input-icon" />
                <input
                  type="email"
                  className="profile-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-form-label">Phone Number</label>
              <div className="profile-input-wrapper">
                <Phone size={15} className="profile-input-icon" />
                <input
                  type="text"
                  className="profile-input"
                  placeholder="(555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {isSurgeon && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="profile-form-group">
                  <label className="profile-form-label">Clinical Specialty</label>
                  <div className="profile-input-wrapper">
                    <Stethoscope size={15} className="profile-input-icon" />
                    <input
                      type="text"
                      className="profile-input"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                    />
                  </div>
                </div>

                <div className="profile-form-group">
                  <label className="profile-form-label">License Number</label>
                  <div className="profile-input-wrapper">
                    <Shield size={15} className="profile-input-icon" />
                    <input
                      type="text"
                      className="profile-input"
                      value={licenseNumber}
                      disabled
                      title="Medical licenses are verified by clinical compliance"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Security & Credentials */}
          <div className="profile-section-card">
            <div className="profile-section-header">
              <div className="profile-section-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                <KeyRound size={18} />
              </div>
              <div>
                <h3 className="profile-section-title">Security & Password</h3>
                <p className="profile-section-subtitle">Update your password to keep your account secure</p>
              </div>
            </div>

            <div className="profile-form-group">
              <label className="profile-form-label">New Password</label>
              <div className="profile-input-wrapper">
                <Lock size={15} className="profile-input-icon" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className="profile-input"
                  placeholder="Leave blank to keep current password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Must be at least 6 characters long
              </span>
            </div>

            <div className="profile-form-group">
              <label className="profile-form-label">Confirm New Password</label>
              <div className="profile-input-wrapper">
                <Lock size={15} className="profile-input-icon" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className="profile-input"
                  placeholder="Re-type new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginTop: 'auto'
            }}>
              <strong>Account Protection:</strong> Credentials update immediately in the database and apply to your next portal sign in.
            </div>
          </div>
        </div>

        {/* Footer save bar */}
        <div className="profile-footer-actions">
          {onBack && (
            <button
              type="button"
              className="btn-header"
              onClick={onBack}
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            className="profile-save-btn"
            disabled={saving}
          >
            <Save size={16} />
            <span>{saving ? 'Saving Changes...' : 'Save Profile Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
