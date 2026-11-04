import React, { useState, useMemo } from 'react';
import {
  FileText,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Search,
  X,
  Download,
  Eye,
  RefreshCw,
  Send,
  Building,
  ShieldAlert,
  ChevronRight,
  Receipt,
  Tag
} from 'lucide-react';
import {
  claimsService,
  CLAIM_LIFECYCLE_STATUSES,
  CLAIM_STATUS_CONFIG,
  BILLING_FORMATS,
  ASC_REVENUE_CODES
} from '../lib/claimsService';
import './ClaimsModelView.css';

export default function ClaimsModelView() {
  const [data] = useState(() => claimsService.getBaselineSampleData());
  const [activeTab, setActiveTab] = useState('all_claims');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedPayer, setSelectedPayer] = useState('ALL');
  const [selectedFormat, setSelectedFormat] = useState('ALL');
  const [selectedClaim, setSelectedClaim] = useState(null);

  const claims = data.claims;
  const auditHistory = data.auditHistory;

  // Flattened Claim Lines for Tab 2
  const allClaimLines = useMemo(() => {
    return claims.flatMap(c => 
      c.lines.map(l => ({
        ...l,
        claimControlNumber: c.patientControlNumber,
        patientName: c.patientName,
        payerName: c.primaryPayerName,
        claimStatus: c.rcmStatus
      }))
    );
  }, [claims]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return claimsService.calculateFacilityRcmKpis(claims);
  }, [claims]);

  // Unique Payers for Filter
  const uniquePayers = useMemo(() => {
    const set = new Set(claims.map(c => c.primaryPayerName));
    return Array.from(set);
  }, [claims]);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter(c => {
      const matchesSearch = !searchTerm.trim() ||
        c.patientControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.procedureName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.primaryPayerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.clearinghouseClaimId && c.clearinghouseClaimId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.payerClaimControlNumber && c.payerClaimControlNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = selectedStatus === 'ALL' || c.rcmStatus === selectedStatus;
      const matchesPayer = selectedPayer === 'ALL' || c.primaryPayerName === selectedPayer;
      const matchesFormat = selectedFormat === 'ALL' || c.billingFormat === selectedFormat;

      return matchesSearch && matchesStatus && matchesPayer && matchesFormat;
    });
  }, [claims, searchTerm, selectedStatus, selectedPayer, selectedFormat]);

  // Filtered Lines for Tab 2
  const filteredLines = useMemo(() => {
    return allClaimLines.filter(l => {
      const matchesSearch = !searchTerm.trim() ||
        l.claimControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.cptCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.procedureDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.revenueCode && l.revenueCode.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = selectedStatus === 'ALL' || l.claimStatus === selectedStatus;
      const matchesPayer = selectedPayer === 'ALL' || l.payerName === selectedPayer;

      return matchesSearch && matchesStatus && matchesPayer;
    });
  }, [allClaimLines, searchTerm, selectedStatus, selectedPayer]);

  // Lifecycle Stage Counts for Visual Pipeline
  const pipelineStats = useMemo(() => {
    const stats = {
      preSubmission: { count: 0, amount: 0 },
      transmission: { count: 0, amount: 0 },
      adjudication: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      denied: { count: 0, amount: 0 }
    };

    claims.forEach(c => {
      const gross = Number(c.totalGrossCharge || 0);
      const stage = CLAIM_STATUS_CONFIG[c.rcmStatus]?.stage;

      if (stage === 'PRE_SUBMISSION') {
        stats.preSubmission.count += 1;
        stats.preSubmission.amount += gross;
      } else if (stage === 'TRANSMISSION') {
        stats.transmission.count += 1;
        stats.transmission.amount += gross;
      } else if (stage === 'ADJUDICATION') {
        stats.adjudication.count += 1;
        stats.adjudication.amount += gross;
      } else if (stage === 'RESOLVED' && c.rcmStatus === CLAIM_LIFECYCLE_STATUSES.PAID) {
        stats.paid.count += 1;
        stats.paid.amount += Number(c.totalPaidAmount || 0);
      } else if (stage === 'DENIAL_APPEAL') {
        stats.denied.count += 1;
        stats.denied.amount += Number(c.outstandingArBalance || gross);
      }
    });

    return stats;
  }, [claims]);

  // Export CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'Patient Control #',
      'Patient Name',
      'MRN',
      'DOS',
      'Procedure',
      'Payer',
      'Format',
      'RCM Status',
      'Gross Billed ($)',
      'Allowed ($)',
      'Paid ($)',
      'Contractual Write-Off ($)',
      'Patient Port ($)',
      'Outstanding AR ($)',
      'Clearinghouse Trace ID',
      'Payer ICN'
    ];

    const rows = filteredClaims.map(c => [
      `"${c.patientControlNumber}"`,
      `"${c.patientName}"`,
      c.patientMrn,
      c.dateOfService,
      `"${c.procedureName}"`,
      `"${c.primaryPayerName}"`,
      c.billingFormat,
      c.rcmStatus,
      c.totalGrossCharge,
      c.totalAllowedAmount,
      c.totalPaidAmount,
      c.totalContractualAdjustment,
      c.totalPatientBalance,
      c.outstandingArBalance,
      c.clearinghouseClaimId || 'N/A',
      c.payerClaimControlNumber || 'N/A'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `claims_rcm_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="claims-container">
      {/* Top Header Toolbar */}
      <div className="claims-topbar">
        <div className="topbar-left">
          <div className="header-icon-badge">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="claims-title">Claims Management & RCM Lifecycle</h1>
            <p className="claims-subtitle">
              UB-04 Institutional & CMS-1500 Adjudication, Clearinghouse Provenance & AR Ledger
            </p>
          </div>
        </div>

        <div className="topbar-right">
          <button onClick={handleExportCsv} className="action-btn export-btn" title="Export Claims to CSV">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export Claims CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      <div className="kpi-banner-grid">
        {/* KPI 1: Active Outstanding AR */}
        <div className="kpi-card highlight-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Outstanding AR</span>
            <DollarSign className="w-4 h-4 text-sky-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value text-sky-400">
              ${kpis.totalActiveAr.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row mt-2">
            <span className="kpi-badge badge-sky">Billed: ${kpis.totalBilledAmount.toLocaleString()}</span>
            <span className="kpi-subtext">{claims.length} Total Claims</span>
          </div>
        </div>

        {/* KPI 2: Clean Claim Submission Rate */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Clean Claim Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value text-emerald-400">{kpis.cleanClaimRate}%</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-emerald">Zero Scrub Edits</span>
            <span className="kpi-subtext">First-Pass Yield</span>
          </div>
        </div>

        {/* KPI 3: Pending Payer Adjudication */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">In Payer Adjudication</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value text-amber-400">
              ${kpis.pendingAdjudicationAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-amber">277CA Acked</span>
            <span className="kpi-subtext">Awaiting 835 Remittance</span>
          </div>
        </div>

        {/* KPI 4: Denied / At-Risk AR */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Denied / At-Risk AR</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value text-rose-400">
              ${kpis.deniedAtRiskAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-rose">Action Required</span>
            <span className="kpi-subtext">CARC Denial Review</span>
          </div>
        </div>
      </div>

      {/* Visual RCM Lifecycle Pipeline Ribbon */}
      <div className="lifecycle-pipeline-card">
        <div className="pipeline-title-row">
          <span className="pipeline-title">Claim Lifecycle Velocity Pipeline</span>
          <span className="pipeline-sub">Real-Time Distribution Across RCM Adjudication Stages</span>
        </div>
        <div className="pipeline-grid">
          <div className="pipeline-stage">
            <div className="stage-header">
              <span className="stage-name">1. Pre-Submission</span>
              <span className="stage-count">{pipelineStats.preSubmission.count}</span>
            </div>
            <div className="stage-bar"><div className="stage-fill fill-slate" style={{ width: '100%' }}></div></div>
            <div className="stage-amt">${pipelineStats.preSubmission.amount.toLocaleString()}</div>
          </div>

          <div className="pipeline-stage">
            <div className="stage-header">
              <span className="stage-name">2. Transmission</span>
              <span className="stage-count">{pipelineStats.transmission.count}</span>
            </div>
            <div className="stage-bar"><div className="stage-fill fill-sky" style={{ width: '100%' }}></div></div>
            <div className="stage-amt">${pipelineStats.transmission.amount.toLocaleString()}</div>
          </div>

          <div className="pipeline-stage">
            <div className="stage-header">
              <span className="stage-name">3. Adjudication</span>
              <span className="stage-count">{pipelineStats.adjudication.count}</span>
            </div>
            <div className="stage-bar"><div className="stage-fill fill-amber" style={{ width: '100%' }}></div></div>
            <div className="stage-amt">${pipelineStats.adjudication.amount.toLocaleString()}</div>
          </div>

          <div className="pipeline-stage">
            <div className="stage-header">
              <span className="stage-name">4. Paid & Settled</span>
              <span className="stage-count">{pipelineStats.paid.count}</span>
            </div>
            <div className="stage-bar"><div className="stage-fill fill-emerald" style={{ width: '100%' }}></div></div>
            <div className="stage-amt">${pipelineStats.paid.amount.toLocaleString()}</div>
          </div>

          <div className="pipeline-stage">
            <div className="stage-header">
              <span className="stage-name">5. Denied / Appeals</span>
              <span className="stage-count">{pipelineStats.denied.count}</span>
            </div>
            <div className="stage-bar"><div className="stage-fill fill-rose" style={{ width: '100%' }}></div></div>
            <div className="stage-amt">${pipelineStats.denied.amount.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation Strip (Row 1) */}
      <div className="claims-tabs-bar">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'all_claims' ? 'active' : ''}`}
            onClick={() => { setActiveTab('all_claims'); setSelectedStatus('ALL'); }}
          >
            <FileText className="w-4 h-4" />
            <span>All Claims Master ({claims.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'claim_lines' ? 'active' : ''}`}
            onClick={() => { setActiveTab('claim_lines'); setSelectedStatus('ALL'); }}
          >
            <Layers className="w-4 h-4" />
            <span>Claim Lines & Charges ({allClaimLines.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'adjudication' ? 'active' : ''}`}
            onClick={() => { setActiveTab('adjudication'); setSelectedStatus('ALL'); }}
          >
            <Clock className="w-4 h-4" />
            <span>Adjudication & AR Pipeline</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'audit_logs' ? 'active' : ''}`}
            onClick={() => { setActiveTab('audit_logs'); setSelectedStatus('ALL'); }}
          >
            <Receipt className="w-4 h-4" />
            <span>Clearinghouse EDI Audit ({auditHistory.length})</span>
          </button>
        </div>
      </div>

      {/* Dedicated Search & Filter Toolbar (Row 2) */}
      <div className="claims-toolbar">
        <div className="toolbar-left-controls">
          <div className="claims-search-box">
            <Search className="w-4 h-4 search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'all_claims'
                  ? 'Search by Control #, Patient, CPT, Payer, Trace ID...'
                  : activeTab === 'claim_lines'
                  ? 'Search by CPT, Rev Code, Procedure, Patient...'
                  : 'Search claims or audit history...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="claims-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="claims-clear-btn"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="claims-dropdown-filter">
            <label className="filter-label">Status:</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="claims-select"
            >
              <option value="ALL">All Statuses</option>
              {Object.values(CLAIM_LIFECYCLE_STATUSES).map(s => (
                <option key={s} value={s}>{CLAIM_STATUS_CONFIG[s]?.shortLabel || s}</option>
              ))}
            </select>
          </div>

          <div className="claims-dropdown-filter">
            <label className="filter-label">Payer:</label>
            <select
              value={selectedPayer}
              onChange={e => setSelectedPayer(e.target.value)}
              className="claims-select"
            >
              <option value="ALL">All Payers</option>
              {uniquePayers.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {(searchTerm || selectedStatus !== 'ALL' || selectedPayer !== 'ALL' || selectedFormat !== 'ALL') && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSelectedStatus('ALL'); setSelectedPayer('ALL'); setSelectedFormat('ALL'); }}
              className="claims-reset-btn"
              title="Reset all filters"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="toolbar-right-controls">
          <span className="results-badge">
            Showing <strong className="text-emerald-400 font-mono">{
              activeTab === 'all_claims' ? filteredClaims.length :
              activeTab === 'claim_lines' ? filteredLines.length :
              auditHistory.length
            }</strong> records
          </span>
        </div>
      </div>

      {/* TAB 1: ALL CLAIMS MASTER */}
      {activeTab === 'all_claims' && (
        <div className="table-responsive">
          <table className="claims-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Patient Control #</th>
                <th style={{ width: '180px' }}>Patient & DOS</th>
                <th style={{ width: '190px' }}>Procedure & Surgeon</th>
                <th style={{ width: '180px' }}>Payer & Format</th>
                <th style={{ width: '140px', textAlign: 'center' }}>RCM Status</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Billed Charge</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Allowed</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Paid Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Outstanding AR</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-table-cell">
                    <AlertCircle className="w-8 h-8 text-slate-500 mb-2" />
                    <div>No claims match the active search or filter criteria.</div>
                  </td>
                </tr>
              ) : (
                filteredClaims.map(c => {
                  const statusCfg = CLAIM_STATUS_CONFIG[c.rcmStatus] || {};
                  return (
                    <tr key={c.id} className="hover-row" onClick={() => setSelectedClaim(c)}>
                      <td>
                        <div className="font-mono font-semibold text-sky-400">{c.patientControlNumber}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{c.claimFrequencyType === '1' ? 'Original (1)' : 'Replaced (7)'}</div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-200">{c.patientName}</div>
                        <div className="text-xs text-slate-400">{c.patientMrn} • DOS: {c.dateOfService}</div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-300 text-truncate" title={c.procedureName}>
                          {c.procedureName}
                        </div>
                        <div className="text-xs text-slate-400">{c.surgeonName}</div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-300">{c.primaryPayerName}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {c.billingFormat === BILLING_FORMATS.UB04_INSTITUTIONAL ? 'UB-04 (837I)' : 'CMS-1500 (837P)'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`kpi-badge ${statusCfg.badgeClass || 'badge-slate'}`}>
                          {statusCfg.label || c.rcmStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono text-slate-200 font-semibold">
                        ${c.totalGrossCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono text-slate-300">
                        ${c.totalAllowedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono text-emerald-400 font-semibold">
                        ${c.totalPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono">
                        <span className={c.outstandingArBalance > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                          ${c.outstandingArBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedClaim(c); }}
                          className="inspect-btn"
                          title="Inspect Claim & Lines"
                        >
                          <Eye className="w-3.5 h-3.5 text-sky-400" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: CLAIM LINES & CHARGE BREAKDOWN */}
      {activeTab === 'claim_lines' && (
        <div className="table-responsive">
          <table className="claims-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Claim Ref</th>
                <th style={{ width: '70px', textAlign: 'center' }}>Line #</th>
                <th style={{ width: '110px' }}>Rev Code</th>
                <th style={{ width: '110px' }}>CPT / HCPCS</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Modifiers</th>
                <th style={{ width: '220px' }}>Procedure Description</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Gross Charge</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Allowed</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Paid</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Contractual Adj</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Line Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty-table-cell">
                    <AlertCircle className="w-8 h-8 text-slate-500 mb-2" />
                    <div>No claim service lines match the search criteria.</div>
                  </td>
                </tr>
              ) : (
                filteredLines.map(l => (
                  <tr key={l.id} className="hover-row">
                    <td className="font-mono text-sky-400 font-semibold">{l.claimControlNumber}</td>
                    <td style={{ textAlign: 'center' }} className="font-mono">{l.lineNumber}</td>
                    <td>
                      <span className="font-mono text-amber-300 font-semibold">{l.revenueCode || '0490'}</span>
                      <div className="text-2xs text-slate-400">
                        {ASC_REVENUE_CODES[l.revenueCode]?.name.slice(0, 20) || 'ASC Surgical'}
                      </div>
                    </td>
                    <td className="font-mono text-slate-200 font-bold">{l.cptCode}</td>
                    <td style={{ textAlign: 'center' }}>
                      {l.modifiers && l.modifiers.length > 0 ? (
                        <div className="tag-group">
                          {l.modifiers.map(m => (
                            <span key={m} className="mod-tag">{m}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="text-slate-300 text-truncate" title={l.procedureDescription}>
                      {l.procedureDescription}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono text-slate-200 font-semibold">
                      ${l.grossCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono text-slate-300">
                      ${l.allowedAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono text-emerald-400 font-semibold">
                      ${l.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono text-slate-400">
                      ${l.contractualAdjustment.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`kpi-badge ${
                        l.lineRcmStatus === 'ADJUDICATED_PAID' ? 'badge-emerald' :
                        l.lineRcmStatus === 'ADJUDICATED_DENIED' ? 'badge-rose' :
                        l.lineRcmStatus === 'SUBMITTED' ? 'badge-sky' : 'badge-slate'
                      }`}>
                        {l.lineRcmStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: ADJUDICATION & AR PIPELINE */}
      {activeTab === 'adjudication' && (
        <div className="table-responsive">
          <table className="claims-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Patient Control #</th>
                <th style={{ width: '160px' }}>Primary Payer</th>
                <th style={{ width: '180px' }}>Clearinghouse Trace ID</th>
                <th style={{ width: '180px' }}>Payer ICN / DCN</th>
                <th style={{ width: '140px' }}>Initial Submitted</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Adjudication Status</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Billed Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Outstanding AR</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Yield Pct</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.map(c => {
                const statusCfg = CLAIM_STATUS_CONFIG[c.rcmStatus] || {};
                const yieldPct = c.totalGrossCharge > 0 ? Math.round((c.totalPaidAmount / c.totalGrossCharge) * 100) : 0;
                return (
                  <tr key={c.id} className="hover-row" onClick={() => setSelectedClaim(c)}>
                    <td className="font-mono font-semibold text-sky-400">{c.patientControlNumber}</td>
                    <td className="text-slate-300 font-medium">{c.primaryPayerName}</td>
                    <td className="font-mono text-slate-300">{c.clearinghouseClaimId || 'Pending Batch'}</td>
                    <td className="font-mono text-slate-300">{c.payerClaimControlNumber || 'Awaiting 277CA'}</td>
                    <td className="text-slate-400 text-xs">{c.initialSubmittedAt ? new Date(c.initialSubmittedAt).toLocaleDateString() : 'Unsubmitted'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`kpi-badge ${statusCfg.badgeClass || 'badge-slate'}`}>
                        {statusCfg.label || c.rcmStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono text-slate-200">
                      ${c.totalGrossCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right' }} className="font-mono font-bold text-amber-400">
                      ${c.outstandingArBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }} className="font-mono">
                      <span className={`yield-pill ${yieldPct >= 35 ? 'pill-emerald' : yieldPct > 0 ? 'pill-amber' : 'pill-slate'}`}>
                        {yieldPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: CLEARINGHOUSE EDI AUDIT LOG */}
      {activeTab === 'audit_logs' && (
        <div className="table-responsive">
          <table className="claims-table">
            <thead>
              <tr>
                <th style={{ width: '170px' }}>Timestamp</th>
                <th style={{ width: '140px' }}>Claim Ref</th>
                <th style={{ width: '180px' }}>Transition Event</th>
                <th style={{ width: '140px' }}>From Status</th>
                <th style={{ width: '140px' }}>To Status</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Actor Role</th>
                <th>Audit Notes & Provenance</th>
              </tr>
            </thead>
            <tbody>
              {auditHistory.map(a => (
                <tr key={a.id} className="hover-row">
                  <td className="font-mono text-xs text-slate-300">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="font-mono text-sky-400 font-semibold">{a.claimId}</td>
                  <td className="font-mono font-semibold text-emerald-400">{a.transitionEvent}</td>
                  <td>
                    <span className="kpi-badge badge-slate">{a.fromStatus}</span>
                  </td>
                  <td>
                    <span className="kpi-badge badge-sky">{a.toStatus}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="role-tag">{a.actorRole}</span>
                  </td>
                  <td className="text-slate-300 text-xs">{a.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CLAIM DETAIL INSPECTOR MODAL */}
      {selectedClaim && (
        <div className="modal-backdrop" onClick={() => setSelectedClaim(null)}>
          <div className="claim-modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-left">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="modal-title">
                    Claim Detail: <span className="font-mono text-sky-400">{selectedClaim.patientControlNumber}</span>
                  </h3>
                  <p className="modal-subtitle">
                    {selectedClaim.procedureName} • {selectedClaim.patientName} ({selectedClaim.patientMrn})
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedClaim(null)} className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              {/* Claim Overview Metadata Grid */}
              <div className="claim-meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Primary Payer</span>
                  <span className="meta-val font-semibold text-slate-200">{selectedClaim.primaryPayerName}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Billing Format</span>
                  <span className="meta-val font-mono text-sky-400">
                    {selectedClaim.billingFormat === BILLING_FORMATS.UB04_INSTITUTIONAL ? 'UB-04 (837I Facility)' : 'CMS-1500 (837P)'}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">RCM Status</span>
                  <span className={`kpi-badge ${CLAIM_STATUS_CONFIG[selectedClaim.rcmStatus]?.badgeClass || 'badge-slate'}`}>
                    {CLAIM_STATUS_CONFIG[selectedClaim.rcmStatus]?.label || selectedClaim.rcmStatus}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Clearinghouse Trace</span>
                  <span className="meta-val font-mono text-slate-300">{selectedClaim.clearinghouseClaimId || 'Unassigned'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Payer ICN / DCN</span>
                  <span className="meta-val font-mono text-slate-300">{selectedClaim.payerClaimControlNumber || 'Pending'}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Batch Identifier</span>
                  <span className="meta-val font-mono text-slate-300">{selectedClaim.transmissionBatchId || 'None'}</span>
                </div>
              </div>

              {/* Financial Balance Summary Ribbon */}
              <div className="claim-financial-strip">
                <div className="fin-box">
                  <span className="fin-lbl">Gross Billed</span>
                  <span className="fin-num font-mono text-slate-200">${selectedClaim.totalGrossCharge.toFixed(2)}</span>
                </div>
                <div className="fin-box">
                  <span className="fin-lbl">Allowed</span>
                  <span className="fin-num font-mono text-slate-300">${selectedClaim.totalAllowedAmount.toFixed(2)}</span>
                </div>
                <div className="fin-box">
                  <span className="fin-lbl">Paid Amount</span>
                  <span className="fin-num font-mono text-emerald-400 font-bold">${selectedClaim.totalPaidAmount.toFixed(2)}</span>
                </div>
                <div className="fin-box">
                  <span className="fin-lbl">Contractual Adj</span>
                  <span className="fin-num font-mono text-slate-400">${selectedClaim.totalContractualAdjustment.toFixed(2)}</span>
                </div>
                <div className="fin-box">
                  <span className="fin-lbl">Patient Due</span>
                  <span className="fin-num font-mono text-amber-300">${selectedClaim.totalPatientBalance.toFixed(2)}</span>
                </div>
                <div className="fin-box highlight-fin">
                  <span className="fin-lbl">Outstanding AR</span>
                  <span className="fin-num font-mono text-amber-400 font-bold">${selectedClaim.outstandingArBalance.toFixed(2)}</span>
                </div>
              </div>

              {/* Itemized Claim Service Lines */}
              <h4 className="section-title mt-4 mb-2">Itemized Claim Lines ({selectedClaim.lines.length})</h4>
              <div className="table-responsive modal-table-wrap">
                <table className="claims-table compact-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th style={{ width: '80px' }}>Rev Code</th>
                      <th style={{ width: '90px' }}>CPT</th>
                      <th style={{ width: '80px' }}>Mods</th>
                      <th>Procedure Description</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Charge</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Allowed</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Paid</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Coinsurance</th>
                      <th style={{ width: '100px', textAlign: 'center' }}>Line Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedClaim.lines.map(l => (
                      <tr key={l.id}>
                        <td className="font-mono text-slate-400">{l.lineNumber}</td>
                        <td className="font-mono text-amber-300 font-semibold">{l.revenueCode || '0490'}</td>
                        <td className="font-mono font-bold text-slate-200">{l.cptCode}</td>
                        <td className="font-mono text-xs">{l.modifiers?.join(',') || '—'}</td>
                        <td className="text-slate-300 text-xs">{l.procedureDescription}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-slate-200">${l.grossCharge.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-slate-300">${l.allowedAmount.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-emerald-400 font-semibold">${l.paidAmount.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-amber-300">${l.patientCoinsurance.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="kpi-badge badge-sky text-2xs">{l.lineRcmStatus}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setSelectedClaim(null)} className="action-btn modal-btn">
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
