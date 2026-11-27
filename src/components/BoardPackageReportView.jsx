import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Lock,
  Sliders,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ClipboardCheck
} from 'lucide-react';
import {
  VALID_PACKAGE_TRANSITIONS,
  CANONICAL_VOTE_OUTCOMES,
  getBpkConfig,
  updateBpkConfig,
  getBpkTelemetry,
  getBpkPackages,
  getBpkCovenants,
  getBpkExecutiveSections,
  getBpkResolutions,
  getBpkSignoffAudit,
  getBpkDispatchLogs,
  compileBoardPackageEdition,
  advanceBoardPackageStatus,
  recordBoardResolutionVote,
  dispatchBoardPackageDigest,
  normalizeFacilityId
} from '../services/boardPackageReportService';
import './BoardPackageReportView.css';

const STATUS_BADGE_CLASS = {
  DRAFT: 'bpk-badge-amber',
  CFO_VERIFIED: 'bpk-badge-sky',
  BOARD_APPROVED: 'bpk-badge-emerald',
  LOCKED_PUBLISHED: 'bpk-badge-emerald'
};

const COVENANT_BADGE_CLASS = {
  COMPLIANT: 'bpk-badge-emerald',
  WATCH: 'bpk-badge-amber',
  BREACH: 'bpk-badge-rose'
};

export default function BoardPackageReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('dossier'); // 'dossier' | 'covenants' | 'resolutions' | 'audit'
  const [selectedPkgId, setSelectedPkgId] = useState('bpk-pkg-2026q4');
  const [signoffNote, setSignoffNote] = useState('');
  const [voteOutcome, setVoteOutcome] = useState('APPROVED');
  const [voteNote, setVoteNote] = useState('');
  const [selectedResolutionId, setSelectedResolutionId] = useState('bres-2');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [packages, setPackages] = useState([]);
  const [covenants, setCovenants] = useState([]);
  const [sections, setSections] = useState([]);
  const [resolutions, setResolutions] = useState([]);
  const [signoffAudit, setSignoffAudit] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    min_dq_trust_score_for_board: 80,
    min_dscr_covenant: 1.25,
    max_leverage_ratio: 3.5,
    require_cfo_and_chair_signoff: true
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, pkgs, dsps] = await Promise.all([
          getBpkConfig(facilityId),
          getBpkTelemetry(facilityId),
          getBpkPackages(facilityId),
          getBpkDispatchLogs(facilityId)
        ]);
        const targetPkg = pkgs.find(p => p.id === selectedPkgId) || pkgs[0];
        const [covs, secs, ress, auds] = targetPkg
          ? await Promise.all([
              getBpkCovenants(facilityId, targetPkg.id),
              getBpkExecutiveSections(facilityId, targetPkg.id),
              getBpkResolutions(facilityId, targetPkg.id),
              getBpkSignoffAudit(facilityId, targetPkg.id)
            ])
          : [[], [], [], []];

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setPackages(pkgs);
        setCovenants(covs);
        setSections(secs);
        setResolutions(ress);
        setSignoffAudit(auds);
        setDispatchLogs(dsps);
        setDraftConfig({
          min_dq_trust_score_for_board: cfg.min_dq_trust_score_for_board,
          min_dscr_covenant: cfg.min_dscr_covenant,
          max_leverage_ratio: cfg.max_leverage_ratio,
          require_cfo_and_chair_signoff: cfg.require_cfo_and_chair_signoff
        });
        if (ress.length > 0) {
          setSelectedResolutionId(prev => (ress.some(r => r.id === prev) ? prev : ress[0].id));
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Board Package: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedPkgId, refreshKey]);

  const activePackage = useMemo(
    () => packages.find(p => p.id === selectedPkgId) || packages[0] || null,
    [packages, selectedPkgId]
  );

  const nextStatuses = useMemo(
    () => (activePackage ? VALID_PACKAGE_TRANSITIONS[activePackage.package_status] || [] : []),
    [activePackage]
  );

  const handleCompilePackage = async () => {
    setIsCompiling(true);
    try {
      const res = await compileBoardPackageEdition(facilityId, { period_code: '2027-Q1' });
      setSelectedPkgId(res.package.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled Board Dossier ${res.package.package_code} in DRAFT status.`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleAdvanceStatus = async (targetStatus) => {
    if (!activePackage) return;
    try {
      await advanceBoardPackageStatus(facilityId, activePackage.id, targetStatus, {
        notes: signoffNote || `Board package governance transition to ${targetStatus}.`
      });
      setSignoffNote('');
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `${activePackage.package_code} transitioned cleanly to ${targetStatus}.`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordVote = async (e) => {
    e.preventDefault();
    if (!selectedResolutionId) return;
    try {
      const updated = await recordBoardResolutionVote(facilityId, selectedResolutionId, {
        vote_outcome: voteOutcome,
        notes: voteNote
      });
      setVoteNote('');
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Sealed vote "${updated.vote_outcome}" recorded for ${updated.resolution_code}.`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleDispatch = async () => {
    if (!activePackage) return;
    try {
      const log = await dispatchBoardPackageDigest(facilityId, activePackage.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Board Governance Dossier distributed via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateBpkConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: 'Board trust-gate & covenant compliance floors saved cleanly.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <div className="bpk-container">
      {/* Header Bar */}
      <div className="bpk-header-bar">
        <div className="bpk-header-title">
          <div className="bpk-title-icon"><BookOpen size={20} /></div>
          <div>
            <h2>Quarterly Executive Board Governance Package (H9)</h2>
            <p className="bpk-subtitle">
              {facilityName} · Cross-Report H1–H8 Synthesis · Debt Covenants, Trust Gate (&ge;{config?.min_dq_trust_score_for_board ?? 80}%) & Dual Sign-Off
            </p>
          </div>
        </div>
        <div className="bpk-header-actions">
          <button type="button" className="bpk-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> Governance Gates
          </button>
          <button type="button" className="bpk-btn-secondary" onClick={handleCompilePackage} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Q1 Dossier'}
          </button>
          <button type="button" className="bpk-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Distribute Board Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`bpk-banner bpk-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="bpk-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="bpk-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="bpk-telemetry-grid">
          <div className="bpk-kpi-card">
            <div className="bpk-kpi-label"><DollarSign size={14} /> Net Revenue & EBITDA</div>
            <div className="bpk-kpi-value">{fmtCurrency(telemetry.net_revenue_usd)} · {telemetry.ebitda_margin_pct}%</div>
            <div className="bpk-kpi-meta">EBITDA: {fmtCurrency(telemetry.ebitda_usd)}</div>
          </div>
          <div className="bpk-kpi-card">
            <div className="bpk-kpi-label"><TrendingUp size={14} /> OR Yield & RCM Velocity</div>
            <div className="bpk-kpi-value">{telemetry.or_adjusted_util_pct}% OR · {telemetry.dso_days}d DSO</div>
            <div className="bpk-kpi-meta">Verified ROI: {fmtCurrency(telemetry.realized_roi_value_usd)}</div>
          </div>
          <div className="bpk-kpi-card">
            <div className="bpk-kpi-label"><ShieldCheck size={14} /> Covenants & Trust Gate</div>
            <div className="bpk-kpi-value">{telemetry.is_covenant_compliant ? '100% Compliant' : `${telemetry.covenant_breaches} Breach`}</div>
            <div className="bpk-kpi-meta">DQ Trust Score: {Number(telemetry.dq_trust_score || 0).toFixed(1)}%</div>
          </div>
          <div className="bpk-kpi-card">
            <div className="bpk-kpi-label"><Lock size={14} /> Active Dossier State</div>
            <div className="bpk-kpi-value-badge">
              <span className={`bpk-badge ${STATUS_BADGE_CLASS[activePackage?.package_status] || 'bpk-badge-sky'}`}>
                {activePackage?.package_status || telemetry.latest_package_status}
              </span>
            </div>
            <div className="bpk-kpi-meta bpk-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Edition Selector */}
      <div className="bpk-controls-bar">
        <div className="bpk-subtabs">
          <button
            type="button"
            className={`bpk-subtab ${activeSubTab === 'dossier' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('dossier')}
          >
            <BookOpen size={14} /> Executive Dossier ({sections.length})
          </button>
          <button
            type="button"
            className={`bpk-subtab ${activeSubTab === 'covenants' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('covenants')}
          >
            <ShieldCheck size={14} /> Debt Covenants ({covenants.length})
          </button>
          <button
            type="button"
            className={`bpk-subtab ${activeSubTab === 'resolutions' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('resolutions')}
          >
            <FileText size={14} /> Strategic Resolutions ({resolutions.length})
          </button>
          <button
            type="button"
            className={`bpk-subtab ${activeSubTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('audit')}
          >
            <ClipboardCheck size={14} /> Sign-Off & Dispatches ({signoffAudit.length + dispatchLogs.length})
          </button>
        </div>

        <div className="bpk-controls-right">
          <select
            className="bpk-select"
            value={selectedPkgId}
            onChange={(e) => setSelectedPkgId(e.target.value)}
            aria-label="Package Selector"
          >
            {packages.map(p => (
              <option key={p.id} value={p.id}>{p.package_code} ({p.period_code}) — {p.package_status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtab 1: Executive Dossier & Sequential Sign-Off */}
      {activeSubTab === 'dossier' && activePackage && (
        <div className="bpk-split-layout">
          <div className="bpk-card-panel">
            <div className="bpk-panel-head">
              <h3>Executive Governance Synthesis ({activePackage.package_code})</h3>
              <span className={`bpk-badge ${STATUS_BADGE_CLASS[activePackage.package_status] || 'bpk-badge-sky'}`}>
                {activePackage.package_status}
              </span>
            </div>
            <div className="bpk-section-list">
              {sections.map(sec => (
                <div key={sec.id} className="bpk-section-card">
                  <div className="bpk-section-top">
                    <span className="bpk-code">{sec.section_title}</span>
                    <span className="bpk-badge bpk-badge-sky">{sec.source_phase_ref} · {sec.headline_metric}</span>
                  </div>
                  <p>{sec.executive_summary}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bpk-card-panel">
            <h3>Sequential CFO &rarr; Board Chair Sign-Off</h3>
            <div className="bpk-stepper">
              {['DRAFT', 'CFO_VERIFIED', 'BOARD_APPROVED', 'LOCKED_PUBLISHED'].map(st => (
                <div
                  key={st}
                  className={`bpk-step ${activePackage.package_status === st ? 'bpk-step-active' : ''}`}
                >
                  <span>{st.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>

            {nextStatuses.length > 0 ? (
              <div className="bpk-signoff-box">
                <input
                  className="bpk-note-input"
                  type="text"
                  placeholder="Enter attestation note (min 5 chars) to certify next governance state..."
                  value={signoffNote}
                  onChange={(e) => setSignoffNote(e.target.value)}
                />
                <div className="bpk-signoff-actions">
                  {nextStatuses.map(nextSt => (
                    <button
                      key={nextSt}
                      type="button"
                      className="bpk-btn-primary"
                      onClick={() => handleAdvanceStatus(nextSt)}
                    >
                      <CheckCircle2 size={14} /> Certify &rarr; {nextSt.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bpk-locked-notice">
                <Lock size={15} /> Dossier is cryptographically locked (`LOCKED_PUBLISHED`).
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 2: Debt Covenants */}
      {activeSubTab === 'covenants' && (
        <div className="bpk-card-panel">
          <h3>Lender & Treasury Covenant Compliance Monitor</h3>
          <div className="bpk-table-wrap">
            <table className="bpk-table">
              <thead>
                <tr>
                  <th>Covenant Metric</th>
                  <th>Lender / Authority</th>
                  <th>Comparator</th>
                  <th>Threshold</th>
                  <th>Actual Performance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {covenants.map(c => (
                  <tr key={c.id}>
                    <td className="bpk-item-title">{c.covenant_name}</td>
                    <td>{c.lender_facility}</td>
                    <td className="bpk-code">{c.comparator}</td>
                    <td>{Number(c.threshold_value).toFixed(2)} {c.unit_label}</td>
                    <td className="bpk-code">{Number(c.actual_value).toFixed(2)} {c.unit_label}</td>
                    <td>
                      <span className={`bpk-badge ${COVENANT_BADGE_CLASS[c.compliance_status] || 'bpk-badge-sky'}`}>
                        {c.compliance_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Strategic Resolutions */}
      {activeSubTab === 'resolutions' && (
        <div className="bpk-stack">
          <div className="bpk-card-panel">
            <h3>Capital Allocation & Strategic Board Resolutions</h3>
            <div className="bpk-table-wrap">
              <table className="bpk-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Resolution Title</th>
                    <th>Category</th>
                    <th>Capital Impact</th>
                    <th>Sponsor</th>
                    <th>Vote Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutions.map(r => (
                    <tr
                      key={r.id}
                      className={selectedResolutionId === r.id ? 'bpk-row-selected' : ''}
                      onClick={() => setSelectedResolutionId(r.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="bpk-code">{r.resolution_code}</td>
                      <td>
                        <div className="bpk-item-title">{r.title}</div>
                        <div className="bpk-mono-cell">{r.notes}</div>
                      </td>
                      <td>{r.category}</td>
                      <td className="bpk-code">{fmtCurrency(r.capital_impact_usd)}</td>
                      <td>{r.sponsor_role}</td>
                      <td>
                        <span className={`bpk-badge ${r.vote_outcome === 'APPROVED' ? 'bpk-badge-emerald' : r.vote_outcome === 'REJECTED' ? 'bpk-badge-rose' : 'bpk-badge-amber'}`}>
                          {r.vote_outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="bpk-action-form" onSubmit={handleRecordVote}>
              <h4>Record Sealed Board Resolution Vote</h4>
              <div className="bpk-action-row">
                <select
                  className="bpk-select"
                  value={voteOutcome}
                  onChange={(e) => setVoteOutcome(e.target.value)}
                >
                  {CANONICAL_VOTE_OUTCOMES.map(v => (
                    <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <input
                  className="bpk-note-input"
                  type="text"
                  placeholder="Enter Board motion / quorum note (>= 5 chars)..."
                  value={voteNote}
                  onChange={(e) => setVoteNote(e.target.value)}
                />
                <button type="submit" className="bpk-btn-primary">Record Vote</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subtab 4: Governance Audit & H0 Dispatches */}
      {activeSubTab === 'audit' && (
        <div className="bpk-stack">
          <div className="bpk-card-panel">
            <h3>Sequential CFO & Board Sign-Off Audit Trail</h3>
            <div className="bpk-table-wrap">
              <table className="bpk-table">
                <thead>
                  <tr>
                    <th>Transition</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {signoffAudit.map(a => (
                    <tr key={a.id}>
                      <td className="bpk-code">{a.from_status} &rarr; {a.to_status}</td>
                      <td>{a.actor_email} ({a.actor_role})</td>
                      <td>{a.notes}</td>
                      <td className="bpk-mono-cell">{a.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bpk-card-panel">
            <h3>H0 Board Distribution History (RPT-H9-BOARD-PKG)</h3>
            <div className="bpk-table-wrap">
              <table className="bpk-table">
                <thead>
                  <tr>
                    <th>Execution Code</th>
                    <th>Channel</th>
                    <th>Format</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLogs.map(d => (
                    <tr key={d.id}>
                      <td className="bpk-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="bpk-badge bpk-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="bpk-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Trust Gate & Covenant Config Modal */}
      {isConfigOpen && (
        <div className="bpk-modal-backdrop">
          <div className="bpk-modal">
            <div className="bpk-modal-header">
              <h3>Board Package Trust Gate & Covenant Floors</h3>
              <button type="button" className="bpk-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="bpk-modal-body">
              <div className="bpk-form-row">
                <label>Minimum DQ Trust Score for Board Release (%) [50–100]</label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  step="0.5"
                  value={draftConfig.min_dq_trust_score_for_board}
                  onChange={(e) => setDraftConfig({ ...draftConfig, min_dq_trust_score_for_board: Number(e.target.value) })}
                />
              </div>
              <div className="bpk-form-row">
                <label>Minimum DSCR Covenant Floor (x)</label>
                <input
                  type="number"
                  min={0.1}
                  step="0.05"
                  value={draftConfig.min_dscr_covenant}
                  onChange={(e) => setDraftConfig({ ...draftConfig, min_dscr_covenant: Number(e.target.value) })}
                />
              </div>
              <div className="bpk-form-row">
                <label>Maximum Leverage Ratio Ceiling (x)</label>
                <input
                  type="number"
                  min={0.5}
                  step="0.1"
                  value={draftConfig.max_leverage_ratio}
                  onChange={(e) => setDraftConfig({ ...draftConfig, max_leverage_ratio: Number(e.target.value) })}
                />
              </div>
              <label className="bpk-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftConfig.require_cfo_and_chair_signoff}
                  onChange={(e) => setDraftConfig({ ...draftConfig, require_cfo_and_chair_signoff: e.target.checked })}
                />
                Require Dual CFO &amp; Board Chair Sign-Off Before Publication
              </label>
              <div className="bpk-modal-footer">
                <button type="button" className="bpk-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="bpk-btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
