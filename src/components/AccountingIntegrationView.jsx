import React, { useState, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  Database,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  FileText,
  ExternalLink,
  ChevronRight,
  Sliders,
  X,
  Play,
  Zap,
  Check,
  ArrowRightLeft,
  FileSpreadsheet,
  Building2,
  Landmark
} from 'lucide-react';
import {
  getAccountingConnectorConfig,
  getAccountingTelemetry,
  getAccountingChartOfAccounts,
  getAccountingJournalBatches,
  getAccountingJournalLines,
  getAccountingReconciliations,
  getAccountingExceptions,
  testAccountingConnection,
  triggerManualJournalPost,
  runSubledgerBankReconciliation,
  resolveAccountingException,
  normalizeFacilityId
} from '../services/accountingIntegrationService';
import './AccountingIntegrationView.css';

export default function AccountingIntegrationView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('journal_batches'); // 'journal_batches' | 'chart_of_accounts' | 'bank_reconciliation' | 'accounting_exceptions'
  const [selectedBatchId, setSelectedBatchId] = useState('bat-acc-01');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Banners & Notifications
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load Data
  const config = useMemo(() => getAccountingConnectorConfig(facilityId), [facilityId, refreshKey]);
  const telemetry = useMemo(() => getAccountingTelemetry(facilityId), [facilityId, refreshKey]);
  const coaList = useMemo(() => getAccountingChartOfAccounts(facilityId), [facilityId, refreshKey]);
  const batches = useMemo(() => getAccountingJournalBatches(facilityId), [facilityId, refreshKey]);
  const reconciliations = useMemo(() => getAccountingReconciliations(facilityId), [facilityId, refreshKey]);
  const exceptions = useMemo(() => getAccountingExceptions(facilityId), [facilityId, refreshKey]);

  // Selected Batch Lines
  const selectedBatch = useMemo(() => batches.find(b => b.id === selectedBatchId) || batches[0], [batches, selectedBatchId]);
  const selectedLines = useMemo(() => getAccountingJournalLines(selectedBatch?.id || 'bat-acc-01'), [selectedBatch, refreshKey]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.batchControlNumber.toLowerCase().includes(q) ||
        b.periodCode.toLowerCase().includes(q) ||
        b.batchType.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  }, [batches, searchQuery]);

  // Filtered COA
  const filteredCoa = useMemo(() => {
    return coaList.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.accountCode.toLowerCase().includes(q) ||
        c.accountName.toLowerCase().includes(q) ||
        c.categoryMapping.toLowerCase().includes(q) ||
        c.accountType.toLowerCase().includes(q)
      );
    });
  }, [coaList, searchQuery]);

  // Filtered Reconciliations
  const filteredReconciliations = useMemo(() => {
    return reconciliations.filter(r => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.reconciliationCode.toLowerCase().includes(q) ||
        r.reconciledBy.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q))
      );
    });
  }, [reconciliations, searchQuery]);

  // Filtered Exceptions
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.exceptionCode.toLowerCase().includes(q) ||
        e.exceptionCategory.toLowerCase().includes(q) ||
        (e.offendingAccount && e.offendingAccount.toLowerCase().includes(q))
      );
    });
  }, [exceptions, searchQuery]);

  // Test Connection Handler
  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = testAccountingConnection(facilityId);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Live GL ERP Connection Verified: ${res.message} (Latency: ${res.latencyMs}ms)`
        });
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Connection Test Failed: ${err.message}`
      });
    } finally {
      setIsTesting(false);
    }
  }, [facilityId]);

  // Trigger Manual Journal Post Handler
  const handlePostJournal = useCallback(async () => {
    setIsPosting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = triggerManualJournalPost(facilityId, 'DAILY_CASH_POSTING');
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Balanced Double-Entry Journal Posted: Generated ${res.batch.batchControlNumber} ($${Number(res.batch.totalDebit).toLocaleString('en-US', { minimumFractionDigits: 2 })}) with $0.00 variance and cryptographic seal.`
        });
        setSelectedBatchId(res.batch.id);
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Journal Post Failed: ${err.message}`
      });
    } finally {
      setIsPosting(false);
    }
  }, [facilityId]);

  // Trigger Bank Reconciliation Handler
  const handleRunRecon = useCallback(async () => {
    setIsReconciling(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = runSubledgerBankReconciliation(facilityId);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Bank Reconciliation Completed: ${res.reconciliation.reconciliationCode} matched $${Number(res.reconciliation.subledgerCashAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} with $0.00 variance.`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Bank Reconciliation Failed: ${err.message}`
      });
    } finally {
      setIsReconciling(false);
    }
  }, [facilityId]);

  // Resolve Exception Handler
  const handleResolveException = useCallback((exceptionId) => {
    const res = resolveAccountingException(exceptionId, 'RESOLVED_BY_FINANCE_OVERRIDE');
    if (res.success) {
      setBanner({
        show: true,
        type: 'success',
        message: 'Accounting exception resolved and cleared from active workqueue.'
      });
      setRefreshKey(k => k + 1);
    }
  }, []);

  return (
    <div className="acc-container">
      {/* 1. Header Action Bar */}
      <div className="acc-header">
        <div className="acc-header-left">
          <div className="acc-title-row">
            <h1 className="acc-title">Accounting & General Ledger Gateway</h1>
            <span className="acc-badge-vendor">{config.accountingVendor} Financials ERP</span>
            <span className={`acc-badge-status status-${config.connectionStatus.toLowerCase()}`}>
              <span className="acc-status-dot" />
              {config.connectionStatus}
            </span>
            <span className="acc-badge-period">Period: {config.currentAccountingPeriod}</span>
          </div>
          <p className="acc-subtitle">
            Facility: <strong>{facilityName}</strong> | Automated Chart of Accounts mapping, double-entry journal posting, sub-ledger to bank reconciliation & GAAP compliance.
          </p>
        </div>

        <div className="acc-header-actions">
          <button
            className="acc-btn acc-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <Activity size={15} className={isTesting ? 'spin-icon' : ''} />
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            className="acc-btn acc-btn-secondary"
            onClick={handleRunRecon}
            disabled={isReconciling}
          >
            <Landmark size={15} className={isReconciling ? 'spin-icon' : ''} />
            {isReconciling ? 'Reconciling...' : 'Run Bank Recon'}
          </button>
          <button
            className="acc-btn acc-btn-primary"
            onClick={handlePostJournal}
            disabled={isPosting}
          >
            <BookOpen size={15} className={isPosting ? 'spin-icon' : ''} />
            {isPosting ? 'Posting...' : 'Post Daily Journal'}
          </button>
          <button
            className="acc-btn acc-btn-icon"
            onClick={() => setIsDrawerOpen(true)}
            title="GL ERP Gateway Settings"
          >
            <Sliders size={16} />
          </button>
        </div>
      </div>

      {/* 2. Notification Banner */}
      {banner.show && (
        <div className={`acc-banner acc-banner-${banner.type}`}>
          <div className="acc-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Activity size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="acc-banner-close" onClick={() => setBanner({ show: false, type: 'info', message: '' })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. 4-Card Telemetry KPI Ribbon */}
      <div className="acc-kpi-grid">
        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-label">Journal Batches Posted (30d)</span>
            <div className="acc-kpi-icon-wrapper icon-teal">
              <BookOpen size={16} />
            </div>
          </div>
          <div className="acc-kpi-value">{telemetry.journalBatchesPosted30d}</div>
          <div className="acc-kpi-footer">
            <span className="acc-trend-positive">
              ${Number(telemetry.totalDebitsPosted30d).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="acc-kpi-subtext">total debits/credits</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-label">Double-Entry Balance Rate</span>
            <div className="acc-kpi-icon-wrapper icon-emerald">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="acc-kpi-value">{telemetry.doubleEntryBalancePct}%</div>
          <div className="acc-kpi-footer">
            <span className="acc-trend-positive">GAAP Compliant</span>
            <span className="acc-kpi-subtext">zero balancing variance</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-label">Reconciled Cash (MTD)</span>
            <div className="acc-kpi-icon-wrapper icon-blue">
              <Landmark size={16} />
            </div>
          </div>
          <div className="acc-kpi-value">
            ${Number(telemetry.reconciledCashMtd).toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
          <div className="acc-kpi-footer">
            <span className="acc-trend-neutral">100% Cleared</span>
            <span className="acc-kpi-subtext">matched to bank deposits</span>
          </div>
        </div>

        <div className="acc-kpi-card">
          <div className="acc-kpi-header">
            <span className="acc-kpi-label">GL ERP Gateway Latency</span>
            <div className="acc-kpi-icon-wrapper icon-amber">
              <Clock size={16} />
            </div>
          </div>
          <div className="acc-kpi-value">{telemetry.avgErpLatencyMs} ms</div>
          <div className="acc-kpi-footer">
            <span className="acc-trend-positive">Real-time</span>
            <span className="acc-kpi-subtext">REST API post speed</span>
          </div>
        </div>
      </div>

      {/* 4. 5-Stage Accounting Pipeline Visualizer */}
      <div className="acc-pipeline-card">
        <div className="acc-pipeline-header">
          <div className="acc-pipeline-title-group">
            <Layers size={17} className="acc-pipeline-title-icon" />
            <h3 className="acc-pipeline-title">Deterministic 5-Stage Accounting & Reconciliation Pipeline</h3>
          </div>
          <div className="acc-pipeline-badge">
            <ShieldCheck size={14} />
            <span>Cryptographic Proof: {telemetry.latestSyncSeal.substring(0, 19)}...</span>
          </div>
        </div>

        <div className="acc-stages-row">
          <div className="acc-stage-item stage-completed">
            <div className="acc-stage-number">1</div>
            <div className="acc-stage-body">
              <span className="acc-stage-title">Sub-Ledger Ingestion</span>
              <span className="acc-stage-desc">Claims & 835 ERA Payments Captured</span>
            </div>
          </div>

          <div className="acc-stage-arrow">→</div>

          <div className="acc-stage-item stage-completed">
            <div className="acc-stage-number">2</div>
            <div className="acc-stage-body">
              <span className="acc-stage-title">COA Mapping</span>
              <span className="acc-stage-desc">Accounts & Cost Centers Assigned</span>
            </div>
          </div>

          <div className="acc-stage-arrow">→</div>

          <div className="acc-stage-item stage-completed">
            <div className="acc-stage-number">3</div>
            <div className="acc-stage-body">
              <span className="acc-stage-title">Double-Entry Validation</span>
              <span className="acc-stage-desc">Sum(Debits) - Sum(Credits) = $0.00</span>
            </div>
          </div>

          <div className="acc-stage-arrow">→</div>

          <div className="acc-stage-item stage-completed">
            <div className="acc-stage-number">4</div>
            <div className="acc-stage-body">
              <span className="acc-stage-title">GL ERP Dispatch</span>
              <span className="acc-stage-desc">NetSuite / QuickBooks REST Post</span>
            </div>
          </div>

          <div className="acc-stage-arrow">→</div>

          <div className="acc-stage-item stage-active">
            <div className="acc-stage-number">5</div>
            <div className="acc-stage-body">
              <span className="acc-stage-title">Bank Reconciliation</span>
              <span className="acc-stage-desc">Sub-Ledger vs Bank Deposit Cleared</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Sub-Navigation Tab Bar */}
      <div className="acc-tab-bar">
        <button
          className={`acc-tab-btn ${activeSubTab === 'journal_batches' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('journal_batches')}
        >
          <BookOpen size={15} />
          <span>Journal Entry Batches</span>
          <span className="acc-tab-count">{batches.length}</span>
        </button>

        <button
          className={`acc-tab-btn ${activeSubTab === 'chart_of_accounts' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('chart_of_accounts')}
        >
          <Database size={15} />
          <span>Chart of Accounts (COA)</span>
          <span className="acc-tab-count">{coaList.length}</span>
        </button>

        <button
          className={`acc-tab-btn ${activeSubTab === 'bank_reconciliation' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('bank_reconciliation')}
        >
          <Landmark size={15} />
          <span>Bank Reconciliation</span>
          <span className="acc-tab-count">{reconciliations.length}</span>
        </button>

        <button
          className={`acc-tab-btn ${activeSubTab === 'accounting_exceptions' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('accounting_exceptions')}
        >
          <AlertTriangle size={15} />
          <span>Accounting Exceptions</span>
          <span className="acc-tab-count count-amber">{exceptions.length}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="acc-filter-row">
        <div className="acc-search-wrapper">
          <Search size={15} className="acc-search-icon" />
          <input
            type="text"
            className="acc-search-input"
            placeholder="Search by Batch Control Number, Account Code, Reconciliation Code, or Status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="acc-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 6. Tab Content Area */}
      {/* Subtab 1: Journal Entry Batches */}
      {activeSubTab === 'journal_batches' && (
        <div className="acc-table-card">
          <div className="acc-table-header">
            <h3 className="acc-card-title">General Ledger Journal Entry Batches</h3>
            <span className="acc-card-caption">All batches validated for strict double-entry balance prior to ERP dispatch</span>
          </div>

          <div className="acc-table-responsive">
            <table className="acc-data-table">
              <thead>
                <tr>
                  <th>Batch Control Number</th>
                  <th>Period</th>
                  <th>Batch Type</th>
                  <th>Lines</th>
                  <th>Total Debits</th>
                  <th>Total Credits</th>
                  <th>Variance</th>
                  <th>Balancing Invariant</th>
                  <th>Status</th>
                  <th>Cryptographic SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => (
                  <tr
                    key={b.id}
                    className={selectedBatchId === b.id ? 'row-selected' : ''}
                    onClick={() => setSelectedBatchId(b.id)}
                  >
                    <td>
                      <strong>{b.batchControlNumber}</strong>
                      <div className="acc-sub-id">{new Date(b.postedAt).toLocaleString()}</div>
                    </td>
                    <td>
                      <span className="acc-chip chip-period">{b.periodCode}</span>
                    </td>
                    <td>
                      <span className="acc-chip chip-type">{b.batchType}</span>
                    </td>
                    <td>{b.lineCount}</td>
                    <td>
                      <strong>${Number(b.totalDebit).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </td>
                    <td>
                      <strong>${Number(b.totalCredit).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </td>
                    <td>
                      <span className={b.varianceAmount === 0 ? 'acc-text-emerald' : 'acc-text-amber'}>
                        ${Number(b.varianceAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      {b.isBalanced ? (
                        <span className="acc-badge-balanced">
                          <Check size={13} />
                          Balanced ($0.00)
                        </span>
                      ) : (
                        <span className="acc-badge-imbalanced">
                          <AlertTriangle size={13} />
                          Imbalanced
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`acc-status-badge status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <span className="acc-seal-code" title={b.sha256SyncSeal}>
                        {b.sha256SyncSeal.substring(0, 19)}...
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredBatches.length === 0 && (
                  <tr>
                    <td colSpan={10} className="acc-empty-state">
                      No journal batches found matching search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected Batch Lines Inspector */}
          {selectedBatch && (
            <div className="acc-detail-panel">
              <div className="acc-detail-header">
                <h4>Itemized Journal Entry Distribution Lines for {selectedBatch.batchControlNumber}</h4>
                <span className="acc-sub-id">Period: {selectedBatch.periodCode} | Type: {selectedBatch.batchType}</span>
              </div>
              <div className="acc-table-responsive">
                <table className="acc-data-table">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Account Code</th>
                      <th>Account Name</th>
                      <th>Department</th>
                      <th>Debit Amount</th>
                      <th>Credit Amount</th>
                      <th>Description</th>
                      <th>Reference Trace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLines.map(line => (
                      <tr key={line.id || line.lineNumber}>
                        <td>{line.lineNumber}</td>
                        <td>
                          <strong>{line.accountCode}</strong>
                        </td>
                        <td>{line.accountName}</td>
                        <td>
                          <span className="acc-chip chip-dept">{line.departmentCode}</span>
                        </td>
                        <td>
                          {line.debitAmount > 0 ? (
                            <strong className="acc-text-blue">
                              ${Number(line.debitAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </strong>
                          ) : '—'}
                        </td>
                        <td>
                          {line.creditAmount > 0 ? (
                            <strong className="acc-text-emerald">
                              ${Number(line.creditAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </strong>
                          ) : '—'}
                        </td>
                        <td>{line.description}</td>
                        <td>
                          <span className="acc-mono-text">{line.referenceId || '—'}</span>
                        </td>
                      </tr>
                    ))}
                    {selectedLines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="acc-empty-state">
                          No line items found for this batch.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Chart of Accounts (COA) */}
      {activeSubTab === 'chart_of_accounts' && (
        <div className="acc-table-card">
          <div className="acc-table-header">
            <h3 className="acc-card-title">Chart of Accounts (COA) & Category Mapping Ledger</h3>
            <span className="acc-card-caption">
              Authoritative mapping linking ASC clinical billing categories to GAAP general ledger accounts
            </span>
          </div>

          <div className="acc-table-responsive">
            <table className="acc-data-table">
              <thead>
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Account Type</th>
                  <th>Platform Category Mapping</th>
                  <th>Normal Balance</th>
                  <th>Active Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoa.map(c => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.accountCode}</strong>
                    </td>
                    <td>{c.accountName}</td>
                    <td>
                      <span className="acc-chip chip-type">{c.accountType}</span>
                    </td>
                    <td>
                      <span className="acc-chip chip-category">{c.categoryMapping}</span>
                    </td>
                    <td>
                      <span className={`acc-chip ${c.normalBalance === 'DEBIT' ? 'chip-debit' : 'chip-credit'}`}>
                        {c.normalBalance}
                      </span>
                    </td>
                    <td>
                      {c.isActive ? (
                        <span className="acc-badge-balanced">
                          <Check size={13} />
                          Active
                        </span>
                      ) : (
                        <span className="acc-badge-imbalanced">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredCoa.length === 0 && (
                  <tr>
                    <td colSpan={6} className="acc-empty-state">
                      No Chart of Accounts records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Bank Reconciliation */}
      {activeSubTab === 'bank_reconciliation' && (
        <div className="acc-table-card">
          <div className="acc-table-header">
            <h3 className="acc-card-title">Sub-Ledger to Bank Reconciliation Ledger</h3>
            <span className="acc-card-caption">
              Automated matching between platform cash collections (835 ERA EFTs & patient card payments) and GL bank deposits
            </span>
          </div>

          <div className="acc-table-responsive">
            <table className="acc-data-table">
              <thead>
                <tr>
                  <th>Reconciliation Code</th>
                  <th>Reconciliation Date</th>
                  <th>Sub-Ledger Cash</th>
                  <th>GL Bank Deposit</th>
                  <th>Variance Amount</th>
                  <th>Status</th>
                  <th>Reconciled By</th>
                  <th>Notes & Trace</th>
                </tr>
              </thead>
              <tbody>
                {filteredReconciliations.map(r => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.reconciliationCode}</strong>
                    </td>
                    <td>{r.reconciliationDate}</td>
                    <td>${Number(r.subledgerCashAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(r.glBankDepositAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={r.varianceAmount === 0 ? 'acc-text-emerald' : 'acc-text-amber'}>
                        ${Number(r.varianceAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td>
                      {r.status === 'RECONCILED' ? (
                        <span className="acc-badge-balanced">
                          <Check size={13} />
                          Reconciled ($0.00)
                        </span>
                      ) : (
                        <span className="acc-badge-imbalanced">
                          <AlertTriangle size={13} />
                          Variance Flagged
                        </span>
                      )}
                    </td>
                    <td>{r.reconciledBy}</td>
                    <td>
                      <span className="acc-notes-text">{r.notes}</span>
                    </td>
                  </tr>
                ))}
                {filteredReconciliations.length === 0 && (
                  <tr>
                    <td colSpan={8} className="acc-empty-state">
                      No bank reconciliation records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Accounting Exceptions */}
      {activeSubTab === 'accounting_exceptions' && (
        <div className="acc-table-card">
          <div className="acc-table-header">
            <h3 className="acc-card-title">Accounting & Journal Exception Workqueue</h3>
            <span className="acc-card-caption">Quarantined records requiring finance review or Chart of Accounts remapping</span>
          </div>

          <div className="acc-table-responsive">
            <table className="acc-data-table">
              <thead>
                <tr>
                  <th>Exception Code</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Offending Account</th>
                  <th>Resolution Action</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExceptions.map(e => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.exceptionCode}</strong>
                    </td>
                    <td>
                      <span className="acc-chip chip-category">{e.exceptionCategory}</span>
                    </td>
                    <td>
                      <span className={`acc-severity-badge severity-${e.severity.toLowerCase()}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td>
                      <span className="acc-mono-text">{e.offendingAccount || '—'}</span>
                    </td>
                    <td>{e.resolutionAction}</td>
                    <td>
                      {e.isResolved ? (
                        <span className="acc-badge-resolved">
                          <Check size={13} />
                          Resolved
                        </span>
                      ) : (
                        <span className="acc-badge-pending">
                          <AlertTriangle size={13} />
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td>
                      {!e.isResolved ? (
                        <button
                          className="acc-btn-action"
                          onClick={() => handleResolveException(e.id)}
                        >
                          Resolve
                        </button>
                      ) : (
                        <span className="acc-sub-id">Cleared</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredExceptions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="acc-empty-state">
                      No active accounting exceptions. All journal batches and COA mappings are fully balanced.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Settings Modal / Drawer */}
      {isDrawerOpen && (
        <div className="acc-modal-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="acc-modal-content" onClick={e => e.stopPropagation()}>
            <div className="acc-modal-header">
              <div className="acc-modal-title-group">
                <Sliders size={18} />
                <h3>General Ledger ERP Configuration</h3>
              </div>
              <button className="acc-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="acc-modal-body">
              <div className="acc-config-group">
                <label className="acc-config-label">Accounting / GL ERP Vendor</label>
                <input
                  type="text"
                  className="acc-config-input"
                  value={config.accountingVendor}
                  readOnly
                />
              </div>

              <div className="acc-config-group">
                <label className="acc-config-label">Gateway Transport Mode</label>
                <input
                  type="text"
                  className="acc-config-input"
                  value={config.gatewayMode}
                  readOnly
                />
              </div>

              <div className="acc-config-group">
                <label className="acc-config-label">REST API Endpoint URL</label>
                <input
                  type="text"
                  className="acc-config-input"
                  value={config.apiEndpointUrl}
                  readOnly
                />
              </div>

              <div className="acc-config-row">
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">Subsidiary / Company ID</label>
                  <input
                    type="text"
                    className="acc-config-input"
                    value={config.subsidiaryCompanyId}
                    readOnly
                  />
                </div>
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">Current Accounting Period</label>
                  <input
                    type="text"
                    className="acc-config-input"
                    value={config.currentAccountingPeriod}
                    readOnly
                  />
                </div>
              </div>

              <div className="acc-config-row">
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">OAuth2 Client ID</label>
                  <input
                    type="text"
                    className="acc-config-input"
                    value={config.clientId}
                    readOnly
                  />
                </div>
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">Client Secret (Encrypted)</label>
                  <input
                    type="text"
                    className="acc-config-input acc-mono-text"
                    value={config.clientSecretMasked}
                    readOnly
                  />
                </div>
              </div>

              <div className="acc-config-row">
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">Auto-Post Schedule</label>
                  <input
                    type="text"
                    className="acc-config-input"
                    value={config.autoPostSchedule}
                    readOnly
                  />
                </div>
                <div className="acc-config-group flex-1">
                  <label className="acc-config-label">Lock Closed Periods</label>
                  <input
                    type="text"
                    className="acc-config-input"
                    value={config.lockClosedPeriods ? 'Enabled (Strict)' : 'Disabled'}
                    readOnly
                  />
                </div>
              </div>
            </div>

            <div className="acc-modal-footer">
              <button
                className="acc-btn acc-btn-secondary"
                onClick={() => setIsDrawerOpen(false)}
              >
                Close
              </button>
              <button
                className="acc-btn acc-btn-primary"
                onClick={handleTestConnection}
              >
                Test Gateway Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
