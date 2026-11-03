import React, { useState, useMemo } from 'react';
import {
  FileText,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Filter,
  Plus,
  RotateCcw,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Hash,
  X
} from 'lucide-react';
import {
  caseFinancialLedgerService,
  LEDGER_ENTRY_TYPES,
  LEDGER_CATEGORIES,
  LEDGER_STATUSES,
  ENTRY_TYPE_CONFIG
} from '../lib/caseFinancialLedgerService.js';
import './CaseFinancialLedgerView.css';

const SAMPLE_CASES = [
  { id: 101, patient: 'Marcus Vance', mrn: 'MRN-78491', procedure: 'Left Knee Arthroscopy & Meniscectomy', date: '2026-10-24', surgeon: 'Dr. Sarah Lin, MD', facility: 'ASC North Suite 2', payer: 'Blue Cross PPO' },
  { id: 102, patient: 'Eleanor Rigby', mrn: 'MRN-88210', procedure: 'Right Cataract Phacoemulsification w/ IOL', date: '2026-10-25', surgeon: 'Dr. James Thorne, MD', facility: 'ASC Eye Pavilion', payer: 'Medicare Part B' },
  { id: 103, patient: 'David Kowalski', mrn: 'MRN-64022', procedure: 'Open Reduction Internal Fixation (ORIF) Ankle', date: '2026-10-26', surgeon: 'Dr. Robert Chen, MD', facility: 'ASC Main Suite 1', payer: 'Aetna HMO' }
];

export default function CaseFinancialLedgerView() {
  const [selectedCaseId, setSelectedCaseId] = useState(101);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');
  const [showPostModal, setShowPostModal] = useState(false);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reversalTarget, setReversalTarget] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state for new entry
  const [newEntryType, setNewEntryType] = useState(LEDGER_ENTRY_TYPES.PATIENT_PAYMENT);
  const [newEntryAmount, setNewEntryAmount] = useState('');
  const [newEntryDesc, setNewEntryDesc] = useState('');
  const [newEntryRef, setNewEntryRef] = useState('');

  const currentCase = useMemo(() => {
    return SAMPLE_CASES.find(c => c.id === selectedCaseId) || SAMPLE_CASES[0];
  }, [selectedCaseId]);

  // Retrieve ledger entries & calculated summary
  const entries = useMemo(() => {
    return caseFinancialLedgerService.getCaseLedgerEntries(currentCase.id);
  }, [currentCase.id, successMessage]);

  const summary = useMemo(() => {
    return caseFinancialLedgerService.getCaseFinancialSummary(currentCase.id);
  }, [currentCase.id, successMessage]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (activeCategoryFilter === 'ALL') return entries;
    return entries.filter(e => e.category === activeCategoryFilter);
  }, [entries, activeCategoryFilter]);

  const handlePostEntry = (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const amt = parseFloat(newEntryAmount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error('Please enter a valid amount greater than $0.00');
      }

      caseFinancialLedgerService.postLedgerEntry({
        surgeryId: currentCase.id,
        entryType: newEntryType,
        amount: amt,
        description: newEntryDesc || ENTRY_TYPE_CONFIG[newEntryType].label,
        sourceReferenceId: newEntryRef || `MANUAL-${Date.now()}`,
        sourceModule: 'ManualLedgerPosting'
      });

      setSuccessMessage('Ledger transaction line successfully posted and fingerprinted.');
      setShowPostModal(false);
      setNewEntryAmount('');
      setNewEntryDesc('');
      setNewEntryRef('');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleOpenReverse = (entry) => {
    if (entry.status === LEDGER_STATUSES.REVERSED) return;
    setReversalTarget(entry);
    setReversalReason('');
    setErrorMessage('');
    setShowReverseModal(true);
  };

  const handleExecuteReversal = (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      if (!reversalReason || reversalReason.trim().length < 10) {
        throw new Error('Reversal rationale must be at least 10 characters detailing justification');
      }

      caseFinancialLedgerService.reverseLedgerEntry(
        currentCase.id,
        reversalTarget.id,
        reversalReason
      );

      setSuccessMessage(`Entry #${reversalTarget.entry_number} reversed. Offsetting transaction posted.`);
      setShowReverseModal(false);
      setReversalTarget(null);
      setReversalReason('');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="case-ledger-container">
      {/* Header */}
      <div className="case-ledger-header">
        <div className="header-left">
          <div className="header-icon-box">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="header-title">Case Financial Ledger</h1>
            <p className="header-subtitle">
              Event-sourced line-item journal, double-entry balances & deterministic contribution margin engine
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="case-selector-box">
            <label className="selector-label">Active Surgical Case:</label>
            <select
              className="case-dropdown"
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(Number(e.target.value))}
            >
              {SAMPLE_CASES.map(c => (
                <option key={c.id} value={c.id}>
                  Case #{c.id} — {c.patient} ({c.procedure.substring(0, 32)}...)
                </option>
              ))}
            </select>
          </div>

          <button
            className="action-btn post-btn"
            onClick={() => setShowPostModal(true)}
          >
            <Plus size={16} />
            Post Entry
          </button>
        </div>
      </div>

      {/* Case Overview Card */}
      <div className="case-meta-banner">
        <div className="meta-col">
          <span className="meta-label">Patient</span>
          <span className="meta-val">{currentCase.patient} <span className="meta-sub">({currentCase.mrn})</span></span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Procedure</span>
          <span className="meta-val">{currentCase.procedure}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Primary Payer</span>
          <span className="meta-val">{currentCase.payer}</span>
        </div>
        <div className="meta-col">
          <span className="meta-label">Surgeon / Facility</span>
          <span className="meta-val">{currentCase.surgeon} • {currentCase.facility}</span>
        </div>
        <div className="meta-col meta-col-right">
          <span className="meta-label">Completeness Status</span>
          <span className={`completeness-badge badge-${summary.completenessStatus.toLowerCase()}`}>
            {summary.completenessStatus === 'COMPLETE' && <CheckCircle2 size={13} />}
            {summary.completenessStatus !== 'COMPLETE' && <AlertCircle size={13} />}
            {summary.completenessStatus}
          </span>
        </div>
      </div>

      {/* Alert Notices */}
      {successMessage && (
        <div className="ledger-alert alert-success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="ledger-alert alert-error">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* KPI Balance Cards */}
      <div className="ledger-kpi-grid">
        <div className="kpi-card card-charges">
          <div className="kpi-top">
            <span className="kpi-title">Gross Billed Charges</span>
            <DollarSign size={18} className="kpi-icon" />
          </div>
          <div className="kpi-value">{caseFinancialLedgerService.formatCurrency(summary.totalBilledCharges)}</div>
          <div className="kpi-caption">Total list prices billed on claims</div>
        </div>

        <div className="kpi-card card-allowable">
          <div className="kpi-top">
            <span className="kpi-title">Contract Total Allowable</span>
            <ShieldCheck size={18} className="kpi-icon text-sky" />
          </div>
          <div className="kpi-value text-sky">{caseFinancialLedgerService.formatCurrency(summary.expectedContractAllowable)}</div>
          <div className="kpi-caption">Phase 68 adjudicated baseline</div>
        </div>

        <div className="kpi-card card-collections">
          <div className="kpi-top">
            <span className="kpi-title">Total Net Collections</span>
            <CheckCircle2 size={18} className="kpi-icon text-emerald" />
          </div>
          <div className="kpi-value text-emerald">{caseFinancialLedgerService.formatCurrency(summary.totalNetCollections)}</div>
          <div className="kpi-caption">Payer + Patient cash realized</div>
        </div>

        <div className="kpi-card card-costs">
          <div className="kpi-top">
            <span className="kpi-title">Total Direct Case Costs</span>
            <ArrowDownRight size={18} className="kpi-icon text-amber" />
          </div>
          <div className="kpi-value text-amber">{caseFinancialLedgerService.formatCurrency(summary.totalDirectCaseCosts)}</div>
          <div className="kpi-caption">Implants, supplies, labor & OR time</div>
        </div>

        <div className={`kpi-card ${summary.expectedContributionMargin >= 0 ? 'card-margin-pos' : 'card-margin-neg'}`}>
          <div className="kpi-top">
            <span className="kpi-title">Expected Contribution Margin</span>
            <TrendingUp size={18} className="kpi-icon" />
          </div>
          <div className="kpi-value">
            {caseFinancialLedgerService.formatCurrency(summary.expectedContributionMargin)}
          </div>
          <div className="kpi-badges-row">
            <span className="margin-pill">{summary.expectedMarginPct}% yield</span>
            <span className="margin-pill">${summary.expectedMarginPerOrMinute}/OR min</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="ledger-controls-row">
        <div className="filter-pills">
          <button
            className={`filter-pill ${activeCategoryFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('ALL')}
          >
            All Journal Entries ({entries.length})
          </button>
          <button
            className={`filter-pill ${activeCategoryFilter === LEDGER_CATEGORIES.CHARGES ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(LEDGER_CATEGORIES.CHARGES)}
          >
            Charges
          </button>
          <button
            className={`filter-pill ${activeCategoryFilter === LEDGER_CATEGORIES.CONTRACTUAL ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(LEDGER_CATEGORIES.CONTRACTUAL)}
          >
            Contractual Expected
          </button>
          <button
            className={`filter-pill ${activeCategoryFilter === LEDGER_CATEGORIES.PAYMENTS ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(LEDGER_CATEGORIES.PAYMENTS)}
          >
            Collections & Cash
          </button>
          <button
            className={`filter-pill ${activeCategoryFilter === LEDGER_CATEGORIES.ADJUSTMENTS ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(LEDGER_CATEGORIES.ADJUSTMENTS)}
          >
            Adjustments
          </button>
          <button
            className={`filter-pill ${activeCategoryFilter === LEDGER_CATEGORIES.DIRECT_COSTS ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter(LEDGER_CATEGORIES.DIRECT_COSTS)}
          >
            Direct Case Costs
          </button>
        </div>

        <div className="balance-info-badge">
          <span className="balance-label">Open AR Balance:</span>
          <span className="balance-amount">{caseFinancialLedgerService.formatCurrency(summary.patientAndPayerOutstandingAr)}</span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="ledger-table-card">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Entry Type & Category</th>
              <th>Description / Narrative</th>
              <th>Source Reference</th>
              <th className="text-right">Debit (-)</th>
              <th className="text-right">Credit (+)</th>
              <th className="text-right">AR Balance</th>
              <th>Status</th>
              <th>Audit Hash</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const isDebit = e.entry_sign === -1;
              const isCredit = e.entry_sign === 1;

              return (
                <tr key={e.id} className={`ledger-row ${e.status === LEDGER_STATUSES.REVERSED ? 'row-reversed' : ''}`}>
                  <td className="entry-num">{e.entry_number}</td>
                  <td className="entry-date">{e.effective_date}</td>
                  <td>
                    <div className="entry-type-cell">
                      <span className="type-label">{e.label}</span>
                      <span className="cat-sub">{e.category}</span>
                    </div>
                  </td>
                  <td className="entry-desc">
                    <span>{e.description}</span>
                  </td>
                  <td className="source-ref">
                    <span className="ref-tag">{e.source_reference_id || 'N/A'}</span>
                    <span className="module-sub">{e.source_module}</span>
                  </td>
                  <td className="text-right debit-col">
                    {isDebit ? caseFinancialLedgerService.formatCurrency(e.amount) : '—'}
                  </td>
                  <td className="text-right credit-col">
                    {isCredit ? caseFinancialLedgerService.formatCurrency(e.amount) : '—'}
                  </td>
                  <td className="text-right balance-col">
                    {caseFinancialLedgerService.formatCurrency(e.running_patient_ar_balance)}
                  </td>
                  <td>
                    <span className={`status-pill status-${e.status.toLowerCase()}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>
                    <span className="hash-code" title={e.audit_hash}>
                      <Hash size={11} />
                      {e.audit_hash.substring(0, 10)}...
                    </span>
                  </td>
                  <td className="text-center">
                    {e.status === LEDGER_STATUSES.POSTED && (
                      <button
                        className="reverse-btn"
                        title="Post an offsetting reversal"
                        onClick={() => handleOpenReverse(e)}
                      >
                        <RotateCcw size={13} />
                        Reverse
                      </button>
                    )}
                    {e.status === LEDGER_STATUSES.REVERSED && (
                      <span className="reversed-lock-label">Reversed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Post Entry Modal */}
      {showPostModal && (
        <div className="modal-backdrop">
          <div className="ledger-modal">
            <div className="modal-header">
              <h3 className="modal-title">Post Case Ledger Entry</h3>
              <button className="modal-close-btn" onClick={() => setShowPostModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePostEntry} className="modal-form">
              <div className="form-group">
                <label className="form-label">Transaction Type</label>
                <select
                  className="form-select"
                  value={newEntryType}
                  onChange={(e) => setNewEntryType(e.target.value)}
                >
                  <optgroup label="Payments & Cash">
                    <option value={LEDGER_ENTRY_TYPES.PATIENT_PAYMENT}>Patient Copay / Payment (+)</option>
                    <option value={LEDGER_ENTRY_TYPES.PAYER_PAYMENT}>Payer Remittance Payment (+)</option>
                    <option value={LEDGER_ENTRY_TYPES.SECONDARY_PAYMENT}>Secondary Insurer Payment (+)</option>
                  </optgroup>
                  <optgroup label="Adjustments">
                    <option value={LEDGER_ENTRY_TYPES.CONTRACTUAL_ADJUSTMENT}>Contractual Discount Adjustment (-)</option>
                    <option value={LEDGER_ENTRY_TYPES.ADMIN_WRITE_OFF}>Administrative Write-Off (-)</option>
                    <option value={LEDGER_ENTRY_TYPES.REFUND_RECOUPMENT}>Payer Recoupment / Refund (-)</option>
                  </optgroup>
                  <optgroup label="Direct Costs">
                    <option value={LEDGER_ENTRY_TYPES.IMPLANT_COST}>Implant Device Cost (-)</option>
                    <option value={LEDGER_ENTRY_TYPES.SUPPLY_COST}>Surgical Supplies Cost (-)</option>
                    <option value={LEDGER_ENTRY_TYPES.LABOR_COST}>Clinical Labor Cost (-)</option>
                    <option value={LEDGER_ENTRY_TYPES.OR_TIME_COST}>OR Room Minute Overhead (-)</option>
                  </optgroup>
                  <optgroup label="Charges">
                    <option value={LEDGER_ENTRY_TYPES.CHARGE}>Gross Billed Charge (+)</option>
                  </optgroup>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Transaction Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="form-input"
                  value={newEntryAmount}
                  onChange={(e) => setNewEntryAmount(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Source Reference / Invoice / Check ID</label>
                <input
                  type="text"
                  placeholder="e.g. ERA-99218 or INV-78401"
                  className="form-input"
                  value={newEntryRef}
                  onChange={(e) => setNewEntryRef(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description / Accounting Narrative</label>
                <textarea
                  rows={2}
                  placeholder="Explain transaction justification..."
                  className="form-textarea"
                  value={newEntryDesc}
                  onChange={(e) => setNewEntryDesc(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setShowPostModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-submit-btn">
                  Post Immutable Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reverse Entry Modal */}
      {showReverseModal && reversalTarget && (
        <div className="modal-backdrop">
          <div className="ledger-modal">
            <div className="modal-header">
              <h3 className="modal-title">Reverse Ledger Entry #{reversalTarget.entry_number}</h3>
              <button className="modal-close-btn" onClick={() => setShowReverseModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteReversal} className="modal-form">
              <div className="reversal-warning-box">
                <AlertCircle size={18} className="text-amber" />
                <span>
                  Ledger entries are permanent. Reversing entry <strong>#{reversalTarget.entry_number}</strong> ({caseFinancialLedgerService.formatCurrency(reversalTarget.amount)}) will post an offsetting transaction with the opposite sign.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Audit Rationale (Minimum 10 characters required)</label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the audit justification for reversing this line item..."
                  className="form-textarea"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setShowReverseModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-reverse-confirm-btn">
                  Confirm Reversal Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
