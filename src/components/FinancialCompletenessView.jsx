import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Layers,
  Search,
  Filter,
  Download,
  X,
  Maximize2,
  FileCheck,
  Building,
  User,
  DollarSign,
  TrendingUp,
  BarChart3,
  HelpCircle,
  FileText,
  Lock
} from 'lucide-react';
import {
  financialCompletenessService,
  COMPLETENESS_TRUST_TIERS,
  TRUST_TIER_CONFIG,
  SCORING_DIMENSIONS
} from '../lib/financialCompletenessService.js';
import './FinancialCompletenessView.css';

export default function FinancialCompletenessView() {
  const [activeTab, setActiveTab] = useState('case_matrix'); // case_matrix, payer_summary, surgeon_rankings, remediation_hub
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedPayer, setSelectedPayer] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [inspectedCase, setInspectedCase] = useState(null);

  // Load baseline cases
  const allCases = useMemo(() => {
    return financialCompletenessService.getBaselineSampleCases();
  }, []);

  // Filter cases
  const filteredCases = useMemo(() => {
    return allCases.filter(c => {
      const matchesSearch =
        !searchTerm ||
        (c.patient && c.patient.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.surgeonName && c.surgeonName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.procedure && c.procedure.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.cpt_codes && c.cpt_codes.includes(searchTerm)) ||
        (c.payerName && c.payerName.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSpecialty = selectedSpecialty === 'ALL' || c.specialty === selectedSpecialty;
      const matchesPayer = selectedPayer === 'ALL' || c.payerName === selectedPayer;

      const evalResult = financialCompletenessService.evaluateCaseCompleteness(c);
      const matchesTier = selectedTier === 'ALL' || evalResult.trustTier === selectedTier;

      return matchesSearch && matchesSpecialty && matchesPayer && matchesTier;
    });
  }, [allCases, searchTerm, selectedSpecialty, selectedPayer, selectedTier]);

  // Overall Facility KPIs
  const facilityKpis = useMemo(() => {
    return financialCompletenessService.calculateFacilityCompletenessKpis(filteredCases);
  }, [filteredCases]);

  // Rollup views
  const payerSummary = useMemo(() => {
    return financialCompletenessService.aggregatePayerCompleteness(filteredCases);
  }, [filteredCases]);

  const surgeonRankings = useMemo(() => {
    return financialCompletenessService.aggregateSurgeonCompleteness(filteredCases);
  }, [filteredCases]);

  // Extract all missing elements for remediation tab
  const allRemediationItems = useMemo(() => {
    const items = [];
    filteredCases.forEach(c => {
      const evalResult = financialCompletenessService.evaluateCaseCompleteness(c);
      evalResult.missingElements.forEach(gap => {
        items.push({
          ...gap,
          caseId: c.id,
          patient: c.patient,
          surgeonName: c.surgeonName,
          cpt: c.cpt_codes,
          margin: evalResult.expectedContributionMargin
        });
      });
    });
    return items;
  }, [filteredCases]);

  // Unique filter lists
  const specialties = useMemo(() => {
    return ['ALL', ...new Set(allCases.map(c => c.specialty).filter(Boolean))];
  }, [allCases]);

  const payers = useMemo(() => {
    return ['ALL', ...new Set(allCases.map(c => c.payerName).filter(Boolean))];
  }, [allCases]);

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Case ID',
      'Patient',
      'MRN',
      'Procedure',
      'CPT',
      'Surgeon',
      'Specialty',
      'Payer',
      'Overall Completeness Score',
      'Trust Tier',
      'Audit Ready',
      'Reimbursement (25)',
      'Direct Cost (25)',
      'Time & Staffing (20)',
      'Pharmacy & Sterile (10)',
      'Coding & Modifiers (10)',
      'Ledger & Cash (10)',
      'Missing Items Count'
    ];

    const rows = filteredCases.map(c => {
      const e = financialCompletenessService.evaluateCaseCompleteness(c);
      return [
        c.id,
        `"${c.patient}"`,
        c.mrn,
        `"${c.procedure}"`,
        c.cpt_codes,
        `"${c.surgeonName}"`,
        `"${c.specialty}"`,
        `"${c.payerName}"`,
        e.overallScore,
        e.trustTier,
        e.isAuditReady ? 'YES' : 'NO',
        e.scores.reimbursement,
        e.scores.directCost,
        e.scores.timeStaffing,
        e.scores.pharmacySterile,
        e.scores.codingModifier,
        e.scores.ledgerVerification,
        e.missingCount
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial_completeness_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="completeness-container">
      {/* Top Header Toolbar */}
      <div className="completeness-topbar">
        <div className="topbar-left">
          <div className="header-icon-badge">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="completeness-title">Financial Completeness Score & Trust Thresholds Engine</h1>
            <p className="completeness-subtitle">
              Multi-Dimensional Audit Readiness, Data Provenance Integrity & General Ledger Governance Gates
            </p>
          </div>
        </div>

        <div className="topbar-right">
          <button onClick={handleExportCsv} className="action-btn export-btn" title="Export Completeness Report to CSV">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export Audit Scorecard</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      <div className="kpi-banner-grid">
        {/* KPI 1: Facility Avg Completeness Score */}
        <div className="kpi-card highlight-card">
          <div className="kpi-header">
            <span className="kpi-label">Facility Completeness Score</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{facilityKpis.avgScore}</span>
            <span className="kpi-unit">/ 100</span>
          </div>
          <div className="score-progress-bar">
            <div
              className={`score-progress-fill ${facilityKpis.avgScore >= 90 ? 'fill-emerald' : facilityKpis.avgScore >= 75 ? 'fill-sky' : 'fill-amber'}`}
              style={{ width: `${facilityKpis.avgScore}%` }}
            />
          </div>
          <div className="kpi-meta-row mt-2">
            <span className="kpi-badge badge-emerald">Audit Gate: ≥90.0</span>
            <span className="kpi-subtext">{facilityKpis.totalCases} cases evaluated</span>
          </div>
        </div>

        {/* KPI 2: Audit-Ready Cases Share */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Audit-Ready Case Share</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{facilityKpis.auditReadyPct}%</span>
            <span className="kpi-unit">of cases</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-emerald">{facilityKpis.auditReadyCount} Closed-Period Ready</span>
            <span className="kpi-subtext">SOX § 404 Compliant</span>
          </div>
        </div>

        {/* KPI 3: Provisional Risk Margin Exposure */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Provisional Margin Exposure</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">
              ${facilityKpis.provisionalRiskExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-amber">{facilityKpis.provisionalCount + facilityKpis.criticalCount} Unverified Cases</span>
            <span className="kpi-subtext">Pending Invoices/Remits</span>
          </div>
        </div>

        {/* KPI 4: Unresolved Documentation Gaps */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Unresolved Data Gaps</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{facilityKpis.totalMissingGaps}</span>
            <span className="kpi-unit">action items</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-rose">{facilityKpis.criticalCount} Critical Incomplete</span>
            <span className="kpi-subtext">Actionable in Hub</span>
          </div>
        </div>
      </div>

      {/* Filter and Tab Navigation Bar */}
      <div className="controls-container">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'case_matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('case_matrix')}
          >
            <Layers className="w-4 h-4" />
            <span>Case Completeness Matrix ({filteredCases.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'payer_summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('payer_summary')}
          >
            <Building className="w-4 h-4" />
            <span>Payer Readiness ({payerSummary.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'surgeon_rankings' ? 'active' : ''}`}
            onClick={() => setActiveTab('surgeon_rankings')}
          >
            <User className="w-4 h-4" />
            <span>Surgeon Compliance ({surgeonRankings.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'remediation_hub' ? 'active' : ''}`}
            onClick={() => setActiveTab('remediation_hub')}
          >
            <FileText className="w-4 h-4" />
            <span>Remediation Hub ({allRemediationItems.length})</span>
          </button>
        </div>

        {/* Filters */}
        <div className="filters-wrapper">
          <div className="search-box">
            <Search className="w-4 h-4 text-slate-400 search-icon" />
            <input
              type="text"
              placeholder="Search patient, surgeon, CPT, payer..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Specialty:</label>
            <select
              value={selectedSpecialty}
              onChange={e => setSelectedSpecialty(e.target.value)}
              className="filter-select"
            >
              {specialties.map(s => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Specialties' : s}
                </option>
              ))}
            </select>
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Payer:</label>
            <select
              value={selectedPayer}
              onChange={e => setSelectedPayer(e.target.value)}
              className="filter-select"
            >
              {payers.map(p => (
                <option key={p} value={p}>
                  {p === 'ALL' ? 'All Payers' : p}
                </option>
              ))}
            </select>
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Trust Tier:</label>
            <select
              value={selectedTier}
              onChange={e => setSelectedTier(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Trust Tiers</option>
              {Object.values(COMPLETENESS_TRUST_TIERS).map(tierKey => (
                <option key={tierKey} value={tierKey}>
                  {TRUST_TIER_CONFIG[tierKey].shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="tab-content-wrapper">
        {/* TAB 1: Case Completeness Matrix */}
        {activeTab === 'case_matrix' && (
          <div className="table-responsive">
            <table className="completeness-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Case ID</th>
                  <th style={{ width: '160px' }}>Patient / MRN</th>
                  <th style={{ width: '220px' }}>Procedure & CPT</th>
                  <th style={{ width: '160px' }}>Surgeon / Specialty</th>
                  <th style={{ width: '140px' }}>Payer</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>Total Score</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Trust Tier</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Audit Ready</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Reimburse</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Cost/Implant</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Time/Staff</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>Open Gaps</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="empty-state-cell">
                      <div className="empty-state-box">
                        <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                        <p className="empty-title">No surgical cases match the selected filters.</p>
                        <p className="empty-subtitle">Try adjusting your search keywords, specialty, or trust tier filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCases.map(c => {
                    const e = financialCompletenessService.evaluateCaseCompleteness(c);
                    return (
                      <tr key={c.id} className="completeness-row">
                        <td className="font-mono text-slate-400">#{c.id}</td>
                        <td>
                          <div className="patient-name">{c.patient}</div>
                          <div className="patient-mrn">{c.mrn}</div>
                        </td>
                        <td>
                          <div className="procedure-name" title={c.procedure}>{c.procedure}</div>
                          <span className="cpt-badge">CPT {c.cpt_codes}</span>
                        </td>
                        <td>
                          <div className="surgeon-name">{c.surgeonName}</div>
                          <div className="specialty-sub">{c.specialty}</div>
                        </td>
                        <td>
                          <span className="payer-pill">{c.payerName}</span>
                        </td>
                        <td className="text-center font-mono">
                          <span className={`score-badge ${e.overallScore >= 90 ? 'badge-emerald' : e.overallScore >= 75 ? 'badge-sky' : e.overallScore >= 50 ? 'badge-amber' : 'badge-rose'}`}>
                            {e.overallScore}
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={`tier-badge ${e.tierConfig.badgeClass}`}>
                            {e.tierConfig.shortLabel}
                          </span>
                        </td>
                        <td className="text-center">
                          {e.isAuditReady ? (
                            <span className="status-pill audit-yes">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                            </span>
                          ) : (
                            <span className="status-pill audit-no">
                              <Lock className="w-3.5 h-3.5" /> Blocked
                            </span>
                          )}
                        </td>
                        <td className="text-right font-mono text-slate-300">
                          {e.scores.reimbursement} <span className="text-slate-500">/25</span>
                        </td>
                        <td className="text-right font-mono text-slate-300">
                          {e.scores.directCost} <span className="text-slate-500">/25</span>
                        </td>
                        <td className="text-right font-mono text-slate-300">
                          {e.scores.timeStaffing} <span className="text-slate-500">/20</span>
                        </td>
                        <td className="text-center font-mono">
                          {e.missingCount > 0 ? (
                            <span className="gaps-pill has-gaps">{e.missingCount} gaps</span>
                          ) : (
                            <span className="gaps-pill no-gaps">0 gaps</span>
                          )}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => setInspectedCase({ caseRecord: c, completeness: e })}
                            className="inspect-btn"
                            title="Inspect 6-Dimensional Breakdown"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
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

        {/* TAB 2: Payer Readiness Summary */}
        {activeTab === 'payer_summary' && (
          <div className="table-responsive">
            <table className="completeness-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Payer / Health Plan</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Total Cases</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Avg Completeness</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Audit-Ready Cases</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Audit Readiness %</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Provisional Exposure</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Critical Cases</th>
                </tr>
              </thead>
              <tbody>
                {payerSummary.map(p => (
                  <tr key={p.payerName} className="completeness-row">
                    <td>
                      <span className="payer-pill font-semibold">{p.payerName}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">{p.totalCases}</td>
                    <td className="text-center font-mono font-bold">
                      <span className={`score-badge ${p.avgScore >= 90 ? 'badge-emerald' : p.avgScore >= 75 ? 'badge-sky' : 'badge-amber'}`}>
                        {p.avgScore}
                      </span>
                    </td>
                    <td className="text-center font-mono text-emerald-400 font-semibold">{p.auditReadyCases}</td>
                    <td className="text-center font-mono">
                      <span className={`status-pill ${p.auditReadinessPct >= 80 ? 'audit-yes' : 'audit-no'}`}>
                        {p.auditReadinessPct}%
                      </span>
                    </td>
                    <td className="text-right font-mono text-amber-400 font-semibold">
                      ${p.provisionalMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-center font-mono">
                      {p.criticalCases > 0 ? (
                        <span className="text-rose-400 font-bold">{p.criticalCases}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: Surgeon Compliance */}
        {activeTab === 'surgeon_rankings' && (
          <div className="table-responsive">
            <table className="completeness-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Surgeon</th>
                  <th style={{ width: '180px' }}>Specialty</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Total Cases</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Avg Completeness</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Audit-Ready Cases</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Compliance %</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Total Open Gaps</th>
                </tr>
              </thead>
              <tbody>
                {surgeonRankings.map(s => (
                  <tr key={s.surgeonName} className="completeness-row">
                    <td>
                      <div className="surgeon-name font-semibold">{s.surgeonName}</div>
                    </td>
                    <td>
                      <span className="specialty-pill">{s.specialty}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">{s.totalCases}</td>
                    <td className="text-center font-mono font-bold">
                      <span className={`score-badge ${s.avgScore >= 90 ? 'badge-emerald' : s.avgScore >= 75 ? 'badge-sky' : 'badge-amber'}`}>
                        {s.avgScore}
                      </span>
                    </td>
                    <td className="text-center font-mono text-emerald-400 font-semibold">{s.auditReadyCases}</td>
                    <td className="text-center font-mono">
                      <span className={`status-pill ${s.compliancePct >= 80 ? 'audit-yes' : 'audit-no'}`}>
                        {s.compliancePct}%
                      </span>
                    </td>
                    <td className="text-center font-mono">
                      {s.totalGaps > 0 ? (
                        <span className="gaps-pill has-gaps">{s.totalGaps} items</span>
                      ) : (
                        <span className="gaps-pill no-gaps">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: Remediation Hub */}
        {activeTab === 'remediation_hub' && (
          <div className="table-responsive">
            <table className="completeness-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Severity</th>
                  <th style={{ width: '240px' }}>Missing Documentation Artifact</th>
                  <th style={{ width: '140px' }}>Dimension</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Impact</th>
                  <th style={{ width: '90px' }}>Case ID</th>
                  <th style={{ width: '150px' }}>Patient</th>
                  <th style={{ width: '160px' }}>Surgeon</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Case Margin</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {allRemediationItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-state-cell">
                      <div className="empty-state-box">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                        <p className="empty-title">All evaluated cases are 100% complete!</p>
                        <p className="empty-subtitle">Zero unresolved financial documentation gaps found across active records.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  allRemediationItems.map((gap, idx) => (
                    <tr key={`${gap.caseId}-${gap.code}-${idx}`} className="completeness-row">
                      <td>
                        <span className={`severity-pill ${gap.severity === 'HIGH' ? 'badge-rose' : gap.severity === 'MEDIUM' ? 'badge-amber' : 'badge-slate'}`}>
                          {gap.severity}
                        </span>
                      </td>
                      <td>
                        <div className="gap-label font-medium text-slate-200">{gap.label}</div>
                        <div className="gap-code font-mono text-slate-500 text-xs">{gap.code}</div>
                      </td>
                      <td>
                        <span className="dimension-pill">{gap.dimension}</span>
                      </td>
                      <td className="text-right font-mono text-rose-400 font-semibold">
                        -{gap.impactPoints.toFixed(1)} pts
                      </td>
                      <td className="font-mono text-slate-400">#{gap.caseId}</td>
                      <td>
                        <div className="patient-name text-sm">{gap.patient}</div>
                      </td>
                      <td>
                        <div className="surgeon-name text-sm">{gap.surgeonName}</div>
                      </td>
                      <td className="text-right font-mono text-slate-300">
                        ${gap.margin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={() => alert(`Remediation Task Dispatched: Routed ${gap.code} on Case #${gap.caseId} to Revenue Cycle Workqueue.`)}
                          className="resolve-btn"
                          title="Dispatch Remediation Task"
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Deterministic Scorecard Modal */}
      {inspectedCase && (
        <div className="modal-backdrop" onClick={() => setInspectedCase(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="modal-title">Financial Audit Completeness Scorecard</h3>
              </div>
              <button onClick={() => setInspectedCase(null)} className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              {/* Case Summary */}
              <div className="modal-case-summary">
                <div className="summary-col">
                  <div className="sum-label">Patient & Case ID</div>
                  <div className="sum-val">{inspectedCase.caseRecord.patient}</div>
                  <div className="sum-sub">{inspectedCase.caseRecord.mrn} • Case #{inspectedCase.caseRecord.id}</div>
                </div>
                <div className="summary-col">
                  <div className="sum-label">Procedure & CPT</div>
                  <div className="sum-val">{inspectedCase.caseRecord.procedure}</div>
                  <div className="sum-sub">CPT {inspectedCase.caseRecord.cpt_codes}</div>
                </div>
                <div className="summary-col">
                  <div className="sum-label">Surgeon / Payer</div>
                  <div className="sum-val">{inspectedCase.caseRecord.surgeonName}</div>
                  <div className="sum-sub">{inspectedCase.caseRecord.payerName}</div>
                </div>
              </div>

              {/* Overall Score Badge Banner */}
              <div className="overall-score-banner">
                <div className="score-left">
                  <div className="banner-score-val font-mono">{inspectedCase.completeness.overallScore}</div>
                  <div className="banner-score-sub">/ 100 Points Total</div>
                </div>
                <div className="score-right">
                  <span className={`tier-badge large-badge ${inspectedCase.completeness.tierConfig.badgeClass}`}>
                    {inspectedCase.completeness.tierConfig.label}
                  </span>
                  <div className="score-desc text-slate-300 mt-1">
                    {inspectedCase.completeness.tierConfig.description}
                  </div>
                </div>
              </div>

              {/* Dimensional Breakdown Grid */}
              <h4 className="audit-section-heading mt-4">6-Dimensional Scoring Matrix</h4>
              <div className="dimensions-grid">
                {SCORING_DIMENSIONS.map(dim => {
                  const score = inspectedCase.completeness.scores[dim.key];
                  const pct = Math.round((score / dim.maxPoints) * 100);
                  return (
                    <div key={dim.key} className="dimension-card">
                      <div className="dim-header">
                        <span className="dim-label">{dim.label}</span>
                        <span className="dim-score font-mono">{score} / {dim.maxPoints}</span>
                      </div>
                      <div className="dim-bar">
                        <div
                          className={`dim-fill ${pct === 100 ? 'fill-emerald' : pct >= 70 ? 'fill-sky' : 'fill-rose'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Missing Elements / Remediation */}
              <h4 className="audit-section-heading mt-4">Detected Documentation Gaps</h4>
              {inspectedCase.completeness.missingElements.length === 0 ? (
                <div className="no-gaps-box">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>No missing documentation items. Case is fully verified for audit freeze.</span>
                </div>
              ) : (
                <div className="modal-gaps-list">
                  {inspectedCase.completeness.missingElements.map(gap => (
                    <div key={gap.code} className="modal-gap-row">
                      <span className={`severity-pill ${gap.severity === 'HIGH' ? 'badge-rose' : 'badge-amber'}`}>
                        {gap.severity}
                      </span>
                      <div className="gap-info">
                        <div className="gap-title">{gap.label}</div>
                        <div className="gap-sub font-mono">{gap.code} • Dimension: {gap.dimension}</div>
                      </div>
                      <span className="gap-deduction font-mono">-{gap.impactPoints.toFixed(1)} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button onClick={() => setInspectedCase(null)} className="modal-dismiss-btn">
                Close Scorecard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

