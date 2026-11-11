import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Layers,
  Send,
  Sliders,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Activity,
  Zap,
  Info
} from 'lucide-react';
import opportunityPriorityService, {
  SOURCE_MODULES,
  PRIORITY_ACTION_TIERS,
  ITEM_STATUSES,
  DEFAULT_ROPS_WEIGHTS
} from '../services/opportunityPriorityScoreService';
import './RevenueOpportunityPriorityView.css';

export default function RevenueOpportunityPriorityView() {
  const [activeSourceTab, setActiveSourceTab] = useState('ALL');
  const [activeTierFilter, setActiveTierFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchAnalystInput, setDispatchAnalystInput] = useState('');
  const [dispatchNotesInput, setDispatchNotesInput] = useState('');

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryAmountInput, setRecoveryAmountInput] = useState('');
  const [recoveryNotesInput, setRecoveryNotesInput] = useState('');

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [benchmarkInput, setBenchmarkInput] = useState('5000');
  const [weightValueInput, setWeightValueInput] = useState('0.35');
  const [weightConfInput, setWeightConfInput] = useState('0.25');
  const [weightRecInput, setWeightRecInput] = useState('0.25');
  const [weightUrgInput, setWeightUrgInput] = useState('0.15');

  const [notification, setNotification] = useState(null);

  // Live state tracking
  const [dataVersion, setDataVersion] = useState(0);
  const reloadData = () => setDataVersion(v => v + 1);

  const opportunities = useMemo(() => {
    return opportunityPriorityService.getAllOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const metrics = useMemo(() => {
    return opportunityPriorityService.getMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return opportunities.filter(item => {
      // Source module tab filter
      if (activeSourceTab !== 'ALL' && item.source_module !== activeSourceTab) {
        return false;
      }

      // Tier dropdown filter
      if (activeTierFilter !== 'ALL' && item.priority_action_tier !== activeTierFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.patient_name.toLowerCase().includes(q);
        const matchMrn = item.patient_mrn.toLowerCase().includes(q);
        const matchClaim = item.claim_number.toLowerCase().includes(q);
        const matchCpt = item.cpt_code.toLowerCase().includes(q);
        const matchProc = item.procedure_name.toLowerCase().includes(q);
        const matchPayer = item.payer_name.toLowerCase().includes(q);
        if (!matchName && !matchMrn && !matchClaim && !matchCpt && !matchProc && !matchPayer) {
          return false;
        }
      }

      return true;
    });
  }, [opportunities, activeSourceTab, activeTierFilter, searchQuery]);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Handlers
  const handleOpenDispatch = (item) => {
    setSelectedItem(item);
    setDispatchAnalystInput(item.assigned_analyst_name || 'Senior RCM Specialist');
    setDispatchNotesInput('');
    setShowDispatchModal(true);
  };

  const handleSaveDispatch = (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      opportunityPriorityService.dispatchToQueue(selectedItem.id, dispatchAnalystInput, dispatchNotesInput);
      setShowDispatchModal(false);
      reloadData();
      showToast(`Opportunity dispatched to ${dispatchAnalystInput}.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenRecovery = (item) => {
    setSelectedItem(item);
    setRecoveryAmountInput(String(item.recoverable_amount));
    setRecoveryNotesInput('');
    setShowRecoveryModal(true);
  };

  const handleSaveRecovery = (e) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      opportunityPriorityService.recordRecovery(selectedItem.id, parseFloat(recoveryAmountInput), recoveryNotesInput);
      setShowRecoveryModal(false);
      reloadData();
      showToast(`Recovered $${recoveryAmountInput} recorded successfully.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDismiss = (item) => {
    const reason = prompt('Please enter the formal justification for dismissing this revenue opportunity:');
    if (!reason) return;
    try {
      opportunityPriorityService.dismissOpportunity(item.id, reason);
      reloadData();
      showToast('Opportunity marked as not recoverable.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveConfig = (e) => {
    e.preventDefault();
    try {
      const b = parseFloat(benchmarkInput) || 5000;
      const w = {
        VALUE: parseFloat(weightValueInput) || 0.35,
        CONFIDENCE: parseFloat(weightConfInput) || 0.25,
        RECOVERABILITY: parseFloat(weightRecInput) || 0.25,
        URGENCY: parseFloat(weightUrgInput) || 0.15
      };
      opportunityPriorityService.updateConfig(b, w);
      setShowConfigModal(false);
      reloadData();
      showToast('ROPS facility scoring configuration updated.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="rops-container">
      {/* Toast Notification */}
      {notification && (
        <div className={`rops-toast toast-${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="rops-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge">RCM PHASE 98</span>
            <span className="clinical-badge badge-teal">CROSS-MODULE PRIORITY INDEX</span>
            <span className="clinical-badge badge-blue">YIELD VELOCITY ($/HR)</span>
          </div>
          <h1>Revenue Opportunity Priority Score (ROPS)</h1>
          <p className="subtitle">
            Authoritative, unified ranking combining recoverable value, data confidence, contractual recoverability, and statutory deadline urgency across all revenue leakage domains.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowConfigModal(true)} title="Configure Weights & Benchmark">
            <Sliders size={15} />
            <span>Scoring Config</span>
          </button>
          <button className="btn-secondary" onClick={reloadData} title="Refresh Live Queue">
            <RefreshCw size={15} />
            <span>Sync Opportunities</span>
          </button>
        </div>
      </div>

      {/* 5-Card Top Metric Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-card card-accent-blue">
          <div className="metric-header">
            <span className="metric-title">Pipeline Opportunity</span>
            <DollarSign size={18} className="text-blue" />
          </div>
          <div className="metric-value text-blue">
            ${metrics.totalPipelineAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-blue font-medium">{metrics.totalOpportunitiesCount} open recovery opportunities</span>
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">Expected Realizable Yield</span>
            <TrendingUp size={18} className="text-emerald" />
          </div>
          <div className="metric-value text-emerald">
            ${metrics.totalExpectedYield.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-emerald font-medium">Confidence & probability adjusted</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Average ROPS Index</span>
            <Activity size={18} className="text-slate" />
          </div>
          <div className="metric-value">{metrics.avgRopsScore}</div>
          <div className="metric-footer">
            <span className="text-slate">Portfolio composite score (0-100)</span>
          </div>
        </div>

        <div className="metric-card card-accent-crimson">
          <div className="metric-header">
            <span className="metric-title">Urgent Deadlines</span>
            <Clock size={18} className="text-crimson" />
          </div>
          <div className="metric-value text-crimson">{metrics.urgentDeadlinesCount}</div>
          <div className="metric-footer">
            <span className="text-crimson font-medium">Timely filing limits &lt; 15 days</span>
          </div>
        </div>

        <div className="metric-card card-accent-teal">
          <div className="metric-header">
            <span className="metric-title">Recovered Cash MTD</span>
            <CheckCircle2 size={18} className="text-teal" />
          </div>
          <div className="metric-value text-teal">
            ${metrics.recoveredCashMtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-teal font-medium">Realized collections to date</span>
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Tabs */}
      <div className="workbench-filter-bar">
        <div className="source-tabs">
          <button
            className={`tab-btn ${activeSourceTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('ALL')}
          >
            All Sources ({opportunities.length})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'IMPLANT_CARVEOUT' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('IMPLANT_CARVEOUT')}
          >
            Implant Carveouts ({metrics.moduleDistribution.IMPLANT_CARVEOUT})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'DENIAL_APPEAL' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('DENIAL_APPEAL')}
          >
            Denial Appeals ({metrics.moduleDistribution.DENIAL_APPEAL})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'SECONDARY_COB' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('SECONDARY_COB')}
          >
            Secondary COB ({metrics.moduleDistribution.SECONDARY_COB})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'PAYER_UNDERPAYMENT' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('PAYER_UNDERPAYMENT')}
          >
            Underpayments ({metrics.moduleDistribution.PAYER_UNDERPAYMENT})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'RECURRING_PATTERN' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('RECURRING_PATTERN')}
          >
            Patterns ({metrics.moduleDistribution.RECURRING_PATTERN})
          </button>
          <button
            className={`tab-btn ${activeSourceTab === 'UNBILLED_CASE' ? 'active' : ''}`}
            onClick={() => setActiveSourceTab('UNBILLED_CASE')}
          >
            Unbilled ({metrics.moduleDistribution.UNBILLED_CASE})
          </button>
        </div>

        <div className="search-and-dropdowns">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search patient, MRN, CPT, procedure, claim..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dropdown-wrapper">
            <Filter size={14} className="filter-icon" />
            <select
              value={activeTierFilter}
              onChange={(e) => setActiveTierFilter(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Action Tiers</option>
              {Object.entries(PRIORITY_ACTION_TIERS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Data Grid */}
      <div className="table-responsive-container">
        <table className="rops-table">
          <thead>
            <tr>
              <th>ROPS Index</th>
              <th>Source & Opportunity</th>
              <th>Patient & Procedure</th>
              <th>Payer & DOS</th>
              <th>Expected Realizable Yield</th>
              <th>Subscore Breakdown</th>
              <th>Filing Urgency</th>
              <th>Status & Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  <div className="empty-state">
                    <CheckCircle2 size={36} className="text-slate" />
                    <p className="empty-title">No Revenue Opportunities Match Filter</p>
                    <p className="empty-desc">All cross-module revenue cycle opportunities are fully reconciled.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const tier = PRIORITY_ACTION_TIERS[item.priority_action_tier] || PRIORITY_ACTION_TIERS.TIER_5_EXPIRED_OR_SUPPRESSED;
                const source = SOURCE_MODULES[item.source_module] || { label: item.source_module, badgeColor: '#64748b' };
                const statusMeta = ITEM_STATUSES[item.item_status] || { label: item.item_status, color: '#64748b' };
                const isUrgent = item.days_until_deadline <= 15 && item.days_until_deadline >= 0;
                const isExpired = item.days_until_deadline < 0;

                return (
                  <tr key={item.id} className={isExpired ? 'row-expired' : isUrgent ? 'row-urgent' : ''}>
                    {/* ROPS Score & Tier */}
                    <td>
                      <div className="rops-score-cell">
                        <span className="rops-pill" style={{ borderColor: tier.badgeColor }}>
                          {item.rops_priority_score.toFixed(1)}
                        </span>
                        <div className="rops-tier-info">
                          <span className="tier-tag" style={{ color: tier.badgeColor, backgroundColor: `${tier.badgeColor}15` }}>
                            {tier.label.split(':')[0]}
                          </span>
                          <span className="yield-velocity-pill" title="Recovery cash velocity per staff labor hour">
                            <Zap size={11} className="text-amber" />
                            ${item.yield_per_hour.toFixed(0)}/hr
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Source Module & Context */}
                    <td>
                      <div className="source-cell">
                        <span className="source-badge" style={{ backgroundColor: `${source.badgeColor}15`, color: source.badgeColor, borderColor: `${source.badgeColor}40` }}>
                          {source.label}
                        </span>
                        <div className="source-record">ID: {item.source_record_id}</div>
                        <div className="source-claim">Claim: {item.claim_number}</div>
                      </div>
                    </td>

                    {/* Patient & Procedure */}
                    <td>
                      <div className="patient-cell">
                        <div className="patient-name">{item.patient_name}</div>
                        <div className="patient-mrn">{item.patient_mrn}</div>
                        <div className="procedure-tag">CPT {item.cpt_code}: {item.procedure_name}</div>
                      </div>
                    </td>

                    {/* Payer & DOS */}
                    <td>
                      <div className="payer-cell">
                        <div className="payer-name">{item.payer_name}</div>
                        <div className="dos-date">DOS: {item.date_of_service}</div>
                        {item.assigned_analyst_name && (
                          <div className="assigned-tag">Assigned: {item.assigned_analyst_name}</div>
                        )}
                      </div>
                    </td>

                    {/* Expected Realizable Yield */}
                    <td>
                      <div className="yield-cell">
                        <div className="expected-yield text-emerald font-bold">
                          ${item.expected_realizable_yield.toFixed(2)}
                        </div>
                        <div className="raw-recoverable">
                          Gross: ${item.recoverable_amount.toFixed(2)}
                        </div>
                        <div className="yield-formula-hint">
                          {item.confidence_score.toFixed(0)}% Conf • {item.recoverability_score.toFixed(0)}% Prob
                        </div>
                      </div>
                    </td>

                    {/* Subscore Breakdown */}
                    <td>
                      <div className="subscores-cell">
                        <div className="subscore-row">
                          <span className="subscore-label">Val (35%):</span>
                          <div className="subscore-bar-bg">
                            <div className="subscore-bar-fill fill-blue" style={{ width: `${item.value_score}%` }}></div>
                          </div>
                          <span className="subscore-val">{item.value_score.toFixed(0)}</span>
                        </div>

                        <div className="subscore-row">
                          <span className="subscore-label">Conf (25%):</span>
                          <div className="subscore-bar-bg">
                            <div className="subscore-bar-fill fill-teal" style={{ width: `${item.confidence_score}%` }}></div>
                          </div>
                          <span className="subscore-val">{item.confidence_score.toFixed(0)}</span>
                        </div>

                        <div className="subscore-row">
                          <span className="subscore-label">Recov (25%):</span>
                          <div className="subscore-bar-bg">
                            <div className="subscore-bar-fill fill-emerald" style={{ width: `${item.recoverability_score}%` }}></div>
                          </div>
                          <span className="subscore-val">{item.recoverability_score.toFixed(0)}</span>
                        </div>

                        <div className="subscore-row">
                          <span className="subscore-label">Urg (15%):</span>
                          <div className="subscore-bar-bg">
                            <div className="subscore-bar-fill fill-amber" style={{ width: `${item.urgency_score}%` }}></div>
                          </div>
                          <span className="subscore-val">{item.urgency_score.toFixed(0)}</span>
                        </div>
                      </div>
                    </td>

                    {/* Filing Deadline */}
                    <td>
                      <div className="deadline-cell">
                        {isExpired ? (
                          <span className="deadline-tag expired">
                            <XCircle size={13} />
                            <span>Expired ({Math.abs(item.days_until_deadline)}d)</span>
                          </span>
                        ) : isUrgent ? (
                          <span className="deadline-tag urgent">
                            <Clock size={13} />
                            <span>{item.days_until_deadline} Days Left</span>
                          </span>
                        ) : (
                          <span className="deadline-tag standard">
                            <Clock size={13} />
                            <span>{item.days_until_deadline} Days Left</span>
                          </span>
                        )}
                        <div className="deadline-date">{item.filing_deadline}</div>
                      </div>
                    </td>

                    {/* Status & Actions */}
                    <td>
                      <div className="actions-cell">
                        <span className="status-pill" style={{ color: statusMeta.color, borderColor: statusMeta.color }}>
                          {statusMeta.label}
                        </span>

                        <div className="action-buttons-group">
                          {!['DISPATCHED_TO_QUEUE', 'RECOVERED', 'EXPIRED_UNCOLLECTIBLE'].includes(item.item_status) && (
                            <button
                              className="btn-action btn-dispatch"
                              onClick={() => handleOpenDispatch(item)}
                              title="Dispatch Opportunity to Specialist Queue"
                            >
                              <Send size={13} />
                              <span>Dispatch</span>
                            </button>
                          )}

                          {item.recoverable_amount > 0 && !['RECOVERED', 'EXPIRED_UNCOLLECTIBLE'].includes(item.item_status) && (
                            <button
                              className="btn-action btn-recover"
                              onClick={() => handleOpenRecovery(item)}
                              title="Record Collected Recovery Cash"
                            >
                              <DollarSign size={13} />
                              <span>Recover</span>
                            </button>
                          )}

                          {!['DISMISSED_NOT_RECOVERABLE', 'RECOVERED'].includes(item.item_status) && (
                            <button
                              className="btn-action btn-dismiss"
                              onClick={() => handleDismiss(item)}
                              title="Dismiss as Ineligible / Non-Recoverable"
                            >
                              <XCircle size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Dispatch to Queue */}
      {showDispatchModal && selectedItem && (
        <div className="rops-modal-backdrop modal-backdrop">
          <div className="rops-modal-container modal-container">
            <div className="rops-modal-header modal-header">
              <div className="rops-modal-title-group modal-title-group">
                <Send size={18} className="text-blue" />
                <h3 className="rops-modal-title">Dispatch Revenue Opportunity</h3>
              </div>
              <button className="rops-modal-close-btn close-btn" onClick={() => setShowDispatchModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveDispatch}>
              <div className="rops-modal-body modal-body">
                <div className="summary-spec-card">
                  <div><strong>Source:</strong> {SOURCE_MODULES[selectedItem.source_module]?.label}</div>
                  <div><strong>Patient:</strong> {selectedItem.patient_name} • <strong>Payer:</strong> {selectedItem.payer_name}</div>
                  <div><strong>Expected Yield:</strong> <span className="text-emerald font-bold">${selectedItem.expected_realizable_yield.toFixed(2)}</span> (ROPS: {selectedItem.rops_priority_score.toFixed(1)})</div>
                </div>

                <div className="form-group">
                  <label>Assign to Specialist / Billing Queue <span className="text-crimson">*</span></label>
                  <input
                    type="text"
                    required
                    value={dispatchAnalystInput}
                    onChange={(e) => setDispatchAnalystInput(e.target.value)}
                    placeholder="e.g. Senior Denial Specialist"
                    className="rops-form-control form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Dispatch Routing Notes</label>
                  <textarea
                    rows={3}
                    value={dispatchNotesInput}
                    onChange={(e) => setDispatchNotesInput(e.target.value)}
                    placeholder="e.g. Priority filing per statutory 14-day appeal limit."
                    className="rops-form-control form-control"
                  />
                </div>
              </div>
              <div className="rops-modal-footer modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowDispatchModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm & Dispatch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Recovery */}
      {showRecoveryModal && selectedItem && (
        <div className="rops-modal-backdrop modal-backdrop">
          <div className="rops-modal-container modal-container">
            <div className="rops-modal-header modal-header">
              <div className="rops-modal-title-group modal-title-group">
                <DollarSign size={18} className="text-emerald" />
                <h3 className="rops-modal-title">Record Realized Cash Recovery</h3>
              </div>
              <button className="rops-modal-close-btn close-btn" onClick={() => setShowRecoveryModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveRecovery}>
              <div className="rops-modal-body modal-body">
                <div className="summary-spec-card">
                  <div><strong>Opportunity:</strong> {selectedItem.procedure_name} ({selectedItem.claim_number})</div>
                  <div><strong>Gross Recoverable:</strong> <span className="text-blue font-bold">${selectedItem.recoverable_amount.toFixed(2)}</span></div>
                </div>

                <div className="form-group">
                  <label>Actual Cash Collected ($) <span className="text-crimson">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={recoveryAmountInput}
                    onChange={(e) => setRecoveryAmountInput(e.target.value)}
                    className="rops-form-control form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Remittance Check / ERA # / Adjustment Code</label>
                  <input
                    type="text"
                    value={recoveryNotesInput}
                    onChange={(e) => setRecoveryNotesInput(e.target.value)}
                    placeholder="e.g. 835 Remittance ERA-2026-BCBS-912"
                    className="rops-form-control form-control"
                  />
                </div>
              </div>
              <div className="rops-modal-footer modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRecoveryModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm & Close Opportunity</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Configure Facility ROPS Weights */}
      {showConfigModal && (
        <div className="rops-modal-backdrop modal-backdrop">
          <div className="rops-modal-container modal-container">
            <div className="rops-modal-header modal-header">
              <div className="rops-modal-title-group modal-title-group">
                <Sliders size={18} className="text-teal" />
                <h3 className="rops-modal-title">Facility ROPS Scoring Configuration</h3>
              </div>
              <button className="rops-modal-close-btn close-btn" onClick={() => setShowConfigModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveConfig}>
              <div className="rops-modal-body modal-body">
                <div className="config-info-box">
                  <Info size={16} className="text-teal inline-icon" />
                  <span>Configures facility-wide priority weights. Weights must sum to exactly 1.00 (100%).</span>
                </div>

                <div className="form-group">
                  <label>Facility Benchmark Dollar Amount ($)</label>
                  <input
                    type="number"
                    step="500"
                    required
                    value={benchmarkInput}
                    onChange={(e) => setBenchmarkInput(e.target.value)}
                    className="rops-form-control form-control"
                  />
                  <span className="field-hint">Maximum dollar variance for 100% Value Subscore (default: $5,000.00).</span>
                </div>

                <div className="weights-grid">
                  <div className="form-group">
                    <label>Value Weight (0-1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      required
                      value={weightValueInput}
                      onChange={(e) => setWeightValueInput(e.target.value)}
                      className="rops-form-control form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Confidence Weight (0-1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      required
                      value={weightConfInput}
                      onChange={(e) => setWeightConfInput(e.target.value)}
                      className="rops-form-control form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Recoverability Weight (0-1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      required
                      value={weightRecInput}
                      onChange={(e) => setWeightRecInput(e.target.value)}
                      className="rops-form-control form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Urgency Weight (0-1)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      required
                      value={weightUrgInput}
                      onChange={(e) => setWeightUrgInput(e.target.value)}
                      className="rops-form-control form-control"
                    />
                  </div>
                </div>
              </div>
              <div className="rops-modal-footer modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowConfigModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Apply & Recalculate</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

