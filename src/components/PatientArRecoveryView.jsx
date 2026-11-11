import React, { useState, useMemo } from 'react';
import {
  Users,
  DollarSign,
  CreditCard,
  Clock,
  CheckCircle2,
  Heart,
  Send,
  Calendar,
  AlertTriangle,
  Search,
  Filter,
  Download,
  RefreshCw,
  FileText,
  PhoneCall,
  MessageSquare,
  ShieldCheck,
  XCircle,
  HelpCircle,
  TrendingUp
} from 'lucide-react';
import {
  patientArRecoveryService,
  PROPENSITY_TIERS,
  ENGAGEMENT_TIERS,
  RECOVERY_ACTION_TIERS,
  CASE_STATUSES
} from '../lib/patientArRecoveryService';
import './PatientArRecoveryView.css';

export default function PatientArRecoveryView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue', 'inspector', 'plans', 'charity'
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [p2pFilter, setP2pFilter] = useState('ALL');
  const [selectedFacility, setSelectedFacility] = useState('fac-surgical-01');
  const [selectedId, setSelectedId] = useState('par-001');

  // Modals state
  const [nudgeModalOpen, setNudgeModalOpen] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [charityModalOpen, setCharityModalOpen] = useState(false);

  // Form states for modals
  const [selectedInstallments, setSelectedInstallments] = useState(6);
  const [autopayEnabled, setAutopayEnabled] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD_ONLINE');
  const [fplPercentage, setFplPercentage] = useState(180);
  const [supervisorName, setSupervisorName] = useState('Dr. Marcus Welby, MD (Medical Director)');
  const [charityNotes, setCharityNotes] = useState('');
  const [nudgeChannel, setNudgeChannel] = useState('SMS_AND_EMAIL');

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch data
  const cases = useMemo(() => {
    return patientArRecoveryService.getAllCases(selectedFacility, {
      tier: tierFilter,
      status: statusFilter,
      p2p: p2pFilter,
      search: searchTerm
    });
  }, [selectedFacility, tierFilter, statusFilter, p2pFilter, searchTerm, refreshKey]);

  const plans = useMemo(() => {
    return patientArRecoveryService.getPaymentPlans(selectedFacility);
  }, [selectedFacility, refreshKey]);

  const metrics = useMemo(() => {
    return patientArRecoveryService.getMetrics(selectedFacility);
  }, [selectedFacility, refreshKey]);

  const selectedCase = useMemo(() => {
    return patientArRecoveryService.getCaseById(selectedId) || cases[0] || null;
  }, [selectedId, cases]);

  // Actions
  const handleSendNudge = () => {
    if (!selectedCase) return;
    try {
      patientArRecoveryService.sendDigitalNudge(selectedCase.id, nudgeChannel);
      setNudgeModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreatePlan = () => {
    if (!selectedCase) return;
    try {
      patientArRecoveryService.setupPaymentPlan(selectedCase.id, Number(selectedInstallments), autopayEnabled);
      setPlanModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRecordPayment = () => {
    if (!selectedCase) return;
    try {
      patientArRecoveryService.recordPatientPayment(selectedCase.id, Number(paymentAmount), paymentMethod);
      setPayModalOpen(false);
      setPaymentAmount('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApproveCharity = () => {
    if (!selectedCase) return;
    try {
      patientArRecoveryService.approveCharityCare(
        selectedCase.id,
        'usr-sup-01',
        supervisorName,
        Number(fplPercentage),
        charityNotes
      );
      setCharityModalOpen(false);
      setCharityNotes('');
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
      'Phone',
      'DOS',
      'OriginalPR',
      'PatientPaid',
      'BalanceDue',
      'DaysInAR',
      'PropensityTier',
      'EngagementTier',
      'PriorityScore',
      'RecoveryTier',
      'CaseStatus'
    ];
    const rows = cases.map(c => [
      c.claim_number,
      `"${c.patient_name}"`,
      c.patient_mrn,
      `"${c.patient_phone || ''}"`,
      c.date_of_service,
      c.original_patient_resp,
      c.patient_paid_amount,
      c.patient_balance_due,
      c.days_in_patient_ar,
      c.propensity_to_pay_tier,
      c.engagement_tier,
      c.priority_score,
      c.recovery_action_tier,
      c.case_status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `patient_ar_recovery_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="par-container">
      {/* 1. Header Banner */}
      <div className="par-header">
        <div>
          <div className="par-header-title-row">
            <span className="par-badge-phase">Phase 96</span>
            <h1 className="par-title">Patient AR Prioritization &amp; Self-Pay Recovery</h1>
          </div>
          <p className="par-subtitle">
            Post-insurance patient accounts receivable prioritization, Propensity-to-Pay risk segmentation, and compassionate payment plan recovery.
          </p>
        </div>

        <div className="par-header-actions">
          <select
            className="par-filter-select"
            value={selectedFacility}
            onChange={e => setSelectedFacility(e.target.value)}
          >
            <option value="fac-surgical-01">St. Jude Ambulatory Surgery Center</option>
            <option value="fac-surgical-02">Pacific Coast Outpatient Pavilion</option>
          </select>

          <button className="par-btn par-btn-secondary" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={14} /> Sync Ledger
          </button>

          <button className="par-btn par-btn-secondary" onClick={handleExportCsv}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* 2. 5-Card KPI Ribbon */}
      <div className="par-kpi-grid">
        <div className="par-kpi-card">
          <div className="par-kpi-header">
            <span>Active Patient AR Accounts</span>
            <Users size={16} color="#0284c7" />
          </div>
          <div className="par-kpi-value">{metrics.activeAccountsCount}</div>
          <div className="par-kpi-subtext">Post-insurance self-pay encounters</div>
        </div>

        <div className="par-kpi-card">
          <div className="par-kpi-header">
            <span>Total Collectible Self-Pay</span>
            <DollarSign size={16} color="#f97316" />
          </div>
          <div className="par-kpi-value" style={{ color: '#f97316' }}>
            ${metrics.totalBalanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="par-kpi-subtext">Net outstanding patient liability</div>
        </div>

        <div className="par-kpi-card">
          <div className="par-kpi-header">
            <span>Active Payment Plans Value</span>
            <CreditCard size={16} color="#10b981" />
          </div>
          <div className="par-kpi-value" style={{ color: '#10b981' }}>
            ${metrics.activePlansValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="par-kpi-subtext">{plans.filter(p => p.plan_status === 'ACTIVE').length} enrolled recurring autopay plans</div>
        </div>

        <div className="par-kpi-card">
          <div className="par-kpi-header">
            <span>Average Days in Patient AR</span>
            <Clock size={16} color="#38bdf8" />
          </div>
          <div className="par-kpi-value" style={{ color: '#38bdf8' }}>
            {metrics.avgDaysInAr} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>days</span>
          </div>
          <div className="par-kpi-subtext">Target: &lt; 45 days post-insurance</div>
        </div>

        <div className="par-kpi-card">
          <div className="par-kpi-header">
            <span>Recovered Cash MTD</span>
            <TrendingUp size={16} color="#059669" />
          </div>
          <div className="par-kpi-value" style={{ color: '#059669' }}>
            ${metrics.recoveredCashMtd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="par-kpi-subtext">Realized patient collections</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="par-tabs-bar">
        <button
          className={`par-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Users size={16} /> Prioritized Patient Queue ({cases.length})
        </button>
        <button
          className={`par-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          <DollarSign size={16} /> Scoring &amp; Propensity Inspector
        </button>
        <button
          className={`par-tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          <CreditCard size={16} /> Structured Payment Plans ({plans.length})
        </button>
        <button
          className={`par-tab-btn ${activeTab === 'charity' ? 'active' : ''}`}
          onClick={() => setActiveTab('charity')}
        >
          <Heart size={16} /> Charity Care &amp; Bad Debt Guardian
        </button>
      </div>

      {/* 4. Tab Content */}

      {/* TAB 1: PRIORITIZED QUEUE */}
      {activeTab === 'queue' && (
        <div>
          <div className="par-toolbar">
            <div className="par-search-box">
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                className="par-search-input"
                placeholder="Search patient, MRN, claim #, procedure..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="par-filter-select"
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
              >
                <option value="ALL">All Action Tiers</option>
                <option value="TIER_1_DIGITAL_NUDGE">Tier 1: Digital Nudge</option>
                <option value="TIER_2_PAYMENT_PLAN_OFFER">Tier 2: Installment Offer</option>
                <option value="TIER_3_COUNSELOR_OUTREACH">Tier 3: Counselor Call</option>
                <option value="TIER_4_FINAL_NOTICE">Tier 4: Pre-Collection Cure</option>
                <option value="TIER_5_BAD_DEBT_OR_CHARITY">Tier 5: Bad Debt / Charity</option>
              </select>

              <select
                className="par-filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Case Statuses</option>
                <option value="NEW_STATEMENT">New Statement</option>
                <option value="ENGAGED">Engaged</option>
                <option value="ON_PAYMENT_PLAN">On Payment Plan</option>
                <option value="PAID_IN_FULL">Paid in Full</option>
                <option value="CHARITY_APPROVED">Charity Approved</option>
                <option value="BAD_DEBT_ASSIGNED">Bad Debt Assigned</option>
              </select>

              <select
                className="par-filter-select"
                value={p2pFilter}
                onChange={e => setP2pFilter(e.target.value)}
              >
                <option value="ALL">All Propensity Tiers</option>
                <option value="EXCELLENT_PROPENSITY">Tier A (Excellent)</option>
                <option value="GOOD_PROPENSITY">Tier B (Good)</option>
                <option value="MODERATE_PROPENSITY">Tier C (Moderate)</option>
                <option value="LOW_PROPENSITY">Tier D (Low)</option>
                <option value="CHARITY_CANDIDATE">Charity Candidate</option>
              </select>
            </div>
          </div>

          <div className="par-table-card">
            <div className="par-table-wrapper">
              <table className="par-table">
                <thead>
                  <tr>
                    <th>Action Tier / Score</th>
                    <th>Patient Name &amp; MRN</th>
                    <th>Procedure / DOS</th>
                    <th>Total Charges</th>
                    <th>Ins. Paid</th>
                    <th>Balance Due</th>
                    <th>Days in AR</th>
                    <th>P2P Propensity</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(item => {
                    const isSelected = selectedCase && selectedCase.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedId(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className={`par-tier-pill par-tier-${item.recovery_action_tier}`}>
                            {RECOVERY_ACTION_TIERS[item.recovery_action_tier]?.label || item.recovery_action_tier}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            Score: <strong>{item.priority_score.toFixed(1)}</strong>/100
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.patient_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            {item.patient_mrn} &bull; {item.patient_phone || 'No phone'}
                          </div>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600 }}>CPT {item.cpt_code}</div>
                          <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            DOS: {item.date_of_service}
                          </div>
                        </td>

                        <td style={{ color: '#cbd5e1' }}>
                          ${item.total_charges.toFixed(2)}
                        </td>

                        <td style={{ color: '#38bdf8', fontWeight: 600 }}>
                          ${item.insurance_paid_amount.toFixed(2)}
                        </td>

                        <td style={{ fontWeight: 700, color: item.patient_balance_due > 0 ? '#f8fafc' : '#10b981' }}>
                          ${item.patient_balance_due.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td>
                          {item.days_in_patient_ar <= 30 ? (
                            <span className="par-aging-pill par-aging-fresh">
                              {item.days_in_patient_ar}d (Fresh)
                            </span>
                          ) : item.days_in_patient_ar <= 90 ? (
                            <span className="par-aging-pill par-aging-warning">
                              {item.days_in_patient_ar}d
                            </span>
                          ) : (
                            <span className="par-aging-pill par-aging-danger">
                              <AlertTriangle size={12} /> {item.days_in_patient_ar}d (Delinquent)
                            </span>
                          )}
                        </td>

                        <td>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: PROPENSITY_TIERS[item.propensity_to_pay_tier]?.badgeColor || '#94a3b8' }}>
                            {PROPENSITY_TIERS[item.propensity_to_pay_tier]?.label}
                          </span>
                        </td>

                        <td>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.725rem',
                            fontWeight: 600,
                            backgroundColor: `${CASE_STATUSES[item.case_status]?.color}22`,
                            color: CASE_STATUSES[item.case_status]?.color || '#cbd5e1',
                            border: `1px solid ${CASE_STATUSES[item.case_status]?.color || '#475569'}`
                          }}>
                            {CASE_STATUSES[item.case_status]?.label || item.case_status}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {item.patient_balance_due > 0 && item.case_status !== 'PAID_IN_FULL' && (
                              <>
                                <button
                                  className="par-btn par-btn-primary"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(item.id);
                                    setNudgeModalOpen(true);
                                  }}
                                  title="Send instant SMS/Email digital checkout link"
                                >
                                  <Send size={12} /> Nudge
                                </button>

                                {!item.payment_plan_id && (
                                  <button
                                    className="par-btn par-btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedId(item.id);
                                      setPlanModalOpen(true);
                                    }}
                                    title="Offer structured zero-interest installment plan"
                                  >
                                    <CreditCard size={12} /> Plan
                                  </button>
                                )}

                                <button
                                  className="par-btn par-btn-success"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(item.id);
                                    setPaymentAmount(item.patient_balance_due.toString());
                                    setPayModalOpen(true);
                                  }}
                                  title="Record patient cash/card payment"
                                >
                                  <DollarSign size={12} />
                                </button>
                              </>
                            )}

                            {item.propensity_to_pay_tier === 'CHARITY_CANDIDATE' && item.case_status !== 'CHARITY_APPROVED' && (
                              <button
                                className="par-btn par-btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(item.id);
                                  setCharityModalOpen(true);
                                }}
                                title="Screen for 100% charity care write-off"
                              >
                                <Heart size={12} color="#06b6d4" />
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

      {/* TAB 2: SCORING & PROPENSITY INSPECTOR */}
      {activeTab === 'inspector' && selectedCase && (
        <div className="par-inspector-grid">
          {/* Card 1: 4-Factor Breakdown */}
          <div className="par-card">
            <h3 className="par-card-title">
              <DollarSign size={18} color="#0284c7" /> Deterministic 4-Factor Recovery Priority
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Patient: <strong>{selectedCase.patient_name}</strong> | MRN: <strong>{selectedCase.patient_mrn}</strong>
            </p>

            {/* Factor 1: Balance Score */}
            <div className="par-subscore-bar-group">
              <div className="par-subscore-meta">
                <span>Balance Score (Weight: 35%)</span>
                <strong>{selectedCase.balance_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="par-progress-track">
                <div
                  className="par-progress-fill"
                  style={{ width: `${selectedCase.balance_score}%`, backgroundColor: '#0284c7' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Outstanding self-pay due: ${selectedCase.patient_balance_due.toFixed(2)} (Benchmark: $1,000.00).
              </div>
            </div>

            {/* Factor 2: Propensity Score */}
            <div className="par-subscore-bar-group">
              <div className="par-subscore-meta">
                <span>Propensity-to-Pay (P2P) Score (Weight: 30%)</span>
                <strong>{selectedCase.propensity_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="par-progress-track">
                <div
                  className="par-progress-fill"
                  style={{ width: `${selectedCase.propensity_score}%`, backgroundColor: '#10b981' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Tier: {PROPENSITY_TIERS[selectedCase.propensity_to_pay_tier]?.label}.
              </div>
            </div>

            {/* Factor 3: Aging Urgency Score */}
            <div className="par-subscore-bar-group">
              <div className="par-subscore-meta">
                <span>Aging Urgency Score (Weight: 20%)</span>
                <strong>{selectedCase.urgency_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="par-progress-track">
                <div
                  className="par-progress-fill"
                  style={{ width: `${selectedCase.urgency_score}%`, backgroundColor: '#f59e0b' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                {selectedCase.days_in_patient_ar} days elapsed since first statement ({selectedCase.statement_date}).
              </div>
            </div>

            {/* Factor 4: Engagement Score */}
            <div className="par-subscore-bar-group">
              <div className="par-subscore-meta">
                <span>Digital Reachability Score (Weight: 15%)</span>
                <strong>{selectedCase.engagement_score.toFixed(1)} / 100.0</strong>
              </div>
              <div className="par-progress-track">
                <div
                  className="par-progress-fill"
                  style={{ width: `${selectedCase.engagement_score}%`, backgroundColor: '#38bdf8' }}
                />
              </div>
              <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '0.25rem' }}>
                Channel: {ENGAGEMENT_TIERS[selectedCase.engagement_tier]?.label}.
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
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Composite Recovery Priority Score</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
                    {selectedCase.priority_score.toFixed(2)} <span style={{ fontSize: '1rem', color: '#94a3b8' }}>/ 100.00</span>
                  </div>
                </div>
                <div className={`par-tier-pill par-tier-${selectedCase.recovery_action_tier}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                  {RECOVERY_ACTION_TIERS[selectedCase.recovery_action_tier]?.label}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                ({selectedCase.balance_score}×0.35) + ({selectedCase.propensity_score}×0.30) + ({selectedCase.urgency_score}×0.20) + ({selectedCase.engagement_score}×0.15)
              </div>
            </div>
          </div>

          {/* Card 2: Financial Ledger & Recommended Strategy */}
          <div className="par-card">
            <h3 className="par-card-title">
              <FileText size={18} color="#10b981" /> Financial Ledger &amp; Recommended Action
            </h3>

            {/* Financial Ledger Summary */}
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
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Billed Charges</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                  ${selectedCase.total_charges.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Ins. Adjudicated</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8' }}>
                  ${selectedCase.insurance_paid_amount.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>Patient Balance</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f97316' }}>
                  ${selectedCase.patient_balance_due.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Recommended Workflow Action */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Recommended Recovery Workflow
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                <span style={{ fontWeight: 700, color: '#10b981' }}>
                  {RECOVERY_ACTION_TIERS[selectedCase.recovery_action_tier]?.label}:
                </span>{' '}
                {RECOVERY_ACTION_TIERS[selectedCase.recovery_action_tier]?.action}
              </div>
            </div>

            {/* Payment Plan Status */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                Installment Agreement Status
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid #334155', fontSize: '0.825rem' }}>
                {selectedCase.payment_plan_id ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CreditCard size={14} /> Active recurring autopay plan enrolled. Paid: ${selectedCase.patient_paid_amount.toFixed(2)} to date.
                  </span>
                ) : (
                  <span style={{ color: '#94a3b8' }}>
                    No active installment agreement. Eligible for 3, 6, or 12 month zero-interest autopay plan.
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                className="par-btn par-btn-primary"
                onClick={() => setNudgeModalOpen(true)}
              >
                <Send size={14} /> Send Digital Nudge
              </button>
              {!selectedCase.payment_plan_id && (
                <button
                  className="par-btn par-btn-secondary"
                  onClick={() => setPlanModalOpen(true)}
                >
                  <CreditCard size={14} /> Setup Payment Plan
                </button>
              )}
              <button
                className="par-btn par-btn-success"
                onClick={() => {
                  setPaymentAmount(selectedCase.patient_balance_due.toString());
                  setPayModalOpen(true);
                }}
              >
                <DollarSign size={14} /> Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STRUCTURED PAYMENT PLANS */}
      {activeTab === 'plans' && (
        <div className="par-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 className="par-card-title" style={{ margin: 0 }}>
                <CreditCard size={18} color="#10b981" /> Structured Recurring Payment Plans
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
                Enrolled zero-interest patient installment agreements with automated recurring ACH/Card autopay.
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                ${metrics.activePlansValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Active Financed Balance</div>
            </div>
          </div>

          <div className="par-table-wrapper">
            <table className="par-table">
              <thead>
                <tr>
                  <th>Plan ID / Patient</th>
                  <th>Total Financed</th>
                  <th>Monthly Installment</th>
                  <th>Terms</th>
                  <th>Autopay</th>
                  <th>Next Billing</th>
                  <th>Paid to Date</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{p.id}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.patient_name}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>${p.plan_total_amount.toFixed(2)}</td>
                    <td style={{ color: '#10b981', fontWeight: 700 }}>${p.monthly_payment_amount.toFixed(2)}/mo</td>
                    <td>{p.installment_count} months</td>
                    <td>
                      {p.autopay_enrolled ? (
                        <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600 }}>Active Autopay</span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>Manual Bill</span>
                      )}
                    </td>
                    <td>{p.next_payment_date}</td>
                    <td style={{ color: '#38bdf8', fontWeight: 600 }}>${p.total_paid_to_date.toFixed(2)}</td>
                    <td style={{ color: '#f8fafc', fontWeight: 700 }}>${p.remaining_plan_balance.toFixed(2)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        backgroundColor: p.plan_status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                        color: p.plan_status === 'ACTIVE' ? '#6ee7b7' : '#cbd5e1'
                      }}>
                        {p.plan_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CHARITY CARE & BAD DEBT GUARDIAN */}
      {activeTab === 'charity' && (
        <div className="par-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 className="par-card-title" style={{ margin: 0 }}>
                <Heart size={18} color="#06b6d4" /> Charity Care &amp; Bad Debt Guardian
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
                Compassionate financial hardship evaluation and supervisory bad debt authorization before credit agency dispatch.
              </p>
            </div>
          </div>

          <div className="par-table-wrapper">
            <table className="par-table">
              <thead>
                <tr>
                  <th>Patient Name &amp; MRN</th>
                  <th>Balance Due</th>
                  <th>Days in AR</th>
                  <th>Propensity Tier</th>
                  <th>Charity Screened</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.filter(c => c.days_in_patient_ar >= 60 || c.propensity_to_pay_tier === 'CHARITY_CANDIDATE').map(item => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.patient_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.patient_mrn}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: '#f8fafc' }}>${item.patient_balance_due.toFixed(2)}</td>
                    <td>
                      <span className={`par-aging-pill ${item.days_in_patient_ar > 120 ? 'par-aging-danger' : 'par-aging-warning'}`}>
                        {item.days_in_patient_ar} days
                      </span>
                    </td>
                    <td>
                      <span style={{ color: PROPENSITY_TIERS[item.propensity_to_pay_tier]?.badgeColor || '#cbd5e1', fontWeight: 600 }}>
                        {PROPENSITY_TIERS[item.propensity_to_pay_tier]?.label}
                      </span>
                    </td>
                    <td>
                      {item.is_charity_screened ? (
                        <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Screened</span>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>Pending Hardship Screen</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{item.case_status}</span>
                    </td>
                    <td>
                      <button
                        className="par-btn par-btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.725rem' }}
                        onClick={() => {
                          setSelectedId(item.id);
                          setCharityModalOpen(true);
                        }}
                      >
                        <Heart size={12} color="#06b6d4" /> Hardship Review
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

      {/* MODAL 1: SEND DIGITAL NUDGE */}
      {nudgeModalOpen && selectedCase && (
        <div className="par-modal-overlay" onClick={() => setNudgeModalOpen(false)}>
          <div className="par-modal-content" onClick={e => e.stopPropagation()}>
            <div className="par-modal-header">
              <h3 style={{ margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={18} color="#0284c7" /> Dispatch Digital Payment Link
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setNudgeModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Patient: <strong>{selectedCase.patient_name}</strong> | Balance Due: <strong style={{ color: '#f97316' }}>${selectedCase.patient_balance_due.toFixed(2)}</strong>
              <br />
              Delivery Channels: <strong>{selectedCase.patient_phone || 'SMS'} &bull; {selectedCase.patient_email || 'Email'}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Select Delivery Channel:
            </label>
            <select
              className="par-filter-select"
              style={{ width: '100%', marginBottom: '1rem' }}
              value={nudgeChannel}
              onChange={e => setNudgeChannel(e.target.value)}
            >
              <option value="SMS_AND_EMAIL">SMS Text &amp; Email Digital Link (Recommended)</option>
              <option value="SMS_ONLY">SMS Text-to-Pay Only</option>
              <option value="EMAIL_ONLY">Email Statement Link Only</option>
            </select>

            <div style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
              <CheckCircle2 size={12} color="#10b981" style={{ display: 'inline', marginRight: '4px' }} />
              Includes secure 1-click Apple Pay, Google Pay, and instant installment enrollment proposal.
            </div>

            <div className="par-modal-footer">
              <button className="par-btn par-btn-secondary" onClick={() => setNudgeModalOpen(false)}>
                Cancel
              </button>
              <button className="par-btn par-btn-primary" onClick={handleSendNudge}>
                Send Payment Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SETUP PAYMENT PLAN */}
      {planModalOpen && selectedCase && (
        <div className="par-modal-overlay" onClick={() => setPlanModalOpen(false)}>
          <div className="par-modal-content" onClick={e => e.stopPropagation()}>
            <div className="par-modal-header">
              <h3 style={{ margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={18} color="#10b981" /> Structured Installment Agreement Builder
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setPlanModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Patient: <strong>{selectedCase.patient_name}</strong> | Financed Balance: <strong>${selectedCase.patient_balance_due.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Select Number of Monthly Installments:
            </label>
            <select
              className="par-filter-select"
              style={{ width: '100%', marginBottom: '1rem' }}
              value={selectedInstallments}
              onChange={e => setSelectedInstallments(Number(e.target.value))}
            >
              <option value={3}>3 Months (${(selectedCase.patient_balance_due / 3).toFixed(2)} / mo)</option>
              <option value={6}>6 Months (${(selectedCase.patient_balance_due / 6).toFixed(2)} / mo)</option>
              <option value={12}>12 Months (${(selectedCase.patient_balance_due / 12).toFixed(2)} / mo)</option>
              <option value={18}>18 Months (${(selectedCase.patient_balance_due / 18).toFixed(2)} / mo)</option>
              <option value={24}>24 Months (${(selectedCase.patient_balance_due / 24).toFixed(2)} / mo)</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autopayEnabled}
                onChange={e => setAutopayEnabled(e.target.checked)}
              />
              Enable Recurring ACH / Card Autopay (Recommended)
            </label>

            <div className="par-modal-footer">
              <button className="par-btn par-btn-secondary" onClick={() => setPlanModalOpen(false)}>
                Cancel
              </button>
              <button className="par-btn par-btn-success" onClick={handleCreatePlan}>
                Activate Payment Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD PATIENT PAYMENT */}
      {payModalOpen && selectedCase && (
        <div className="par-modal-overlay" onClick={() => setPayModalOpen(false)}>
          <div className="par-modal-content" onClick={e => e.stopPropagation()}>
            <div className="par-modal-header">
              <h3 style={{ margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <DollarSign size={18} color="#059669" /> Record Patient Payment
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setPayModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Patient: <strong>{selectedCase.patient_name}</strong> | Current Balance: <strong>${selectedCase.patient_balance_due.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Payment Amount ($):
            </label>
            <input
              type="number"
              className="par-search-input"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Payment Method:
            </label>
            <select
              className="par-filter-select"
              style={{ width: '100%', marginBottom: '1rem' }}
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
            >
              <option value="CREDIT_CARD_ONLINE">Online Credit Card (Digital Portal)</option>
              <option value="CHECK_BY_MAIL">Paper Check by Mail</option>
              <option value="CREDIT_CARD_PHONE">Credit Card via Phone</option>
              <option value="CASH_FRONT_DESK">Front Desk Cash / POS Terminal</option>
            </select>

            <div className="par-modal-footer">
              <button className="par-btn par-btn-secondary" onClick={() => setPayModalOpen(false)}>
                Cancel
              </button>
              <button className="par-btn par-btn-success" onClick={handleRecordPayment}>
                Post Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CHARITY CARE HARDSHIP */}
      {charityModalOpen && selectedCase && (
        <div className="par-modal-overlay" onClick={() => setCharityModalOpen(false)}>
          <div className="par-modal-content" onClick={e => e.stopPropagation()}>
            <div className="par-modal-header">
              <h3 style={{ margin: 0, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Heart size={18} color="#06b6d4" /> Charity Care Hardship Evaluation
              </h3>
              <button
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setCharityModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Patient: <strong>{selectedCase.patient_name}</strong> | Balance: <strong>${selectedCase.patient_balance_due.toFixed(2)}</strong>
            </div>

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Household Income relative to Federal Poverty Level (% FPL):
            </label>
            <input
              type="number"
              className="par-search-input"
              style={{
                width: '100%',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
              value={fplPercentage}
              onChange={e => setFplPercentage(e.target.value)}
            />

            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Authorizing Medical Director / Supervisor:
            </label>
            <input
              type="text"
              className="par-search-input"
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
              Documented Justification Notes:
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
              placeholder="Cite verified tax return, proof of income, disability, or catastrophe hardship..."
              value={charityNotes}
              onChange={e => setCharityNotes(e.target.value)}
            />

            <div className="par-modal-footer">
              <button className="par-btn par-btn-secondary" onClick={() => setCharityModalOpen(false)}>
                Cancel
              </button>
              <button className="par-btn par-btn-primary" onClick={handleApproveCharity}>
                Approve Charity Write-Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
