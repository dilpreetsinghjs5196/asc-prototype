import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Paperclip,
  Send,
  HelpCircle,
  Layers,
  ChevronRight,
  ExternalLink,
  PlusCircle,
  FileCheck,
  RefreshCw,
  Cpu
} from 'lucide-react';
import implantCarveoutService, {
  REIMBURSEMENT_MODELS,
  LEAKAGE_TYPES,
  RECOVERY_ACTION_TIERS,
  DOCUMENTATION_TIERS,
  DISCREPANCY_STATUSES
} from '../services/implantCarveoutService';
import './ImplantCarveoutDetectionView.css';

export default function ImplantCarveoutDetectionView() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeakageType, setSelectedLeakageType] = useState('ALL');
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState(null);
  
  // Modals
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState('');
  const [invoiceCostInput, setInvoiceCostInput] = useState('');
  
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeTypeInput, setDisputeTypeInput] = useState('CORRECTED_CLAIM');
  const [disputeNotesInput, setDisputeNotesInput] = useState('');
  
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryAmountInput, setRecoveryAmountInput] = useState('');
  const [recoveryNotesInput, setRecoveryNotesInput] = useState('');

  const [notification, setNotification] = useState(null);

  // Load live data from service store
  const [dataVersion, setDataVersion] = useState(0);
  const reloadData = () => setDataVersion(v => v + 1);

  const discrepancies = useMemo(() => {
    return implantCarveoutService.getAllDiscrepancies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const metrics = useMemo(() => {
    return implantCarveoutService.getMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Filtered dataset
  const filteredDiscrepancies = useMemo(() => {
    return discrepancies.filter(d => {
      // Tab filter (Action Tiers)
      if (activeTab === 'TIER_1' && d.recovery_action_tier !== 'TIER_1_CRITICAL_RECOVERY') return false;
      if (activeTab === 'TIER_2' && d.recovery_action_tier !== 'TIER_2_HIGH_YIELD_DISPUTE') return false;
      if (activeTab === 'TIER_3' && d.recovery_action_tier !== 'TIER_3_DOCUMENTATION_CURE') return false;
      if (activeTab === 'UNBILLED' && d.carveout_leakage_type !== 'UNBILLED_IMPLANT') return false;
      if (activeTab === 'ZERO_PAID' && d.carveout_leakage_type !== 'ZERO_PAID_BUNDLED') return false;

      // Leakage Type Filter
      if (selectedLeakageType !== 'ALL' && d.carveout_leakage_type !== selectedLeakageType) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = d.patient_name.toLowerCase().includes(q);
        const matchMrn = d.patient_mrn.toLowerCase().includes(q);
        const matchClaim = d.claim_number.toLowerCase().includes(q);
        const matchDevice = d.device_name.toLowerCase().includes(q);
        const matchHcpcs = d.hcpcs_device_code.toLowerCase().includes(q);
        const matchPayer = d.payer_name.toLowerCase().includes(q);
        if (!matchName && !matchMrn && !matchClaim && !matchDevice && !matchHcpcs && !matchPayer) {
          return false;
        }
      }

      return true;
    });
  }, [discrepancies, activeTab, selectedLeakageType, searchQuery]);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Handlers
  const handleOpenAttachInvoice = (item) => {
    setSelectedDiscrepancy(item);
    setInvoiceNumberInput(item.invoice_number || `INV-${item.vendor_name.slice(0, 3).toUpperCase()}-${Math.floor(10000 + Math.random() * 90000)}`);
    setInvoiceCostInput(String(item.invoice_cost || ''));
    setShowInvoiceModal(true);
  };

  const handleSaveInvoice = (e) => {
    e.preventDefault();
    if (!selectedDiscrepancy) return;
    try {
      implantCarveoutService.attachInvoice(
        selectedDiscrepancy.id,
        invoiceNumberInput,
        `/invoices/${invoiceNumberInput}.pdf`,
        parseFloat(invoiceCostInput) || null
      );
      setShowInvoiceModal(false);
      reloadData();
      showToast(`Vendor invoice ${invoiceNumberInput} attached successfully.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenDispute = (item) => {
    setSelectedDiscrepancy(item);
    setDisputeTypeInput(item.carveout_leakage_type === 'UNBILLED_IMPLANT' ? 'CORRECTED_CLAIM' : 'APPEAL_LETTER');
    setDisputeNotesInput('');
    setShowDisputeModal(true);
  };

  const handleSaveDispute = (e) => {
    e.preventDefault();
    if (!selectedDiscrepancy) return;
    try {
      const res = implantCarveoutService.generateDisputePacket(
        selectedDiscrepancy.id,
        disputeTypeInput,
        disputeNotesInput
      );
      setShowDisputeModal(false);
      reloadData();
      showToast(`Dispute packet generated: ${res.discrepancy.discrepancy_status}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenRecovery = (item) => {
    setSelectedDiscrepancy(item);
    setRecoveryAmountInput(String(item.carveout_variance));
    setRecoveryNotesInput('');
    setShowRecoveryModal(true);
  };

  const handleSaveRecovery = (e) => {
    e.preventDefault();
    if (!selectedDiscrepancy) return;
    try {
      implantCarveoutService.recordRecovery(
        selectedDiscrepancy.id,
        parseFloat(recoveryAmountInput),
        recoveryNotesInput
      );
      setShowRecoveryModal(false);
      reloadData();
      showToast(`Recovered $${recoveryAmountInput} recorded successfully.`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDismiss = (item) => {
    const reason = prompt('Please enter the formal clinical/contractual audit justification for dismissing this carve-out:');
    if (!reason) return;
    try {
      implantCarveoutService.dismissDiscrepancy(item.id, reason);
      reloadData();
      showToast('Carve-out discrepancy marked as non-eligible.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="implant-carveout-container">
      {/* Toast Notification */}
      {notification && (
        <div className={`carveout-toast toast-${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="carveout-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge">RCM PHASE 97</span>
            <span className="clinical-badge badge-teal">COMMERCIAL CONTRACT CARVE-OUTS</span>
            <span className="clinical-badge badge-blue">SURGICAL DEVICE AUDIT</span>
          </div>
          <h1>Implant Carveout Detection & Recovery</h1>
          <p className="subtitle">
            Deterministic detection of unbilled, zero-paid, or underpaid surgical implants, biologics, and devices with contract-backed carve-out provisions.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={reloadData} title="Refresh Live Queue">
            <RefreshCw size={15} />
            <span>Sync Remittances</span>
          </button>
        </div>
      </div>

      {/* 5-Card Top Metric Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Active Opportunities</span>
            <Layers size={18} className="text-slate" />
          </div>
          <div className="metric-value">{metrics.totalActiveCount}</div>
          <div className="metric-footer">
            <span className="text-slate">Underpayment alerts requiring action</span>
          </div>
        </div>

        <div className="metric-card card-accent-crimson">
          <div className="metric-header">
            <span className="metric-title">Total Active Variance</span>
            <DollarSign size={18} className="text-crimson" />
          </div>
          <div className="metric-value text-crimson">
            ${metrics.totalActiveVariance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-crimson font-medium">Underpaid & unbilled device balance</span>
          </div>
        </div>

        <div className="metric-card card-accent-amber">
          <div className="metric-header">
            <span className="metric-title">Unbilled Implants at Risk</span>
            <AlertTriangle size={18} className="text-amber" />
          </div>
          <div className="metric-value text-amber">
            ${metrics.unbilledVarianceAtRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-amber">Logged in OR, omitted from 837 claim</span>
          </div>
        </div>

        <div className="metric-card card-accent-blue">
          <div className="metric-header">
            <span className="metric-title">Invoice Deficits</span>
            <Paperclip size={18} className="text-blue" />
          </div>
          <div className="metric-value text-blue">{metrics.invoiceDeficitsCount}</div>
          <div className="metric-footer">
            <span className="text-blue">Pending vendor invoice attachment</span>
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">Recovered MTD</span>
            <CheckCircle2 size={18} className="text-emerald" />
          </div>
          <div className="metric-value text-emerald">
            ${metrics.recoveredCashMtd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="metric-footer">
            <span className="text-emerald font-medium">Reconciled remittance cash</span>
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Tabs */}
      <div className="workbench-filter-bar">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveTab('ALL')}
          >
            All Carve-Outs ({discrepancies.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'TIER_1' ? 'active' : ''}`}
            onClick={() => setActiveTab('TIER_1')}
          >
            Tier 1: Critical Recovery ({metrics.tierDistribution.TIER_1_CRITICAL_RECOVERY})
          </button>
          <button
            className={`tab-btn ${activeTab === 'UNBILLED' ? 'active' : ''}`}
            onClick={() => setActiveTab('UNBILLED')}
          >
            Unbilled Implants ({metrics.leakageDistribution.UNBILLED_IMPLANT})
          </button>
          <button
            className={`tab-btn ${activeTab === 'ZERO_PAID' ? 'active' : ''}`}
            onClick={() => setActiveTab('ZERO_PAID')}
          >
            Bundled Zero-Paid ({metrics.leakageDistribution.ZERO_PAID_BUNDLED})
          </button>
          <button
            className={`tab-btn ${activeTab === 'TIER_3' ? 'active' : ''}`}
            onClick={() => setActiveTab('TIER_3')}
          >
            Invoice Holds ({metrics.tierDistribution.TIER_3_DOCUMENTATION_CURE})
          </button>
        </div>

        <div className="search-and-dropdowns">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search patient, MRN, CPT, device, or payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="dropdown-wrapper">
            <Filter size={14} className="filter-icon" />
            <select
              value={selectedLeakageType}
              onChange={(e) => setSelectedLeakageType(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Leakage Types</option>
              {Object.entries(LEAKAGE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Data Grid */}
      <div className="table-responsive-container">
        <table className="carveout-table">
          <thead>
            <tr>
              <th>Priority & Tier</th>
              <th>Patient & Procedure</th>
              <th>Payer & Contract</th>
              <th>Device & Invoice</th>
              <th>Carve-Out Model</th>
              <th>Financial Reconciliation</th>
              <th>Filing Deadline</th>
              <th>Status & Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDiscrepancies.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-table-cell">
                  <div className="empty-state">
                    <CheckCircle2 size={36} className="text-slate" />
                    <p className="empty-title">No Carve-Out Discrepancies Found</p>
                    <p className="empty-desc">All surgical devices are either fully reimbursed or matched to contract terms.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredDiscrepancies.map((item) => {
                const tier = RECOVERY_ACTION_TIERS[item.recovery_action_tier] || RECOVERY_ACTION_TIERS.TIER_5_EXPIRED_OR_NON_CARVED;
                const leakage = LEAKAGE_TYPES[item.carveout_leakage_type] || { label: item.carveout_leakage_type };
                const model = REIMBURSEMENT_MODELS[item.reimbursement_model] || { label: item.reimbursement_model };
                const statusMeta = DISCREPANCY_STATUSES[item.discrepancy_status] || { label: item.discrepancy_status, color: '#64748b' };
                const isUrgent = item.days_until_deadline <= 15 && item.days_until_deadline >= 0;
                const isExpired = item.days_until_deadline < 0;

                return (
                  <tr key={item.id} className={isExpired ? 'row-expired' : isUrgent ? 'row-urgent' : ''}>
                    {/* Priority & Tier */}
                    <td>
                      <div className="priority-cell">
                        <span className="priority-score-pill" style={{ borderColor: tier.badgeColor }}>
                          {item.carveout_priority_score.toFixed(1)}
                        </span>
                        <div className="priority-details">
                          <span className="tier-tag" style={{ color: tier.badgeColor, backgroundColor: `${tier.badgeColor}15` }}>
                            {tier.label.split(':')[0]}
                          </span>
                          <span className="leakage-type-badge">{leakage.label}</span>
                        </div>
                      </div>
                    </td>

                    {/* Patient & Procedure */}
                    <td>
                      <div className="patient-cell">
                        <div className="patient-name">{item.patient_name}</div>
                        <div className="patient-mrn">{item.patient_mrn} • Claim: {item.claim_number}</div>
                        <div className="procedure-tag">CPT {item.primary_cpt}: {item.procedure_name}</div>
                      </div>
                    </td>

                    {/* Payer & Contract */}
                    <td>
                      <div className="payer-cell">
                        <div className="payer-name">{item.payer_name}</div>
                        <div className="dos-date">DOS: {item.date_of_service}</div>
                        {item.payer_carc_code && (
                          <div className="carc-tag">
                            Remit: {item.payer_carc_code} {item.payer_rarc_code ? `(${item.payer_rarc_code})` : ''}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Device & Invoice */}
                    <td>
                      <div className="device-cell">
                        <div className="device-title" title={item.device_name}>
                          <Cpu size={13} className="text-blue inline-icon" />
                          <span>{item.device_name}</span>
                        </div>
                        <div className="device-sub">
                          HCPCS: <strong>{item.hcpcs_device_code}</strong> • Vendor: {item.vendor_name}
                        </div>
                        <div className="invoice-status-row">
                          {item.invoice_attached ? (
                            <span className="invoice-badge attached">
                              <FileCheck size={12} />
                              <span>Inv #{item.invoice_number} (${item.invoice_cost.toFixed(2)})</span>
                            </span>
                          ) : (
                            <span className="invoice-badge missing">
                              <AlertTriangle size={12} />
                              <span>Invoice Missing</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Carve-Out Model */}
                    <td>
                      <div className="model-cell">
                        <div className="model-name">{model.label}</div>
                        {item.markup_percentage > 0 && (
                          <div className="model-extra">Markup: {(item.markup_percentage * 100).toFixed(1)}%</div>
                        )}
                        {item.min_threshold > 0 && (
                          <div className="model-extra">Threshold: ${item.min_threshold.toFixed(2)}</div>
                        )}
                        {item.fixed_fee_amount > 0 && (
                          <div className="model-extra">Fixed Fee: ${item.fixed_fee_amount.toFixed(2)}</div>
                        )}
                      </div>
                    </td>

                    {/* Financial Reconciliation */}
                    <td>
                      <div className="financial-cell">
                        <div className="variance-amount text-crimson font-bold">
                          -${item.carveout_variance.toFixed(2)}
                        </div>
                        <div className="financial-sub">
                          Expected: ${item.expected_carveout_amount.toFixed(2)}
                        </div>
                        <div className="financial-sub">
                          Payer Paid: ${item.payer_paid_carveout.toFixed(2)}
                        </div>
                      </div>
                    </td>

                    {/* Filing Deadline */}
                    <td>
                      <div className="deadline-cell">
                        {isExpired ? (
                          <span className="deadline-tag expired">
                            <XCircle size={13} />
                            <span>Expired ({Math.abs(item.days_until_deadline)}d ago)</span>
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
                          {!item.invoice_attached && (
                            <button
                              className="btn-action btn-attach"
                              onClick={() => handleOpenAttachInvoice(item)}
                              title="Attach Vendor Manufacturer Invoice"
                            >
                              <Paperclip size={13} />
                              <span>Attach Inv</span>
                            </button>
                          )}

                          {item.invoice_attached && !['DISPUTE_SUBMITTED', 'CORRECTED_CLAIM_QUEUED', 'RECOVERED', 'EXPIRED_UNRECOVERABLE'].includes(item.discrepancy_status) && (
                            <button
                              className="btn-action btn-dispute"
                              onClick={() => handleOpenDispute(item)}
                              title="Generate Corrected 837 Claim or Appeal Letter"
                            >
                              <Send size={13} />
                              <span>Dispute</span>
                            </button>
                          )}

                          {item.carveout_variance > 0 && !['RECOVERED', 'EXPIRED_UNRECOVERABLE'].includes(item.discrepancy_status) && (
                            <button
                              className="btn-action btn-recover"
                              onClick={() => handleOpenRecovery(item)}
                              title="Record Recovered Remittance Cash"
                            >
                              <DollarSign size={13} />
                              <span>Recover</span>
                            </button>
                          )}

                          {!['DISMISSED_NOT_ELIGIBLE', 'RECOVERED'].includes(item.discrepancy_status) && (
                            <button
                              className="btn-action btn-dismiss"
                              onClick={() => handleDismiss(item)}
                              title="Dismiss as Non-Carved Out"
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

      {/* Modal: Attach Vendor Invoice */}
      {showInvoiceModal && selectedDiscrepancy && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <div className="modal-title-group">
                <Paperclip size={18} className="text-blue" />
                <h3>Attach Vendor Manufacturer Invoice</h3>
              </div>
              <button className="close-btn" onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveInvoice}>
              <div className="modal-body">
                <div className="device-spec-card">
                  <div><strong>Device:</strong> {selectedDiscrepancy.device_name}</div>
                  <div><strong>HCPCS:</strong> {selectedDiscrepancy.hcpcs_device_code} • <strong>Vendor:</strong> {selectedDiscrepancy.vendor_name}</div>
                  <div><strong>Claim:</strong> {selectedDiscrepancy.claim_number} ({selectedDiscrepancy.patient_name})</div>
                </div>

                <div className="form-group">
                  <label>Vendor Invoice Number <span className="text-crimson">*</span></label>
                  <input
                    type="text"
                    required
                    value={invoiceNumberInput}
                    onChange={(e) => setInvoiceNumberInput(e.target.value)}
                    placeholder="e.g. INV-STR-49921"
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Verified Acquisition Cost ($) <span className="text-crimson">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={invoiceCostInput}
                    onChange={(e) => setInvoiceCostInput(e.target.value)}
                    placeholder="e.g. 5800.00"
                    className="form-control"
                  />
                  <span className="field-hint">Cost printed on vendor shipping invoice before sales tax or shipping charges.</span>
                </div>

                <div className="attachment-preview-box">
                  <FileText size={20} className="text-blue" />
                  <div>
                    <div className="attachment-title">Simulated Manufacturer Invoice PDF</div>
                    <div className="attachment-sub">Vendor Itemized Slip with UDI/Lot verification</div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowInvoiceModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Verify & Attach Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Generate Dispute / Corrected Claim */}
      {showDisputeModal && selectedDiscrepancy && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <div className="modal-title-group">
                <Send size={18} className="text-teal" />
                <h3>Generate Carve-Out Dispute / Corrected 837</h3>
              </div>
              <button className="close-btn" onClick={() => setShowDisputeModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveDispute}>
              <div className="modal-body">
                <div className="device-spec-card">
                  <div><strong>Patient:</strong> {selectedDiscrepancy.patient_name} • <strong>Payer:</strong> {selectedDiscrepancy.payer_name}</div>
                  <div><strong>Device:</strong> {selectedDiscrepancy.device_name} (HCPCS {selectedDiscrepancy.hcpcs_device_code})</div>
                  <div><strong>Carve-Out Variance:</strong> <span className="text-crimson font-bold">${selectedDiscrepancy.carveout_variance.toFixed(2)}</span></div>
                </div>

                <div className="form-group">
                  <label>Dispute Submission Action <span className="text-crimson">*</span></label>
                  <select
                    value={disputeTypeInput}
                    onChange={(e) => setDisputeTypeInput(e.target.value)}
                    className="form-control"
                  >
                    <option value="CORRECTED_CLAIM">Electronic 837 Corrected Claim (Frequency Code 7)</option>
                    <option value="APPEAL_LETTER">Formal Contractual Carve-Out Appeal Letter</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Dispute Notes & Contract Citations</label>
                  <textarea
                    rows={3}
                    value={disputeNotesInput}
                    onChange={(e) => setDisputeNotesInput(e.target.value)}
                    placeholder="e.g. Attached vendor invoice INV-ZB-98124 per Commercial Agreement Section 8.4."
                    className="form-control"
                  />
                </div>

                <div className="dispute-packet-preview">
                  <div className="packet-header">Automatic Dispute Packet Inclusions:</div>
                  <ul className="packet-list">
                    <li>✓ Vendor Manufacturer Invoice #{selectedDiscrepancy.invoice_number}</li>
                    <li>✓ Operative Report & Nursing Implant Log Verification</li>
                    <li>✓ Contract Addendum Excerpt for {selectedDiscrepancy.payer_name}</li>
                    <li>✓ UDI Barcode: {selectedDiscrepancy.udi_di || 'GS1 Verified'}</li>
                  </ul>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowDisputeModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Dispatch Dispute Packet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Recovered Remittance */}
      {showRecoveryModal && selectedDiscrepancy && (
        <div className="modal-backdrop">
          <div className="modal-container">
            <div className="modal-header">
              <div className="modal-title-group">
                <DollarSign size={18} className="text-emerald" />
                <h3>Record Carve-Out Remittance Recovery</h3>
              </div>
              <button className="close-btn" onClick={() => setShowRecoveryModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveRecovery}>
              <div className="modal-body">
                <div className="device-spec-card">
                  <div><strong>Patient:</strong> {selectedDiscrepancy.patient_name} • <strong>Claim:</strong> {selectedDiscrepancy.claim_number}</div>
                  <div><strong>Outstanding Variance:</strong> <span className="text-crimson font-bold">${selectedDiscrepancy.carveout_variance.toFixed(2)}</span></div>
                </div>

                <div className="form-group">
                  <label>Recovered Cash Amount ($) <span className="text-crimson">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={recoveryAmountInput}
                    onChange={(e) => setRecoveryAmountInput(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Remittance Notes / Check # / ERA ID</label>
                  <input
                    type="text"
                    value={recoveryNotesInput}
                    onChange={(e) => setRecoveryNotesInput(e.target.value)}
                    placeholder="e.g. 835 Remittance ERA-2026-90412 paid in full"
                    className="form-control"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowRecoveryModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Reconcile & Recover</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
