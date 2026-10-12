import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { db } from '../lib/supabase';
import { downloadDatabaseBackup, BACKUP_TABLES } from '../utils/databaseBackup';
import './Management.css';

const Settings = ({ onUpdate }) => {
    const [settings, setSettings] = useState({
        facility_name: 'Naples Surgery Center',
        facility_address: '123 Medical Blvd',
        facility_city: 'Naples',
        facility_state: 'FL',
        facility_zip: '34102',
        facility_phone: '(555) 123-4567',
        tax_id: '59-1234567',
        npi: '1234567890',
        apply_medicare_mppr: false,
        ai_allowed_email: '', // Restrict usage to this email
        gemini_api_key: '',
        light_sidebar_color: '#112238',
        light_bg_color: '#f8fafc',
        light_text_color: '#0f172a',
        light_label_color: '#334155',
        light_portal_color: '#ffffff',
        dark_sidebar_color: '#0F2036',
        dark_bg_color: '#142842',
        dark_text_color: '#f8fafc',
        dark_label_color: '#cbd5e1',
        dark_portal_color: '#1E3A5F'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exportingBackup, setExportingBackup] = useState(false);

    const handleDownloadBackup = async () => {
        try {
            setExportingBackup(true);

            Swal.fire({
                title: 'Generating Database SQL Backup',
                html: `
                    <div style="text-align: left; padding: 0.5rem 0.5rem 0; font-size: 0.9rem;">
                        <p style="margin-bottom: 0.75rem; color: #475569;">Fetching all records from Supabase tables and generating PostgreSQL SQL dump...</p>
                        <div id="swal-backup-progress" style="font-family: monospace; font-size: 0.82rem; color: #0369a1; background: #f0f9ff; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #bae6fd; min-height: 48px; display: flex; align-items: center;">
                            Connecting to database...
                        </div>
                    </div>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const result = await downloadDatabaseBackup((progress) => {
                const el = document.getElementById('swal-backup-progress');
                if (el) {
                    if (progress.phase === 'fetching') {
                        el.innerHTML = `<div>[${progress.tableIndex}/${progress.totalTables}] Exporting <b>${progress.label}</b> (<code>${progress.currentTable}</code>)...<br/><span style="color:#0284c7;font-size:0.75rem;">${(progress.rowsFetched || 0).toLocaleString()} rows fetched</span></div>`;
                    } else if (progress.phase === 'finalizing') {
                        el.innerHTML = `<div>Finalizing sequences, constraints, and building .sql file...</div>`;
                    }
                }
            });

            Swal.fire({
                icon: 'success',
                title: 'Database Backup Downloaded!',
                html: `
                    <div style="text-align: left; padding: 0.25rem 0.5rem;">
                        <p style="margin-bottom: 0.75rem; color: #334155; font-size: 0.95rem;">
                            Your complete PostgreSQL database backup file has been generated and downloaded.
                        </p>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 0.75rem;">
                            <div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.35rem;"><b>File:</b> <code style="color: #0369a1; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${result.fileName}</code></div>
                            <div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.35rem;"><b>Size:</b> ${result.fileSizeMB} MB</div>
                            <div style="font-size: 0.85rem; color: #475569; margin-bottom: 0.35rem;"><b>Total Records:</b> <span style="color: #10b981; font-weight: 700;">${result.totalRecords.toLocaleString()}</span> rows</div>
                            <div style="font-size: 0.85rem; color: #475569;"><b>Tables Exported:</b> ${Object.keys(result.tableCounts).length} tables</div>
                        </div>
                        <p style="margin: 0; font-size: 0.8rem; color: #64748b; line-height: 1.5;">
                            💡 <b>Restoration:</b> You can execute this <code>.sql</code> script anytime inside the <b>Supabase SQL Editor</b> or any PostgreSQL database to recreate or restore your data.
                        </p>
                    </div>
                `,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'Done'
            });
        } catch (error) {
            console.error('Error generating database backup:', error);
            Swal.fire({
                icon: 'error',
                title: 'Backup Failed',
                text: error.message || 'An error occurred while generating the database backup.',
                confirmButtonColor: '#ef4444'
            });
        } finally {
            setExportingBackup(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await db.getSettings();
            
            // Load local AI config for email just in case it's not in DB
            const localAI = {
                ai_allowed_email: localStorage.getItem('ai_allowed_email') || '',
                light_sidebar_color: localStorage.getItem('light_sidebar_color') || '#112238',
                light_bg_color: localStorage.getItem('light_bg_color') || '#f8fafc',
                light_text_color: localStorage.getItem('light_text_color') || '#0f172a',
                light_label_color: localStorage.getItem('light_label_color') || '#334155',
                light_portal_color: localStorage.getItem('light_portal_color') || '#ffffff',
                dark_sidebar_color: localStorage.getItem('dark_sidebar_color') || '#0F2036',
                dark_bg_color: localStorage.getItem('dark_bg_color') || '#142842',
                dark_text_color: localStorage.getItem('dark_text_color') || '#f8fafc',
                dark_label_color: localStorage.getItem('dark_label_color') || '#cbd5e1',
                dark_portal_color: localStorage.getItem('dark_portal_color') || '#1E3A5F'
            };

            if (data) {
                setSettings({ ...data, ...localAI });
            } else {
                setSettings(prev => ({ ...prev, ...localAI }));
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            Swal.fire('Error', 'Failed to load settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const resetThemeDefaults = () => {
        setSettings(prev => ({
            ...prev,
            light_sidebar_color: '#112238',
            light_bg_color: '#f8fafc',
            light_text_color: '#0f172a',
            light_label_color: '#334155',
            light_portal_color: '#ffffff',
            dark_sidebar_color: '#0F2036',
            dark_bg_color: '#142842',
            dark_text_color: '#f8fafc',
            dark_label_color: '#cbd5e1',
            dark_portal_color: '#1E3A5F'
        }));
    };

    const handleSave = async (e) => {
        e.preventDefault();

        try {
            setSaving(true);

            // Separate AI settings to store locally to prevent Supabase schema errors for email
            const { id, ai_allowed_email, light_sidebar_color, light_bg_color, light_text_color, light_label_color, light_portal_color, dark_sidebar_color, dark_bg_color, dark_text_color, dark_label_color, dark_portal_color, ...settingsToUpdate } = settings;

            // Save local settings
            if (ai_allowed_email !== undefined) localStorage.setItem('ai_allowed_email', ai_allowed_email);
            if (light_sidebar_color) localStorage.setItem('light_sidebar_color', light_sidebar_color);
            if (light_bg_color) localStorage.setItem('light_bg_color', light_bg_color);
            if (light_text_color) localStorage.setItem('light_text_color', light_text_color);
            if (light_label_color) localStorage.setItem('light_label_color', light_label_color);
            if (light_portal_color) localStorage.setItem('light_portal_color', light_portal_color);
            if (dark_sidebar_color) localStorage.setItem('dark_sidebar_color', dark_sidebar_color);
            if (dark_bg_color) localStorage.setItem('dark_bg_color', dark_bg_color);
            if (dark_text_color) localStorage.setItem('dark_text_color', dark_text_color);
            if (dark_label_color) localStorage.setItem('dark_label_color', dark_label_color);
            if (dark_portal_color) localStorage.setItem('dark_portal_color', dark_portal_color);

            // Dispatch theme update event
            window.dispatchEvent(new Event('theme-updated'));

            // If the user didn't type a new API key (it's either empty or just the placeholder dots), we don't overwrite it in DB
            // We use a separate state to handle the input, but since it's in `settings.gemini_api_key`, 
            // if it's exactly the masked string '••••••••••••••••', we delete it from settingsToUpdate
            // so we don't overwrite the real key with dots.
            if (settingsToUpdate.gemini_api_key === '••••••••••••••••' || settingsToUpdate.gemini_api_key === '...........................') {
                delete settingsToUpdate.gemini_api_key;
            }

            await db.updateSettings(settingsToUpdate);

            // Refresh global state
            if (onUpdate) await onUpdate();

            Swal.fire({
                icon: 'success',
                title: 'Settings Saved',
                text: 'Facility settings have been updated successfully',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error saving settings:', error);
            Swal.fire('Error', 'Failed to save settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="setting-container fade-in">
                <div className="setting-header">
                    <h2 className="setting-title">⚙️ Facility Settings</h2>
                </div>
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner"></div>
                    <p>Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="setting-container fade-in">
            <div className="setting-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h2 className="setting-title">⚙️ Facility Settings</h2>
                    <p className="setting-card-subtitle" style={{ marginTop: '0.5rem' }}>
                        Manage facility details, billing identifiers, and financial configurations
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleDownloadBackup}
                        disabled={exportingBackup}
                        title="Download entire database backup as a PostgreSQL .sql file"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.5rem',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            borderRadius: '12px',
                            border: '1px solid #10b981',
                            background: exportingBackup ? '#065f46' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            color: '#ffffff',
                            cursor: exportingBackup ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            opacity: exportingBackup ? 0.7 : 1
                        }}
                    >
                        <span>{exportingBackup ? '⏳' : '📥'}</span>
                        {exportingBackup ? 'Generating Backup...' : 'Download SQL Backup'}
                    </button>
                    <button
                        type="button"
                        className="setting-btn-add"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.75rem 2rem',
                            fontSize: '1rem',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
                            minWidth: '180px'
                        }}
                    >
                        <span>{saving ? '⏳' : '💾'}</span>
                        {saving ? 'Saving Changes...' : 'Save Settings'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '2rem', alignItems: 'start' }}>

                {/* Left Column: Preview Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="setting-section-header" style={{ marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: '700' }}>HCFA Preview</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Live preview of claim form box data</p>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#6366f1' }}></div>
                        <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Box 25 - Federal Tax ID</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{settings.tax_id || 'Not Set'}</div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#0ea5e9' }}></div>
                        <div style={{ fontSize: '0.75rem', color: '#0ea5e9', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Box 32 - Service Facility</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{settings.facility_name || 'Not Set'}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            {settings.facility_address && <div>{settings.facility_address}</div>}
                            {(settings.facility_city || settings.facility_state || settings.facility_zip) && (
                                <div>{settings.facility_city}, {settings.facility_state} {settings.facility_zip}</div>
                            )}
                        </div>
                    </div>

                    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#10b981' }}></div>
                        <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '700', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Box 33 - Billing Provider</div>
                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{settings.facility_name || 'Not Set'}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>📞</span> {settings.facility_phone || 'No phone'}
                        </div>
                    </div>

                    {/* Info Box */}
                    <div style={{
                        padding: '1.25rem',
                        background: 'rgba(14, 165, 233, 0.1)',
                        borderRadius: '16px',
                        border: '1px solid rgba(14, 165, 233, 0.3)',
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'flex-start'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>💡</span>
                        <div>
                            <strong style={{ color: '#38bdf8', fontSize: '0.9rem', display: 'block', marginBottom: '0.25rem' }}>
                                Auto-Synced Data
                            </strong>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#7dd3fc', lineHeight: '1.5' }}>
                                These settings populate your HCFA-1500 forms. Verify accuracy before generating claims.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Form */}
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    {/* Section 1: Facility Details */}
                    <div className="setting-content-card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#2563eb' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M17 21v-8H7v8" /></svg>
                            </div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>Facility Details</h3>
                        </div>

                        <div style={{ display: 'grid', gap: '1.5rem' }}>
                            <div className="setting-form-group">
                                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Facility Name <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    className="setting-form-input"
                                    type="text"
                                    name="facility_name"
                                    value={settings.facility_name}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g., Naples Surgery Center"
                                    style={{ height: '48px', fontSize: '1rem' }}
                                />
                            </div>

                            <div className="setting-form-group">
                                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Street Address <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    className="setting-form-input"
                                    type="text"
                                    name="facility_address"
                                    value={settings.facility_address}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g., 123 Medical Blvd"
                                    style={{ height: '48px' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                                <div className="setting-form-group">
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>City <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        className="setting-form-input"
                                        type="text"
                                        name="facility_city"
                                        value={settings.facility_city}
                                        onChange={handleChange}
                                        required
                                        placeholder="Naples"
                                        style={{ height: '48px' }}
                                    />
                                </div>
                                <div className="setting-form-group">
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>State <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        className="setting-form-input"
                                        type="text"
                                        name="facility_state"
                                        value={settings.facility_state}
                                        onChange={handleChange}
                                        required
                                        maxLength={2}
                                        placeholder="FL"
                                        style={{ textTransform: 'uppercase', textAlign: 'center', height: '48px' }}
                                    />
                                </div>
                                <div className="setting-form-group">
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>ZIP <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input
                                        className="setting-form-input"
                                        type="text"
                                        name="facility_zip"
                                        value={settings.facility_zip}
                                        onChange={handleChange}
                                        required
                                        placeholder="34102"
                                        style={{ height: '48px' }}
                                    />
                                </div>
                            </div>

                            <div className="setting-form-group">
                                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Phone Number <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    className="setting-form-input"
                                    type="tel"
                                    name="facility_phone"
                                    value={settings.facility_phone}
                                    onChange={handleChange}
                                    required
                                    placeholder="(555) 123-4567"
                                    style={{ height: '48px' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Billing Identifiers */}
                    <div className="setting-content-card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#16a34a' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                            </div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>Billing Identifiers</h3>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            <div className="setting-form-group">
                                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Federal Tax ID (EIN) <span style={{ color: '#ef4444' }}>*</span></label>
                                <input
                                    className="setting-form-input"
                                    type="text"
                                    name="tax_id"
                                    value={settings.tax_id}
                                    onChange={handleChange}
                                    required
                                    placeholder="59-1234567"
                                    style={{ height: '48px', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                                />
                            </div>
                            <div className="setting-form-group">
                                <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>NPI Number</label>
                                <input
                                    className="setting-form-input"
                                    type="text"
                                    name="npi"
                                    value={settings.npi}
                                    onChange={handleChange}
                                    placeholder="1234567890"
                                    style={{ height: '48px', fontFamily: 'monospace', letterSpacing: '0.05em' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: AI Configuration */}
                    <div className="setting-content-card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ background: 'rgba(147, 51, 234, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#9333ea' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /></svg>
                            </div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>AI Configuration</h3>
                        </div>

                        <div className="setting-form-group">
                            <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Gemini API Key</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="setting-form-input"
                                    type="password"
                                    name="gemini_api_key"
                                    value={settings.gemini_api_key ? (settings.gemini_api_key === '••••••••••••••••' ? '••••••••••••••••' : settings.gemini_api_key.includes('AIza') ? '••••••••••••••••' : settings.gemini_api_key) : ''}
                                    onChange={handleChange}
                                    placeholder="Enter new API key to update..."
                                    style={{ height: '48px', fontFamily: 'monospace', letterSpacing: '0.05em', paddingRight: '120px' }}
                                    autoComplete="new-password"
                                />
                                <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.05)', padding: '4px 8px', borderRadius: '4px' }}>
                                    Encrypted
                                </div>
                            </div>
                            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Provide your Google Gemini API Key to enable the ASC Assistant chatbot. this key will be stored securely in your database.
                            </p>
                            <div style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                <span style={{ fontSize: '1rem' }}>🛡️</span>
                                <strong>Rate Limit Active:</strong> 5 requests / minute
                            </div>
                        </div>

                        <div className="setting-form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                            <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Restricted Access (Optional)</label>
                            <input
                                className="setting-form-input"
                                type="email"
                                name="ai_allowed_email"
                                value={settings.ai_allowed_email || ''}
                                onChange={handleChange}
                                placeholder="Enter specific user email (e.g., admin@hospital.com)"
                                style={{ height: '48px' }}
                            />
                            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                If entered, <strong>ONLY</strong> this user will be able to use the AI features. Leave empty to allow all registered users.
                            </p>
                        </div>
                    </div>

                    {/* Section 4: Financial Logic */}
                    <div className="setting-content-card" style={{ padding: '2rem', border: '2px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ background: 'rgba(234, 88, 12, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#ea580c' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                            </div>
                            <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>Financial Configurations</h3>
                        </div>

                        <label style={{ display: 'flex', gap: '1rem', cursor: 'pointer', padding: '1rem', borderRadius: '12px', transition: 'background 0.2s', background: settings.apply_medicare_mppr ? '#fffbeb' : 'transparent', border: settings.apply_medicare_mppr ? '1px solid #fcd34d' : '1px solid transparent' }}>
                            <div style={{ position: 'relative', width: '48px', height: '28px', flexShrink: 0 }}>
                                <input
                                    type="checkbox"
                                    name="apply_medicare_mppr"
                                    checked={settings.apply_medicare_mppr || false}
                                    onChange={handleChange}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <div style={{
                                    position: 'absolute',
                                    top: 0, left: 0, right: 0, bottom: 0,
                                    background: settings.apply_medicare_mppr ? '#10b981' : '#cbd5e1',
                                    borderRadius: '34px',
                                    transition: '0.3s'
                                }}></div>
                                <div style={{
                                    position: 'absolute',
                                    content: '""',
                                    height: '20px',
                                    width: '20px',
                                    left: settings.apply_medicare_mppr ? '24px' : '4px',
                                    bottom: '4px',
                                    backgroundColor: 'white',
                                    borderRadius: '50%',
                                    transition: '0.3s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}></div>
                            </div>
                            <div>
                                <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
                                    Apply Medicare MPPR Rule
                                </strong>
                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                                    Automatically reduce reimbursement by 50% for secondary procedures on the same claim.
                                </div>
                                {settings.apply_medicare_mppr && (
                                    <div style={{ fontSize: '0.8rem', color: '#b45309', background: '#fffbeb', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'inline-block' }}>
                                        ✅ MPPR Active: Secondary procedures will be billed at 50%.
                                    </div>
                                )}
                            </div>
                        </label>
                    </div>

                    {/* Section 5: Theme Configurations */}
                    <div className="setting-content-card" style={{ padding: '2rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem', borderRadius: '8px', color: '#2563eb' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>
                                </div>
                                <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0 }}>Theme Configurations</h3>
                            </div>
                            <button
                                type="button"
                                onClick={resetThemeDefaults}
                                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                Restore Defaults
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            {/* Light Mode Colors */}
                            <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Light Mode Settings</h4>
                                <div className="setting-form-group">
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Sidebar Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="light_sidebar_color"
                                            value={settings.light_sidebar_color || '#112238'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.light_sidebar_color || '#112238'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Main Panel Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="light_bg_color"
                                            value={settings.light_bg_color || '#f8fafc'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.light_bg_color || '#f8fafc'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Portal (Card) Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="light_portal_color"
                                            value={settings.light_portal_color || '#ffffff'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.light_portal_color || '#ffffff'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Text Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="light_text_color"
                                            value={settings.light_text_color || '#0f172a'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.light_text_color || '#0f172a'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Label Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="light_label_color"
                                            value={settings.light_label_color || '#334155'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.light_label_color || '#334155'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dark Mode Colors */}
                            <div style={{ background: 'var(--bg-main)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>Dark Mode Settings</h4>
                                <div className="setting-form-group">
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Sidebar Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="dark_sidebar_color"
                                            value={settings.dark_sidebar_color || '#0F2036'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.dark_sidebar_color || '#0F2036'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Main Panel Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="dark_bg_color"
                                            value={settings.dark_bg_color || '#142842'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.dark_bg_color || '#142842'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Portal (Card) Background Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="dark_portal_color"
                                            value={settings.dark_portal_color || '#1E3A5F'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.dark_portal_color || '#1E3A5F'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Text Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="dark_text_color"
                                            value={settings.dark_text_color || '#f8fafc'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.dark_text_color || '#f8fafc'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                                <div className="setting-form-group" style={{ marginTop: '1rem' }}>
                                    <label style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Label Color</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="color"
                                            name="dark_label_color"
                                            value={settings.dark_label_color || '#cbd5e1'}
                                            onChange={handleChange}
                                            style={{ width: '48px', height: '48px', padding: '0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                        />
                                        <input
                                            className="setting-form-input"
                                            type="text"
                                            value={settings.dark_label_color || '#cbd5e1'}
                                            disabled
                                            style={{ height: '48px', fontFamily: 'monospace' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 6: Database Management & Backup */}
                    <div className="setting-content-card" style={{ padding: '2rem', border: '1px solid rgba(16, 185, 129, 0.35)', background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.04) 0%, rgba(16, 185, 129, 0.01) 100%)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '0.5rem', borderRadius: '8px', color: '#10b981' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                                    </svg>
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '1.125rem', color: 'var(--text-primary)', margin: 0, fontWeight: '700' }}>Full Database Backup (.sql)</h3>
                                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        Export entire database tables, schemas, constraints, sequences, and records
                                    </p>
                                </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.35rem 0.75rem', borderRadius: '9999px', border: '1px solid rgba(16, 185, 129, 0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                PostgreSQL & Supabase Ready
                            </span>
                        </div>

                        <div style={{ marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                            Clicking the button below will query all database tables and generate a comprehensive, downloadable <code>.sql</code> backup script. This file includes full table structures (DDL), auto-increment sequence resets, and batch <code>INSERT</code> statements for all records.
                        </div>

                        <div style={{ background: 'var(--bg-main)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.625rem' }}>
                                Tables Included in Backup ({BACKUP_TABLES.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {BACKUP_TABLES.map(t => (
                                    <span key={t.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
                                        {t.name}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>🔒</span>
                                <span>Safe operation: Read-only export; will not alter existing database records.</span>
                            </div>
                            <button
                                type="button"
                                onClick={handleDownloadBackup}
                                disabled={exportingBackup}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.625rem',
                                    padding: '0.875rem 2rem',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: exportingBackup ? '#065f46' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: '#ffffff',
                                    cursor: exportingBackup ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    opacity: exportingBackup ? 0.7 : 1
                                }}
                            >
                                <span style={{ fontSize: '1.2rem' }}>{exportingBackup ? '⏳' : '📥'}</span>
                                {exportingBackup ? 'Generating SQL Backup...' : 'Download Database Backup (.sql)'}
                            </button>
                        </div>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default Settings;
