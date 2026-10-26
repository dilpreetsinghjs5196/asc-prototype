import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, AlertOctagon, ShieldAlert, 
  FileText, Cpu, DollarSign, Check, RefreshCw, Key
} from 'lucide-react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';

export default function PrebillCompletenessModal({ isOpen, onClose, surgery, onSignoffComplete }) {
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [runData, setRunData] = useState(null);
  const [findings, setFindings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [userPerms, setUserPerms] = useState([]);
  const [activeTab, setActiveTab] = useState('findings'); // 'findings' | 'devices'

  const loadPermissions = useCallback(async () => {
    try {
      const perms = await rbacService.getPermissionsForUser(surgery?.facility_id);
      setUserPerms(perms || []);
    } catch (err) {
      console.warn('Failed to fetch user permissions:', err);
    }
  }, [surgery?.facility_id]);

  const loadAuditData = useCallback(async () => {
    if (!surgery?.id) return;
    setLoading(true);
    setActionError('');
    try {
      // 1. Fetch devices
      const devList = await db.getCaseDevices(surgery.id);
      setDevices(devList || []);

      // 2. Fetch latest completeness run
      let run = await db.getLatestCompletenessRun(surgery.id);
      if (!run) {
        // Run evaluation if none exists
        run = await db.evaluateChargeCompleteness(surgery.id);
      }
      setRunData(run);

      if (run?.id || run?.run_id) {
        const fList = await db.getCompletenessFindings(run.id || run.run_id);
        setFindings(fList || []);
      }
    } catch (err) {
      console.error('Error loading completeness audit:', err);
      setActionError('Failed to load charge completeness findings: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [surgery?.id]);

  useEffect(() => {
    if (isOpen && surgery?.id) {
      loadAuditData();
      loadPermissions();
    }
  }, [isOpen, surgery?.id, loadAuditData, loadPermissions]);

  const handleReevaluate = async () => {
    if (!surgery?.id) return;
    setEvaluating(true);
    setActionError('');
    try {
      const res = await db.evaluateChargeCompleteness(surgery.id);
      setRunData(res);
      if (res?.run_id || res?.id) {
        const fList = await db.getCompletenessFindings(res.run_id || res.id);
        setFindings(fList || []);
      }
      const devList = await db.getCaseDevices(surgery.id);
      setDevices(devList || []);
    } catch (err) {
      console.error('Error running completeness evaluation:', err);
      setActionError('Evaluation failed: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleOpenOverride = (finding) => {
    setSelectedFinding(finding);
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  const handleSubmitOverride = async (e) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setActionError('Override justification is mandatory.');
      return;
    }
    try {
      const session = db.getSession();
      await db.overrideCompletenessFinding(selectedFinding.id, overrideReason, session?.user?.id);
      setOverrideModalOpen(false);
      await loadAuditData();
    } catch (err) {
      setActionError('Failed to save override: ' + err.message);
    }
  };

  const handleSignoff = async () => {
    if (!canSignoff) return;
    try {
      const session = db.getSession();
      await db.clearCompletenessRun(runData.id || runData.run_id, 'Signed off in pre-bill completeness review', session?.user?.id);
      if (onSignoffComplete) onSignoffComplete(surgery.id);
      onClose();
    } catch (err) {
      setActionError('Sign-off failed: ' + err.message);
    }
  };

  if (!isOpen || !surgery) return null;

  const canOverride = rbacService.hasPermission(userPerms, 'billing.override_blocker');
  const canSignoff = rbacService.hasPermission(userPerms, 'billing.signoff_prebill') && 
                     (runData?.blockers_count === 0 || runData?.blocker_count === 0 || runData?.is_cleared || runData?.clearance_status === 'CLEARED');

  const status = (runData?.clearance_status || runData?.overall_status || 'evaluating').toUpperCase();
  const isStatusCleared = status === 'CLEARED' || status === 'CLEAN';
  const isStatusBlocked = status === 'BLOCKED';
  const isStatusOverridden = status === 'OVERRIDDEN';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 11, 24, 0.8)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '920px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-primary, #f8fafc)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-app, #0f172a)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              padding: '10px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '10px',
              color: '#60a5fa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldAlert size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary, #f8fafc)' }}>
                  Pre-Bill Charge Completeness Review
                </h2>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  fontWeight: '700',
                  letterSpacing: '0.5px',
                  backgroundColor: isStatusCleared ? 'rgba(16, 185, 129, 0.15)' :
                                   isStatusBlocked ? 'rgba(239, 68, 68, 0.15)' :
                                   isStatusOverridden ? 'rgba(168, 85, 247, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: isStatusCleared ? '#34d399' :
                         isStatusBlocked ? '#f87171' :
                         isStatusOverridden ? '#c084fc' : '#fbbf24',
                  border: `1px solid ${
                    isStatusCleared ? 'rgba(16, 185, 129, 0.4)' :
                    isStatusBlocked ? 'rgba(239, 68, 68, 0.4)' :
                    isStatusOverridden ? 'rgba(168, 85, 247, 0.4)' : 'rgba(245, 158, 11, 0.4)'
                  }`
                }}>
                  {status}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
                Case #{surgery.id} • Patient: {surgery.patient_name || `Patient #${surgery.patient_id || 'N/A'}`} • DOS: {surgery.date || 'Scheduled'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleReevaluate}
              disabled={evaluating}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-color, #cbd5e1)',
                color: 'var(--text-primary, #0f172a)',
                cursor: evaluating ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600'
              }}
              title="Rerun Completeness Engine"
            >
              <RefreshCw size={14} className={evaluating ? 'animate-spin' : ''} />
              {evaluating ? 'Auditing...' : 'Re-evaluate'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #64748b)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div style={{
            margin: '16px 24px 0',
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{actionError}</span>
          </div>
        )}

        {/* Metric Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px',
          padding: '20px 24px 10px'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-subtab, rgba(0, 0, 0, 0.02))',
            border: '1px solid var(--border-color, #cbd5e1)',
            padding: '14px 16px',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', fontWeight: '600', textTransform: 'uppercase' }}>
              Total Rules
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary, #0f172a)' }}>
              {runData?.total_rules_evaluated || runData?.total_findings || 12}
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            padding: '14px 16px',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: '600', textTransform: 'uppercase' }}>
              Active Blockers
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '4px', color: '#f87171' }}>
              {runData?.blockers_count ?? runData?.blocker_count ?? 0}
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            padding: '14px 16px',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: '600', textTransform: 'uppercase' }}>
              Warnings
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '4px', color: '#fbbf24' }}>
              {runData?.warnings_count ?? runData?.warning_count ?? 0}
            </div>
          </div>

          <div style={{
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '14px 16px',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: '600', textTransform: 'uppercase' }}>
              Itemized Devices
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', marginTop: '4px', color: '#60a5fa' }}>
              {devices.length}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '10px 24px 0',
          borderBottom: '1px solid var(--border-color, #334155)'
        }}>
          <button
            onClick={() => setActiveTab('findings')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'findings' ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === 'findings' ? '#60a5fa' : 'var(--text-muted, #94a3b8)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FileText size={16} />
            Pre-Bill Completeness Findings ({findings.length})
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'devices' ? '2px solid #10b981' : '2px solid transparent',
              color: activeTab === 'devices' ? '#34d399' : 'var(--text-muted, #94a3b8)',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Cpu size={16} />
            Itemized Case Devices & Implants ({devices.length})
          </button>
        </div>

        {/* Content Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px'
        }}>
          {activeTab === 'findings' && (
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted, #94a3b8)' }}>
                  Loading pre-bill audit findings...
                </div>
              ) : findings.length === 0 ? (
                <div style={{
                  padding: '30px',
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  textAlign: 'center'
                }}>
                  <CheckCircle2 size={36} style={{ color: '#34d399', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '1rem', fontWeight: '700', color: '#34d399' }}>
                    All Charge Completeness Criteria Satisfied
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
                    This surgical encounter has 0 active blockers and is cleared for claims submission.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {findings.map((f) => {
                    const isBlocker = f.severity === 'BLOCKER' || f.severity === 'ERROR';
                    return (
                      <div
                        key={f.id}
                        style={{
                          padding: '14px 18px',
                          borderRadius: '10px',
                          backgroundColor: f.is_overridden ? 'rgba(168, 85, 247, 0.06)' :
                                           isBlocker ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)',
                          border: `1px solid ${
                            f.is_overridden ? 'rgba(168, 85, 247, 0.3)' :
                            isBlocker ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                          }`,
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '16px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ marginTop: '2px' }}>
                            {f.is_overridden ? (
                              <Check size={18} style={{ color: '#c084fc' }} />
                            ) : isBlocker ? (
                              <AlertOctagon size={18} style={{ color: '#f87171' }} />
                            ) : (
                              <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: isBlocker ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: isBlocker ? 'var(--danger-color, #ef4444)' : 'var(--warning-color, #f59e0b)'
                              }}>
                                {f.rule_code || f.rule_id}
                              </span>
                              <span style={{
                                fontSize: '0.65rem',
                                fontWeight: '800',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                backgroundColor: isBlocker ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                color: isBlocker ? '#ef4444' : '#f59e0b'
                              }}>
                                {f.severity}
                              </span>
                              {f.is_overridden && (
                                <span style={{
                                  fontSize: '0.65rem',
                                  fontWeight: '800',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(168, 85, 247, 0.2)',
                                  color: 'var(--color-purple, #8b5cf6)'
                                }}>
                                  OVERRIDDEN
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary, #0f172a)', marginTop: '6px' }}>
                              {f.description || f.finding_message}
                            </div>
                            {f.affected_entity && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '3px' }}>
                                Affected: <span style={{ color: 'var(--color-blue, #2563eb)' }}>{f.affected_entity}</span>
                              </div>
                            )}
                            {f.is_overridden && f.override_reason && (
                              <div style={{
                                marginTop: '8px',
                                fontSize: '0.75rem',
                                fontStyle: 'italic',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(168, 85, 247, 0.12)',
                                border: '1px solid rgba(168, 85, 247, 0.3)',
                                color: 'var(--color-purple, #8b5cf6)'
                              }}>
                                Override Justification: "{f.override_reason}"
                              </div>
                            )}
                          </div>
                        </div>

                        {isBlocker && !f.is_overridden && canOverride && (
                          <button
                            onClick={() => handleOpenOverride(f)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(168, 85, 247, 0.15)',
                              border: '1px solid rgba(168, 85, 247, 0.35)',
                              color: 'var(--color-purple, #8b5cf6)',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              flexShrink: 0
                            }}
                          >
                            <Key size={12} />
                            Override
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'devices' && (
            <div>
              {devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted, #94a3b8)' }}>
                  <Cpu size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                  <p style={{ margin: 0 }}>No itemized devices or implants recorded for this case.</p>
                </div>
              ) : (
                <div style={{
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-muted, #94a3b8)', borderBottom: '1px solid var(--border-color, #334155)' }}>
                        <th style={{ padding: '10px 14px' }}>Device Name</th>
                        <th style={{ padding: '10px 14px' }}>HCPCS C-Code</th>
                        <th style={{ padding: '10px 14px' }}>Manufacturer</th>
                        <th style={{ padding: '10px 14px' }}>Serial / Lot</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Unit Cost</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Unit Charge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border-color, #cbd5e1)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text-primary, #0f172a)' }}>{d.device_name}</td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--color-blue, #2563eb)' }}>{d.hcpcs_c_code || d.hcpcs_code || '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary, #475569)' }}>{d.manufacturer || '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary, #475569)' }}>{d.serial_number || d.lot_number || '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>{d.quantity}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace' }}>${parseFloat(d.unit_cost || 0).toFixed(2)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#10b981' }}>
                            ${parseFloat(d.unit_charge || d.charge_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color, #cbd5e1)',
          backgroundColor: 'var(--bg-app, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
            <DollarSign size={14} />
            Statutory AMA CPT® & CMS ASC Addenda Compliant Pre-Bill Engine
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-card, #ffffff)',
                border: '1px solid var(--border-color, #cbd5e1)',
                color: 'var(--text-primary, #0f172a)',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
            <button
              onClick={handleSignoff}
              disabled={!canSignoff}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '8px',
                backgroundColor: canSignoff ? '#10b981' : 'var(--bg-toggle, #e2e8f0)',
                border: canSignoff ? '1px solid #10b981' : '1px solid var(--border-color, #cbd5e1)',
                color: canSignoff ? '#ffffff' : 'var(--text-muted, #64748b)',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: canSignoff ? 'pointer' : 'not-allowed',
                boxShadow: canSignoff ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none'
              }}
            >
              <CheckCircle2 size={16} />
              Sign-Off & Clear Claim
            </button>
          </div>
        </div>
      </div>

      {/* Override Dialog Sub-Modal */}
      {overrideModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setOverrideModalOpen(false)}
        >
          <div
            style={{
              width: '520px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-card, #ffffff)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: '14px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              padding: '24px',
              color: 'var(--text-primary, #0f172a)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', fontWeight: '700', color: 'var(--color-purple, #8b5cf6)' }}>
                <Key size={18} />
                Override Completeness Blocker
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #64748b)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: 'var(--color-purple, #8b5cf6)',
              marginBottom: '16px'
            }}>
              <strong>{selectedFinding?.rule_code || selectedFinding?.rule_id}:</strong> {selectedFinding?.description || selectedFinding?.finding_message}
            </div>

            <form onSubmit={handleSubmitOverride}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary, #0f172a)' }}>
                Mandatory Clinical / Billing Override Justification:
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Document authorized exception, clinical emergency, or payer carve-out justification..."
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-subtab, #f8fafc)',
                  border: '1px solid var(--border-color, #cbd5e1)',
                  color: 'var(--text-primary, #0f172a)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    border: '1px solid var(--border-color, #cbd5e1)',
                    color: 'var(--text-secondary, #334155)',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    backgroundColor: '#8b5cf6',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Commit Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
