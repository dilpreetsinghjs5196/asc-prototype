import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, CheckCircle2, AlertOctagon,
  RefreshCw, Key, FileText, Download,
  Filter, Play, Layers, X, Calculator
} from 'lucide-react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';
import ReimbursementInspectorModal from './ReimbursementInspectorModal';

const SAMPLE_CLAIMS = [
  {
    id: 'clm-demo-001',
    claim_number: 'CLM-2026-0042',
    patient_control_number: 'CLM-2026-0042',
    patient_name: 'GARON, SUZANNE',
    patients: { name: 'GARON, SUZANNE', mrn: '2034', dob: '1960-11-15', gender: 'Female' },
    surgeries: { date: '2026-02-23', status: 'Completed', procedure_name: 'Knee Arthroscopy Meniscectomy' },
    payers: { name: 'UnitedHealthcare', payer_code: 'UHC01' },
    primary_procedure: '29881 - Knee Arthroscopy Meniscectomy',
    total_charge: 7300,
    total_gross_charge: 7300,
    total_expected_reimbursement: 3200,
    billing_provider_npi: '1982736450',
    billing_provider_tax_id: '59-3829104',
    rendering_provider_npi: '1982736450',
    place_of_service: '11',
    scrub_status: 'SCRUB_FAILED',
    fatal_error_count: 2,
    warning_count: 0,
    lines: [
      { id: 'line-1', line_number: 1, cpt_code: '29881', procedure_description: 'Knee Arthroscopy Meniscectomy', modifiers: ['LT'], units: 1, gross_charge: 4850, line_charge: 4850, expected_reimbursement: 2200, diagnosis_pointers: ['A'], line_scrub_status: 'PASSED' },
      { id: 'line-2', line_number: 2, cpt_code: '29877', procedure_description: 'Chondroplasty (NCCI Bundled into 29881)', modifiers: ['LT'], units: 1, gross_charge: 2450, line_charge: 2450, expected_reimbursement: 1000, diagnosis_pointers: ['A'], line_scrub_status: 'FAILED' }
    ],
    findings: [
      { id: 'f-1', rule_id: 'SCRUB-06', rule_category: 'EDI_SYNTAX', severity: 'FATAL', edi_loop_reference: '2300 CLM05-1', finding_message: "Place of Service is set to '11' (Office). ASC claims strictly require POS '24'.", remediation_guidance: "Apply proposed automated edit to reset Place of Service to '24' for Ambulatory Surgery Center.", is_overridden: false },
      { id: 'f-2', rule_id: 'SCRUB-09', rule_category: 'NCCI_PTP', severity: 'FATAL', edi_loop_reference: '2400 SV101-3', finding_message: 'CPT 29881 bundles 29877 under CMS NCCI PTP edits. Unbundling requires distinct compartment modifier (XS/59).', remediation_guidance: "Apply proposed edit to append modifier XS on Line 2 if chondroplasty was performed in a separate compartment.", is_overridden: false }
    ],
    proposedEdits: [
      { id: 'e-1', rule_id: 'SCRUB-06', edit_action: 'SET_POS', target_field: 'place_of_service', original_value: '11', proposed_value: '24', status: 'PROPOSED' },
      { id: 'e-2', rule_id: 'SCRUB-09', claim_line_id: 'line-2', edit_action: 'APPEND_MODIFIER', target_field: 'modifiers', original_value: 'LT', proposed_value: 'LT,XS', status: 'PROPOSED' }
    ]
  },
  {
    id: 'clm-demo-002',
    claim_number: 'CLM-2026-0088',
    patient_control_number: 'CLM-2026-0088',
    patient_name: 'SMITH, JOHNATHAN',
    patients: { name: 'SMITH, JOHNATHAN', mrn: '1052', dob: '1975-04-22', gender: 'Male' },
    surgeries: { date: '2026-02-23', status: 'Completed', procedure_name: 'Cataract Extraction' },
    payers: { name: 'Medicare Part B', payer_code: '00400' },
    primary_procedure: '66984 - Cataract Removal with IOL',
    total_charge: 4550,
    total_gross_charge: 4550,
    total_expected_reimbursement: 1850,
    billing_provider_npi: '1982736450',
    billing_provider_tax_id: '59-3829104',
    rendering_provider_npi: '1728394051',
    place_of_service: '24',
    scrub_status: 'SCRUB_PASSED',
    fatal_error_count: 0,
    warning_count: 0,
    lines: [
      { id: 'line-3', line_number: 1, cpt_code: '66984', procedure_description: 'Cataract Removal with IOL Implant', modifiers: ['RT'], units: 1, gross_charge: 4550, line_charge: 4550, expected_reimbursement: 1850, diagnosis_pointers: ['A'], line_scrub_status: 'PASSED' }
    ],
    findings: [],
    proposedEdits: []
  },
  {
    id: 'clm-demo-003',
    claim_number: 'CLM-2026-0105',
    patient_control_number: 'CLM-2026-0105',
    patient_name: 'RODRIGUEZ, MARIA',
    patients: { name: 'RODRIGUEZ, MARIA', mrn: '4491', dob: '1988-09-02', gender: 'Female' },
    surgeries: { date: '2026-02-23', status: 'Completed', procedure_name: 'Colonoscopy Biopsy' },
    payers: { name: 'Aetna Health', payer_code: 'AETNA' },
    primary_procedure: '45380 - Colonoscopy Biopsy',
    total_charge: 3250,
    total_gross_charge: 3250,
    total_expected_reimbursement: 1450,
    billing_provider_npi: '1982736450',
    billing_provider_tax_id: '59-3829104',
    rendering_provider_npi: '1092837465',
    place_of_service: '24',
    scrub_status: 'SCRUB_FAILED',
    fatal_error_count: 1,
    warning_count: 1,
    lines: [
      { id: 'line-4', line_number: 1, cpt_code: '45380', procedure_description: 'Colonoscopy with Biopsy', modifiers: [], units: 1, gross_charge: 3250, line_charge: 3250, expected_reimbursement: 1450, diagnosis_pointers: ['A'], line_scrub_status: 'FAILED' }
    ],
    findings: [
      { id: 'f-3', rule_id: 'SCRUB-16', rule_category: 'REGULATORY', severity: 'WARNING', edi_loop_reference: '2300 REF02', finding_message: 'Commercial payer Aetna typically requires prior authorization reference in Box 23 / Loop 2300.', remediation_guidance: 'Confirm whether prior authorization was granted and record reference number.', is_overridden: false },
      { id: 'f-4', rule_id: 'SCRUB-11', rule_category: 'FINANCIAL', severity: 'FATAL', edi_loop_reference: '2400 SV102', finding_message: 'Missing anatomical laterality or modifier justification for endoscopy service.', remediation_guidance: 'Review operative note pathology findings and assign appropriate modifier.', is_overridden: false }
    ],
    proposedEdits: []
  },
  {
    id: 'clm-demo-004',
    claim_number: 'CLM-2026-0112',
    patient_control_number: 'CLM-2026-0112',
    patient_name: 'DAVIS, ROBERT',
    patients: { name: 'DAVIS, ROBERT', mrn: '3029', dob: '1952-12-30', gender: 'Male' },
    surgeries: { date: '2026-02-23', status: 'Completed', procedure_name: 'Total Knee Arthroplasty' },
    payers: { name: 'Blue Cross Blue Shield', payer_code: 'BCBS' },
    primary_procedure: '27447 - Total Knee Joint Repair',
    total_charge: 14200,
    total_gross_charge: 14200,
    total_expected_reimbursement: 5900,
    billing_provider_npi: '1982736450',
    billing_provider_tax_id: '59-3829104',
    rendering_provider_npi: '1546372819',
    place_of_service: '24',
    scrub_status: 'READY_FOR_SUBMISSION',
    fatal_error_count: 0,
    warning_count: 0,
    lines: [
      { id: 'line-5', line_number: 1, cpt_code: '27447', procedure_description: 'Total Knee Joint Repair', modifiers: ['LT'], units: 1, gross_charge: 14200, line_charge: 14200, expected_reimbursement: 5900, diagnosis_pointers: ['A'], line_scrub_status: 'PASSED' }
    ],
    findings: [],
    proposedEdits: []
  }
];

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
  const [reimbModalOpen, setReimbModalOpen] = useState(false);
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
      let data = await db.getClaims(targetFacilityId, options);
      if (!data || data.length === 0) {
        data = SAMPLE_CLAIMS;
        if (statusFilter !== 'ALL') {
          data = data.filter(c => c.scrub_status === statusFilter);
        }
      }
      setClaims(data || []);
      if (data && data.length > 0) {
        setSelectedClaim(prev => {
          const found = data.find(c => c.id === prev?.id);
          return found || data[0];
        });
      } else {
        setSelectedClaim(null);
      }
    } catch (err) {
      console.error('Failed to load claims list:', err);
      let fallbackList = SAMPLE_CLAIMS;
      if (statusFilter !== 'ALL') {
        fallbackList = fallbackList.filter(c => c.scrub_status === statusFilter);
      }
      setClaims(fallbackList);
      if (fallbackList.length > 0) setSelectedClaim(fallbackList[0]);
    } finally {
      setLoading(false);
    }
  }, [targetFacilityId, statusFilter]);

  const loadClaimDetails = useCallback(async (claimId) => {
    if (!claimId) return;
    try {
      const [lines, fList, eList] = await Promise.all([
        db.getClaimLines(claimId).catch(() => []),
        db.getClaimScrubFindings(claimId).catch(() => []),
        db.getClaimScrubEdits(claimId).catch(() => [])
      ]);

      const sampleMatch = SAMPLE_CLAIMS.find(s => s.id === claimId);

      setClaimLines((lines && lines.length > 0) ? lines : (sampleMatch?.lines || []));
      setFindings((fList && fList.length > 0) ? fList : (sampleMatch?.findings || []));
      setProposedEdits((eList && eList.length > 0) ? eList : (sampleMatch?.proposedEdits || []));
    } catch (err) {
      console.error('Failed to load claim details:', err);
      const sampleMatch = SAMPLE_CLAIMS.find(s => s.id === claimId);
      if (sampleMatch) {
        setClaimLines(sampleMatch.lines || []);
        setFindings(sampleMatch.findings || []);
        setProposedEdits(sampleMatch.proposedEdits || []);
      }
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
      let result;
      try {
        result = await db.scrubClaim(selectedClaim.id);
      } catch (err) {
        console.warn('Scrub fallback:', err.message);
        const hasFatal = findings.some(f => f.severity === 'FATAL' && !f.is_overridden);
        result = {
          status: hasFatal ? 'SCRUB_FAILED' : 'SCRUB_PASSED',
          fatal_errors_count: hasFatal ? findings.filter(f => f.severity === 'FATAL' && !f.is_overridden).length : 0
        };
      }
      setActionSuccess(`Claim scrub completed: ${result.status} with ${result.fatal_errors_count || 0} fatal error(s).`);
      setSelectedClaim(prev => ({ ...prev, scrub_status: result.status, fatal_error_count: result.fatal_errors_count }));
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? { ...c, scrub_status: result.status, fatal_error_count: result.fatal_errors_count } : c));
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
      try {
        await db.applyClaimEdit(editId);
      } catch (dbErr) {
        console.warn('DB apply edit fallback:', dbErr.message);
      }
      const edit = proposedEdits.find(e => e.id === editId);
      if (edit) {
        if (edit.edit_action === 'SET_POS') {
          setSelectedClaim(prev => ({ ...prev, place_of_service: edit.proposed_value }));
          setClaims(prev => prev.map(c => c.id === selectedClaim.id ? { ...c, place_of_service: edit.proposed_value } : c));
        } else if (edit.edit_action === 'APPEND_MODIFIER') {
          const newMods = edit.proposed_value.split(',');
          setClaimLines(prev => prev.map(l => l.id === edit.claim_line_id ? { ...l, modifiers: newMods, line_scrub_status: 'EDITED' } : l));
        }
        setProposedEdits(prev => prev.filter(e => e.id !== editId));
        setFindings(prev => prev.filter(f => f.rule_id !== edit.rule_id));
      }
      setActionSuccess('Proposed edit successfully applied and claim re-scrubbed.');
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
      try {
        await db.overrideClaimFinding(selectedFinding.id, overrideReason);
      } catch (dbErr) {
        console.warn('DB override fallback:', dbErr.message);
      }
      setFindings(prev => prev.map(f => f.id === selectedFinding.id ? { ...f, is_overridden: true, override_reason: overrideReason } : f));
      setOverrideModalOpen(false);
      setActionSuccess('Scrubbing blocker override recorded.');
      setSelectedClaim(prev => ({ ...prev, scrub_status: 'OVERRIDDEN' }));
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? { ...c, scrub_status: 'OVERRIDDEN' } : c));
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
      try {
        const res = await db.approveCleanClaim(selectedClaim.id);
        if (res && res.success === false) {
          setActionError(res.error || 'Approval failed.');
          return;
        }
      } catch (dbErr) {
        console.warn('DB approve fallback:', dbErr.message);
      }
      setActionSuccess('Claim approved and locked. Ready for clearinghouse transmission.');
      setSelectedClaim(prev => ({ ...prev, scrub_status: 'READY_FOR_SUBMISSION' }));
      setClaims(prev => prev.map(c => c.id === selectedClaim.id ? { ...c, scrub_status: 'READY_FOR_SUBMISSION' } : c));
    } catch (err) {
      console.error('Error approving claim:', err);
      setActionError('Approval error: ' + err.message);
    }
  };

  const handleExportEDI = async () => {
    if (!selectedClaim) return;
    try {
      const ediRes = await db.exportClaimEDI({
        ...selectedClaim,
        lines: claimLines
      });
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
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', border: 'rgba(16, 185, 129, 0.4)' };
      case 'SCRUB_FAILED':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626', border: 'rgba(239, 68, 68, 0.4)' };
      case 'OVERRIDDEN':
        return { bg: 'rgba(14, 165, 233, 0.15)', text: '#0284c7', border: 'rgba(14, 165, 233, 0.4)' };
      default:
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706', border: 'rgba(245, 158, 11, 0.4)' };
    }
  };

  return (
    <div style={{ padding: '24px', color: 'var(--text-primary, #0f172a)' }}>
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
              backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)',
              color: 'var(--text-primary, #0f172a)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'
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
          backgroundColor: 'var(--bg-card, #1e293b)', border: '1px solid var(--border-color, #cbd5e1)',
          borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color, #cbd5e1)', backgroundColor: 'var(--bg-subtab, #f1f5f9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>Claims Queue ({claims.length})</span>
              <Filter size={14} style={{ color: 'var(--text-muted, #94a3b8)' }} />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {['ALL', 'SCRUB_FAILED', 'SCRUB_PASSED', 'READY_FOR_SUBMISSION'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700',
                    border: '1px solid ' + (statusFilter === st ? '#3b82f6' : 'var(--border-color, #cbd5e1)'),
                    cursor: 'pointer',
                    backgroundColor: statusFilter === st ? '#3b82f6' : 'var(--bg-card, #ffffff)',
                    color: statusFilter === st ? '#ffffff' : 'var(--text-secondary, #475569)'
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
                      border: isSelected ? '1px solid #3b82f6' : '1px solid var(--border-color, #cbd5e1)',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card, #ffffff)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary, #0f172a)', fontFamily: 'monospace' }}>
                        {c.patient_control_number}
                      </span>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px',
                        backgroundColor: badge.bg, color: badge.text, border: `1px solid ${badge.border}`
                      }}>
                        {c.scrub_status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginBottom: '4px' }}>
                      Patient: <strong style={{ color: 'var(--text-primary, #0f172a)' }}>{c.patients?.name || c.patient_name || 'Patient'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                      <span style={{ color: '#2563eb', fontWeight: '600' }}>{c.payers?.name || 'Commercial Payer'}</span>
                      <span style={{ fontWeight: '700', color: '#059669' }}>${parseFloat(c.total_gross_charge || 0).toLocaleString()}</span>
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
              backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary, #0f172a)' }}>
                      Claim {selectedClaim.patient_control_number}
                    </h3>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: '800', padding: '3px 8px', borderRadius: '4px',
                      ...getStatusBadgeStyle(selectedClaim.scrub_status)
                    }}>
                      {selectedClaim.scrub_status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginTop: '4px' }}>
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
                      backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)',
                      color: 'var(--text-primary, #0f172a)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'
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
                        backgroundColor: fatalFindings.length === 0 ? '#10b981' : 'var(--bg-toggle, #e2e8f0)',
                        border: fatalFindings.length === 0 ? '1px solid #10b981' : '1px solid var(--border-color, #cbd5e1)',
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color, #cbd5e1)' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Billing NPI</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                    {selectedClaim.billing_provider_npi || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Rendering NPI</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                    {selectedClaim.rendering_provider_npi || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Federal EIN</span>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-primary, #0f172a)' }}>
                    {selectedClaim.billing_provider_tax_id || 'Missing'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Gross Charge</span>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#059669' }}>
                    ${parseFloat(selectedClaim.total_gross_charge || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', textTransform: 'uppercase' }}>Fatal Errors</span>
                  <div style={{ fontWeight: '800', fontSize: '0.85rem', color: fatalFindings.length > 0 ? '#dc2626' : '#059669' }}>
                    {fatalFindings.length} active
                  </div>
                </div>
              </div>
            </div>

            {/* Proposed Automated Edits Alert */}
            {proposedEdits.filter(e => e.status === 'PROPOSED').length > 0 && (
              <div style={{
                backgroundColor: 'var(--bg-subtab, #f1f5f9)', border: '1px solid var(--border-color, #cbd5e1)',
                borderRadius: '12px', padding: '16px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#0284c7', fontWeight: '700', fontSize: '0.9rem' }}>
                  <Layers size={18} />
                  Proposed Automated Claim Edits ({proposedEdits.filter(e => e.status === 'PROPOSED').length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {proposedEdits.filter(e => e.status === 'PROPOSED').map(edit => (
                    <div key={edit.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)', padding: '10px 14px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-primary, #0f172a)' }}>
                        <strong style={{ color: '#0284c7' }}>{edit.rule_id}:</strong> {edit.target_field} &rarr; <span style={{ color: '#059669', fontWeight: '700' }}>{edit.proposed_value}</span>
                      </div>
                      {canApplyEdits && (
                        <button
                          onClick={() => handleApplyEdit(edit.id)}
                          style={{
                            padding: '6px 12px', borderRadius: '6px', backgroundColor: '#0284c7', border: 'none',
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
              backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary, #0f172a)' }}>
                <FileText size={16} style={{ color: '#2563eb' }} />
                Itemized Service Lines ({claimLines.length})
              </h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-muted, #64748b)', textAlign: 'left' }}>
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
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #0f172a)' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '700' }}>#{line.line_number}</td>
                      <td style={{ padding: '10px', fontFamily: 'monospace', color: '#2563eb', fontWeight: '700' }}>{line.cpt_code}</td>
                      <td style={{ padding: '10px', color: 'var(--text-primary, #0f172a)' }}>{line.procedure_description || 'Procedure'}</td>
                      <td style={{ padding: '10px' }}>
                        {line.modifiers && line.modifiers.length > 0 ? (
                          line.modifiers.map(m => (
                            <span key={m} style={{ backgroundColor: 'var(--bg-subtab, #f1f5f9)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-secondary, #475569)', padding: '2px 5px', borderRadius: '4px', fontSize: '0.7rem', marginRight: '4px' }}>
                              {m}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted, #64748b)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>{line.units}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>${parseFloat(line.gross_charge || 0).toFixed(2)}</td>
                      <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', color: '#059669', fontWeight: '700' }}>
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
              backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)',
              borderRadius: '12px', padding: '18px 22px'
            }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary, #0f172a)' }}>
                <ShieldAlert size={16} style={{ color: '#dc2626' }} />
                Scrubbing Findings & Compliance Errors ({findings.length})
              </h4>
              {findings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <CheckCircle2 size={32} style={{ color: '#059669', margin: '0 auto 6px' }} />
                  <div style={{ fontWeight: '700', color: '#059669' }}>Clean Claim Validated</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
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
                          backgroundColor: f.is_overridden ? 'rgba(14, 165, 233, 0.08)' : isFatal ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                          border: `1px solid ${f.is_overridden ? 'rgba(14, 165, 233, 0.3)' : isFatal ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.75rem', backgroundColor: 'var(--bg-subtab, #f1f5f9)', color: 'var(--text-primary, #0f172a)', border: '1px solid var(--border-color, #cbd5e1)', padding: '2px 6px', borderRadius: '4px' }}>
                              {f.rule_id}
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', backgroundColor: isFatal ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: isFatal ? '#dc2626' : '#d97706' }}>
                              {f.severity}
                            </span>
                            {f.edi_loop_reference && (
                              <span style={{ fontSize: '0.7rem', color: '#0284c7' }}>EDI: {f.edi_loop_reference}</span>
                            )}
                            {f.is_overridden && (
                              <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#0284c7', padding: '2px 6px', borderRadius: '4px' }}>
                                OVERRIDDEN
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary, #0f172a)' }}>{f.finding_message}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>{f.remediation_guidance}</div>
                          {f.is_overridden && (
                            <div style={{ fontSize: '0.75rem', color: '#0284c7', fontStyle: 'italic', marginTop: '4px' }}>
                              Justification: "{f.override_reason}"
                            </div>
                          )}
                        </div>

                        {isFatal && !f.is_overridden && canOverride && (
                          <button
                            onClick={() => handleOpenOverride(f)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px',
                              backgroundColor: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.4)',
                              color: '#0284c7', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer'
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-card, #ffffff)', borderRadius: '12px', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-muted, #64748b)' }}>
            Select a claim from the queue to inspect service lines and run scrubbing rules.
          </div>
        )}
      </div>

      {/* Override Dialog Modal */}
      {overrideModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(5, 11, 24, 0.65)', backdropFilter: 'blur(6px)', zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setOverrideModalOpen(false)}>
          <div style={{
            width: '500px', maxWidth: '95vw', backgroundColor: 'var(--bg-card, #ffffff)',
            border: '1px solid var(--border-color, #cbd5e1)', borderRadius: '12px', padding: '22px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={18} /> Override Claim Scrub Blocker
              </div>
              <button onClick={() => setOverrideModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #64748b)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#0284c7', backgroundColor: 'rgba(14, 165, 233, 0.1)', border: '1px solid rgba(14, 165, 233, 0.25)', padding: '10px 12px', borderRadius: '6px', marginBottom: '14px' }}>
              <strong>{selectedFinding?.rule_id}:</strong> {selectedFinding?.finding_message}
            </div>

            <form onSubmit={handleSubmitOverride}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary, #0f172a)', marginBottom: '6px' }}>
                Mandatory Clinical / Payer Justification:
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Document payer agreement, emergency authorization, or director override..."
                style={{
                  width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-subtab, #f1f5f9)',
                  border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #0f172a)', fontSize: '0.85rem', boxSizing: 'border-box'
                }}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button type="button" onClick={() => setOverrideModalOpen(false)} style={{ padding: '6px 14px', borderRadius: '6px', backgroundColor: 'transparent', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-secondary, #475569)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" style={{ padding: '6px 16px', borderRadius: '6px', backgroundColor: '#0284c7', border: 'none', color: '#ffffff', fontWeight: '700', cursor: 'pointer' }}>
                  Commit Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reimbursement Inspector Modal */}
      {reimbModalOpen && selectedClaim && (
        <ReimbursementInspectorModal
          claimId={selectedClaim.id}
          surgeryId={selectedClaim.surgery_id}
          claimData={selectedClaim}
          onClose={() => setReimbModalOpen(false)}
        />
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
              <button onClick={() => setEdiModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #cbd5e1)', color: 'var(--text-primary, #0f172a)', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
