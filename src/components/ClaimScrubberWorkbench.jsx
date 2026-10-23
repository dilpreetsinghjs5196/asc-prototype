import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, CheckCircle2, AlertOctagon,
  RefreshCw, Key, FileText, Download,
  Filter, Play, Layers, X
} from 'lucide-react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';

export default function ClaimScrubberWorkbench({ activeFacility, onSelectSurgery: _onSelectSurgery }) {
  const [claims, setClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimLines, setClaimLines] = useState([]);
  const [findings, setFindings] = useState([]);
  const [proposedEdits, setProposedEdits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [userPerms, setUserPerms] = useState([]);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [ediModalOpen, setEdiModalOpen] = useState(false);
  const [ediContent, setEdiContent] = useState('');

  const targetFacilityId = activeFacility?.id || db.getActiveFacility()?.id;

  const loadPermissions = useCallback(async () => {
    try {
      const perms = await rbacService.getPermissionsForUser(targetFacilityId);
      setUserPerms(perms || []);
    } catch (err) {
      console.warn('Failed to load user permissions:', err);
    }
  }, [targetFacilityId]);

  const loadClaimsList = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const options = statusFilter !== 'ALL' ? { status: statusFilter } : {};
      const data = await db.getClaims(targetFacilityId, options);
      setClaims(data || []);
      if (data && data.length > 0 && !selectedClaim) {
        setSelectedClaim(data[0]);
      }
    } catch (err) {
      console.error('Failed to load claims list:', err);
      setActionError('Error loading claims: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [targetFacilityId, statusFilter, selectedClaim]);

  const loadClaimDetails = useCallback(async (claimId) => {
    if (!claimId) return;
    try {
      const lines = await db.getClaimLines(claimId);
      setClaimLines(lines || []);

      const fList = await db.getClaimScrubFindings(claimId);
      setFindings(fList || []);

      const eList = await db.getClaimScrubEdits(claimId);
      setProposedEdits(eList || []);
    } catch (err) {
      console.error('Failed to load claim details:', err);
      setActionError('Error loading claim details: ' + err.message);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
    loadClaimsList();
  }, [loadPermissions, loadClaimsList]);

  useEffect(() => {
    if (selectedClaim?.id) {
      loadClaimDetails(selectedClaim.id);
    }
  }, [selectedClaim?.id, loadClaimDetails]);

  const handleRunScrub = async () => {
    if (!selectedClaim?.id) return;
    setScrubbing(true);
    setActionError('');
    setActionSuccess('');
    try {
      const result = await db.scrubClaim(selectedClaim.id);
      setActionSuccess(`Claim scrub completed: ${result.status} with ${result.fatal_errors_count} fatal error(s).`);
      await loadClaimDetails(selectedClaim.id);
      const updatedClaim = await db.getClaimById(selectedClaim.id);
      setSelectedClaim(updatedClaim);
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? updatedClaim : c));
    } catch (err) {
      console.error('Error scrubbing claim:', err);
      setActionError('Scrubbing failed: ' + err.message);
    } finally {
      setScrubbing(false);
    }
  };

  const handleApplyEdit = async (editId) => {
    setActionError('');
    setActionSuccess('');
    try {
      await db.applyClaimEdit(editId);
      setActionSuccess('Proposed edit successfully applied and claim re-scrubbed.');
      await loadClaimDetails(selectedClaim.id);
      const updatedClaim = await db.getClaimById(selectedClaim.id);
      setSelectedClaim(updatedClaim);
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? updatedClaim : c));
    } catch (err) {
      console.error('Error applying edit:', err);
      setActionError('Failed to apply edit: ' + err.message);
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
      setActionError('Override justification is required.');
      return;
    }
    try {
      await db.overrideClaimFinding(selectedFinding.id, overrideReason);
      setOverrideModalOpen(false);
      setActionSuccess('Scrubbing blocker override recorded.');
      await loadClaimDetails(selectedClaim.id);
      const updatedClaim = await db.getClaimById(selectedClaim.id);
      setSelectedClaim(updatedClaim);
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? updatedClaim : c));
    } catch (err) {
      console.error('Error submitting override:', err);
      setActionError('Failed to override finding: ' + err.message);
    }
  };

  const handleApproveClaim = async () => {
    if (!selectedClaim?.id) return;
    setActionError('');
    setActionSuccess('');
    try {
      const res = await db.approveCleanClaim(selectedClaim.id);
      if (!res.success) {
        setActionError(res.error || 'Approval failed.');
        return;
      }
      setActionSuccess('Claim approved and locked. Ready for clearinghouse transmission.');
      const updatedClaim = await db.getClaimById(selectedClaim.id);
      setSelectedClaim(updatedClaim);
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? updatedClaim : c));
    } catch (err) {
      console.error('Error approving claim:', err);
      setActionError('Approval error: ' + err.message);
    }
  };

  const handleExportEDI = async () => {
    if (!selectedClaim?.id) return;
    try {
      const ediRes = await db.exportClaimEDI(selectedClaim.id);
      setEdiContent(ediRes.edi_content);
      setEdiModalOpen(true);
    } catch (err) {
      console.error('Error generating EDI:', err);
      setActionError('EDI Export failed: ' + err.message);
    }
  };

  const canApplyEdits = rbacService.hasPermission(userPerms, 'claims.apply_edits');
  const canOverride = rbacService.hasPermission(userPerms, 'claims.override_error');
  const canApprove = rbacService.hasPermission(userPerms, 'claims.approve_claim');

  const fatalFindings = findings.filter(f => f.severity === 'FATAL' && !f.is_overridden);

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'SCRUB_PASSED':
      case 'READY_FOR_SUBMISSION':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.4)' };
      case 'SCRUB_FAILED':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.4)' };
      case 'OVERRIDDEN':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' };
      default:
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' };
    }
  };

  return (
    <div style={{ padding: '24px', color: 'var(--text-primary, #f8fafc)' }}>
      {/* Page Title & Stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={26} style={{ color: '#38bdf8' }} />
            Pre-Bill Claim Scrubber & EDI Workbench
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>
            Deterministic line-level claim scrubbing, HIPAA 5010 837P syntax validation, and NCCI PTP edits
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadClaimsList}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color, #334155)',
              color: '#f8fafc', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh Queue
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionError && (
        <div style={{
          padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <AlertOctagon size={16} />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div style={{
          padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '8px', color: '#34d399', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Grid: Left Claim List, Right Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', minHeight: '650px' }}>
        
        {/* Left Column: Claims Worklist */}
        <div style={{
          backgroundColor: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, #334155)',
          borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color, #334155)', backgroundColor: 'var(--bg-app, #0f172a)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f8fafc' }}>Claims Queue ({claims.length})</span>
              <Filter size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'SCRUB_FAILED', 'SCRUB_PASSED', 'READY_FOR_SUBMISSION'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: statusFilter === st ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
                    color: statusFilter === st ? '#ffffff' : 'var(--text-muted, #94a3b8)'
                  }}
                >
                  {st.replace('SCRUB_', '')}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {claims.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted, #94a3b8)', fontSize: '0.8rem' }}>
                No claims match the selected filter.
              </div>
            ) : (
              claims.map(c => {
                const isSelected = selectedClaim?.id === c.id;
                const badge = getStatusBadgeStyle(c.scrub_status);
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClaim(c)}
                    style={{
                      padding: '12px 14px', borderRadius: '8px', marginBottom: '8px', cursor: 'pointer',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-color, #334155)',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#f8fafc', fontFamily: 'monospace' }}>
                        {c.patient_control_number}
                      </span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px',
                        backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}`
                      }}>
                        {c.scrub_status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '4px' }}>
                      Patient: <strong style={{ color: '#f8fafc' }}>{c.patients?.name || 'Patient'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                      <span style={{ color: '#60a5fa' }}>{c.payers?.name || 'Commercial Payer'}</span>
                      <span style={{ fontWeight: '700', color: '#34d399' }}>${parseFloat(c.total_gross_charge || 0).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Claim Inspector Workbench */}
        {selectedClaim ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Header Card */}
            <div style={{
              backgroundColor: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800' }}>
                      Claim {selectedClaim.patient_control_number}
                    </h3>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: '800', padding: '3px 8px', borderRadius: '4px',
                      ...getStatusBadgeStyle(selectedClaim.scrub_status)
                    }}>
                      {selectedClaim.scrub_status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
                    Encounter #{selectedClaim.surgery_id} • Payer: {selectedClaim.payers?.name || 'Commercial Payer'} ({selectedClaim.payers?.payer_code || '00100'}) • Place of Service: {selectedClaim.place_of_service}
                  </div>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleRunScrub}
                    disabled={scrubbing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                      backgroundColor: '#3b82f6', border: 'none', color: '#ffffff', cursor: scrubbing ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem', fontWeight: '700'
                    }}
                  >
                    <Play size={14} className={scrubbing ? 'animate-spin' : ''} />
                    {scrubbing ? 'Scrubbing...' : 'Re-Scrub Claim'}
                  </button>
                  <button
                    onClick={handleExportEDI}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color, #334155)',
                      color: '#f8fafc', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'
                    }}
                  >
                    <Download size={14} />
                    EDI 837P Preview
                  </button>
                  {canApprove && (
                    <button
                      onClick={handleApproveClaim}
                      disabled={fatalFindings.length > 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px',
                        backgroundColor: fatalFindings.length === 0 ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                        border: fatalFindings.length === 0 ? '1px solid #10b981' : '1px solid var(--border-color, #334155)',
                        color: fatalFindings.length === 0 ? '#ffffff' : 'var(--text-muted, #64748b)',
                        cursor: fatalFindings.length === 0 ? 'pointer' : 'not-allowed',
                        fontSize: '0.8rem', fontWeight: '700'
                      }}
                    >
                      <CheckCircle2 size={14} />
                      Approve & Release
                    </button>
                  )}
                </div>
              </div>

              {/* EDI Header Summary Matrix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color, #334155)' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Billing NPI</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: '#f8fafc' }}>
                    {selectedClaim.billing_provider_npi || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Rendering NPI</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: '#f8fafc' }}>
                    {selectedClaim.rendering_provider_npi || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Federal EIN</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: '#f8fafc' }}>
                    {selectedClaim.billing_provider_tax_id || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Gross Charge</span>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#34d399' }}>
                    ${parseFloat(selectedClaim.total_gross_charge || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)', textTransform: 'uppercase' }}>Fatal Errors</span>
                  <div style={{ fontWeight: '800', fontSize: '0.85rem', color: fatalFindings.length > 0 ? '#f87171' : '#34d399' }}>
                    {fatalFindings.length} active
                  </div>
                </div>
              </div>
            </div>

            {/* Proposed Automated Edits Alert */}
            {proposedEdits.filter(e => e.status === 'PROPOSED').length > 0 && (
              <div style={{
                backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '12px', padding: '16px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#818cf8', fontWeight: '700', fontSize: '0.9rem' }}>
                  <Layers size={18} />
                  Proposed Automated Claim Edits ({proposedEdits.filter(e => e.status === 'PROPOSED').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {proposedEdits.filter(e => e.status === 'PROPOSED').map(edit => (
                    <div key={edit.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '10px 14px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.8rem' }}>
                        <strong style={{ color: '#c084fc' }}>{edit.rule_id}:</strong> {edit.target_field} &rarr; <span style={{ color: '#34d399' }}>{edit.proposed_value}</span>
                      </div>
                      {canApplyEdits && (
                        <button
                          onClick={() => handleApplyEdit(edit.id)}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', backgroundColor: '#6366f1', border: 'none',
                            color: '#ffffff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer'
                          }}
                        >
                          Apply Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Claim Lines Table */}
            <div style={{
              backgroundColor: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={16} style={{ color: '#60a5fa' }} />
                Itemized Service Lines ({claimLines.length})
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #334155)', color: 'var(--text-muted, #94a3b8)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Line</th>
                    <th style={{ padding: '8px 10px' }}>CPT Code</th>
                    <th style={{ padding: '8px 10px' }}>Description</th>
                    <th style={{ padding: '8px 10px' }}>Modifiers</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Units</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Charge</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Expected</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Diag</th>
                  </tr>
                </thead>
                <tbody>
                  {claimLines.map(line => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border-color, #334155)' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '700' }}>#{line.line_number}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#60a5fa', fontWeight: '700' }}>{line.cpt_code}</td>
                      <td style={{ padding: '10px', color: '#f8fafc' }}>{line.procedure_description || 'Procedure'}</td>
                      <td style={{ padding: '10px' }}>
                        {line.modifiers && line.modifiers.length > 0 ? (
                          line.modifiers.map(m => (
                            <span key={m} style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 5px', borderRadius: '4px', fontSize: '0.7rem', marginRight: '4px' }}>
                              {m}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted, #64748b)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{line.units}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>${parseFloat(line.gross_charge || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', color: '#34d399', fontWeight: '700' }}>
                        ${parseFloat(line.expected_reimbursement || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>{line.diagnosis_pointers?.join(',') || 'A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Findings Section */}
            <div style={{
              backgroundColor: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, #334155)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} style={{ color: '#f87171' }} />
                Scrubbing Findings & Compliance Errors ({findings.length})
              </h4>
              {findings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px' }}>
                  <CheckCircle2 size={32} style={{ color: '#34d399', margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: '700', color: '#34d399' }}>Clean Claim Validated</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                    Zero fatal errors or unbundling violations found.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {findings.map(f => {
                    const isFatal = f.severity === 'FATAL';
                    return (
                      <div
                        key={f.id}
                        style={{
                          padding: '12px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                          backgroundColor: f.is_overridden ? 'rgba(168, 85, 247, 0.06)' : isFatal ? 'rgba(239, 68, 68, 0.06)' : 'rgba(245, 158, 11, 0.06)',
                          border: `1px solid ${f.is_overridden ? 'rgba(168, 85, 247, 0.3)' : isFatal ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                              {f.rule_id}
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', backgroundColor: isFatal ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: isFatal ? '#f87171' : '#fbbf24' }}>
                              {f.severity}
                            </span>
                            {f.edi_loop_reference && (
                              <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>EDI: {f.edi_loop_reference}</span>
                            )}
                            {f.is_overridden && (
                              <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '2px 6px', borderRadius: '4px' }}>
                                OVERRIDDEN
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', fontWeight: '600', color: '#f8fafc' }}>{f.finding_message}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>{f.remediation_guidance}</div>
                          {f.is_overridden && (
                            <div style={{ fontSize: '0.75rem', color: '#c084fc', fontStyle: 'italic', marginTop: '4px' }}>
                              Justification: "{f.override_reason}"
                            </div>
                          )}
                        </div>

                        {isFatal && !f.is_overridden && canOverride && (
                          <button
                            onClick={() => handleOpenOverride(f)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px',
                              backgroundColor: 'rgba(168, 85, 247, 0.2)', border: '1px solid rgba(168, 85, 247, 0.4)',
                              color: '#c084fc', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer'
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

          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-card, #1e293b)', borderRadius: '12px', border: '1px solid var(--border-color, #334155)', color: 'var(--text-muted, #94a3b8)' }}>
            Select a claim from the queue to inspect service lines and run scrubbing rules.
          </div>
        )}
      </div>

      {/* Override Dialog Modal */}
      {overrideModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 11, 24, 0.85)', backdropFilter: 'blur(6px)', zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setOverrideModalOpen(false)}>
          <div style={{
            width: '500px', maxWidth: '95vw', backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid rgba(168, 85, 247, 0.4)', borderRadius: '12px', padding: '22px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} /> Override Claim Scrub Blocker
              </div>
              <button onClick={() => setOverrideModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#c084fc', backgroundColor: 'rgba(168, 85, 247, 0.1)', padding: '10px 12px', borderRadius: '6px', marginBottom: '14px' }}>
              <strong>{selectedFinding?.rule_id}:</strong> {selectedFinding?.finding_message}
            </div>

            <form onSubmit={handleSubmitOverride}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px' }}>
                Mandatory Clinical / Payer Justification:
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Document payer agreement, emergency authorization, or director override..."
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color, #334155)', color: '#f8fafc', fontSize: '0.85rem', boxSizing: 'border-box'
                }}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button type="button" onClick={() => setOverrideModalOpen(false)} style={{ padding: '6px 14px', borderRadius: '6px', backgroundColor: 'transparent', border: '1px solid var(--border-color, #334155)', color: '#94a3b8', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: '#8b5cf6', border: 'none', color: '#ffffff', fontWeight: '700', cursor: 'pointer' }}>
                  Commit Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDI 837P Preview Modal */}
      {ediModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 11, 24, 0.85)', backdropFilter: 'blur(6px)', zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setEdiModalOpen(false)}>
          <div style={{
            width: '750px', maxWidth: '95vw', maxHeight: '85vh', backgroundColor: 'var(--bg-card, #1e293b)',
            border: '1px solid var(--border-color, #334155)', borderRadius: '12px', padding: '22px', display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={18} /> HIPAA 5010 837P EDI Stream Preview
              </div>
              <button onClick={() => setEdiModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <textarea
              readOnly
              value={ediContent}
              style={{
                flex: 1, minHeight: '350px', fontFamily: 'monospace', fontSize: '0.8rem', padding: '12px',
                borderRadius: '8px', backgroundColor: 'rgba(0, 0, 0, 0.5)', border: '1px solid var(--border-color, #334155)',
                color: '#34d399', resize: 'none', outline: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(ediContent);
                  setActionSuccess('EDI 837P stream copied to clipboard.');
                  setEdiModalOpen(false);
                }}
                style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: '#3b82f6', border: 'none', color: '#ffffff', fontWeight: '700', cursor: 'pointer' }}
              >
                Copy EDI Content
              </button>
              <button onClick={() => setEdiModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border-color, #334155)', color: '#f8fafc', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
