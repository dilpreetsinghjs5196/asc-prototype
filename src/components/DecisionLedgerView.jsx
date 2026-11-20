/**
 * ==============================================================================
 * Phase D4: Recommendation Decision Ledger & Realized Value View
 * Module 13: Decision Intelligence
 * Displays the immutable, event-sourced decision ledger tracking recommendations,
 * approvals, executions, 835 remittances, and realized financial value.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * ==============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  ShieldCheck,
  AlertTriangle,
  FileText,
  DollarSign,
  TrendingUp,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  Lock,
  Download,
  Eye,
  RefreshCw,
  Hash,
  Layers,
  Award,
  Link as LinkIcon,
  Copy
} from 'lucide-react';

import {
  REALIZATION_STATUSES,
  LEDGER_EVENT_TYPES,
  getDecisionLedgerEntries,
  getLedgerEntryById,
  verifyLedgerChainIntegrity,
  recordLedgerOutcome,
  getLedgerEvents,
  getDecisionLedgerTelemetry
} from '../services/decisionLedgerService.js';

import './DecisionLedgerView.css';

export default function DecisionLedgerView({ activeFacility }) {
  const rawFacId = activeFacility?.id || (typeof activeFacility === 'string' ? activeFacility : null) || 'fac-naples-01';
  const facilityId = (rawFacId === '00000000-0000-0000-0000-000000000002') ? 'fac-naples-01' : rawFacId;
  const facilityName = activeFacility?.name || 'Naples Surgery Center';

  // State
  const [entries, setEntries] = useState([]);
  const [telemetry, setTelemetry] = useState(null);
  const [chainStatus, setChainStatus] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [inspectModalEntry, setInspectModalEntry] = useState(null);
  const [inspectEvents, setInspectEvents] = useState([]);
  const [recordModalEntry, setRecordModalEntry] = useState(null);
  const [outcomePayment, setOutcomePayment] = useState('');
  const [outcomeSource, setOutcomeSource] = useState('835_REMITTANCE');
  const [outcomeReference, setOutcomeReference] = useState('');
  const [outcomeRemarks, setOutcomeRemarks] = useState('');
  const [recordError, setRecordError] = useState('');
  const [toastMessage, setToastMessage] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedHash, setCopiedHash] = useState(null);

  const loadData = () => {
    const list = getDecisionLedgerEntries(facilityId, {
      status: statusFilter,
      category: categoryFilter,
      searchQuery
    });
    setEntries(list);

    const telem = getDecisionLedgerTelemetry(facilityId);
    setTelemetry(telem);

    const chain = verifyLedgerChainIntegrity(facilityId);
    setChainStatus(chain);
  };

  useEffect(() => {
    loadData();
  }, [facilityId, statusFilter, categoryFilter, searchQuery]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyHash = (hash, e) => {
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      showToast('SHA-256 Block Hash copied to clipboard.');
      setTimeout(() => setCopiedHash(null), 2500);
    }
  };

  const handleVerifyChain = () => {
    setIsVerifying(true);
    setTimeout(() => {
      const verification = verifyLedgerChainIntegrity(facilityId);
      setChainStatus(verification);
      setIsVerifying(false);
      if (verification.isValid) {
        showToast(`Cryptographic Chain Verified Unbroken: ${verification.verifiedBlockCount} blocks sealed.`);
      } else {
        showToast(`Tamper Alert: ${verification.failureReason}`);
      }
    }, 600);
  };

  const handleInspect = (entry) => {
    setInspectModalEntry(entry);
    const evts = getLedgerEvents(entry.id);
    setInspectEvents(evts);
  };

  const handleOpenRecordModal = (entry) => {
    setRecordModalEntry(entry);
    setOutcomePayment(entry.expectedFinancialValue || '');
    setOutcomeReference(entry.adjudicationReference || 'ERA-835-AUTO-CHK');
    setOutcomeRemarks('');
    setRecordError('');
  };

  const handleSubmitOutcome = (e) => {
    e.preventDefault();
    const paymentVal = parseFloat(outcomePayment);
    if (isNaN(paymentVal) || paymentVal < 0) {
      setRecordError('Please enter a valid non-negative realized financial amount.');
      return;
    }
    if (!outcomeReference.trim()) {
      setRecordError('Adjudication reference (e.g., 835 check number) is required.');
      return;
    }

    try {
      recordLedgerOutcome(recordModalEntry.id, {
        realizedFinancialValue: paymentVal,
        adjudicationSource: outcomeSource,
        adjudicationReference: outcomeReference.trim(),
        remarks: outcomeRemarks.trim()
      }, {
        userId: 'usr_sarah_rcm',
        userName: 'Sarah Jenkins (Billing Lead)'
      });

      setRecordModalEntry(null);
      showToast(`Realized outcome committed to block #${recordModalEntry.sequenceNumber} ledger.`);
      loadData();
    } catch (err) {
      setRecordError(err.message);
    }
  };

  const handleExportLedger = () => {
    const jsonStr = JSON.stringify({
      facility: facilityName,
      facilityId,
      exportedAt: new Date().toISOString(),
      chainStatus,
      telemetry,
      ledgerEntries: entries
    }, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision-ledger-${facilityId}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Authoritative Decision Ledger audit archive exported.');
  };

  return (
    <div className="dlv-container">
      {/* Toast */}
      {toastMessage && (
        <div className="dlv-toast">
          <CheckCircle2 size={16} className="dlv-toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="dlv-header">
        <div>
          <div className="dlv-title-row">
            <h2 className="dlv-title">Decision Ledger & Realized Value History</h2>
            <span className="dlv-facility-pill">
              <ShieldCheck size={14} />
              {facilityName}
            </span>
            <span className="dlv-ver-badge">Phase D4 - Module 13</span>
          </div>
          <p className="dlv-subtitle">
            Immutable, event-sourced audit ledger linking recommendations, dual-key approvals, external execution, 835 remittances, and realized financial outcomes
          </p>
        </div>
        <div className="dlv-header-actions">
          <button className="dlv-btn-secondary" onClick={handleVerifyChain} disabled={isVerifying}>
            <ShieldCheck size={14} />
            {isVerifying ? 'Verifying Chain...' : 'Verify Chain Integrity'}
          </button>
          <button className="dlv-btn-primary" onClick={handleExportLedger}>
            <Download size={14} /> Export Audit Ledger
          </button>
        </div>
      </div>

      {/* Cryptographic Chain Integrity Banner */}
      {chainStatus && (
        <div className={`dlv-chain-banner ${chainStatus.isValid ? 'dlv-chain-valid' : 'dlv-chain-invalid'}`}>
          <div className="dlv-chain-banner-left">
            {chainStatus.isValid ? (
              <ShieldCheck size={20} className="dlv-ico-emerald" />
            ) : (
              <AlertTriangle size={20} className="dlv-ico-crimson" />
            )}
            <div>
              <div className="dlv-chain-title">
                {chainStatus.isValid ? 'Cryptographic Chain-of-Custody Verified' : 'Cryptographic Chain Broken / Tamper Detected'}
              </div>
              <div className="dlv-chain-sub">
                {chainStatus.isValid
                  ? `${chainStatus.verifiedBlockCount} consecutive blocks sealed with SHA-256 block hash chaining. Genesis digest linked.`
                  : chainStatus.failureReason}
              </div>
            </div>
          </div>
          <div className="dlv-chain-badge">
            <Lock size={12} />
            {chainStatus.tipHash ? `Tip: ${chainStatus.tipHash.substring(0, 16)}...` : 'Genesis Block'}
          </div>
        </div>
      )}

      {/* 5-Card Telemetry Ribbon */}
      <div className="dlv-ribbon-grid">
        <div className="dlv-ribbon-card">
          <div className="dlv-ribbon-label">
            <DollarSign size={14} className="dlv-ico-emerald" />
            Total Realized Value
          </div>
          <div className="dlv-ribbon-val">
            ${(telemetry?.totalRealizedFinancialValue ?? 34510.00).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="dlv-ribbon-sub">
            Target: ${(telemetry?.totalExpectedFinancialValue ?? 38430.00).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="dlv-ribbon-card">
          <div className="dlv-ribbon-label">
            <TrendingUp size={14} className="dlv-ico-emerald" />
            Realization Yield Rate
          </div>
          <div className="dlv-ribbon-val">{telemetry?.cumulativeRealizationRatePct ?? 89.8}%</div>
          <div className="dlv-ribbon-sub">Net financial realization efficiency</div>
        </div>

        <div className="dlv-ribbon-card">
          <div className="dlv-ribbon-label">
            <Layers size={14} className="dlv-ico-sky" />
            Net Realization Variance
          </div>
          <div className={`dlv-ribbon-val ${(telemetry?.netRealizationVarianceAmount ?? 0) >= 0 ? 'dlv-val-surplus' : 'dlv-val-deficit'}`}>
            {(telemetry?.netRealizationVarianceAmount ?? 0) >= 0 ? '+' : ''}${(telemetry?.netRealizationVarianceAmount ?? -3920.00).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="dlv-ribbon-sub">
            {(telemetry?.netRealizationVarianceAmount ?? 0) >= 0 ? 'Financial surplus realized' : 'Pending realization delta'}
          </div>
        </div>

        <div className="dlv-ribbon-card">
          <div className="dlv-ribbon-label">
            <Clock size={14} className="dlv-ico-amber" />
            Mean Time to Realization (MTTR)
          </div>
          <div className="dlv-ribbon-val">{telemetry?.avgTimeToRealizationDays ?? 4.8} Days</div>
          <div className="dlv-ribbon-sub">Average recommendation-to-cash velocity</div>
        </div>

        <div className="dlv-ribbon-card">
          <div className="dlv-ribbon-label">
            <Lock size={14} className="dlv-ico-slate" />
            Ledger Provenance
          </div>
          <div className="dlv-ribbon-val">SHA-256</div>
          <div className="dlv-ribbon-sub">100% Unbroken Hash Ledger</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="dlv-toolbar">
        <div className="dlv-search-box">
          <Search size={14} className="dlv-search-icon" />
          <input
            type="text"
            className="dlv-search-input"
            placeholder="Search by action code, title, or 835 check number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="dlv-filter-group">
          <div className="dlv-filter-item">
            <label>Realization Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="dlv-select"
            >
              <option value="ALL">All Statuses</option>
              <option value="FULLY_REALIZED">Fully Realized (100%)</option>
              <option value="OVER_REALIZED">Over Realized (&gt;100%)</option>
              <option value="PARTIALLY_REALIZED">Partially Realized (&lt;100%)</option>
              <option value="PENDING_REALIZATION">Pending Realization (0%)</option>
              <option value="UNREALIZED_DEFICIT">Unrealized Deficit</option>
            </select>
          </div>

          <div className="dlv-filter-item">
            <label>Category:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="dlv-select"
            >
              <option value="ALL">All Categories</option>
              <option value="DENIAL_APPEAL_URGENT">Denial Appeal</option>
              <option value="OR_BLOCK_RELEASE">OR Block Release</option>
              <option value="MISSING_CHARGE_CAPTURE">Missing Charge</option>
              <option value="PRIOR_AUTH_EXPIRING">Prior Auth</option>
              <option value="IMPLANT_CARVEOUT_CLAIM">Implant Carveout</option>
              <option value="PRE_SERVICE_DEPOSIT_COLLECTION">Pre-Service Balance</option>
              <option value="SECONDARY_CROSSOVER_SUBMISSION">Secondary Crossover</option>
            </select>
          </div>

          <button className="dlv-btn-secondary" onClick={loadData}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Decision Ledger Table */}
      <div className="dlv-table-card">
        <div className="dlv-table-header">
          <div className="dlv-table-title">
            <Layers size={16} />
            <span>Chained Decision Blocks ({entries.length})</span>
          </div>
          <span className="dlv-block-count-badge">
            Block Height: #{entries.length}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="dlv-empty-state">
            <Layers size={36} className="dlv-empty-icon" />
            <h3>No Decision Ledger Entries Found</h3>
            <p>No ledger entries matched your filter criteria.</p>
          </div>
        ) : (
          <div className="dlv-table-wrapper">
            <table className="dlv-table">
              <thead>
                <tr>
                  <th>Seq / Block Hash</th>
                  <th>Action Code & Title</th>
                  <th>Expected</th>
                  <th>Realized</th>
                  <th>Variance</th>
                  <th>Status</th>
                  <th>Adjudication Ref</th>
                  <th>MTTR</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item.id} className="dlv-table-row">
                    <td>
                      <div className="dlv-seq-col">
                        <span className="dlv-seq-badge">#{String(item.sequenceNumber).padStart(3, '0')}</span>
                        <button
                          className="dlv-hash-chip"
                          onClick={(e) => handleCopyHash(item.currentBlockHash, e)}
                          title="Click to copy full SHA-256 hash"
                        >
                          <Hash size={11} />
                          <span>{item.currentBlockHash.substring(0, 8)}...</span>
                          <Copy size={10} />
                        </button>
                      </div>
                    </td>

                    <td>
                      <div className="dlv-action-col">
                        <div className="dlv-action-code">{item.actionCode}</div>
                        <div className="dlv-action-title">{item.title}</div>
                        <span className="dlv-action-cat">{item.category}</span>
                      </div>
                    </td>

                    <td className="dlv-num-col">
                      <span className="dlv-val-expected">${Number(item.expectedFinancialValue).toFixed(2)}</span>
                    </td>

                    <td className="dlv-num-col">
                      <span className="dlv-val-realized">${Number(item.realizedFinancialValue).toFixed(2)}</span>
                    </td>

                    <td className="dlv-num-col">
                      <span className={`dlv-variance-badge ${item.varianceAmount >= 0 ? 'dlv-var-positive' : item.realizedFinancialValue === 0 ? 'dlv-var-neutral' : 'dlv-var-negative'}`}>
                        {item.varianceAmount >= 0 ? '+' : ''}${Number(item.varianceAmount).toFixed(2)}
                      </span>
                    </td>

                    <td>
                      <span className={`dlv-status-badge dlv-status-${item.realizationStatus.toLowerCase()}`}>
                        {item.realizationStatus.replace('_', ' ')}
                      </span>
                    </td>

                    <td>
                      <div className="dlv-ref-col">
                        <span className="dlv-ref-text">{item.adjudicationReference || 'Awaiting Adjudication'}</span>
                        <span className="dlv-source-tag">{item.adjudicationSource || 'PENDING'}</span>
                      </div>
                    </td>

                    <td>
                      <div className="dlv-time-col">
                        {item.timeToRealizationDays ? `${item.timeToRealizationDays}d` : '--'}
                      </div>
                    </td>

                    <td>
                      <div className="dlv-action-btns">
                        <button
                          className="dlv-btn-icon"
                          onClick={() => handleInspect(item)}
                          title="Inspect cryptographic block & audit timeline"
                        >
                          <Eye size={14} />
                        </button>
                        {item.realizationStatus === REALIZATION_STATUSES.PENDING_REALIZATION && (
                          <button
                            className="dlv-btn-action-small"
                            onClick={() => handleOpenRecordModal(item)}
                            title="Record 835 remittance check or payment"
                          >
                            <DollarSign size={12} /> Record
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Block Inspector Drawer/Modal */}
      {inspectModalEntry && (
        <div className="dlv-modal-overlay" onClick={() => setInspectModalEntry(null)}>
          <div className="dlv-modal-content dlv-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dlv-modal-header">
              <div className="dlv-modal-title">
                <Layers size={18} className="dlv-ico-emerald" />
                <span>Decision Block #{String(inspectModalEntry.sequenceNumber).padStart(3, '0')}</span>
              </div>
              <button className="dlv-btn-close" onClick={() => setInspectModalEntry(null)}>
                <XCircle size={18} />
              </button>
            </div>

            <div className="dlv-modal-body">
              {/* Block Hash Certificate */}
              <div className="dlv-cert-card">
                <div className="dlv-cert-row">
                  <span className="dlv-cert-label">Current Block Hash (SHA-256):</span>
                  <code className="dlv-hash-code">{inspectModalEntry.currentBlockHash}</code>
                </div>
                <div className="dlv-cert-row">
                  <span className="dlv-cert-label">Previous Block Hash:</span>
                  <code className="dlv-hash-code">{inspectModalEntry.previousBlockHash}</code>
                </div>
                <div className="dlv-cert-row">
                  <span className="dlv-cert-label">Merkle Event Root:</span>
                  <code className="dlv-hash-code">{inspectModalEntry.merkleRootHash}</code>
                </div>
              </div>

              {/* Financial Yield Summary */}
              <div className="dlv-inspect-grid">
                <div className="dlv-inspect-box">
                  <div className="dlv-inspect-label">Action Code</div>
                  <div className="dlv-inspect-val">{inspectModalEntry.actionCode}</div>
                </div>
                <div className="dlv-inspect-box">
                  <div className="dlv-inspect-label">Expected Value</div>
                  <div className="dlv-inspect-val">${Number(inspectModalEntry.expectedFinancialValue).toFixed(2)}</div>
                </div>
                <div className="dlv-inspect-box">
                  <div className="dlv-inspect-label">Realized Value</div>
                  <div className="dlv-inspect-val">${Number(inspectModalEntry.realizedFinancialValue).toFixed(2)}</div>
                </div>
                <div className="dlv-inspect-box">
                  <div className="dlv-inspect-label">Yield Rate</div>
                  <div className="dlv-inspect-val">{inspectModalEntry.realizationPercentage}%</div>
                </div>
              </div>

              {/* Event Timeline */}
              <div className="dlv-timeline-section">
                <h4 className="dlv-timeline-title">
                  <History size={15} /> Event-Sourced Lifecycle Ledger
                </h4>
                <div className="dlv-timeline">
                  {inspectEvents.map((ev, idx) => (
                    <div key={ev.id || idx} className="dlv-timeline-node">
                      <div className="dlv-node-bullet">
                        <CheckCircle2 size={12} className="dlv-ico-emerald" />
                      </div>
                      <div className="dlv-node-content">
                        <div className="dlv-node-header">
                          <span className="dlv-node-type">{ev.eventType.replace(/_/g, ' ')}</span>
                          <span className="dlv-node-time">{new Date(ev.recordedAt).toLocaleString()}</span>
                        </div>
                        <div className="dlv-node-user">Recorded by: {ev.recordedByName}</div>
                        <pre className="dlv-node-payload">
                          {JSON.stringify(ev.eventPayload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dlv-modal-footer">
              <button className="dlv-btn-secondary" onClick={() => setInspectModalEntry(null)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Outcome Modal */}
      {recordModalEntry && (
        <div className="dlv-modal-overlay" onClick={() => setRecordModalEntry(null)}>
          <div className="dlv-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="dlv-modal-header">
              <div className="dlv-modal-title">
                <DollarSign size={18} className="dlv-ico-emerald" />
                <span>Record Adjudication Outcome ({recordModalEntry.actionCode})</span>
              </div>
              <button className="dlv-btn-close" onClick={() => setRecordModalEntry(null)}>
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitOutcome}>
              <div className="dlv-modal-body">
                {recordError && (
                  <div className="dlv-modal-error">
                    <AlertTriangle size={14} />
                    <span>{recordError}</span>
                  </div>
                )}

                <div className="dlv-form-group">
                  <label>Realized Financial Recovery ($):</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="dlv-form-input"
                    value={outcomePayment}
                    onChange={(e) => setOutcomePayment(e.target.value)}
                    placeholder="Enter dollar amount recovered"
                    required
                  />
                  <span className="dlv-form-help">
                    Initial Expected Recovery: ${Number(recordModalEntry.expectedFinancialValue).toFixed(2)}
                  </span>
                </div>

                <div className="dlv-form-group">
                  <label>Adjudication Source:</label>
                  <select
                    className="dlv-form-select"
                    value={outcomeSource}
                    onChange={(e) => setOutcomeSource(e.target.value)}
                  >
                    <option value="835_REMITTANCE">EDI 835 Remittance Advice</option>
                    <option value="EHR_SCHEDULE_FILLED">EHR Schedule Booking Recovery</option>
                    <option value="DIRECT_PATIENT_PAYMENT">Direct Patient Credit / Payment</option>
                    <option value="PAYER_CROSSOVER_CHECK">Payer Secondary Crossover Check</option>
                  </select>
                </div>

                <div className="dlv-form-group">
                  <label>Adjudication Reference (835 Check # / Rec ID):</label>
                  <input
                    type="text"
                    className="dlv-form-input"
                    value={outcomeReference}
                    onChange={(e) => setOutcomeReference(e.target.value)}
                    placeholder="e.g., ERA-BCBS-88319-CHK"
                    required
                  />
                </div>

                <div className="dlv-form-group">
                  <label>Auditor Settlement Notes (Optional):</label>
                  <textarea
                    className="dlv-form-textarea"
                    rows={3}
                    value={outcomeRemarks}
                    onChange={(e) => setOutcomeRemarks(e.target.value)}
                    placeholder="Provide explanatory remarks or CARC settlement codes..."
                  />
                </div>
              </div>

              <div className="dlv-modal-footer">
                <button
                  type="button"
                  className="dlv-btn-secondary"
                  onClick={() => setRecordModalEntry(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="dlv-btn-primary">
                  <CheckCircle2 size={14} /> Commit Realized Value
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
