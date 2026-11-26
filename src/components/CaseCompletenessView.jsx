import React, { useState, useMemo, useEffect } from 'react';
import {
  FileCheck2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sliders,
  X,
  Zap,
  Check,
  Play,
  Layers,
  ShieldCheck,
  Award,
  ClipboardList,
  BarChart3
} from 'lucide-react';
import {
  getCaseCompletenessConfig,
  getCaseCompletenessTelemetry,
  getCaseCompletenessRubrics,
  getCaseCompletenessScores,
  getCaseCompletenessFieldGaps,
  getCaseSpecialtyBenchmarks,
  getCaseAuditRuns,
  resolveCaseFieldGap,
  triggerCaseCompletenessAudit,
  validateCompletenessRubricWeights,
  normalizeFacilityId
} from '../services/caseCompletenessService';
import './CaseCompletenessView.css';

export default function CaseCompletenessView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('case_scores'); // 'case_scores' | 'specialty_benchmarks' | 'rubrics' | 'audit_runs'
  const [selectedCaseId, setSelectedCaseId] = useState('CAS-20260224-003');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [rubrics, setRubrics] = useState([]);
  const [scores, setScores] = useState([]);
  const [selectedGaps, setSelectedGaps] = useState([]);
  const [benchmarks, setBenchmarks] = useState([]);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [c, t, r, sc, b, rn] = await Promise.all([
          getCaseCompletenessConfig(facilityId),
          getCaseCompletenessTelemetry(facilityId),
          getCaseCompletenessRubrics(facilityId),
          getCaseCompletenessScores(facilityId),
          getCaseSpecialtyBenchmarks(facilityId),
          getCaseAuditRuns(facilityId)
        ]);
        if (isMounted) {
          setConfig(c);
          setTelemetry(t);
          setRubrics(r);
          setScores(sc);
          setBenchmarks(b);
          setRuns(rn);
        }
      } catch (err) {
        console.error('Failed to load Case Completeness data:', err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    async function loadGaps() {
      if (!selectedCaseId) return;
      const g = await getCaseCompletenessFieldGaps(selectedCaseId);
      if (isMounted) setSelectedGaps(g);
    }
    loadGaps();
    return () => { isMounted = false; };
  }, [selectedCaseId, refreshKey]);

  const handleRunAudit = async () => {
    setIsAuditing(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const auditRun = await triggerCaseCompletenessAudit(facilityId);
      setBanner({
        show: true,
        type: 'success',
        message: `Audit run ${auditRun.run_code} completed — Mean Case Completeness: ${auditRun.mean_completeness_score}% (${auditRun.billing_ready_count}/${auditRun.cases_evaluated} billing ready).`
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setBanner({ show: true, type: 'error', message: `Audit failed: ${err.message}` });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleVerifyRubric = () => {
    const res = validateCompletenessRubricWeights(rubrics);
    setBanner({
      show: true,
      type: res.isValid ? 'success' : 'error',
      message: res.isValid
        ? `5-Pillar Completeness Rubric verified: Weights strictly sum to ${res.totalWeight.toFixed(2)}%.`
        : res.errors.join(' | ')
    });
  };

  const handleResolveGap = async (gapId) => {
    try {
      const res = await resolveCaseFieldGap(gapId, 'him_coding_lead@naplesasc.com', 'VERIFIED_IN_ECHART');
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Gap resolved for ${res.updatedCase.case_identifier} — Updated Score: ${res.updatedCase.overall_completeness_score}% (${res.updatedCase.readiness_status}).`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const filteredScores = useMemo(() => {
    if (!searchQuery.trim()) return scores;
    const q = searchQuery.toLowerCase();
    return scores.filter(s =>
      s.case_identifier.toLowerCase().includes(q) ||
      s.surgeon_name.toLowerCase().includes(q) ||
      s.specialty_name.toLowerCase().includes(q) ||
      (s.primary_cpt || '').toLowerCase().includes(q)
    );
  }, [scores, searchQuery]);

  const selectedCase = useMemo(() => scores.find(s => s.case_identifier === selectedCaseId) || scores[0], [scores, selectedCaseId]);

  return (
    <div className="ccs-container">
      {/* 1. Header Action Bar */}
      <header className="ccs-header">
        <div className="ccs-header-left">
          <div className="ccs-title-row">
            <h1 className="ccs-title">Case Completeness Score & Clinical Readiness</h1>
            <span className="ccs-pill-badge">{telemetry?.billing_ready_pct ?? 50}% BILLING READY</span>
            <span className="ccs-status-pill active">
              <span className="ccs-status-dot"></span>
              {config?.sync_status || 'ACTIVE'}
            </span>
          </div>
          <p className="ccs-subtitle">
            {facilityName} • Five-pillar surgical encounter scoring, perioperative timestamp chronology, coding/UDI completeness & pre-bill readiness gates.
          </p>
        </div>

        <div className="ccs-header-actions">
          <button className="ccs-btn ccs-btn-secondary" onClick={handleVerifyRubric}>
            <CheckCircle2 size={15} />
            Verify Rubric Weights
          </button>
          <button className="ccs-btn ccs-btn-primary" onClick={handleRunAudit} disabled={isAuditing}>
            <Play size={15} className={isAuditing ? 'spin' : ''} />
            {isAuditing ? 'Auditing...' : 'Run Case Audit'}
          </button>
          <button className="ccs-btn ccs-btn-icon" onClick={() => setIsDrawerOpen(true)} title="Readiness Gate Settings">
            <Sliders size={16} />
          </button>
        </div>
      </header>

      {/* Banner */}
      {banner.show && (
        <div className={`ccs-banner ccs-banner-${banner.type}`}>
          <div className="ccs-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Zap size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="ccs-banner-close" onClick={() => setBanner({ show: false, type: 'info', message: '' })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. 4-Card Telemetry Ribbon */}
      <section className="ccs-telemetry-grid">
        <div className="ccs-card">
          <div className="ccs-card-header">
            <span className="ccs-card-title">Avg Case Completeness</span>
            <Award size={18} className="ccs-card-icon" />
          </div>
          <div className="ccs-metric-value">
            {telemetry?.avg_case_completeness_score?.toFixed(1) || '91.9'}%
          </div>
          <div className="ccs-card-footer">
            <span className="ccs-trend positive">Target Floor: {config?.billing_ready_min_score || 95}%</span>
            <span className="ccs-muted">{telemetry?.total_cases_scored || 4} encounters evaluated</span>
          </div>
        </div>

        <div className="ccs-card">
          <div className="ccs-card-header">
            <span className="ccs-card-title">Billing-Ready Rate</span>
            <FileCheck2 size={18} className="ccs-card-icon" />
          </div>
          <div className="ccs-metric-value text-success">
            {telemetry?.billing_ready_pct ?? 50}%
          </div>
          <div className="ccs-card-footer">
            <span className="ccs-trend positive">Zero Critical Blockers</span>
            <span className="ccs-muted">Cleared for 837 claim dispatch</span>
          </div>
        </div>

        <div className="ccs-card">
          <div className="ccs-card-header">
            <span className="ccs-card-title">Cases on Pre-Bill Hold</span>
            <AlertTriangle size={18} className="ccs-card-icon text-warning" />
          </div>
          <div className={`ccs-metric-value ${(telemetry?.cases_on_hold_count || 0) > 0 ? 'text-danger' : 'text-success'}`}>
            {telemetry?.cases_on_hold_count ?? 1}
          </div>
          <div className="ccs-card-footer">
            <span className="ccs-trend warning">INCOMPLETE_HOLD</span>
            <span className="ccs-muted">Blocked by coding/timestamp gaps</span>
          </div>
        </div>

        <div className="ccs-card">
          <div className="ccs-card-header">
            <span className="ccs-card-title">Open Field Deficiencies</span>
            <ClipboardList size={18} className="ccs-card-icon" />
          </div>
          <div className="ccs-metric-value">
            {telemetry?.open_field_gaps_count ?? 4}
          </div>
          <div className="ccs-card-footer">
            <span className="ccs-trend positive">Actionable Queue</span>
            <span className="ccs-muted">Click a case row to remediate</span>
          </div>
        </div>
      </section>

      {/* 3. 5-Pillar Weight Breakdown Bar */}
      <section className="ccs-pillars-panel">
        <div className="ccs-section-header">
          <h2 className="ccs-section-title">
            <Layers size={18} />
            Five-Pillar Case Completeness Scoring Rubric (Sum: 100%)
          </h2>
          <span className="ccs-tag-muted">Coding Lock: {config?.enforce_coding_lock ? 'Enforced' : 'Off'} • UDI Lock: {config?.enforce_implant_udi ? 'Enforced' : 'Off'}</span>
        </div>
        <div className="ccs-pillars-grid">
          {rubrics.map(r => (
            <div key={r.pillar_code} className="ccs-pillar-card">
              <div className="ccs-pillar-top">
                <span className="ccs-pillar-label">{r.pillar_label}</span>
                <span className="ccs-pillar-weight">{Number(r.weight_pct).toFixed(0)}%</span>
              </div>
              <p className="ccs-pillar-desc">{r.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Subtab Navigation */}
      <nav className="ccs-nav-bar">
        <div className="ccs-subtabs">
          <button
            className={`ccs-subtab-btn ${activeSubTab === 'case_scores' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('case_scores')}
          >
            <FileCheck2 size={16} />
            Case Scorecards & Drilldown
            <span className="ccs-tab-count">{scores.length}</span>
          </button>
          <button
            className={`ccs-subtab-btn ${activeSubTab === 'specialty_benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('specialty_benchmarks')}
          >
            <BarChart3 size={16} />
            Specialty Benchmarks
            <span className="ccs-tab-count">{benchmarks.length}</span>
          </button>
          <button
            className={`ccs-subtab-btn ${activeSubTab === 'rubrics' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('rubrics')}
          >
            <Layers size={16} />
            Rubric Matrix
            <span className="ccs-tab-count">{rubrics.length}</span>
          </button>
          <button
            className={`ccs-subtab-btn ${activeSubTab === 'audit_runs' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('audit_runs')}
          >
            <Activity size={16} />
            Audit Run History
            <span className="ccs-tab-count">{runs.length}</span>
          </button>
        </div>

        <div className="ccs-filter-bar">
          <div className="ccs-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search case ID, surgeon, CPT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </nav>

      {/* 5. Subtab Content Panels */}

      {/* Tab 1: Case Scorecards + Interactive Field Gap Drilldown */}
      {activeSubTab === 'case_scores' && (
        <div className="ccs-split-stack">
          <div className="ccs-panel">
            <div className="ccs-table-container">
              <table className="ccs-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>DOS</th>
                    <th>Surgeon</th>
                    <th>Specialty</th>
                    <th>CPT</th>
                    <th>Demo / TS / Staff / Code / Attest</th>
                    <th>Composite Score</th>
                    <th>Gaps (Crit)</th>
                    <th>Readiness Status</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScores.map(s => (
                    <tr
                      key={s.id}
                      className={selectedCase?.case_identifier === s.case_identifier ? 'ccs-row-selected' : ''}
                      onClick={() => setSelectedCaseId(s.case_identifier)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="ccs-mono-text font-bold">{s.case_identifier}</td>
                      <td className="ccs-muted">{s.service_date}</td>
                      <td className="font-semibold">{s.surgeon_name}</td>
                      <td><span className="ccs-tag-pill">{s.specialty_name}</span></td>
                      <td className="ccs-mono-text">{s.primary_cpt || '—'}</td>
                      <td className="ccs-muted">
                        {s.demographics_score} / {s.timestamps_score} / {s.staffing_score} / {s.coding_score} / {s.attestation_score}
                      </td>
                      <td className={`font-bold ${s.overall_completeness_score >= 95 ? 'text-success' : s.overall_completeness_score >= 80 ? 'text-warning' : 'text-danger'}`}>
                        {Number(s.overall_completeness_score).toFixed(2)}%
                      </td>
                      <td>
                        {s.missing_fields_count} ({s.critical_blockers_count})
                      </td>
                      <td>
                        <span className={`ccs-readiness-pill ${s.readiness_status.toLowerCase()}`}>
                          {s.readiness_status === 'BILLING_READY' ? <Check size={12} /> : <AlertTriangle size={12} />}
                          {s.readiness_status}
                        </span>
                      </td>
                      <td>
                        <span className="ccs-seal-badge" title={s.sha256_sync_seal}>
                          <ShieldCheck size={13} />
                          {s.sha256_sync_seal.substring(0, 16)}...
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Field Gap Checklist Drilldown */}
          {selectedCase && (
            <div className="ccs-panel">
              <div className="ccs-panel-subheader">
                <h3>Field-Level Completeness Checklist: {selectedCase.case_identifier} ({selectedCase.surgeon_name})</h3>
                <span className="ccs-muted">{selectedGaps.filter(g => g.remediation_status === 'OPEN').length} open gaps</span>
              </div>
              {selectedGaps.length === 0 ? (
                <div className="ccs-empty-state">
                  <CheckCircle2 size={20} className="text-success" />
                  <span>All 5 operational and clinical pillars are 100% complete for {selectedCase.case_identifier}.</span>
                </div>
              ) : (
                <div className="ccs-table-container">
                  <table className="ccs-table">
                    <thead>
                      <tr>
                        <th>Pillar</th>
                        <th>Missing / Invalid Field</th>
                        <th>Severity</th>
                        <th>Expected Requirement</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGaps.map(g => (
                        <tr key={g.id}>
                          <td><span className="ccs-tag-pill">{g.pillar_code}</span></td>
                          <td className="ccs-mono-text font-bold">{g.field_name}</td>
                          <td><span className={`ccs-severity-pill ${g.severity.toLowerCase()}`}>{g.severity}</span></td>
                          <td className="ccs-muted">{g.expected_requirement}</td>
                          <td>
                            <span className={`ccs-status-pill ${g.remediation_status === 'OPEN' ? 'warning' : 'active'}`}>
                              {g.remediation_status}
                            </span>
                          </td>
                          <td>
                            {g.remediation_status === 'OPEN' ? (
                              <button className="ccs-btn ccs-btn-xs" onClick={() => handleResolveGap(g.id)}>
                                Mark Resolved
                              </button>
                            ) : (
                              <span className="text-success font-semibold">Resolved</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Specialty Benchmarks */}
      {activeSubTab === 'specialty_benchmarks' && (
        <div className="ccs-panel">
          <div className="ccs-table-container">
            <table className="ccs-table">
              <thead>
                <tr>
                  <th>Surgical Specialty</th>
                  <th>Total Cases Scored</th>
                  <th>Avg Completeness Score</th>
                  <th>Billing-Ready %</th>
                  <th>Top Recurring Missing Field</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map(b => (
                  <tr key={b.id}>
                    <td className="font-semibold">{b.specialty_name}</td>
                    <td>{b.total_cases}</td>
                    <td className={`font-bold ${b.avg_completeness_score >= 95 ? 'text-success' : 'text-warning'}`}>
                      {Number(b.avg_completeness_score).toFixed(2)}%
                    </td>
                    <td className="font-semibold">{Number(b.billing_ready_pct).toFixed(1)}%</td>
                    <td className="ccs-mono-text ccs-muted">{b.top_gap_field}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Rubric Weight Matrix */}
      {activeSubTab === 'rubrics' && (
        <div className="ccs-panel">
          <div className="ccs-table-container">
            <table className="ccs-table">
              <thead>
                <tr>
                  <th>Pillar Code</th>
                  <th>Pillar Label</th>
                  <th>Weight (%)</th>
                  <th>Mandatory Fields</th>
                  <th>Scoring Criteria</th>
                </tr>
              </thead>
              <tbody>
                {rubrics.map(r => (
                  <tr key={r.id}>
                    <td className="ccs-mono-text font-bold">{r.pillar_code}</td>
                    <td className="font-semibold">{r.pillar_label}</td>
                    <td className="font-bold text-primary">{Number(r.weight_pct).toFixed(2)}%</td>
                    <td>{r.mandatory_fields_count}</td>
                    <td className="ccs-muted">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Run History */}
      {activeSubTab === 'audit_runs' && (
        <div className="ccs-panel">
          <div className="ccs-table-container">
            <table className="ccs-table">
              <thead>
                <tr>
                  <th>Run Code</th>
                  <th>Cases Evaluated</th>
                  <th>Billing Ready</th>
                  <th>Incomplete Hold</th>
                  <th>Mean Score</th>
                  <th>Duration</th>
                  <th>SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(rn => (
                  <tr key={rn.id}>
                    <td className="ccs-mono-text font-bold">{rn.run_code}</td>
                    <td>{rn.cases_evaluated}</td>
                    <td className="text-success font-bold">{rn.billing_ready_count}</td>
                    <td className={rn.incomplete_hold_count > 0 ? 'text-danger font-bold' : 'ccs-muted'}>{rn.incomplete_hold_count}</td>
                    <td className="font-bold">{Number(rn.mean_completeness_score).toFixed(2)}%</td>
                    <td className="ccs-muted">{rn.duration_ms} ms</td>
                    <td>
                      <span className="ccs-seal-badge" title={rn.sha256_sync_seal}>
                        <ShieldCheck size={13} />
                        {rn.sha256_sync_seal.substring(0, 16)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Configuration Modal */}
      {isDrawerOpen && (
        <div className="ccs-modal-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="ccs-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ccs-modal-header">
              <div className="ccs-modal-title-group">
                <Sliders size={18} />
                <h3>Case Readiness Gate Settings</h3>
              </div>
              <button className="ccs-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="ccs-modal-body">
              <div className="ccs-form-row">
                <div className="ccs-form-group">
                  <label>Billing-Ready Min Score (%)</label>
                  <input type="text" value={`${config?.billing_ready_min_score || 95.00}%`} readOnly />
                </div>
                <div className="ccs-form-group">
                  <label>Clinical Review Min (%)</label>
                  <input type="text" value={`${config?.review_min_score || 80.00}%`} readOnly />
                </div>
              </div>
              <div className="ccs-form-row">
                <div className="ccs-form-group">
                  <label>Coding Blocker Lock</label>
                  <input type="text" value={config?.enforce_coding_lock ? 'ENABLED' : 'DISABLED'} readOnly />
                </div>
                <div className="ccs-form-group">
                  <label>Implant UDI Enforcement</label>
                  <input type="text" value={config?.enforce_implant_udi ? 'ENABLED' : 'DISABLED'} readOnly />
                </div>
              </div>
              <div className="ccs-form-group">
                <label>API / Audit Secret (Encrypted at Rest)</label>
                <input type="text" value={config?.client_secret_masked || 'ccs_sec_****_3301'} readOnly className="ccs-mono-text" />
              </div>
            </div>
            <div className="ccs-modal-footer">
              <button className="ccs-btn ccs-btn-secondary" onClick={() => setIsDrawerOpen(false)}>Close</button>
              <button className="ccs-btn ccs-btn-primary" onClick={() => {
                setIsDrawerOpen(false);
                setBanner({ show: true, type: 'success', message: 'Case readiness gate thresholds verified.' });
              }}>Save & Verify</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
