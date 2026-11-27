import React, { useState, useMemo, useEffect } from 'react';
import {
  Award,
  Users,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Sliders,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ClipboardCheck
} from 'lucide-react';
import {
  CANONICAL_REVIEW_ACTIONS,
  getSsrConfig,
  updateSsrConfig,
  getSsrTelemetry,
  getSsrSpecialtyBenchmarks,
  getSsrEditions,
  getSsrSurgeonScorecards,
  getSsrCptMix,
  getSsrPeerReviews,
  getSsrDispatchLogs,
  compileSurgeonScorecardEdition,
  recordSurgeonPeerReview,
  dispatchSurgeonScorecardDigest,
  normalizeFacilityId
} from '../services/surgeonScorecardReportService';
import './SurgeonScorecardReportView.css';

const TIER_BADGE_CLASS = {
  TOP_QUARTILE_ELITE: 'ssr-badge-emerald',
  ABOVE_BENCHMARK: 'ssr-badge-sky',
  WATCH_COACHING: 'ssr-badge-amber',
  ACTION_REQUIRED: 'ssr-badge-rose'
};

export default function SurgeonScorecardReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('leaderboard'); // 'leaderboard' | 'benchmarks' | 'cpt_mix' | 'reviews'
  const [selectedEditionId, setSelectedEditionId] = useState('ssr-ed-202611');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [actorRole, setActorRole] = useState('Executive / Medical Director');
  const [selectedSurgeonId, setSelectedSurgeonId] = useState('card-mal');
  const [reviewAction, setReviewAction] = useState('MEDICAL_DIR_REVIEW');
  const [reviewNote, setReviewNote] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [benchmarks, setBenchmarks] = useState([]);
  const [editions, setEditions] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [cptMix, setCptMix] = useState([]);
  const [peerReviews, setPeerReviews] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftWeights, setDraftWeights] = useState({
    weight_contribution_margin_pct: 35,
    weight_or_efficiency_pct: 25,
    weight_supply_discipline_pct: 25,
    weight_documentation_quality_pct: 15,
    anonymize_peer_names_for_surgeon_view: true,
    min_cases_for_benchmark: 10
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, bms, eds, revs, dsps] = await Promise.all([
          getSsrConfig(facilityId),
          getSsrTelemetry(facilityId),
          getSsrSpecialtyBenchmarks(facilityId),
          getSsrEditions(facilityId),
          getSsrPeerReviews(facilityId),
          getSsrDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [cards, cptRows] = await Promise.all([
          targetEd
            ? getSsrSurgeonScorecards(facilityId, {
                edition_id: targetEd.id,
                specialty: selectedSpecialty,
                actor_role: actorRole,
                viewer_surgeon_code: 'SRG-MAL'
              })
            : [],
          getSsrCptMix(facilityId)
        ]);

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setBenchmarks(bms);
        setEditions(eds);
        setScorecards(cards);
        setCptMix(cptRows);
        setPeerReviews(revs);
        setDispatchLogs(dsps);
        setDraftWeights({
          weight_contribution_margin_pct: cfg.weight_contribution_margin_pct,
          weight_or_efficiency_pct: cfg.weight_or_efficiency_pct,
          weight_supply_discipline_pct: cfg.weight_supply_discipline_pct,
          weight_documentation_quality_pct: cfg.weight_documentation_quality_pct,
          anonymize_peer_names_for_surgeon_view: cfg.anonymize_peer_names_for_surgeon_view,
          min_cases_for_benchmark: cfg.min_cases_for_benchmark
        });
        if (cards.length > 0 && !cards.some(c => c.id === selectedSurgeonId)) {
          setSelectedSurgeonId(cards[0].id);
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Surgeon Scorecard: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, selectedSpecialty, actorRole, refreshKey]);

  const activeCard = useMemo(
    () => scorecards.find(c => c.id === selectedSurgeonId) || scorecards[0] || null,
    [scorecards, selectedSurgeonId]
  );

  const selectedCptRows = useMemo(() => {
    if (!activeCard || activeCard.is_anonymized_peer) return [];
    return cptMix.filter(r => r.surgeon_code === activeCard.surgeon_code);
  }, [cptMix, activeCard]);

  const draftWeightTotal = useMemo(() => (
    Number(draftWeights.weight_contribution_margin_pct || 0) +
    Number(draftWeights.weight_or_efficiency_pct || 0) +
    Number(draftWeights.weight_supply_discipline_pct || 0) +
    Number(draftWeights.weight_documentation_quality_pct || 0)
  ).toFixed(2), [draftWeights]);

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compileSurgeonScorecardEdition(facilityId, { period_code: '2026-12' });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled edition ${res.edition.edition_code} (${res.scorecards.length} surgeons ranked).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDispatch = async () => {
    if (!editions[0]) return;
    try {
      const edId = selectedEditionId || editions[0].id;
      const log = await dispatchSurgeonScorecardDigest(facilityId, edId);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Confidential scorecard packet dispatched via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateSsrConfig(facilityId, draftWeights);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: '4-pillar scorecard rubric & privacy settings updated cleanly.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordReview = async (e) => {
    e.preventDefault();
    if (!activeCard) return;
    try {
      await recordSurgeonPeerReview(facilityId, activeCard.id, {
        action_type: reviewAction,
        notes: reviewNote,
        actor_role: actorRole
      });
      setReviewNote('');
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: `Sealed peer review logged for ${activeCard.surgeon_code}.` });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <div className="ssr-container">
      {/* Header Bar */}
      <div className="ssr-header-bar">
        <div className="ssr-header-title">
          <div className="ssr-title-icon"><Award size={20} /></div>
          <div>
            <h2>Surgeon Performance Scorecard & Peer Benchmarking (H4)</h2>
            <p className="ssr-subtitle">
              {facilityName} · Conserved 4-Pillar Composite (35/25/25/15) · Specialty Benchmarks & Role-Aware Peer Privacy
            </p>
          </div>
        </div>
        <div className="ssr-header-actions">
          <button type="button" className="ssr-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> Rubric Weights
          </button>
          <button type="button" className="ssr-btn-secondary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Edition'}
          </button>
          <button type="button" className="ssr-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Dispatch H0 Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`ssr-banner ssr-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="ssr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="ssr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="ssr-telemetry-grid">
          <div className="ssr-kpi-card">
            <div className="ssr-kpi-label"><Users size={14} /> Surgeons Evaluated</div>
            <div className="ssr-kpi-value">{telemetry.surgeons_evaluated}</div>
            <div className="ssr-kpi-meta">Min case gate: {config?.min_cases_for_benchmark ?? 10} cases</div>
          </div>
          <div className="ssr-kpi-card">
            <div className="ssr-kpi-label"><Award size={14} /> Mean Composite Score</div>
            <div className="ssr-kpi-value">{Number(telemetry.avg_composite_score || 0).toFixed(1)} / 100</div>
            <div className="ssr-kpi-meta">4-pillar conserved rubric</div>
          </div>
          <div className="ssr-kpi-card">
            <div className="ssr-kpi-label"><DollarSign size={14} /> Total Surgeon Margin</div>
            <div className="ssr-kpi-value">{fmtCurrency(telemetry.total_surgeon_margin_usd)}</div>
            <div className="ssr-kpi-meta">Edition: {telemetry.latest_edition_code || 'N/A'}</div>
          </div>
          <div className="ssr-kpi-card">
            <div className="ssr-kpi-label"><ShieldCheck size={14} /> Top-Quartile & Privacy</div>
            <div className="ssr-kpi-value">{telemetry.top_quartile_count} Elite</div>
            <div className="ssr-kpi-meta ssr-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Filter Bar */}
      <div className="ssr-controls-bar">
        <div className="ssr-subtabs">
          <button
            type="button"
            className={`ssr-subtab ${activeSubTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('leaderboard')}
          >
            <Award size={14} /> Ranked Scorecards ({scorecards.length})
          </button>
          <button
            type="button"
            className={`ssr-subtab ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('benchmarks')}
          >
            <TrendingUp size={14} /> Specialty Benchmarks ({benchmarks.length})
          </button>
          <button
            type="button"
            className={`ssr-subtab ${activeSubTab === 'cpt_mix' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('cpt_mix')}
          >
            <FileText size={14} /> CPT Mix & Card Variance ({cptMix.length})
          </button>
          <button
            type="button"
            className={`ssr-subtab ${activeSubTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('reviews')}
          >
            <ClipboardCheck size={14} /> Peer Reviews & Dispatches ({peerReviews.length + dispatchLogs.length})
          </button>
        </div>

        <div className="ssr-controls-right">
          <select
            className="ssr-select"
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
            aria-label="Actor View Mode"
          >
            <option value="Executive / Medical Director">View: Executive / Medical Director</option>
            <option value="Surgeon Self-View">View: Surgeon Self-View (Peers Masked)</option>
          </select>

          <select
            className="ssr-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            aria-label="Specialty Filter"
          >
            <option value="ALL">All Specialties</option>
            {benchmarks.map(b => (
              <option key={b.id} value={b.specialty}>{b.specialty}</option>
            ))}
          </select>

          <select
            className="ssr-select"
            value={selectedEditionId}
            onChange={(e) => setSelectedEditionId(e.target.value)}
            aria-label="Edition Filter"
          >
            {editions.map(ed => (
              <option key={ed.id} value={ed.id}>{ed.edition_code} ({ed.period_code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtab 1: Leaderboard + 4-Pillar Inspector */}
      {activeSubTab === 'leaderboard' && (
        <div className="ssr-split-layout">
          <div className="ssr-card-panel">
            <div className="ssr-panel-head">
              <h3>Ranked Facility Scorecards</h3>
              <span className="ssr-privacy-pill">
                {actorRole === 'Surgeon Self-View' ? <EyeOff size={13} /> : <Eye size={13} />}
                {actorRole}
              </span>
            </div>
            <div className="ssr-table-wrap">
              <table className="ssr-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Surgeon</th>
                    <th>Specialty</th>
                    <th>Cases</th>
                    <th>Margin / OR Hr</th>
                    <th>Turnover</th>
                    <th>Pref Var</th>
                    <th>Composite</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.map(c => (
                    <tr
                      key={c.id}
                      className={activeCard?.id === c.id ? 'ssr-row-selected' : ''}
                      onClick={() => setSelectedSurgeonId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="ssr-code">#{c.rank_in_facility}</td>
                      <td>
                        <div className="ssr-surgeon-name">{c.surgeon_name}</div>
                        <div className="ssr-mono-cell">{c.surgeon_code} · NPI {c.npi}</div>
                      </td>
                      <td>{c.specialty}</td>
                      <td>{c.completed_cases}</td>
                      <td className="ssr-code">{fmtCurrency(c.margin_per_or_hour_usd)}/hr</td>
                      <td>{c.avg_turnover_minutes}m</td>
                      <td>{c.preference_card_variance_pct > 0 ? `+${c.preference_card_variance_pct}%` : `${c.preference_card_variance_pct}%`}</td>
                      <td className="ssr-code">{Number(c.composite_score).toFixed(1)}</td>
                      <td>
                        <span className={`ssr-badge ${TIER_BADGE_CLASS[c.performance_tier] || 'ssr-badge-sky'}`}>
                          {c.performance_tier.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scorecards.length === 0 && (
                    <tr>
                      <td colSpan={9} className="ssr-empty-state">No scorecards match the active specialty filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4-Pillar Inspector & Confidential Coaching Box */}
          {activeCard && (
            <div className="ssr-card-panel">
              <h3>4-Pillar Breakdown: {activeCard.surgeon_name}</h3>
              <div className="ssr-pillar-list">
                <div className="ssr-pillar-item">
                  <div className="ssr-pillar-row">
                    <span>Contribution Margin / OR Hr ({config?.weight_contribution_margin_pct ?? 35}%)</span>
                    <strong>{activeCard.pillar_scores?.contribution_margin_score ?? 0}</strong>
                  </div>
                  <div className="ssr-bar-track">
                    <div className="ssr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.contribution_margin_score || 0)}%` }} />
                  </div>
                </div>
                <div className="ssr-pillar-item">
                  <div className="ssr-pillar-row">
                    <span>OR Turnover & Efficiency ({config?.weight_or_efficiency_pct ?? 25}%)</span>
                    <strong>{activeCard.pillar_scores?.or_efficiency_score ?? 0}</strong>
                  </div>
                  <div className="ssr-bar-track">
                    <div className="ssr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.or_efficiency_score || 0)}%` }} />
                  </div>
                </div>
                <div className="ssr-pillar-item">
                  <div className="ssr-pillar-row">
                    <span>Supply & Pref Card Discipline ({config?.weight_supply_discipline_pct ?? 25}%)</span>
                    <strong>{activeCard.pillar_scores?.supply_discipline_score ?? 0}</strong>
                  </div>
                  <div className="ssr-bar-track">
                    <div className="ssr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.supply_discipline_score || 0)}%` }} />
                  </div>
                </div>
                <div className="ssr-pillar-item">
                  <div className="ssr-pillar-row">
                    <span>Documentation Quality ({config?.weight_documentation_quality_pct ?? 15}%)</span>
                    <strong>{activeCard.pillar_scores?.documentation_quality_score ?? 0}</strong>
                  </div>
                  <div className="ssr-bar-track">
                    <div className="ssr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.documentation_quality_score || 0)}%` }} />
                  </div>
                </div>
              </div>

              <div className="ssr-cpt-mini">
                <h4>Top CPT Procedure Mix</h4>
                {activeCard.is_anonymized_peer ? (
                  <p className="ssr-empty-inline">CPT details hidden under Surgeon Self-View peer privacy protection.</p>
                ) : selectedCptRows.length > 0 ? (
                  <ul className="ssr-mini-list">
                    {selectedCptRows.map(row => (
                      <li key={row.id}>
                        <span><strong>{row.cpt_code}</strong> · {row.procedure_label} ({row.case_count} cases)</span>
                        <span className="ssr-code">{fmtCurrency(row.avg_margin_per_case_usd)}/case</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ssr-empty-inline">No CPT drill-down rows for this scorecard.</p>
                )}
              </div>

              <form className="ssr-review-form" onSubmit={handleRecordReview}>
                <h4>Log Confidential Coaching / Review</h4>
                <div className="ssr-review-row">
                  <select
                    className="ssr-select"
                    value={reviewAction}
                    onChange={(e) => setReviewAction(e.target.value)}
                  >
                    {CANONICAL_REVIEW_ACTIONS.map(act => (
                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    className="ssr-note-input"
                    type="text"
                    placeholder="Enter confidential Medical Director / coaching note (>= 5 chars)..."
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                  <button type="submit" className="ssr-btn-primary">Log Review</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Specialty Benchmarks */}
      {activeSubTab === 'benchmarks' && (
        <div className="ssr-card-panel">
          <h3>Facility Specialty Peer Benchmarks</h3>
          <div className="ssr-table-wrap">
            <table className="ssr-table">
              <thead>
                <tr>
                  <th>Specialty</th>
                  <th>Median Margin / OR Hr</th>
                  <th>Top Quartile / OR Hr</th>
                  <th>Turnover Target</th>
                  <th>Max Supply Variance</th>
                  <th>Doc Completeness Target</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map(b => (
                  <tr key={b.id}>
                    <td className="ssr-surgeon-name">{b.specialty}</td>
                    <td>{fmtCurrency(b.median_margin_per_or_hour_usd)}/hr</td>
                    <td className="ssr-code">{fmtCurrency(b.top_quartile_margin_per_or_hour_usd)}/hr</td>
                    <td>{b.benchmark_turnover_minutes} min</td>
                    <td>{b.benchmark_supply_variance_pct}%</td>
                    <td>{b.benchmark_doc_completeness_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: CPT Mix & Implant Variance */}
      {activeSubTab === 'cpt_mix' && (
        <div className="ssr-card-panel">
          <h3>CPT Mix & Preference Card Implant Discipline</h3>
          <div className="ssr-table-wrap">
            <table className="ssr-table">
              <thead>
                <tr>
                  <th>Surgeon Code</th>
                  <th>CPT</th>
                  <th>Procedure Description</th>
                  <th>Cases</th>
                  <th>Avg Margin / Case</th>
                  <th>Implant Cost / Case</th>
                  <th>Var vs Peer</th>
                </tr>
              </thead>
              <tbody>
                {cptMix.map(row => (
                  <tr key={row.id}>
                    <td className="ssr-code">{row.surgeon_code}</td>
                    <td className="ssr-code">{row.cpt_code}</td>
                    <td>{row.procedure_label}</td>
                    <td>{row.case_count}</td>
                    <td>{fmtCurrency(row.avg_margin_per_case_usd)}</td>
                    <td>{fmtCurrency(row.implant_cost_per_case_usd)}</td>
                    <td>
                      <span className={`ssr-badge ${row.variance_vs_peer_pct <= 0 ? 'ssr-badge-emerald' : 'ssr-badge-amber'}`}>
                        {row.variance_vs_peer_pct > 0 ? `+${row.variance_vs_peer_pct}%` : `${row.variance_vs_peer_pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Peer Reviews & H0 Dispatches */}
      {activeSubTab === 'reviews' && (
        <div className="ssr-stack">
          <div className="ssr-card-panel">
            <h3>Confidential Peer Review & Coaching Audit Trail</h3>
            <div className="ssr-table-wrap">
              <table className="ssr-table">
                <thead>
                  <tr>
                    <th>Surgeon</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {peerReviews.map(r => (
                    <tr key={r.id}>
                      <td className="ssr-code">{r.surgeon_code}</td>
                      <td><span className="ssr-badge ssr-badge-sky">{r.action_type}</span></td>
                      <td>{r.actor_email} ({r.actor_role})</td>
                      <td>{r.notes}</td>
                      <td className="ssr-mono-cell">{r.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ssr-card-panel">
            <h3>H0 Confidential Dispatch History (RPT-H4-SURGEON-CARD)</h3>
            <div className="ssr-table-wrap">
              <table className="ssr-table">
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
                      <td className="ssr-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="ssr-badge ssr-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="ssr-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rubric Weights & Privacy Modal */}
      {isConfigOpen && (
        <div className="ssr-modal-backdrop">
          <div className="ssr-modal">
            <div className="ssr-modal-header">
              <h3>Scorecard Rubric Weights & Privacy Governance</h3>
              <button type="button" className="ssr-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="ssr-modal-body">
              <div className="ssr-form-row">
                <label>Contribution Margin / OR Hour Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_contribution_margin_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_contribution_margin_pct: Number(e.target.value) })}
                />
              </div>
              <div className="ssr-form-row">
                <label>OR Turnover & Efficiency Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_or_efficiency_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_or_efficiency_pct: Number(e.target.value) })}
                />
              </div>
              <div className="ssr-form-row">
                <label>Supply & Pref Card Discipline Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_supply_discipline_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_supply_discipline_pct: Number(e.target.value) })}
                />
              </div>
              <div className="ssr-form-row">
                <label>Documentation Quality Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_documentation_quality_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_documentation_quality_pct: Number(e.target.value) })}
                />
              </div>
              <div className="ssr-weight-sum">
                Conserved Total Weight: <strong>{draftWeightTotal}%</strong> (must equal 100.00%)
              </div>
              <div className="ssr-form-row">
                <label>Minimum Completed Cases for Benchmark</label>
                <input
                  type="number"
                  min={1}
                  value={draftWeights.min_cases_for_benchmark}
                  onChange={(e) => setDraftWeights({ ...draftWeights, min_cases_for_benchmark: Number(e.target.value) })}
                />
              </div>
              <label className="ssr-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftWeights.anonymize_peer_names_for_surgeon_view}
                  onChange={(e) => setDraftWeights({ ...draftWeights, anonymize_peer_names_for_surgeon_view: e.target.checked })}
                />
                Anonymize Peer Names in Surgeon Self-View
              </label>
              <div className="ssr-modal-footer">
                <button type="button" className="ssr-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="ssr-btn-primary">Save Rubric</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
