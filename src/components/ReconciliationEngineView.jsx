import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  Layers,
  Search,
  Download,
  FileText,
  X,
  ArrowRight,
  Clock,
  ShieldAlert,
  Scale
} from 'lucide-react';
import reconciliationService, {
  RECONCILIATION_STATUSES,
  DISCREPANCY_TYPES,
  DISPOSITION_ACTIONS,
  calculateReconciliationVariance,
  calculateBankDepositVariance,
  calculateExpectedUnderpayment,
  calculateReconciliationKpis,
  getBaselineReconciliationRecords
} from '../lib/reconciliationService';
import './ReconciliationEngineView.css';

export default function ReconciliationEngineView() {
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'discrepancies' | 'deposits' | 'audit'
  const [recordsList, setRecordsList] = useState(() => getBaselineReconciliationRecords());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Discrepancy Resolution Modal State
  const [resolveModalRecord, setResolveModalRecord] = useState(null);
  const [dispositionAction, setDispositionAction] = useState('APPEAL_UNDERPAYMENT');
  const [adjustedAmount, setAdjustedAmount] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Discrepancy Audit Log
  const [auditLog, setAuditLog] = useState([
    {
      id: 'aud-001',
      recordCtrl: 'REC-2026-0034',
      claimNumber: 'CLM-2026-0088',
      payerName: 'UnitedHealthcare Commercial',
      action: 'APPEAL_UNDERPAYMENT',
      amount: 1200.00,
      user: 'Biller Sarah Jenkins',
      timestamp: '2026-10-20T16:15:00Z',
      notes: 'Generated underpayment appeal packet for unauthorized CPT 49505 reduction.'
    },
    {
      id: 'aud-002',
      recordCtrl: 'REC-2026-0012',
      claimNumber: 'CLM-2026-0042',
      payerName: 'Blue Cross Blue Shield Florida',
      action: 'POST_CONTRACTUAL_CORRECTION',
      amount: 4250.00,
      user: 'Cash Poster Mark Vance',
      timestamp: '2026-10-25T11:30:00Z',
      notes: 'CO-45 contractual allowance verified and balanced to bank lockbox slip.'
    }
  ]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return calculateReconciliationKpis(recordsList);
  }, [recordsList]);

  // Filtered Ledger Records
  const filteredRecords = useMemo(() => {
    return recordsList.filter(item => {
      const matchesSearch = searchQuery === '' ||
        item.reconciliationControlNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.claimNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.primaryPayerName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [recordsList, searchQuery, statusFilter]);

  // Discrepancy Records subset
  const discrepancyRecords = useMemo(() => {
    return recordsList.filter(item =>
      item.status === 'UNDERPAYMENT_DISCREPANCY' ||
      item.status === 'OVERPAYMENT_DISCREPANCY' ||
      item.status === 'UNMATCHED_REMITTANCE' ||
      item.status === 'SUSPENSE_UNIDENTIFIED_CASH'
    );
  }, [recordsList]);

  // Handle Discrepancy Resolution Submission
  const handleResolutionSubmit = (e) => {
    e.preventDefault();
    if (!resolveModalRecord) return;

    const newAudit = {
      id: `aud-${Date.now()}`,
      recordCtrl: resolveModalRecord.reconciliationControlNumber,
      claimNumber: resolveModalRecord.claimNumber,
      payerName: resolveModalRecord.primaryPayerName,
      action: dispositionAction,
      amount: parseFloat(adjustedAmount) || Math.abs(resolveModalRecord.varianceAmount),
      user: 'Current User',
      timestamp: new Date().toISOString(),
      notes: resolutionNotes || 'Discrepancy resolved via reconciliation workflow.'
    };

    setAuditLog(prev => [newAudit, ...prev]);

    // Update record status to CLOSED_BALANCED or PARTIALLY_RECONCILED
    setRecordsList(prev => prev.map(r => {
      if (r.id === resolveModalRecord.id) {
        return {
          ...r,
          status: 'CLOSED_BALANCED',
          notes: `${r.notes} [RESOLVED: ${dispositionAction} - ${resolutionNotes}]`
        };
      }
      return r;
    }));

    // Reset & close modal
    setResolveModalRecord(null);
    setAdjustedAmount('');
    setResolutionNotes('');
  };

  return (
    <div
      className="recon-container"
      style={{
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        minHeight: 'calc(100vh - 70px)',
        borderRadius: '12px',
        padding: '16px 24px 40px 24px',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        className="recon-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="recon-topbar-left">
          <div className="recon-header-icon-badge">
            <Scale size={22} className="text-sky" />
          </div>
          <div>
            <h1
              className="recon-title"
              style={{
                color: '#ffffff',
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 4px 0',
                display: 'block',
                visibility: 'visible',
                opacity: 1
              }}
            >
              Claim, Remittance & Payment Reconciliation Engine
            </h1>
            <p
              className="recon-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              Four-way financial matching, deterministic balancing invariants, contractual underpayment detection & discrepancy resolution
            </p>
          </div>
        </div>

        <div className="recon-topbar-right">
          <button
            className="recon-btn recon-btn-secondary"
            onClick={() => alert('Exporting Reconciliation Ledger...')}
          >
            <Download size={14} />
            Export Reconciliation Report
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Ribbon */}
      <div className="recon-kpi-ribbon">
        {/* Card 1: Total Reconciled Cash */}
        <div className="recon-kpi-card">
          <div className="recon-kpi-card-header">
            <span className="recon-kpi-label">TOTAL RECONCILED CASH</span>
            <DollarSign size={18} className="text-sky" />
          </div>
          <div className="recon-kpi-number text-sky">
            ${kpis.totalReconciledDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="recon-kpi-subtext">
            <span>{kpis.fullyReconciledCount} Fully balanced zero-variance transactions</span>
          </div>
        </div>

        {/* Card 2: Clean Match Rate */}
        <div className="recon-kpi-card">
          <div className="recon-kpi-card-header">
            <span className="recon-kpi-label">CLEAN MATCH RATE</span>
            <CheckCircle2 size={18} className={kpis.benchmarkPassed ? 'text-emerald' : 'text-rose'} />
          </div>
          <div className={`recon-kpi-number ${kpis.benchmarkPassed ? 'text-emerald' : 'text-rose'}`}>
            {kpis.cleanMatchRatePct}%
          </div>
          <div className="recon-kpi-subtext">
            <span className={`recon-badge ${kpis.benchmarkPassed ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' : 'bg-rose-950/40 text-rose-400 border-rose-800'}`}>
              ASC Target: ≥ 98.0% {kpis.benchmarkPassed ? '✓ Compliant' : '⚠ Action Needed'}
            </span>
          </div>
        </div>

        {/* Card 3: Underpayment Discrepancies */}
        <div className="recon-kpi-card">
          <div className="recon-kpi-card-header">
            <span className="recon-kpi-label">UNDERPAYMENT EXPOSURE</span>
            <AlertTriangle size={18} className="text-amber" />
          </div>
          <div className="recon-kpi-number text-amber">
            ${kpis.totalUnderpaymentExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="recon-kpi-subtext">
            <span>Recoverable contractual variances</span>
          </div>
        </div>

        {/* Card 4: Suspense / Unapplied Cash */}
        <div className="recon-kpi-card">
          <div className="recon-kpi-card-header">
            <span className="recon-kpi-label">SUSPENSE / UNAPPLIED CASH</span>
            <Clock size={18} className="text-rose" />
          </div>
          <div className="recon-kpi-number text-rose">
            ${kpis.totalSuspenseExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="recon-kpi-subtext">
            <span>Unmatched bank deposits & unlinked ERAs</span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="recon-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`recon-nav-tab ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <Layers size={15} />
          3-Way Reconciliation Ledger ({filteredRecords.length})
        </button>

        <button
          className={`recon-nav-tab ${activeTab === 'discrepancies' ? 'active' : ''}`}
          onClick={() => setActiveTab('discrepancies')}
        >
          <AlertTriangle size={15} />
          Discrepancy Exception Queue ({discrepancyRecords.length})
        </button>

        <button
          className={`recon-nav-tab ${activeTab === 'deposits' ? 'active' : ''}`}
          onClick={() => setActiveTab('deposits')}
        >
          <DollarSign size={15} />
          Bank Deposit vs Remittance Balancing
        </button>

        <button
          className={`recon-nav-tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          <FileText size={15} />
          Audit Trail & Dispositions ({auditLog.length})
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: 3-WAY RECONCILIATION LEDGER                             */}
      {/* ============================================================== */}
      {activeTab === 'ledger' && (
        <div>
          {/* Filter Toolbar */}
          <div className="recon-filter-toolbar">
            <div className="flex items-center gap-3">
              <div className="recon-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search control #, claim, patient, payer..."
                  className="recon-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="recon-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Match Statuses</option>
                {Object.values(RECONCILIATION_STATUSES).map(st => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-sky font-mono font-bold">{filteredRecords.length}</span> of {recordsList.length} reconciliation records
            </div>
          </div>

          {/* Ledger Table */}
          <div className="recon-table-responsive">
            <table className="recon-table">
              <thead>
                <tr>
                  <th>Control # & Claim</th>
                  <th>Patient & DOS</th>
                  <th>Payer & Class</th>
                  <th>Billed / Expected</th>
                  <th>Remit Paid / Bank Deposit</th>
                  <th>CO-45 Adj / PR Share</th>
                  <th>Variance ($\Delta$)</th>
                  <th>Status & Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No reconciliation records found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(item => {
                    const statusObj = RECONCILIATION_STATUSES[item.status] || RECONCILIATION_STATUSES.PARTIALLY_RECONCILED;
                    const isBalanced = Math.abs(item.varianceAmount) === 0 && Math.abs(item.bankDepositVariance) === 0;

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="font-bold text-sky font-mono">{item.reconciliationControlNumber}</div>
                          <div className="text-xs font-mono text-slate-400">{item.claimNumber}</div>
                        </td>
                        <td>
                          <div className="font-semibold text-slate-200">{item.patientName}</div>
                          <div className="text-xs text-slate-400">DOS: {item.dateOfService}</div>
                        </td>
                        <td>
                          <div className="text-slate-200">{item.primaryPayerName}</div>
                          <span className="recon-badge bg-slate-800 text-slate-300">
                            {item.financialClass}
                          </span>
                        </td>
                        <td>
                          <div className="font-mono text-slate-200">
                            ${item.billedAmount.toFixed(2)}
                          </div>
                          <div className="text-xs font-mono text-slate-500">
                            Exp: ${item.expectedReimbursement.toFixed(2)}
                          </div>
                        </td>
                        <td>
                          <div className="font-mono font-bold text-emerald">
                            Remit: ${item.remittancePaidAmount.toFixed(2)}
                          </div>
                          <div className="text-xs font-mono text-sky">
                            Bank: ${item.bankDepositAmount.toFixed(2)}
                          </div>
                        </td>
                        <td>
                          <div className="font-mono text-xs text-slate-300">
                            CO: ${item.contractualAdjustmentAmount.toFixed(2)}
                          </div>
                          <div className="font-mono text-xs text-amber">
                            PR: ${item.patientResponsibilityAmount.toFixed(2)}
                          </div>
                        </td>
                        <td>
                          <div className={`font-mono font-bold text-sm ${isBalanced ? 'text-emerald' : 'text-rose'}`}>
                            ${item.varianceAmount.toFixed(2)}
                          </div>
                          {item.bankDepositVariance !== 0 && (
                            <div className="text-xs font-mono text-amber">
                              Deposit $\Delta$: ${item.bankDepositVariance.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="mb-1">
                            <span className={`recon-badge ${statusObj.badgeClass}`}>
                              {statusObj.label}
                            </span>
                          </div>
                          {!isBalanced && (
                            <button
                              className="recon-btn recon-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                              onClick={() => setResolveModalRecord(item)}
                            >
                              Resolve $\Delta$
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: DISCREPANCY EXCEPTION QUEUE                             */}
      {/* ============================================================== */}
      {activeTab === 'discrepancies' && (
        <div>
          <div className="recon-table-responsive">
            <table className="recon-table">
              <thead>
                <tr>
                  <th>Control # & Claim</th>
                  <th>Payer & Patient</th>
                  <th>Discrepancy Category</th>
                  <th>Variance Amount</th>
                  <th>Root Cause & Notes</th>
                  <th>Recommended Disposition</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {discrepancyRecords.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#10b981' }}>
                      ✓ Zero unresolved reconciliation discrepancies. Clean Match Rate 100%.
                    </td>
                  </tr>
                ) : (
                  discrepancyRecords.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-bold text-sky font-mono">{item.reconciliationControlNumber}</div>
                        <div className="text-xs font-mono text-slate-400">{item.claimNumber}</div>
                      </td>
                      <td>
                        <div className="font-semibold text-slate-200">{item.primaryPayerName}</div>
                        <div className="text-xs text-slate-400">{item.patientName}</div>
                      </td>
                      <td>
                        <span className="recon-badge bg-amber-950/50 text-amber-300 border-amber-700">
                          {item.status}
                        </span>
                      </td>
                      <td>
                        <div className="text-rose font-mono font-bold text-base">
                          ${(item.underpaymentAmount || Math.abs(item.varianceAmount) || Math.abs(item.bankDepositVariance)).toFixed(2)}
                        </div>
                      </td>
                      <td className="text-xs text-slate-300 max-w-xs">
                        {item.notes}
                      </td>
                      <td>
                        <span className="text-xs font-semibold text-sky">
                          {item.status === 'UNDERPAYMENT_DISCREPANCY' && 'Level 1 Underpayment Appeal'}
                          {item.status === 'UNMATCHED_REMITTANCE' && 'Trace Lost Paper/EFT Check'}
                          {item.status === 'SUSPENSE_UNIDENTIFIED_CASH' && 'Crosswalk Unapplied Deposit'}
                          {item.status === 'OVERPAYMENT_DISCREPANCY' && 'Escrow Refund Protocol'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="recon-btn recon-btn-emerald"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => setResolveModalRecord(item)}
                        >
                          Resolve Discrepancy
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: BANK DEPOSIT VS REMITTANCE BALANCING                    */}
      {/* ============================================================== */}
      {activeTab === 'deposits' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="recon-kpi-card" style={{ padding: '14px' }}>
              <div className="recon-kpi-label">TOTAL BANK DEPOSITS</div>
              <div className="recon-kpi-number text-emerald mt-2">
                ${recordsList.reduce((acc, r) => acc + r.bankDepositAmount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="recon-kpi-subtext mt-1">Confirmed bank cash credits</div>
            </div>

            <div className="recon-kpi-card" style={{ padding: '14px' }}>
              <div className="recon-kpi-label">TOTAL REMITTANCE ADVICE (835)</div>
              <div className="recon-kpi-number text-sky mt-2">
                ${recordsList.reduce((acc, r) => acc + r.remittancePaidAmount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="recon-kpi-subtext mt-1">Electronic ERA paid claim sums</div>
            </div>

            <div className="recon-kpi-card" style={{ padding: '14px' }}>
              <div className="recon-kpi-label">NET DEPOSIT-TO-REMIT VARIANCE</div>
              <div className="recon-kpi-number text-amber mt-2">
                ${recordsList.reduce((acc, r) => acc + r.bankDepositVariance, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="recon-kpi-subtext mt-1">Unmatched check or suspense holding balance</div>
            </div>
          </div>

          <div className="recon-table-responsive">
            <table className="recon-table">
              <thead>
                <tr>
                  <th>Deposit Batch</th>
                  <th>EFT Trace Number</th>
                  <th>Payer</th>
                  <th>Bank Deposited</th>
                  <th>ERA Claim Total</th>
                  <th>Batch Variance</th>
                  <th>Audit Assessment</th>
                </tr>
              </thead>
              <tbody>
                {recordsList.map(rec => (
                  <tr key={rec.id}>
                    <td className="font-mono text-slate-200">
                      {rec.depositBatchNumber || 'UNBATCHED'}
                    </td>
                    <td className="font-mono text-sky font-semibold">
                      {rec.eftTraceNumber}
                    </td>
                    <td className="text-slate-200">
                      {rec.primaryPayerName}
                    </td>
                    <td className="font-mono font-bold text-emerald">
                      ${rec.bankDepositAmount.toFixed(2)}
                    </td>
                    <td className="font-mono text-slate-300">
                      ${rec.remittancePaidAmount.toFixed(2)}
                    </td>
                    <td className={`font-mono font-bold ${rec.bankDepositVariance === 0 ? 'text-emerald' : 'text-rose'}`}>
                      ${rec.bankDepositVariance.toFixed(2)}
                    </td>
                    <td>
                      <span className={`recon-badge ${rec.bankDepositVariance === 0 ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' : 'bg-rose-950/40 text-rose-400 border-rose-800'}`}>
                        {rec.bankDepositVariance === 0 ? 'Balanced' : 'Discrepancy Flagged'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: AUDIT TRAIL & DISPOSITIONS                              */}
      {/* ============================================================== */}
      {activeTab === 'audit' && (
        <div>
          <div className="recon-table-responsive">
            <table className="recon-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Control # & Claim</th>
                  <th>Payer</th>
                  <th>Disposition Action</th>
                  <th>Amount</th>
                  <th>Authorized By</th>
                  <th>Audit Resolution Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(aud => (
                  <tr key={aud.id}>
                    <td className="text-xs font-mono text-slate-400">
                      {new Date(aud.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div className="font-bold text-sky font-mono">{aud.recordCtrl}</div>
                      <div className="text-xs text-slate-400">{aud.claimNumber}</div>
                    </td>
                    <td className="text-slate-200">{aud.payerName}</td>
                    <td>
                      <span className="recon-badge bg-sky-950/40 text-sky-400 border-sky-800">
                        {DISPOSITION_ACTIONS[aud.action]?.label || aud.action}
                      </span>
                    </td>
                    <td className="font-mono font-bold text-emerald">
                      ${aud.amount.toFixed(2)}
                    </td>
                    <td className="text-xs text-slate-300">{aud.user}</td>
                    <td className="text-xs text-slate-300 max-w-sm">{aud.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: RESOLVE RECONCILIATION DISCREPANCY                      */}
      {/* ============================================================== */}
      {resolveModalRecord && (
        <div className="recon-modal-backdrop">
          <div className="recon-modal-card">
            <div className="recon-modal-header">
              <h2 className="recon-modal-title flex items-center gap-2">
                <Scale size={18} className="text-sky" />
                Resolve Discrepancy: {resolveModalRecord.reconciliationControlNumber}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setResolveModalRecord(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleResolutionSubmit}>
              <div className="recon-modal-body">
                {/* Variance Context Strip */}
                <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Claim / Patient:</span>
                    <span className="text-slate-200 font-semibold">{resolveModalRecord.claimNumber} ({resolveModalRecord.patientName})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Payer / Plan:</span>
                    <span className="text-slate-200">{resolveModalRecord.primaryPayerName}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Expected vs Remit Paid:</span>
                    <span className="text-slate-300 font-mono">${resolveModalRecord.expectedReimbursement.toFixed(2)} / ${resolveModalRecord.remittancePaidAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Discrepancy Variance:</span>
                    <span className="text-rose font-mono font-bold text-sm">
                      ${(resolveModalRecord.underpaymentAmount || Math.abs(resolveModalRecord.varianceAmount) || Math.abs(resolveModalRecord.bankDepositVariance)).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="recon-form-label">Disposition Action</label>
                  <select
                    className="recon-form-select"
                    value={dispositionAction}
                    onChange={(e) => setDispositionAction(e.target.value)}
                  >
                    {Object.values(DISPOSITION_ACTIONS).map(act => (
                      <option key={act.id} value={act.id}>{act.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="recon-form-label">Adjustment / Resolution Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="recon-form-input"
                    placeholder={(resolveModalRecord.underpaymentAmount || Math.abs(resolveModalRecord.varianceAmount)).toFixed(2)}
                    value={adjustedAmount}
                    onChange={(e) => setAdjustedAmount(e.target.value)}
                  />
                </div>

                <div>
                  <label className="recon-form-label">Resolution Rationale & Audit Notes</label>
                  <textarea
                    rows={3}
                    className="recon-form-textarea"
                    placeholder="Document root-cause analysis, appeal reference number, or contractual adjustment justification..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="recon-modal-footer">
                <button
                  type="button"
                  className="recon-btn recon-btn-secondary"
                  onClick={() => setResolveModalRecord(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="recon-btn recon-btn-primary">
                  Apply Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

