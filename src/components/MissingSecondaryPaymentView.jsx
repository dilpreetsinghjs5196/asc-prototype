import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Layers,
  ShieldCheck,
  FileText,
  Send,
  RefreshCw,
  Download,
  Search,
  Filter,
  ArrowRight,
  Lock,
  Unlock,
  FileCheck,
  XCircle,
  AlertTriangle,
  Layers as LayersIcon,
  HelpCircle
} from 'lucide-react';
import {
  missingSecondaryService,
  SECONDARY_COB_MODELS,
  LEAKAGE_ROOT_CAUSES,
  PRIORITY_TIERS,
  QUEUE_STATUSES
} from '../lib/missingSecondaryService';
import './MissingSecondaryPaymentView.css';

export default function MissingSecondaryPaymentView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'inspector', 'crossover', 'guardian'
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [causeFilter, setCauseFilter] = useState('ALL');
  const [cobFilter, setCobFilter] = useState('ALL');
  const [heldOnlyFilter, setHeldOnlyFilter] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState('fac-surgical-01');
  const [selectedId, setSelectedId] = useState('msp-001');

  // Modals state
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [writeOffModalOpen, setWriteOffModalOpen] = useState(false);
  const [packetModalOpen, setPacketModalOpen] = useState(false);
  const [submissionMethod, setSubmissionMethod] = useState('ELECTRONIC_EDI_837P');
  const [supervisorName, setSupervisorName] = useState('Dr. Marcus Welby, MD (Medical Director)');
  const [transferReason, setTransferReason] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('');

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch data
  const cases = useMemo(() => {
    return missingSecondaryService.getAllCases(selectedFacility, {
      tier: tierFilter,
      status: statusFilter,
      cause: causeFilter,
      cobModel: cobFilter,
      heldOnly: heldOnlyFilter,
      search: searchTerm
    });
  }, [selectedFacility, tierFilter, statusFilter, causeFilter, cobFilter, heldOnlyFilter, searchTerm, refreshKey]);

  const metrics = useMemo(() => {
    return missingSecondaryService.getMetrics(selectedFacility);
  }, [selectedFacility, refreshKey]);

  const selectedCase = useMemo(() => {
    return missingSecondaryService.getCaseById(selectedId) || cases[0] || null;
  }, [selectedId, cases]);

  const cobPacket = useMemo(() => {
    if (!selectedCase) return null;
    try {
      return missingSecondaryService.generateCobClaimPacket(selectedCase.id);
    } catch {
      return null;
    }
  }, [selectedCase]);

  // Actions
  const handleSubmitClaim = () => {
    if (!selectedCase) return;
    try {
      missingSecondaryService.submitSecondaryClaim(selectedCase.id, submissionMethod);
      setSubmitModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTransferToPatient = () => {
    if (!selectedCase) return;
    try {
      missingSecondaryService.transferToPatient(
        selectedCase.id,
        'usr-sup-01',
        supervisorName,
        transferReason
      );
      setTransferModalOpen(false);
      setTransferReason('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleWriteOff = () => {
    if (!selectedCase) return;
    try {
      missingSecondaryService.writeOffSecondary(
        selectedCase.id,
        'usr-sup-01',
        supervisorName,
        writeOffReason
      );
      setWriteOffModalOpen(false);
      setWriteOffReason('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleHold = (id, currentHeld) => {
    try {
      missingSecondaryService.suppressPatientStatement(id, !currentHeld);
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'ClaimNumber',
      'Patient',
      'MRN',
      'PrimaryPayer',
      'PrimaryPaid',
      'PrimaryAllowed',
      'PrimaryPRBalance',
      'SecondaryPayer',
      'PolicyNumber',
      'COBModel',
      'SecondaryExpected',
      'DaysUntilDeadline',
      'RootCause',
      'PriorityTier',
      'QueueStatus',
      'StatementHeld'
    ];
    const rows = cases.map(c => [
      c.claim_number,
      `"${c.patient_name}"`,
      c.patient_mrn,
      `"${c.primary_payer_name}"`,
      c.primary_paid_amount,
      c.primary_allowed_amount,
      c.primary_patient_resp_amount,
      `"${c.secondary_payer_name}"`,
      c.secondary_policy_number,
      c.secondary_cob_model,
      c.secondary_expected_amount,
      c.days_until_filing_deadline,
      c.leakage_root_cause,
      c.priority_tier,
      c.queue_status,
      c.patient_statement_held
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `missing_secondary_payments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="msp-container">
      {/* 1. Header Banner */}
      <div className="msp-header">
        <div>
          <div className="msp-header-title-row">
            <span className="msp-badge-phase">Phase 95</span>
            <h1 className="msp-title">Missing Secondary Payment &amp; COB Leakage</h1>
          </div>
          <p className="msp-subtitle">
            Secondary and supplemental reimbursement recovery, Medigap coordination, and patient statement suppression guardian.
          </p>
        </div>

        <div className="msp-header-actions">
          <select
            className="msp-filter-select"
            value={selectedFacility}
            onChange={e => setSelectedFacility(e.target.value)}
          >
            <option value="fac-surgical-01">St. Jude Ambulatory Surgery Center</option>
            <option value="fac-surgical-02">Pacific Coast Outpatient Pavilion</option>
          </select>

          <button className="msp-btn msp-btn-secondary" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={14} /> Sync Remittances
          </button>

          <button className="msp-btn msp-btn-secondary" onClick={handleExportCsv}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* 2. 5-Card KPI Ribbon */}
      <div className="msp-kpi-grid">
        <div className="msp-kpi-card">
          <div className="msp-kpi-header">
            <span>Active Secondary Encounters</span>
            <AlertCircle size={16} color="#0284c7" />
          </div>
          <div className="msp-kpi-value">{metrics.activeCasesCount}</div>
          <div className="msp-kpi-subtext">Unresolved secondary opportunities</div>
        </div>

        <div className="msp-kpi-card">
          <div className="msp-kpi-header">
            <span>Disputed Patient Responsibility</span>
            <DollarSign size={16} color="#64748b" />
          </div>
          <div className="msp-kpi-value">${metrics.totalPatientRespAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="msp-kpi-subtext">PR-1 deductible &amp; PR-2 coinsurance</div>
        </div>

        <div className="msp-kpi-card">
          <div className="msp-kpi-header">
            <span>Expected Secondary Recovery</span>
            <CheckCircle2 size={16} color="#10b981" />
          </div>
          <div className="msp-kpi-value" style={{ color: '#10b981' }}>
            ${metrics.totalExpectedRecovery.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="msp-kpi-subtext">Deterministic Medigap &amp; COB yield</div>
        </div>

        <div className="msp-kpi-card">
          <div className="msp-kpi-header">
            <span>Critical &amp; High Pipeline</span>
            <Clock size={16} color="#f97316" />
          </div>
          <div className="msp-kpi-value" style={{ color: '#f97316' }}>
            ${metrics.criticalHighPipeline.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="msp-kpi-subtext">Imminent filing deadline target</div>
        </div>

        <div className="msp-kpi-card">
          <div className="msp-kpi-header">
            <span>Patient Statements Suppressed</span>
            <ShieldCheck size={16} color="#38bdf8" />
          </div>
          <div className="msp-kpi-value" style={{ color: '#38bdf8' }}>
            ${metrics.heldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="msp-kpi-subtext">{metrics.statementsHeldCount} accounts protected from premature billing</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="msp-tabs-bar">
        <button
          className={`msp-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Layers size={16} /> Prioritized Secondary Queue ({cases.length})
        </button>
        <button
          className={`msp-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          <DollarSign size={16} /> COB &amp; Calculation Inspector
        </button>
        <button
          className={`msp-tab-btn ${activeTab === 'crossover' ? 'active' : ''}`}
          onClick={() => setActiveTab('crossover')}
        >
          <RefreshCw size={16} /> Payer Crossover Hub
        </button>
        <button
          className={`msp-tab-btn ${activeTab === 'guardian' ? 'active' : ''}`}
          onClick={() => setActiveTab('guardian')}
        >
          <ShieldCheck size={16} /> Statement Hold Guardian ({metrics.statementsHeldCount})
        </button>
      </div>

      {/* 4. Tab Content */}

      {/* TAB 1: PRIORITIZED QUEUE */}
      {activeTab === 'queue' && (
        <div>
          <div className="msp-toolbar">
            <div className="msp-search-box">
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                className="msp-search-input"
                placeholder="Search claim, patient, primary payer, secondary policy..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="msp-filter-select"
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
              >
                <option value="ALL">All Priority Tiers</option>
                <option value="CRITICAL_URGENT">Critical Urgent (80-100)</option>
                <option value="HIGH_PRIORITY">High Priority (65-79.99)</option>
                <option value="MEDIUM_PRIORITY">Medium Priority (45-64.99)</option>
                <option value="LOW_PRIORITY">Low Priority (25-44.99)</option>
                <option value="UNCOLLECTIBLE_HOLD">Uncollectible Hold (&lt;25)</option>
              </select>

              <select
                className="msp-filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Queue Statuses</option>
                <option value="IDENTIFIED">Identified Leakage</option>
                <option value="READY_TO_FILE">Ready to File</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="PENDING_ADJUDICATION">Pending Remit</option>
                <option value="RECOVERED">Recovered</option>
                <option value="TRANSFERRED_TO_PATIENT">Transferred to Patient</option>
                <option value="WRITTEN_OFF">Written Off</option>
              </select>

              <select
                className="msp-filter-select"
                value={cobFilter}
                onChange={e => setCobFilter(e.target.value)}
              >
                <option value="ALL">All COB Models</option>
                <option value="MEDIGAP_SUPPLEMENT">Medigap Supplement</option>
                <option value="STANDARD_COB">Standard COB</option>
                <option value="NON_DUPLICATION_CARVEOUT">Non-Duplication</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={heldOnlyFilter}
                  onChange={e => setHeldOnlyFilter(e.target.checked)}
                />
                Statements Held Only
              </label>
            </div>
          </div>

          <div className="msp-table-card">
            <div className="msp-table-wrapper">
              <table className="msp-table">
                <thead>
                  <tr>
                    <th>Tier / Score</th>
                    <th>Claim # / Patient</th>
                    <th>Primary Payer &amp; EOB</th>
                    <th>Secondary Payer &amp; COB</th>
                    <th>PR Balance</th>
                    <th>Exp. Recovery</th>
                    <th>Filing Limit</th>
                    <th>Patient Hold</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(item => {
                    const isSelected = selectedCase && selectedCase.id === item.id;
                    const isExpired = item.days_until_filing_deadline < 0;

                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedId(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className={`msp-tier-pill msp-tier-${item.priority_tier}`}>
                            {PRIORITY_TIERS[item.priority_tier]?.label || item.priority_tier}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            Score: <strong>{item.priority_score.toFixed(1)}</strong>/100
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.claim_number}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {item.patient_name} ({item.patient_mrn})
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{item.primary_payer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            Paid: ${item.primary_paid_amount.toFixed(2)} | EOB: {item.primary_eob_date}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>{item.secondary_payer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                            {SECONDARY_COB_MODELS[item.secondary_cob_model]?.label || item.secondary_cob_model}
                          </div>
                        </td>

                        <td style={{ fontWeight: 700, color: '#f8fafc' }}>
                          ${item.primary_patient_resp_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td style={{ fontWeight: 700, color: '#10b981' }}>
                          ${item.secondary_expected_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td>
                          {isExpired ? (
                            <span className="msp-deadline-pill msp-deadline-expired">
                              Expired ({Math.abs(item.days_until_filing_deadline)}d ago)
                            </span>
                          ) : item.days_until_filing_deadline <= 15 ? (
                            <span className="msp-deadline-pill msp-deadline-critical">
                              <Clock size={12} /> {item.days_until_filing_deadline}d left (Cliff)
                            </span>
                          ) : item.days_until_filing_deadline <= 30 ? (
                            <span className="msp-deadline-pill msp-deadline-warning">
                              <Clock size={12} /> {item.days_until_filing_deadline}d left
                            </span>
                          ) : (
                            <span className="msp-deadline-pill msp-deadline-safe">
                              {item.days_until_filing_deadline}d left
                            </span>
                          )}
                        </td>

                        <td>
                          {item.patient_statement_held ? (
                            <span className="msp-hold-pill msp-hold-active" title="Statement suppressed from patient billing">
                              <Lock size={12} /> Held
                            </span>
                          ) : (
                            <span className="msp-hold-pill msp-hold-breached" title="WARNING: Patient statement was generated">
                              <AlertTriangle size={12} /> Unheld
                            </span>
                          )}
                        </td>

                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            backgroundColor: `${QUEUE_STATUSES[item.queue_status]?.color}22`,
                            color: QUEUE_STATUSES[item.queue_status]?.color || '#cbd5e1',
                            border: `1px solid ${QUEUE_STATUSES[item.queue_status]?.color || '#475569'}`
                          }}>
                            {QUEUE_STATUSES[item.queue_status]?.label || item.queue_status}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {!isExpired && item.queue_status !== 'SUBMITTED' && item.queue_status !== 'RECOVERED' && (
                              <button
                                className="msp-btn msp-btn-primary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(item.id);
                                  setSubmitModalOpen(true);
                                }}
                                title="Submit electronic secondary claim"
                              >
                                <Send size={12} /> Submit
                              </button>
                            )}

                            <button
                              className="msp-btn msp-btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id);
                                setPacketModalOpen(true);
                              }}
                              title="View COB claim packet"
                            >
                              <FileText size={12} />
                            </button>

                            <button
                              className="msp-btn msp-btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleHold(item.id, item.patient_statement_held);
                              }}
                              title={item.patient_statement_held ? 'Release patient statement hold' : 'Hold statement'}
                            >
                              {item.patient_statement_held ? <Unlock size={12} /> : <Lock size={12} />}
                            </button>

                            {item.queue_status !== 'WRITTEN_OFF' && (
                              <button
                                className="msp-btn msp-btn-danger"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(item.id);
                                  setWriteOffModalOpen(true);
                                }}
                                title="Write-off uncollectible secondary"
                              >
                                <XCircle size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COB & CALCULATION INSPECTOR */}
      {activeTab === 'inspector' && selectedCase && (
        <div className="msp-inspector-grid">
          {/* Card 1: 4-Factor Breakdown */}
          <div className="msp-card">
            <h3 className="msp-card-title">
              <DollarSign size={18} color="#0284c7" /> Deterministic 4-Factor Priority Score
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Claim: <strong>{selectedCase.claim_number}</strong> | Patient: <strong>{selectedCase.patient_name}</strong>
            </p>

            {/* Factor 1: Balance Score */}
            <div className="msp-subscore-bar-group">
              <div className="msp-subscore-meta">
                <span>Secondary Balance Score (Weight: 35%)</span>
                <strong>{selectedCase.balance_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="msp-progress-track">
                <div
                  className="msp-progress-fill"
                  style={{ width: `${selectedCase.balance_score}%`, backgroundColor: '#0284c7' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Secondary expected yield: ${selectedCase.secondary_expected_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} (Benchmark: $1,500.00)
              </div>
            </div>

            {/* Factor 2: Urgency Score */}
            <div className="msp-subscore-bar-group">
              <div className="msp-subscore-meta">
                <span>Filing Deadline Urgency (Weight: 30%)</span>
                <strong>{selectedCase.urgency_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="msp-progress-track">
                <div
                  className="msp-progress-fill"
                  style={{
                    width: `${selectedCase.urgency_score}%`,
                    backgroundColor: selectedCase.days_until_filing_deadline <= 15 ? '#ef4444' : '#f59e0b'
                  }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                {selectedCase.days_until_filing_deadline < 0
                  ? 'Expired filing limit from primary EOB date: Urgency forced to 0.00.'
                  : `${selectedCase.days_until_filing_deadline} calendar days remaining until secondary filing window closes.`}
              </div>
            </div>

            {/* Factor 3: Coverage Certainty Score */}
            <div className="msp-subscore-bar-group">
              <div className="msp-subscore-meta">
                <span>Coverage Certainty (Weight: 20%)</span>
                <strong>{selectedCase.certainty_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="msp-progress-track">
                <div
                  className="msp-progress-fill"
                  style={{ width: `${selectedCase.certainty_score}%`, backgroundColor: '#10b981' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Tier: {selectedCase.coverage_certainty} (Real-time eligibility verification on DOS).
              </div>
            </div>

            {/* Factor 4: Filing Readiness Score */}
            <div className="msp-subscore-bar-group">
              <div className="msp-subscore-meta">
                <span>Filing Readiness (Weight: 15%)</span>
                <strong>{selectedCase.readiness_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="msp-progress-track">
                <div
                  className="msp-progress-fill"
                  style={{ width: `${selectedCase.readiness_score}%`, backgroundColor: '#38bdf8' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Status: {selectedCase.filing_readiness} (Primary 835 attached; Loop 2320 mapped).
              </div>
            </div>

            {/* Total Priority Score Box */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginTop: '1.25rem',
              border: '1px solid #334155'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Composite Secondary Priority Score</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
                    {selectedCase.priority_score.toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ 100.00</span>
                  </div>
                </div>
                <div className={`msp-tier-pill msp-tier-${selectedCase.priority_tier}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                  {PRIORITY_TIERS[selectedCase.priority_tier]?.label}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                ({selectedCase.balance_score}×0.35) + ({selectedCase.urgency_score}×0.30) + ({selectedCase.certainty_score}×0.20) + ({selectedCase.readiness_score}×0.15)
              </div>
            </div>
          </div>

          {/* Card 2: COB Model Comparison & Adjudication Breakdown */}
          <div className="msp-card">
            <h3 className="msp-card-title">
              <LayersIcon size={18} color="#10b981" /> COB Calculation &amp; Adjudication Trace
            </h3>

            {/* Financial Summary */}
            <div style={{
              backgroundColor: '#1e293b',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginBottom: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Primary Allowed</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  ${selectedCase.primary_allowed_amount.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Primary Paid</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8' }}>
                  ${selectedCase.primary_paid_amount.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Secondary Due</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>
                  ${selectedCase.secondary_expected_amount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* COB Model Logic Applied */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Governing COB Model
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                  {SECONDARY_COB_MODELS[selectedCase.secondary_cob_model]?.label}:
                </span>{' '}
                {SECONDARY_COB_MODELS[selectedCase.secondary_cob_model]?.description}
              </div>
            </div>

            {/* Leakage Root Cause */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Identified Leakage Root Cause
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                <span style={{ fontWeight: 700, color: '#f59e0b' }}>
                  {LEAKAGE_ROOT_CAUSES[selectedCase.leakage_root_cause]?.label}:
                </span>{' '}
                {LEAKAGE_ROOT_CAUSES[selectedCase.leakage_root_cause]?.description}
              </div>
            </div>

            {/* Patient Statement Hold Status */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Patient Statement Suppression
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                {selectedCase.patient_statement_held ? (
                  <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Lock size={16} /> Patient statement is actively held to prevent premature balance billing.
                  </span>
                ) : (
                  <span style={{ color: '#fda4af', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={16} /> HOLD RELEASED: Balance has been transferred to patient billing.
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="msp-btn msp-btn-primary"
                onClick={() => setSubmitModalOpen(true)}
              >
                <Send size={14} /> Submit Secondary Claim
              </button>
              <button
                className="msp-btn msp-btn-secondary"
                onClick={() => setPacketModalOpen(true)}
              >
                <FileText size={14} /> View 837P COB Payload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAYER CROSSOVER HUB */}
      {activeTab === 'crossover' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <div className="msp-card">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RefreshCw size={16} color="#0284c7" /> Automatic Medicare COBA Crossovers
            </h4>
            <p style={{ fontSize: '0.775rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Claims where Medicare Part B electronically transmitted adjudication data to supplemental plans (Remark Code MA18).
            </p>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {cases.filter(c => c.leakage_root_cause !== 'FAILED_CROSSOVER').map(c => (
                <div key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.claim_number}</div>
                    <div style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{c.patient_name} &bull; {c.secondary_payer_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#10b981', fontWeight: 700 }}>${c.secondary_expected_amount.toFixed(2)}</div>
                    <div style={{ fontSize: '0.725rem', color: '#38bdf8' }}>{c.queue_status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="msp-card" style={{ borderLeft: '4px solid #ef4444' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} color="#ef4444" /> Failed Crossover &amp; Manual Queues
            </h4>
            <p style={{ fontSize: '0.775rem', color: '#94a3b8', marginBottom: '1rem' }}>
              Medicare/Commercial crossovers that failed to transmit automatically; manual electronic 837P submission required.
            </p>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {cases.filter(c => c.leakage_root_cause === 'FAILED_CROSSOVER' || c.leakage_root_cause === 'UNFILED_SECONDARY_CLAIM').map(c => (
                <div key={c.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.claim_number}</div>
                    <div style={{ fontSize: '0.725rem', color: '#fca5a5' }}>{c.patient_name} &bull; {c.secondary_payer_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#ef4444', fontWeight: 700 }}>${c.secondary_expected_amount.toFixed(2)}</div>
                    <div style={{ fontSize: '0.725rem', color: '#fbbf24' }}>{c.days_until_filing_deadline}d left</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PATIENT STATEMENT HOLD GUARDIAN */}
      {activeTab === 'guardian' && (
        <div className="msp-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 className="msp-card-title" style={{ margin: 0 }}>
                <ShieldCheck size={18} color="#38bdf8" /> Patient Statement Suppression Guardian
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
                Enforces compliance by preventing premature patient billing on claims with active secondary insurance policies.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                ${metrics.heldAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Protected from Collection</div>
            </div>
          </div>

          <div className="msp-table-wrapper">
            <table className="msp-table">
              <thead>
                <tr>
                  <th>Claim # / Patient</th>
                  <th>Primary Payer</th>
                  <th>Secondary Payer</th>
                  <th>Patient Responsibility</th>
                  <th>Secondary Coverage Status</th>
                  <th>Hold Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.claim_number}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.patient_name} ({item.patient_mrn})</div>
                    </td>
                    <td>{item.primary_payer_name}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.secondary_payer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{item.secondary_policy_number}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: '#f8fafc' }}>
                      ${item.primary_patient_resp_amount.toFixed(2)}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                        {item.coverage_certainty}
                      </span>
                    </td>
                    <td>
                      {item.patient_statement_held ? (
                        <span className="msp-hold-pill msp-hold-active">
                          <Lock size={12} /> Held (Protected)
                        </span>
                      ) : (
                        <span className="msp-hold-pill msp-hold-breached">
                          <AlertTriangle size={12} /> Unheld (At Risk)
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="msp-btn msp-btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                        onClick={() => handleToggleHold(item.id, item.patient_statement_held)}
                      >
                        {item.patient_statement_held ? 'Release Hold' : 'Reinstate Hold'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. MODALS */}

      {/* MODAL 1: SUBMIT SECONDARY CLAIM */}
      {submitModalOpen && selectedCase && (
        <div className="msp-modal-overlay" onClick={() => setSubmitModalOpen(false)}>
          <div className="msp-modal-content" onClick={e => e.stopPropagation()}>
            <div className="msp-modal-header">
              <h3 style={{ margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={18} color="#0284c7" /> Submit Secondary Insurance Claim
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setSubmitModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Claim: <strong>{selectedCase.claim_number}</strong> | Patient: <strong>{selectedCase.patient_name}</strong>
              <br />
              Secondary Payer: <strong>{selectedCase.secondary_payer_name}</strong>
              <br />
              Expected Recovery: <strong style={{ color: '#10b981' }}>${selectedCase.secondary_expected_amount.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Submission Transmission Method:
            </label>
            <select
              className="msp-filter-select"
              style={{ width: '100%', marginBottom: '1rem' }}
              value={submissionMethod}
              onChange={e => setSubmissionMethod(e.target.value)}
            >
              <option value="ELECTRONIC_EDI_837P">Clearinghouse Electronic 837P (Loop 2320/2330 COB)</option>
              <option value="DIRECT_PAYER_PORTAL">Secondary Payer Web Portal with EOB PDF</option>
              <option value="PAPER_CMS_1500_EOB">Certified Mail CMS-1500 with Primary Remittance</option>
            </select>

            <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
              <CheckCircle2 size={12} color="#10b981" style={{ display: 'inline', marginRight: '4px' }} />
              Primary 835 Remittance Advice from {selectedCase.primary_payer_name} will be automatically bundled into this submission packet.
            </div>

            <div className="msp-modal-footer">
              <button className="msp-btn msp-btn-secondary" onClick={() => setSubmitModalOpen(false)}>
                Cancel
              </button>
              <button className="msp-btn msp-btn-primary" onClick={handleSubmitClaim}>
                Confirm &amp; Dispatch Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW COB PACKET */}
      {packetModalOpen && selectedCase && cobPacket && (
        <div className="msp-modal-overlay" onClick={() => setPacketModalOpen(false)}>
          <div className="msp-modal-content" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="msp-modal-header">
              <h3 style={{ margin: 0, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} color="#38bdf8" /> Electronic 837P COB Transmission Payload
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setPacketModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <pre style={{
                backgroundColor: '#0b1120',
                padding: '1rem',
                borderRadius: '0.375rem',
                border: '1px solid #1e293b',
                color: '#38bdf8',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                overflowX: 'auto'
              }}>
                {JSON.stringify(cobPacket, null, 2)}
              </pre>
            </div>

            <div className="msp-modal-footer">
              <button className="msp-btn msp-btn-secondary" onClick={() => setPacketModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: WRITE-OFF UNCOLLECTIBLE SECONDARY */}
      {writeOffModalOpen && selectedCase && (
        <div className="msp-modal-overlay" onClick={() => setWriteOffModalOpen(false)}>
          <div className="msp-modal-content" onClick={e => e.stopPropagation()}>
            <div className="msp-modal-header">
              <h3 style={{ margin: 0, color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} color="#ef4444" /> Supervisor Secondary Write-Off
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setWriteOffModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Authorizing contractual write-off of uncollectible secondary balance:
              <br />
              Claim: <strong>{selectedCase.claim_number}</strong> | Balance: <strong>${selectedCase.secondary_expected_amount.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Authorizing Supervisor:
            </label>
            <input
              type="text"
              className="msp-search-input"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
              value={supervisorName}
              onChange={e => setSupervisorName(e.target.value)}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Mandatory Contractual Justification Reason:
            </label>
            <textarea
              rows={3}
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#ffffff',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                fontSize: '0.825rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="E.g., Secondary timely filing limit expired from primary EOB date without waiver..."
              value={writeOffReason}
              onChange={e => setWriteOffReason(e.target.value)}
            />

            <div className="msp-modal-footer">
              <button className="msp-btn msp-btn-secondary" onClick={() => setWriteOffModalOpen(false)}>
                Cancel
              </button>
              <button className="msp-btn msp-btn-danger" onClick={handleWriteOff}>
                Execute Write-Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
