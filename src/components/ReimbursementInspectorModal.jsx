/**
 * src/components/ReimbursementInspectorModal.jsx
 * =====================================================================
 * Phase 68 — Expected Reimbursement Inspector & Trace Explanation Modal
 * =====================================================================
 * Interactive drill-down modal displaying authoritative expected
 * reimbursement, line-level calculation traces, patient responsibility
 * partitioning, and cryptographic SHA-256 ledger integrity.
 * Strictly compliant with Maestro tokens and color design standards.
 */

import React, { useState, useEffect } from 'react';
import {
  X, Calculator, ShieldCheck, DollarSign, RefreshCw, FileText,
  ChevronDown, ChevronRight, Hash, Activity
} from 'lucide-react';
import { reimbursementEngineService } from '../lib/reimbursementEngineService';
import './ReimbursementInspectorModal.css';

export default function ReimbursementInspectorModal({
  isOpen,
  onClose,
  surgeryId,
  _surgeryData = null,
  onCalculationUpdated = null
}) {
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('lines'); // 'lines' | 'patient' | 'history' | 'recalculate'
  const [expandedLines, setExpandedLines] = useState({});
  const [integrityStatus, setIntegrityStatus] = useState(null);
  const [verifyingHash, setVerifyingHash] = useState(false);

  // Recalculation Form State
  const [recalcReason, setRecalcReason] = useState('POST_OP_CPT_RECODING');
  const [customReasonNote, setCustomReasonNote] = useState('');
  const [patientCopayInput, setPatientCopayInput] = useState('250.00');
  const [patientCoinsuranceInput, setPatientCoinsuranceInput] = useState('0.20');
  const [patientDeductibleInput, setPatientDeductibleInput] = useState('0.00');
  const [isSubmittingRecalc, setIsSubmittingRecalc] = useState(false);
  const [historyList, setHistoryList] = useState([]);

  // Load latest calculation whenever modal opens or surgeryId changes
  useEffect(() => {
    if (!isOpen || !surgeryId) return;

    let isMounted = true;
    setLoading(true);

    async function loadData() {
      try {
        const latest = await reimbursementEngineService.getLatestCaseCalculation(surgeryId);
        if (isMounted) {
          if (latest) {
            setCalculation(latest);
          } else {
            // Run dry-run calculation to obtain authoritative numbers
            const simulated = await reimbursementEngineService.calculateExpectedReimbursement(surgeryId, { dryRun: true });
            setCalculation(simulated);
          }
        }

        const history = await reimbursementEngineService.getCaseCalculationHistory(surgeryId);
        if (isMounted) {
          setHistoryList(history || []);
        }
      } catch (err) {
        console.warn('ReimbursementInspectorModal load warning:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [isOpen, surgeryId]);

  const toggleLineExpand = (lineNum) => {
    setExpandedLines(prev => ({
      ...prev,
      [lineNum]: !prev[lineNum]
    }));
  };

  const handleVerifyIntegrity = async () => {
    if (!calculation?.id) return;
    setVerifyingHash(true);
    try {
      const res = await reimbursementEngineService.verifyCalculationIntegrity(calculation.id);
      setIntegrityStatus(res);
    } catch (err) {
      setIntegrityStatus({ is_valid: false, verification_message: err.message });
    } finally {
      setVerifyingHash(false);
    }
  };

  const handleExecuteRecalculate = async (e) => {
    e.preventDefault();
    if (!surgeryId) return;

    setIsSubmittingRecalc(true);
    try {
      const reasonText = customReasonNote ? `${recalcReason}: ${customReasonNote}` : recalcReason;
      const updated = await reimbursementEngineService.recalculateEncounter(surgeryId, reasonText, {
        patientCopay: parseFloat(patientCopayInput) || 0,
        patientCoinsurancePct: parseFloat(patientCoinsuranceInput) || 0,
        patientDeductible: parseFloat(patientDeductibleInput) || 0
      });

      setCalculation(updated);
      setActiveTab('lines');

      if (onCalculationUpdated) {
        onCalculationUpdated(updated);
      }

      const refreshedHistory = await reimbursementEngineService.getCaseCalculationHistory(surgeryId);
      setHistoryList(refreshedHistory || []);
    } catch (err) {
      alert(`Recalculation error: ${err.message}`);
    } finally {
      setIsSubmittingRecalc(false);
    }
  };

  if (!isOpen) return null;

  const totalGross = parseFloat(calculation?.total_gross_billed || 0);
  const totalAllowable = parseFloat(calculation?.total_contract_allowable || 0);
  const patientShare = parseFloat(calculation?.estimated_patient_responsibility || 0);
  const payerShare = parseFloat(calculation?.estimated_payer_reimbursement || 0);
  const directCost = parseFloat(calculation?.facility_acquisition_cost || 0);
  const netMargin = parseFloat(calculation?.expected_contribution_margin || 0);
  const marginPct = (totalAllowable > 0 ? (netMargin / totalAllowable) * 100 : 0).toFixed(1);

  const statusClass = 
    calculation?.calculation_status === 'CALCULATED' ? 'status-calculated' :
    calculation?.calculation_status === 'STOP_LOSS_APPLIED' ? 'status-stoploss' :
    calculation?.calculation_status === 'PARTIALLY_CALCULATED' ? 'status-partial' : 'status-error';

  return (
    <div className="reimb-modal-overlay" onClick={onClose}>
      <div className="reimb-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="reimb-modal-header">
          <div className="reimb-modal-title-group">
            <div className="reimb-modal-icon-badge">
              <Calculator size={22} />
            </div>
            <div>
              <h2 className="reimb-modal-title">
                Expected Reimbursement Inspector & Trace
              </h2>
              <p className="reimb-modal-subtitle">
                <span>Surgery #{surgeryId}</span>
                <span>•</span>
                <span>{calculation?.contract_title || 'Contracted Payer Schedule'}</span>
                <span>•</span>
                <span className={`reimb-status-pill ${statusClass}`}>
                  {calculation?.calculation_status || 'PENDING'}
                </span>
              </p>
            </div>
          </div>
          <div className="reimb-header-actions">
            <button 
              className="reimb-btn-secondary"
              onClick={() => setActiveTab('recalculate')}
            >
              <RefreshCw size={14} /> Recalculate Case
            </button>
            <button className="reimb-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 6 KPI Cards Bar */}
        <div className="reimb-kpi-grid">
          <div className="reimb-kpi-card">
            <span className="reimb-kpi-label">Gross Billed</span>
            <span className="reimb-kpi-val">${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">Chargemaster Total</span>
          </div>
          <div className="reimb-kpi-card accent-emerald">
            <span className="reimb-kpi-label">Contract Allowable</span>
            <span className="reimb-kpi-val">${totalAllowable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">Total Agreed Rate</span>
          </div>
          <div className="reimb-kpi-card accent-amber">
            <span className="reimb-kpi-label">Patient Share</span>
            <span className="reimb-kpi-val">${patientShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">Copay + Coinsurance</span>
          </div>
          <div className="reimb-kpi-card accent-sky">
            <span className="reimb-kpi-label">Est. Payer Payment</span>
            <span className="reimb-kpi-val">${payerShare.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">Net Insurance Due</span>
          </div>
          <div className="reimb-kpi-card">
            <span className="reimb-kpi-label">Direct Cost</span>
            <span className="reimb-kpi-val">${directCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">Supplies + OR Time</span>
          </div>
          <div className={`reimb-kpi-card ${netMargin >= 0 ? 'accent-emerald' : 'accent-rose'}`}>
            <span className="reimb-kpi-label">Contribution Margin</span>
            <span className="reimb-kpi-val">${netMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="reimb-kpi-sub">{marginPct}% Net Margin</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="reimb-tab-nav">
          <button 
            className={`reimb-tab-btn ${activeTab === 'lines' ? 'active' : ''}`}
            onClick={() => setActiveTab('lines')}
          >
            <FileText size={15} /> Adjudicated Lines & Traces
          </button>
          <button 
            className={`reimb-tab-btn ${activeTab === 'patient' ? 'active' : ''}`}
            onClick={() => setActiveTab('patient')}
          >
            <DollarSign size={15} /> Patient Responsibility Partition
          </button>
          <button 
            className={`reimb-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Activity size={15} /> Calculation Lineage & Audits
          </button>
          <button 
            className={`reimb-tab-btn ${activeTab === 'recalculate' ? 'active' : ''}`}
            onClick={() => setActiveTab('recalculate')}
          >
            <RefreshCw size={15} /> Recalculation Engine
          </button>
        </div>

        {/* Modal Content */}
        <div className="reimb-modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 12px auto' }} />
              <p>Adjudicating encounter against active contract rules...</p>
            </div>
          ) : activeTab === 'lines' ? (
            <div>
              <div className="reimb-table-container">
                <table className="reimb-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>CPT / HCPCS</th>
                      <th>Methodology</th>
                      <th>Gross Charge</th>
                      <th>Adjustments</th>
                      <th>Line Allowable</th>
                      <th>Patient Share</th>
                      <th>Payer Due</th>
                      <th style={{ width: '40px' }}>Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(calculation?.lines || []).map((line) => {
                      const isExpanded = Boolean(expandedLines[line.line_number]);
                      return (
                        <React.Fragment key={line.line_number}>
                          <tr>
                            <td>{line.line_number}</td>
                            <td>
                              <span className="reimb-cpt-pill">{line.cpt_code}</span>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                                {line.procedure_description || line.description}
                              </div>
                            </td>
                            <td>
                              <span className="reimb-method-badge">{line.applied_methodology}</span>
                            </td>
                            <td>${parseFloat(line.line_gross_charge || 0).toFixed(2)}</td>
                            <td>
                              {line.mppr_rank > 1 && (
                                <span className="reimb-adj-tag">MPPR 50%</span>
                              )}
                              {line.j8_device_offset_deducted > 0 && (
                                <span className="reimb-adj-tag">J8 Offset -${parseFloat(line.j8_device_offset_deducted).toFixed(0)}</span>
                              )}
                              {line.mppr_rank === 1 && (
                                <span className="reimb-adj-tag" style={{ background: '#0c4a6e', color: '#7dd3fc', borderColor: '#0369a1' }}>
                                  Rank 1 100%
                                </span>
                              )}
                            </td>
                            <td style={{ fontWeight: 700, color: '#34d399' }}>
                              ${parseFloat(line.line_contract_allowable || 0).toFixed(2)}
                            </td>
                            <td style={{ color: '#fbbf24' }}>
                              ${parseFloat(line.line_patient_responsibility || 0).toFixed(2)}
                            </td>
                            <td style={{ fontWeight: 600, color: '#38bdf8' }}>
                              ${parseFloat(line.line_payer_reimbursement || 0).toFixed(2)}
                            </td>
                            <td>
                              <button 
                                className="reimb-close-btn" 
                                onClick={() => toggleLineExpand(line.line_number)}
                                title="Toggle calculation trace"
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={9} style={{ padding: '0 14px 10px 14px', background: 'rgba(15, 23, 42, 0.7)' }}>
                                <div className="reimb-trace-box">
                                  <div className="reimb-trace-header">
                                    <ShieldCheck size={14} /> Mathematical Execution Trace (Line #{line.line_number})
                                  </div>
                                  <div>{line.calculation_trace || 'Standard contracted fee schedule adjudication.'}</div>
                                  <div style={{ marginTop: '6px', color: '#64748b' }}>
                                    Base Rate: ${parseFloat(line.base_benchmark_rate || 0).toFixed(2)} | Multiplier: {parseFloat(line.contract_multiplier || 1).toFixed(4)} | Rank: {line.mppr_rank}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* SHA-256 Ledger Fingerprint Card */}
              <div className="reimb-hash-card">
                <div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary, #f8fafc)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Hash size={14} color="#38bdf8" /> Cryptographic Ledger Snapshot SHA-256
                  </div>
                  <div className="reimb-hash-text">
                    {calculation?.calculation_hash || 'Uncommitted Dry Run Calculation'}
                  </div>
                  {integrityStatus && (
                    <div style={{ fontSize: '0.75rem', marginTop: '4px', color: integrityStatus.is_valid ? '#34d399' : '#f87171' }}>
                      {integrityStatus.verification_message}
                    </div>
                  )}
                </div>
                <div>
                  <button 
                    className="reimb-btn-secondary"
                    onClick={handleVerifyIntegrity}
                    disabled={verifyingHash || !calculation?.id}
                  >
                    <ShieldCheck size={14} /> {verifyingHash ? 'Verifying...' : 'Verify Ledger Integrity'}
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'patient' ? (
            <div style={{ maxWidth: '650px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary, #f8fafc)', marginBottom: '8px' }}>
                Patient Responsibility Partitioning Model
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
                Partition the total contract allowable into patient liability (deductibles, copays, coinsurance, elective upgrades) vs net payer insurance obligation.
              </p>

              <div style={{ background: '#0b1120', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                  <span style={{ color: '#94a3b8' }}>Total Contract Allowable:</span>
                  <span style={{ fontWeight: 700, color: '#34d399' }}>${totalAllowable.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
                  <span style={{ color: '#94a3b8' }}>Patient Responsibility (Copay/Coinsurance):</span>
                  <span style={{ fontWeight: 700, color: '#fbbf24' }}>-${patientShare.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '1rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>Net Estimated Payer Reimbursement:</span>
                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>${payerShare.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : activeTab === 'history' ? (
            <div>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary, #f8fafc)', marginBottom: '8px' }}>
                Calculation Audit History & Recalculation Lineage
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
                All calculations are permanently immutable. Each recalculation generates a new sequence number preserving the previous state.
              </p>

              <div className="reimb-table-container">
                <table className="reimb-table">
                  <thead>
                    <tr>
                      <th>Seq #</th>
                      <th>Status</th>
                      <th>Total Allowable</th>
                      <th>Payer Due</th>
                      <th>Timestamp</th>
                      <th>Recalculation Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map(h => (
                      <tr key={h.id}>
                        <td><strong>#{h.calculation_sequence}</strong></td>
                        <td>
                          <span className={`reimb-status-pill status-${h.calculation_status === 'CALCULATED' ? 'calculated' : 'partial'}`}>
                            {h.calculation_status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: '#34d399' }}>
                          ${parseFloat(h.total_contract_allowable || 0).toFixed(2)}
                        </td>
                        <td style={{ color: '#38bdf8' }}>
                          ${parseFloat(h.estimated_payer_reimbursement || 0).toFixed(2)}
                        </td>
                        <td style={{ color: '#94a3b8' }}>
                          {h.calculation_timestamp ? new Date(h.calculation_timestamp).toLocaleString() : 'Recent'}
                        </td>
                        <td style={{ color: '#cbd5e1' }}>
                          {h.recalculation_reason || 'Initial encounter baseline'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <form onSubmit={handleExecuteRecalculate} className="reimb-recalc-box">
              <h3 style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '6px' }}>
                Recalculate Encounter Reimbursement
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '16px' }}>
                Execute a new calculation sequence. A documented business reason is required for financial ledger compliance.
              </p>

              <label className="reimb-field-label">Recalculation Reason (Mandatory)</label>
              <select 
                className="reimb-select"
                value={recalcReason}
                onChange={e => setRecalcReason(e.target.value)}
              >
                <option value="POST_OP_CPT_RECODING">Post-Op Coding / CPT Amendment</option>
                <option value="IMPLANT_INVOICE_LOGGED">Implant Invoices Logged / Reconciled</option>
                <option value="CONTRACT_RETROACTIVE_UPDATE">Contract Retroactive Amendment</option>
                <option value="PATIENT_INSURANCE_CHANGED">Patient Insurance / Policy Updated</option>
                <option value="OTHER_MANUAL_REVIEW">Other Administrative Review</option>
              </select>

              <label className="reimb-field-label">Additional Documentation Note</label>
              <textarea 
                className="reimb-textarea"
                rows={2}
                placeholder="Enter audit rationale for recalculation..."
                value={customReasonNote}
                onChange={e => setCustomReasonNote(e.target.value)}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="reimb-field-label">Patient Copay ($)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="reimb-input"
                    value={patientCopayInput}
                    onChange={e => setPatientCopayInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="reimb-field-label">Coinsurance %</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="reimb-input"
                    value={patientCoinsuranceInput}
                    onChange={e => setPatientCoinsuranceInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="reimb-field-label">Deductible ($)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="reimb-input"
                    value={patientDeductibleInput}
                    onChange={e => setPatientDeductibleInput(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                <button 
                  type="submit" 
                  className="reimb-btn-primary"
                  disabled={isSubmittingRecalc}
                >
                  <RefreshCw size={14} className={isSubmittingRecalc ? 'animate-spin' : ''} />
                  {isSubmittingRecalc ? 'Recalculating...' : 'Commit New Calculation Sequence'}
                </button>
                <button 
                  type="button" 
                  className="reimb-btn-secondary"
                  onClick={() => setActiveTab('lines')}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

