import React, { useState, useMemo } from 'react';
import {
  Award,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Calendar,
  DollarSign,
  TrendingUp,
  Activity,
  Layers,
  Clock,
  Printer,
  Lock,
  X,
  FileText,
  ChevronRight,
  TrendingDown,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import {
  getBoardPackageByIdOrCode,
  getBoardPackageSections,
  getBoardPackageTelemetry,
  publishAndFreezeBoardPackage,
  PACKAGE_STATUSES,
  SECTION_CODES,
  generateBoardPackageDossier
} from '../services/boardReportingService';
import './BoardReportingView.css';

export default function BoardReportingView({ activeFacility = 'fac-naples-01' }) {
  const facilityId = typeof activeFacility === 'object' && activeFacility !== null
    ? (activeFacility.id || 'fac-naples-01')
    : (activeFacility || 'fac-naples-01');

  const [packageCode] = useState('BOD_2026_M10');
  const [activeSectionCode, setActiveSectionCode] = useState(SECTION_CODES.FINANCIAL);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showGovernanceDrawer, setShowGovernanceDrawer] = useState(false);
  const [freezeNotice, setFreezeNotice] = useState(null);

  const telemetry = useMemo(() => {
    return getBoardPackageTelemetry(facilityId, packageCode);
  }, [facilityId, packageCode, freezeNotice]);

  const sections = useMemo(() => {
    return getBoardPackageSections(packageCode);
  }, [packageCode]);

  const activeSection = useMemo(() => {
    return sections.find(s => s.sectionCode === activeSectionCode) || sections[0];
  }, [sections, activeSectionCode]);

  const dossier = useMemo(() => {
    return generateBoardPackageDossier(packageCode, facilityId);
  }, [packageCode, facilityId, freezeNotice]);

  const handlePublish = () => {
    try {
      const res = publishAndFreezeBoardPackage(packageCode);
      setFreezeNotice({
        type: 'success',
        message: `Board Package ${res.packageCode} hard-frozen with SHA-256 seal: ${res.frozenHash.slice(0, 16)}...`
      });
      setShowGovernanceDrawer(true);
    } catch (err) {
      setFreezeNotice({
        type: 'error',
        message: err.message || 'Failed to publish board package'
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`board-container ${isPresentationMode ? 'presentation-mode' : ''}`}>
      {/* Freeze Alert Banner */}
      {freezeNotice && (
        <div className={`board-banner ${freezeNotice.type === 'error' ? 'board-banner-error' : 'board-banner-success'}`}>
          <div className="board-banner-content">
            {freezeNotice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{freezeNotice.message}</span>
          </div>
          <button
            type="button"
            className="board-banner-close"
            onClick={() => setFreezeNotice(null)}
            title="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="board-header-card">
        <div className="board-header-left">
          <div className="board-header-badges">
            <span className="board-badge board-badge-facility">Naples Surgery Center</span>
            <span className="board-badge board-badge-phase">Phase E6 - Module 14 CFO</span>
            <span className={`board-badge board-badge-status ${telemetry.status.toLowerCase()}`}>
              {telemetry.status === PACKAGE_STATUSES.PUBLISHED_TO_BOARD ? (
                <>
                  <ShieldCheck size={12} className="inline-icon" />
                  PUBLISHED_TO_BOARD
                </>
              ) : (
                telemetry.status
              )}
            </span>
            <span className="board-badge board-badge-period">
              <Calendar size={12} className="inline-icon" />
              {telemetry.periodCode} Close
            </span>
          </div>
          <h1 className="board-title">{telemetry.packageTitle}</h1>
          <p className="board-subtitle">
            Executive board packet synthesizing procedural profitability, multi-module variance analysis,
            liquidity covenant compliance, and strategic expansion initiatives.
          </p>
        </div>

        <div className="board-header-actions">
          <button
            type="button"
            className={`board-btn ${isPresentationMode ? 'board-btn-primary' : 'board-btn-secondary'}`}
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            title="Toggle Clean Boardroom Dossier View"
          >
            <FileText size={16} />
            <span>{isPresentationMode ? 'Standard View' : 'Dossier View'}</span>
          </button>

          <button
            type="button"
            className="board-btn board-btn-secondary"
            onClick={() => setShowGovernanceDrawer(true)}
            title="View Governance Seals & Audit Chain"
          >
            <Lock size={16} />
            <span>Governance Seal</span>
          </button>

          <button
            type="button"
            className="board-btn board-btn-primary"
            onClick={handlePrint}
            title="Export or Print Board Package"
          >
            <Printer size={16} />
            <span>Export Dossier</span>
          </button>
        </div>
      </div>

      {/* Executive Board Scorecard Ribbon (6 Cards) */}
      <div className="board-scorecard-grid">
        {/* KPI 1: Net Patient Revenue */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">NET PATIENT REVENUE</span>
            <DollarSign size={16} className="board-kpi-icon emerald" />
          </div>
          <div className="board-kpi-value">${(telemetry.actualNpr).toLocaleString()}</div>
          <div className="board-kpi-subtext">
            <span>Budget: ${(telemetry.budgetedNpr).toLocaleString()}</span>
            <span className="board-delta-negative">
              -${Math.abs(telemetry.nprVariance).toLocaleString()} (-2.54%)
            </span>
          </div>
        </div>

        {/* KPI 2: Surgical Case Volume */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">CASE VOLUME</span>
            <Activity size={16} className="board-kpi-icon sky" />
          </div>
          <div className="board-kpi-value">{telemetry.actualCases} cases</div>
          <div className="board-kpi-subtext">
            <span>Budget: {telemetry.budgetedCases} cases</span>
            <span className="board-delta-negative">{telemetry.caseVariance} cases (-4.0%)</span>
          </div>
        </div>

        {/* KPI 3: Operating EBITDA */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">OPERATING EBITDA</span>
            <TrendingUp size={16} className="board-kpi-icon emerald" />
          </div>
          <div className="board-kpi-value">${(telemetry.actualEbitda).toLocaleString()}</div>
          <div className="board-kpi-subtext">
            <span>{telemetry.ebitdaMarginPercent}% Margin</span>
            <span className="board-delta-negative">
              -${Math.abs(telemetry.ebitdaVariance).toLocaleString()} vs Target
            </span>
          </div>
        </div>

        {/* KPI 4: Operating Cash & Covenant */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">OPERATING CASH</span>
            <ShieldCheck size={16} className="board-kpi-icon emerald" />
          </div>
          <div className="board-kpi-value">${(telemetry.endingCashBalance).toLocaleString()}</div>
          <div className="board-kpi-subtext">
            <span>Floor: ${(telemetry.minimumCashCovenant).toLocaleString()}</span>
            <span className="board-delta-positive">
              +${(telemetry.covenantHeadroom).toLocaleString()} Headroom
            </span>
          </div>
        </div>

        {/* KPI 5: Days Sales Outstanding */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">DAYS SALES OUTSTANDING</span>
            <Clock size={16} className="board-kpi-icon sky" />
          </div>
          <div className="board-kpi-value">{telemetry.daysSalesOutstanding} days</div>
          <div className="board-kpi-subtext">
            <span>Clean Claim: {telemetry.cleanClaimRate}%</span>
            <span className="board-delta-positive">Target: &lt;35d</span>
          </div>
        </div>

        {/* KPI 6: OR Capacity Utilization */}
        <div className="board-kpi-card">
          <div className="board-kpi-header">
            <span className="board-kpi-label">OR UTILIZATION</span>
            <Layers size={16} className="board-kpi-icon sky" />
          </div>
          <div className="board-kpi-value">{telemetry.orCapacityUtilizationPercent}%</div>
          <div className="board-kpi-subtext">
            <span>18,240 / 40,320 mins</span>
            <span className="board-delta-neutral">4 Operating Suites</span>
          </div>
        </div>
      </div>

      {/* Executive Summary Banner */}
      <div className="board-summary-card">
        <div className="board-summary-header">
          <div className="board-summary-title-row">
            <Award size={18} className="board-summary-icon" />
            <h2 className="board-summary-title">Executive Summary & CFO Overview</h2>
          </div>
          <div className="board-summary-meta">
            <span>Author: {telemetry.metadata?.author || 'Chief Financial Officer'}</span>
            <span className="board-separator">•</span>
            <span>Audience: {telemetry.metadata?.distribution || 'Board of Managers'}</span>
            <span className="board-separator">•</span>
            <span>Meeting: {telemetry.meetingDate}</span>
          </div>
        </div>
        <p className="board-summary-text">{telemetry.executiveSummary}</p>
      </div>

      {/* Standard Interactive Tabbed View */}
      {!isPresentationMode ? (
        <div className="board-sections-container">
          {/* Section Navigation Tabs */}
          <div className="board-tabs-bar">
            {sections.map(section => {
              const isActive = section.sectionCode === activeSectionCode;
              return (
                <button
                  key={section.sectionCode}
                  type="button"
                  className={`board-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveSectionCode(section.sectionCode)}
                >
                  <span className="board-tab-order">{section.displayOrder}</span>
                  <span className="board-tab-title">{section.sectionTitle}</span>
                </button>
              );
            })}
          </div>

          {/* Active Section Content Card */}
          <div className="board-active-section-card">
            <div className="board-active-section-header">
              <div>
                <span className="board-section-tag">SECTION {activeSection.displayOrder} OF 5</span>
                <h3 className="board-active-section-title">{activeSection.sectionTitle}</h3>
              </div>
            </div>

            {/* Section Highlights Grid */}
            <div className="board-highlights-grid">
              {activeSection.keyHighlights?.map((hl, idx) => (
                <div key={idx} className={`board-highlight-item ${hl.status || 'neutral'}`}>
                  <div className="board-highlight-label">{hl.label}</div>
                  <div className="board-highlight-value">{hl.value}</div>
                  <div className="board-highlight-delta">{hl.delta}</div>
                </div>
              ))}
            </div>

            {/* Narrative Prose */}
            <div className="board-narrative-block">
              <h4 className="board-narrative-heading">Detailed Board Narrative</h4>
              <p className="board-narrative-text">{activeSection.narrativeText}</p>
            </div>

            {/* CFO Commentary Callout */}
            {activeSection.cfoCommentary && (
              <div className="board-cfo-callout">
                <div className="board-cfo-callout-header">
                  <ShieldCheck size={16} />
                  <span>Executive Commentary & Action Plan</span>
                </div>
                <p className="board-cfo-callout-text">{activeSection.cfoCommentary}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Presentation / Dossier Mode View (All Sections Stacked) */
        <div className="board-dossier-stack">
          <div className="board-dossier-intro">
            <h3>Full Boardroom Executive Dossier</h3>
            <p>Comprehensive transcript across all 5 operational and financial reporting domains.</p>
          </div>

          {dossier.sections.map(section => (
            <div key={section.sectionCode} className="board-dossier-card">
              <div className="board-dossier-card-header">
                <span className="board-dossier-num">0{section.displayOrder}</span>
                <h3 className="board-dossier-title">{section.sectionTitle}</h3>
              </div>

              <div className="board-highlights-grid">
                {section.keyHighlights?.map((hl, idx) => (
                  <div key={idx} className={`board-highlight-item ${hl.status || 'neutral'}`}>
                    <div className="board-highlight-label">{hl.label}</div>
                    <div className="board-highlight-value">{hl.value}</div>
                    <div className="board-highlight-delta">{hl.delta}</div>
                  </div>
                ))}
              </div>

              <div className="board-narrative-block">
                <p className="board-narrative-text">{section.narrativeText}</p>
              </div>

              {section.cfoCommentary && (
                <div className="board-cfo-callout">
                  <div className="board-cfo-callout-header">
                    <ShieldCheck size={16} />
                    <span>Executive Commentary</span>
                  </div>
                  <p className="board-cfo-callout-text">{section.cfoCommentary}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Slide-out Governance & Audit Drawer */}
      {showGovernanceDrawer && (
        <div className="board-drawer-overlay" onClick={() => setShowGovernanceDrawer(false)}>
          <div className="board-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="board-drawer-header">
              <div className="board-drawer-title-group">
                <Lock size={18} className="board-drawer-icon" />
                <h3 className="board-drawer-title">Board Package Governance & SHA-256 Audit Seal</h3>
              </div>
              <button
                type="button"
                className="board-drawer-close"
                onClick={() => setShowGovernanceDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="board-drawer-content">
              <div className="board-drawer-section">
                <h4 className="board-drawer-heading">Cryptographic Immutability Seal</h4>
                <div className="board-hash-box">
                  <code>{telemetry.frozenHash || 'PENDING_FINAL_SEAL'}</code>
                </div>
                <p className="board-drawer-hint">
                  This SHA-256 digest cryptographically binds the October 2026 Board Report,
                  all 5 narrative sections, and executive KPI scorecards against unauthorized alteration.
                </p>
              </div>

              <div className="board-drawer-section">
                <h4 className="board-drawer-heading">Package Provenance Metadata</h4>
                <div className="board-meta-table">
                  <div className="board-meta-row">
                    <span className="board-meta-key">Package Code</span>
                    <span className="board-meta-val">{telemetry.packageCode}</span>
                  </div>
                  <div className="board-meta-row">
                    <span className="board-meta-key">Period Code</span>
                    <span className="board-meta-val">{telemetry.periodCode}</span>
                  </div>
                  <div className="board-meta-row">
                    <span className="board-meta-key">Meeting Date</span>
                    <span className="board-meta-val">{telemetry.meetingDate}</span>
                  </div>
                  <div className="board-meta-row">
                    <span className="board-meta-key">Package Status</span>
                    <span className="board-meta-val">{telemetry.status}</span>
                  </div>
                  <div className="board-meta-row">
                    <span className="board-meta-key">Published Timestamp</span>
                    <span className="board-meta-val">{telemetry.publishedAt || 'Unpublished'}</span>
                  </div>
                  <div className="board-meta-row">
                    <span className="board-meta-key">Total Sections</span>
                    <span className="board-meta-val">{telemetry.sectionCount} Structured Sections</span>
                  </div>
                </div>
              </div>

              <div className="board-drawer-actions">
                <button
                  type="button"
                  className="board-btn board-btn-primary full-width"
                  onClick={handlePublish}
                >
                  <ShieldCheck size={16} />
                  <span>Re-Compute & Re-Freeze Package Hash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
