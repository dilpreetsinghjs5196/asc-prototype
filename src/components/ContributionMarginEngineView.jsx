import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  Box,
  Scale,
  RefreshCw,
  PieChart,
  Target,
  ArrowRight,
  Info
} from 'lucide-react';
import {
  contributionMarginEngineService,
  PROFITABILITY_TIERS,
  TIER_CONFIG
} from '../lib/contributionMarginEngineService.js';
import './ContributionMarginEngineView.css';

const SAMPLE_CASES = [
  {
    id: 101,
    patient: 'Marcus Vance',
    mrn: 'MRN-78491',
    procedure: 'Left Knee Arthroscopy & Meniscectomy',
    date: '2026-10-24',
    surgeon: 'Dr. Sarah Lin, MD',
    facility: 'ASC North Suite 2',
    payer: 'Blue Cross PPO'
  },
  {
    id: 102,
    patient: 'Eleanor Rigby',
    mrn: 'MRN-88210',
    procedure: 'Right Cataract Phacoemulsification w/ IOL',
    date: '2026-10-25',
    surgeon: 'Dr. James Thorne, MD',
    facility: 'ASC Eye Pavilion',
    payer: 'Medicare Part B'
  },
  {
    id: 103,
    patient: 'David Kowalski',
    mrn: 'MRN-64022',
    procedure: 'Open Reduction Internal Fixation (ORIF) Ankle',
    date: '2026-10-26',
    surgeon: 'Dr. Robert Chen, MD',
    facility: 'ASC Main Suite 1',
    payer: 'Aetna HMO'
  }
];

export default function ContributionMarginEngineView() {
  const [selectedCaseId, setSelectedCaseId] = useState(101);
  const [activeTabFilter, setActiveTabFilter] = useState('ALL');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');

  const currentCase = useMemo(() => {
    return SAMPLE_CASES.find(c => c.id === selectedCaseId) || SAMPLE_CASES[0];
  }, [selectedCaseId]);

  // Retrieve deterministic margin evaluation
  const marginMetrics = useMemo(() => {
    return contributionMarginEngineService.evaluateCaseContributionMargin(currentCase.id);
  }, [currentCase.id, refreshTrigger]);

  // Retrieve multi-case profitability matrix
  const profitabilityMatrix = useMemo(() => {
    return contributionMarginEngineService.getProfitabilityMatrix();
  }, [refreshTrigger]);

  const handleRecalculate = () => {
    setRefreshTrigger(prev => prev + 1);
    setSuccessMessage('Contribution margins recalculated from source ledger & cost items.');
    setTimeout(() => setSuccessMessage(''), 3500);
  };

  return (
    <div className="margin-engine-container">
      {/* Top Action & Case Selector Toolbar */}
      <div className="margin-engine-topbar">
        <div className="topbar-left">
          <div className="case-selector-box">
            <span className="selector-label">Select Case:</span>
            <select
              className="case-dropdown"
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(Number(e.target.value))}
            >
              {SAMPLE_CASES.map(c => (
                <option key={c.id} value={c.id}>
                  Case #{c.id}: {c.patient} — {c.procedure}
                </option>
              ))}
            </select>
          </div>

          <div className="topbar-badges">
            <span className="badge-standard">
              <Scale size={13} />
              GAAP / ASC 606 Aligned
            </span>
            <span className="badge-standard">
              <ShieldCheck size={13} />
              Deterministic Server Truth
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <button className="action-btn btn-secondary" onClick={handleRecalculate}>
            <RefreshCw size={14} />
            Recalculate Margins
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="alert-banner alert-success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Case Meta Banner Card */}
      <div className="case-meta-card">
        <div className="meta-left">
          <div className="patient-avatar">
            {currentCase.patient.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="patient-details">
            <div className="patient-title">
              <span className="patient-name">{currentCase.patient}</span>
              <span className="patient-mrn">{currentCase.mrn}</span>
              <span className="case-badge">Case #{currentCase.id}</span>
            </div>
            <div className="procedure-sub">
              <span>{currentCase.procedure}</span>
              <span className="meta-separator">•</span>
              <span>{currentCase.facility}</span>
            </div>
          </div>
        </div>

        <div className="meta-right">
          <div className="meta-attribute">
            <span className="attr-label">Attending Surgeon</span>
            <span className="attr-value">{currentCase.surgeon}</span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Primary Payer</span>
            <span className="attr-value text-sky">{currentCase.payer}</span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Date of Service</span>
            <span className="attr-value">
              <Calendar size={13} className="inline mr-1 text-slate" />
              {currentCase.date}
            </span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Quality Status</span>
            <span className={`status-pill ${marginMetrics.completenessDetails.badgeClass}`}>
              <ShieldCheck size={13} className="mr-1" />
              {marginMetrics.completenessDetails.label}
            </span>
          </div>
        </div>
      </div>

      {/* Primary Margin KPI Cards Grid */}
      <div className="kpi-grid">
        {/* Expected Contribution Margin */}
        <div className="kpi-card highlight-kpi">
          <div className="kpi-header">
            <span className="kpi-title">Expected Contribution Margin</span>
            <DollarSign size={18} className="kpi-icon text-emerald" />
          </div>
          <div className="kpi-value text-emerald">
            {contributionMarginEngineService.formatCurrency(marginMetrics.expectedContributionMargin)}
          </div>
          <div className="kpi-subtext">
            <span>Contract Allowable Yield</span>
            <span className="font-semibold text-emerald">
              {contributionMarginEngineService.formatPercentage(marginMetrics.expectedMarginPercentage)}
            </span>
          </div>
        </div>

        {/* Actual Realized Contribution Margin */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Actual Realized Margin</span>
            <TrendingUp size={18} className="kpi-icon text-sky" />
          </div>
          <div className="kpi-value text-sky">
            {contributionMarginEngineService.formatCurrency(marginMetrics.actualContributionMargin)}
          </div>
          <div className="kpi-subtext">
            <span>Net Collections Yield</span>
            <span className="font-semibold text-sky">
              {contributionMarginEngineService.formatPercentage(marginMetrics.actualMarginPercentage)}
            </span>
          </div>
        </div>

        {/* Margin Leakage Variance */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Margin Leakage Variance</span>
            <Scale size={18} className="kpi-icon text-amber" />
          </div>
          <div className="kpi-value text-amber">
            {contributionMarginEngineService.formatCurrency(marginMetrics.marginLeakageVariance)}
          </div>
          <div className="kpi-subtext">
            <span>Uncollected Allowable Gap</span>
            <span className="text-amber font-semibold">
              {marginMetrics.marginLeakageVariance === 0 ? 'Fully Realized' : 'Undercollected'}
            </span>
          </div>
        </div>

        {/* Breakeven Revenue Point */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Breakeven Revenue Point</span>
            <Target size={18} className="kpi-icon text-slate" />
          </div>
          <div className="kpi-value text-slate-100">
            {contributionMarginEngineService.formatCurrency(marginMetrics.breakevenRevenueThreshold)}
          </div>
          <div className="kpi-subtext">
            <span>Minimum Viable Allowable</span>
            <span className="text-slate-300 font-semibold">
              Covers 8 Direct Costs
            </span>
          </div>
        </div>
      </div>

      {/* Direct Cost vs Revenue Reconciliation Bridge */}
      <div className="bridge-card">
        <div className="bridge-header">
          <div className="bridge-title-box">
            <PieChart size={18} className="text-emerald" />
            <h3 className="bridge-title">Procedural Profitability & Cost Absorption Bridge</h3>
          </div>
          <span className={`status-pill ${marginMetrics.tierConfig.badgeClass}`}>
            {marginMetrics.tierConfig.label}
          </span>
        </div>

        <div className="bridge-steps">
          <div className="bridge-step step-inflow">
            <span className="step-label">Expected Contract Allowable</span>
            <span className="step-value text-sky">
              +{contributionMarginEngineService.formatCurrency(marginMetrics.expectedContractAllowable)}
            </span>
            <span className="step-sub">Phase 68 Adjudicated Baseline</span>
          </div>

          <div className="bridge-operator">-</div>

          <div className="bridge-step step-cost">
            <span className="step-label">Total Direct Procedural Costs</span>
            <span className="step-value text-amber">
              -{contributionMarginEngineService.formatCurrency(marginMetrics.totalDirectCosts)}
            </span>
            <span className="step-sub">8 Direct Cost Categories</span>
          </div>

          <div className="bridge-operator">=</div>

          <div className="bridge-step step-margin">
            <span className="step-label">Expected Contribution Margin</span>
            <span className="step-value text-emerald font-bold">
              {contributionMarginEngineService.formatCurrency(marginMetrics.expectedContributionMargin)}
            </span>
            <span className="step-sub font-semibold text-emerald">
              {contributionMarginEngineService.formatPercentage(marginMetrics.expectedMarginPercentage)} Yield
            </span>
          </div>

          <div className="bridge-operator">-</div>

          <div className="bridge-step step-overhead">
            <span className="step-label">Indirect Overhead & Deprec.</span>
            <span className="step-value text-slate-300">
              -{contributionMarginEngineService.formatCurrency(marginMetrics.totalIndirectCost)}
            </span>
            <span className="step-sub">Facility Square Ft & Equipment</span>
          </div>

          <div className="bridge-operator">=</div>

          <div className="bridge-step step-net">
            <span className="step-label">Fully Loaded Net Margin</span>
            <span className="step-value text-sky font-bold">
              {contributionMarginEngineService.formatCurrency(marginMetrics.fullyLoadedNetMargin)}
            </span>
            <span className="step-sub">Net Facility Surplus</span>
          </div>
        </div>
      </div>

      {/* Cross-Case Profitability Matrix Table */}
      <div className="matrix-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h3 className="section-title">Encounter Contribution Margin Matrix (Surgeon & Specialty Cross-Tab)</h3>
            <span className="section-desc">
              Deterministic comparison of surgical case margins, yield percentages, and profitability tiers
            </span>
          </div>
          <span className="badge-standard">
            Fixed NUMERIC(12,2) • Zero Floating-Point Drift
          </span>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="table-responsive">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Case ID & Patient</th>
                <th>Procedure & Specialty</th>
                <th>Surgeon</th>
                <th>Primary Payer</th>
                <th className="text-right">Billed Charges</th>
                <th className="text-right">Expected Allowable</th>
                <th className="text-right">Direct Costs</th>
                <th className="text-right">Contribution Margin</th>
                <th className="text-right">Yield (%)</th>
                <th>Profitability Tier</th>
                <th>Completeness</th>
              </tr>
            </thead>
            <tbody>
              {profitabilityMatrix.map(row => {
                const isSelected = row.surgeryId === currentCase.id;
                return (
                  <tr
                    key={row.surgeryId}
                    className={`matrix-row ${isSelected ? 'selected-row' : ''}`}
                    onClick={() => setSelectedCaseId(row.surgeryId)}
                  >
                    <td>
                      <div className="cell-case">
                        <span className="case-num">Case #{row.surgeryId}</span>
                        <span className="patient-name-link">{row.patient}</span>
                      </div>
                    </td>
                    <td>
                      <div className="cell-proc">
                        <span className="proc-text">{row.procedure}</span>
                        <span className="specialty-sub">{row.specialty}</span>
                      </div>
                    </td>
                    <td className="text-slate-200 font-medium">{row.surgeon}</td>
                    <td className="text-sky font-medium">{row.payer}</td>
                    <td className="text-right font-mono text-slate-300">
                      {contributionMarginEngineService.formatCurrency(row.grossBilledCharges)}
                    </td>
                    <td className="text-right font-mono text-sky font-semibold">
                      {contributionMarginEngineService.formatCurrency(row.expectedContractAllowable)}
                    </td>
                    <td className="text-right font-mono text-amber">
                      {contributionMarginEngineService.formatCurrency(row.totalDirectCosts)}
                    </td>
                    <td className="text-right font-mono font-bold text-emerald">
                      {contributionMarginEngineService.formatCurrency(row.expectedContributionMargin)}
                    </td>
                    <td className="text-right font-mono font-bold text-emerald">
                      {contributionMarginEngineService.formatPercentage(row.expectedMarginPercentage)}
                    </td>
                    <td>
                      <span className={`status-pill ${row.tierConfig.badgeClass}`}>
                        {row.tierConfig.shortLabel}
                      </span>
                    </td>
                    <td>
                      <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
                        {row.completenessStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
