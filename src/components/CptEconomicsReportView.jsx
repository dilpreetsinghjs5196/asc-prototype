import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  DollarSign,
  Clock,
  TrendingUp,
  Sliders,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ClipboardCheck,
  ShieldCheck
} from 'lucide-react';
import {
  CANONICAL_ECONOMIC_QUADRANTS,
  CANONICAL_OPTIMIZATION_ACTIONS,
  getCerConfig,
  updateCerConfig,
  getCerTelemetry,
  getCerSpecialtyBenchmarks,
  getCerEditions,
  getCerCptScorecards,
  getCerPayerRateMatrix,
  getCerOptimizationReviews,
  getCerDispatchLogs,
  compileCptEconomicsEdition,
  recordCostOptimizationReview,
  dispatchCptEconomicsDigest,
  normalizeFacilityId
} from '../services/cptEconomicsReportService';
import './CptEconomicsReportView.css';

const QUADRANT_BADGE_CLASS = {
  PRIME_YIELD_ANCHOR: 'cer-badge-emerald',
  VOLUME_PROFIT_BUILDER: 'cer-badge-sky',
  MARGIN_SQUEEZE_AT_RISK: 'cer-badge-amber',
  ECONOMIC_DEFICIT: 'cer-badge-rose'
};

export default function CptEconomicsReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('leaderboard'); // 'leaderboard' | 'benchmarks' | 'payer_rates' | 'reviews'
  const [selectedEditionId, setSelectedEditionId] = useState('cer-ed-2026q4');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedQuadrant, setSelectedQuadrant] = useState('ALL');
  const [selectedCardId, setSelectedCardId] = useState('cer-cpt-29827');
  const [actionType, setActionType] = useState('IMPLANT_NEGOTIATION');
  const [targetSavings, setTargetSavings] = useState('420');
  const [actionNote, setActionNote] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [benchmarks, setBenchmarks] = useState([]);
  const [editions, setEditions] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [payerRates, setPayerRates] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    facility_overhead_per_or_hour_usd: 450,
    target_margin_per_or_hour_usd: 2000,
    min_contribution_margin_pct: 45,
    min_cases_for_statistical_validity: 5
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, bms, eds, revs, dsps] = await Promise.all([
          getCerConfig(facilityId),
          getCerTelemetry(facilityId),
          getCerSpecialtyBenchmarks(facilityId),
          getCerEditions(facilityId),
          getCerOptimizationReviews(facilityId),
          getCerDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [cards, rates] = await Promise.all([
          targetEd
            ? getCerCptScorecards(facilityId, {
                edition_id: targetEd.id,
                specialty: selectedSpecialty,
                quadrant: selectedQuadrant
              })
            : [],
          getCerPayerRateMatrix(facilityId)
        ]);

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setBenchmarks(bms);
        setEditions(eds);
        setScorecards(cards);
        setPayerRates(rates);
        setReviews(revs);
        setDispatchLogs(dsps);
        setDraftConfig({
          facility_overhead_per_or_hour_usd: cfg.facility_overhead_per_or_hour_usd,
          target_margin_per_or_hour_usd: cfg.target_margin_per_or_hour_usd,
          min_contribution_margin_pct: cfg.min_contribution_margin_pct,
          min_cases_for_statistical_validity: cfg.min_cases_for_statistical_validity
        });
        if (cards.length > 0) {
          setSelectedCardId(prev => (cards.some(c => c.id === prev) ? prev : cards[0].id));
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load CPT Economics: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, selectedSpecialty, selectedQuadrant, refreshKey]);

  const activeCard = useMemo(
    () => scorecards.find(c => c.id === selectedCardId) || scorecards[0] || null,
    [scorecards, selectedCardId]
  );

  const selectedPayerRows = useMemo(() => {
    if (!activeCard) return [];
    return payerRates.filter(r => r.cpt_code === activeCard.cpt_code);
  }, [payerRates, activeCard]);

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compileCptEconomicsEdition(facilityId, { period_code: '2026-12' });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled conserved edition ${res.edition.edition_code} (${res.scorecards.length} CPT procedures, NOI ${fmtCurrency(res.edition.total_net_operating_income_usd)}).`
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
      const log = await dispatchCptEconomicsDigest(facilityId, edId);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `CPT Economics report dispatched via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateCerConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: 'Overhead allocation & statistical validity thresholds saved.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordReview = async (e) => {
    e.preventDefault();
    if (!activeCard) return;
    try {
      await recordCostOptimizationReview(facilityId, activeCard.id, {
        action_type: actionType,
        target_savings_per_case_usd: Number(targetSavings || 0),
        notes: actionNote
      });
      setActionNote('');
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: `Sealed optimization plan logged for CPT ${activeCard.cpt_code}.` });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <div className="cer-container">
      {/* Header Bar */}
      <div className="cer-header-bar">
        <div className="cer-header-title">
          <div className="cer-title-icon"><Layers size={20} /></div>
          <div>
            <h2>CPT Reimbursement, Cost, Margin & OR Duration Report (H6)</h2>
            <p className="cer-subtitle">
              {facilityName} · Activity-Based Unit Decomposition · Overhead ({fmtCurrency(config?.facility_overhead_per_or_hour_usd ?? 450)}/hr) & Net Operating Income
            </p>
          </div>
        </div>
        <div className="cer-header-actions">
          <button type="button" className="cer-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> Overhead & Config
          </button>
          <button type="button" className="cer-btn-secondary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Edition'}
          </button>
          <button type="button" className="cer-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Dispatch H0 Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`cer-banner cer-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="cer-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="cer-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="cer-telemetry-grid">
          <div className="cer-kpi-card">
            <div className="cer-kpi-label"><Layers size={14} /> CPTs & Total Cases</div>
            <div className="cer-kpi-value">{telemetry.cpts_evaluated} CPTs · {telemetry.total_case_volume} Cases</div>
            <div className="cer-kpi-meta">{telemetry.anchor_cpt_count} Prime Yield Anchors</div>
          </div>
          <div className="cer-kpi-card">
            <div className="cer-kpi-label"><DollarSign size={14} /> Net Procedure Revenue</div>
            <div className="cer-kpi-value">{fmtCurrency(telemetry.total_net_reimbursement_usd)}</div>
            <div className="cer-kpi-meta">Edition: {telemetry.latest_edition_code || 'N/A'}</div>
          </div>
          <div className="cer-kpi-card">
            <div className="cer-kpi-label"><Clock size={14} /> Weighted Margin / OR Hr</div>
            <div className="cer-kpi-value">{fmtCurrency(telemetry.weighted_margin_per_or_hour_usd)}/hr</div>
            <div className="cer-kpi-meta">Target hurdle: {fmtCurrency(config?.target_margin_per_or_hour_usd ?? 2000)}/hr</div>
          </div>
          <div className="cer-kpi-card">
            <div className="cer-kpi-label"><ShieldCheck size={14} /> Net Operating Income</div>
            <div className="cer-kpi-value">{fmtCurrency(telemetry.total_net_operating_income_usd)}</div>
            <div className="cer-kpi-meta cer-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Filter Bar */}
      <div className="cer-controls-bar">
        <div className="cer-subtabs">
          <button
            type="button"
            className={`cer-subtab ${activeSubTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('leaderboard')}
          >
            <Layers size={14} /> CPT Leaderboard ({scorecards.length})
          </button>
          <button
            type="button"
            className={`cer-subtab ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('benchmarks')}
          >
            <TrendingUp size={14} /> Specialty Benchmarks ({benchmarks.length})
          </button>
          <button
            type="button"
            className={`cer-subtab ${activeSubTab === 'payer_rates' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('payer_rates')}
          >
            <FileText size={14} /> Payer Rate Matrix ({payerRates.length})
          </button>
          <button
            type="button"
            className={`cer-subtab ${activeSubTab === 'reviews' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('reviews')}
          >
            <ClipboardCheck size={14} /> Optimizations & Dispatches ({reviews.length + dispatchLogs.length})
          </button>
        </div>

        <div className="cer-controls-right">
          <select
            className="cer-select"
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
            className="cer-select"
            value={selectedQuadrant}
            onChange={(e) => setSelectedQuadrant(e.target.value)}
            aria-label="Economic Quadrant Filter"
          >
            <option value="ALL">All Quadrants</option>
            {CANONICAL_ECONOMIC_QUADRANTS.map(q => (
              <option key={q} value={q}>{q.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="cer-select"
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

      {/* Subtab 1: CPT Leaderboard & Unit Cost Inspector */}
      {activeSubTab === 'leaderboard' && (
        <div className="cer-split-layout">
          <div className="cer-card-panel">
            <div className="cer-panel-head">
              <h3>Procedure Unit Economics Leaderboard</h3>
              <span className="cer-target-pill">
                <Clock size={13} /> Overhead Allocation: {fmtCurrency(config?.facility_overhead_per_or_hour_usd ?? 450)}/OR hr
              </span>
            </div>
            <div className="cer-table-wrap">
              <table className="cer-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>CPT & Procedure</th>
                    <th>Specialty</th>
                    <th>Cases</th>
                    <th>OR Min</th>
                    <th>Net Reimb</th>
                    <th>Direct Cost</th>
                    <th>Margin / Hr</th>
                    <th>NOI / Case</th>
                    <th>Quadrant</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.map(c => (
                    <tr
                      key={c.id}
                      className={activeCard?.id === c.id ? 'cer-row-selected' : ''}
                      onClick={() => setSelectedCardId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="cer-code">#{c.rank_in_facility}</td>
                      <td>
                        <div className="cer-cpt-title">{c.cpt_code} · {c.procedure_label}</div>
                        <div className="cer-mono-cell">{c.total_or_hours} total OR hrs · {c.contribution_margin_pct}% CM</div>
                      </td>
                      <td>{c.specialty}</td>
                      <td>{c.case_count}</td>
                      <td>{c.avg_or_duration_minutes}m</td>
                      <td>{fmtCurrency(c.avg_net_reimbursement_usd)}</td>
                      <td>{fmtCurrency(c.avg_direct_cost_usd)}</td>
                      <td className="cer-code">{fmtCurrency(c.margin_per_or_hour_usd)}/hr</td>
                      <td className="cer-code">{fmtCurrency(c.net_operating_income_per_case_usd)}</td>
                      <td>
                        <span className={`cer-badge ${QUADRANT_BADGE_CLASS[c.economic_quadrant] || 'cer-badge-sky'}`}>
                          {c.economic_quadrant.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scorecards.length === 0 && (
                    <tr>
                      <td colSpan={10} className="cer-empty-state">No CPT procedures match active specialty/quadrant filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unit Cost Waterfall Inspector */}
          {activeCard && (
            <div className="cer-card-panel">
              <h3>Unit Waterfall: CPT {activeCard.cpt_code}</h3>
              <div className="cer-waterfall-list">
                <div className="cer-wf-row">
                  <span>Avg Net Reimbursement</span>
                  <strong className="cer-code">{fmtCurrency(activeCard.avg_net_reimbursement_usd)}</strong>
                </div>
                <div className="cer-wf-row cer-wf-sub">
                  <span>(−) Implant Cost / Case</span>
                  <span>{fmtCurrency(activeCard.avg_implant_cost_usd)}</span>
                </div>
                <div className="cer-wf-row cer-wf-sub">
                  <span>(−) Sterile Supplies / Case</span>
                  <span>{fmtCurrency(activeCard.avg_supply_cost_usd)}</span>
                </div>
                <div className="cer-wf-row cer-wf-sub">
                  <span>(−) Direct Nursing & Staff Labor</span>
                  <span>{fmtCurrency(activeCard.avg_labor_cost_usd)}</span>
                </div>
                <div className="cer-wf-row cer-wf-highlight">
                  <span>Contribution Margin ({activeCard.contribution_margin_pct}%)</span>
                  <strong className="cer-code">{fmtCurrency(activeCard.contribution_margin_per_case_usd)}</strong>
                </div>
                <div className="cer-wf-row cer-wf-sub">
                  <span>(−) Allocated OR Overhead ({activeCard.avg_or_duration_minutes}m)</span>
                  <span>{fmtCurrency(activeCard.allocated_overhead_per_case_usd)}</span>
                </div>
                <div className="cer-wf-row cer-wf-total">
                  <span>Net Operating Income / Case</span>
                  <strong className="cer-code">{fmtCurrency(activeCard.net_operating_income_per_case_usd)}</strong>
                </div>
              </div>

              <div className="cer-payer-mini">
                <h4>Payer Rate Spread (CPT {activeCard.cpt_code})</h4>
                {selectedPayerRows.length > 0 ? (
                  <ul className="cer-mini-list">
                    {selectedPayerRows.map(r => (
                      <li key={r.id}>
                        <span><strong>{r.payer_code}</strong> · {r.payer_name} ({r.medicare_parity_pct}% MCR)</span>
                        <span className="cer-code">{fmtCurrency(r.net_margin_per_case_usd)} net</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="cer-empty-inline">Use Payer Rate Matrix tab to review cross-plan parity.</p>
                )}
              </div>

              <form className="cer-action-form" onSubmit={handleRecordReview}>
                <h4>Log Cost / Scheduling Optimization</h4>
                <div className="cer-action-row">
                  <select
                    className="cer-select"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                  >
                    {CANONICAL_OPTIMIZATION_ACTIONS.map(act => (
                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    className="cer-savings-input"
                    type="number"
                    min="0"
                    step="10"
                    placeholder="$/case savings"
                    value={targetSavings}
                    onChange={(e) => setTargetSavings(e.target.value)}
                  />
                  <input
                    className="cer-note-input"
                    type="text"
                    placeholder="Describe implant cap, OR speed-up, or carve-out fix (>= 5 chars)..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                  <button type="submit" className="cer-btn-primary">Log Plan</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Specialty Benchmarks */}
      {activeSubTab === 'benchmarks' && (
        <div className="cer-card-panel">
          <h3>Specialty CPT Efficiency & Implant Cost Benchmarks</h3>
          <div className="cer-table-wrap">
            <table className="cer-table">
              <thead>
                <tr>
                  <th>Specialty</th>
                  <th>Target Margin / OR Hr</th>
                  <th>Target OR Duration</th>
                  <th>Max Implant Cost %</th>
                  <th>Target Contribution Margin %</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map(b => (
                  <tr key={b.id}>
                    <td className="cer-cpt-title">{b.specialty}</td>
                    <td className="cer-code">{fmtCurrency(b.target_margin_per_or_hour_usd)}/hr</td>
                    <td>{b.target_duration_minutes} min</td>
                    <td>{Number(b.max_implant_cost_pct).toFixed(1)}%</td>
                    <td className="cer-code">{Number(b.target_contribution_margin_pct).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Payer Rate Matrix */}
      {activeSubTab === 'payer_rates' && (
        <div className="cer-card-panel">
          <h3>Cross-Payer Reimbursement & Medicare Parity Spread Matrix</h3>
          <div className="cer-table-wrap">
            <table className="cer-table">
              <thead>
                <tr>
                  <th>CPT</th>
                  <th>Payer Code</th>
                  <th>Payer Name</th>
                  <th>Cases</th>
                  <th>Net Reimb / Case</th>
                  <th>Net Margin / Case</th>
                  <th>Medicare Parity %</th>
                </tr>
              </thead>
              <tbody>
                {payerRates.map(r => (
                  <tr key={r.id}>
                    <td className="cer-code">{r.cpt_code}</td>
                    <td className="cer-code">{r.payer_code}</td>
                    <td>{r.payer_name}</td>
                    <td>{r.case_count}</td>
                    <td>{fmtCurrency(r.net_reimbursement_per_case_usd)}</td>
                    <td className="cer-code">{fmtCurrency(r.net_margin_per_case_usd)}</td>
                    <td>
                      <span className={`cer-badge ${r.medicare_parity_pct >= 150 ? 'cer-badge-emerald' : 'cer-badge-amber'}`}>
                        {Number(r.medicare_parity_pct).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Optimizations & Dispatches */}
      {activeSubTab === 'reviews' && (
        <div className="cer-stack">
          <div className="cer-card-panel">
            <h3>Sealed Cost Optimization & Preference Card Action Trail</h3>
            <div className="cer-table-wrap">
              <table className="cer-table">
                <thead>
                  <tr>
                    <th>CPT</th>
                    <th>Action Type</th>
                    <th>Target Savings / Case</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map(r => (
                    <tr key={r.id}>
                      <td className="cer-code">{r.cpt_code}</td>
                      <td><span className="cer-badge cer-badge-sky">{r.action_type}</span></td>
                      <td className="cer-code">{fmtCurrency(r.target_savings_per_case_usd)}</td>
                      <td>{r.actor_email} ({r.actor_role})</td>
                      <td>{r.notes}</td>
                      <td className="cer-mono-cell">{r.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="cer-card-panel">
            <h3>H0 Confidential Dispatch History (RPT-H6-CPT-ECON)</h3>
            <div className="cer-table-wrap">
              <table className="cer-table">
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
                      <td className="cer-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="cer-badge cer-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="cer-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cost & Overhead Modal */}
      {isConfigOpen && (
        <div className="cer-modal-backdrop">
          <div className="cer-modal">
            <div className="cer-modal-header">
              <h3>CPT Overhead Allocation & Validity Thresholds</h3>
              <button type="button" className="cer-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="cer-modal-body">
              <div className="cer-form-row">
                <label>Allocated Facility Overhead ($ / OR Hour)</label>
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={draftConfig.facility_overhead_per_or_hour_usd}
                  onChange={(e) => setDraftConfig({ ...draftConfig, facility_overhead_per_or_hour_usd: Number(e.target.value) })}
                />
              </div>
              <div className="cer-form-row">
                <label>Target Contribution Margin ($ / OR Hour)</label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  value={draftConfig.target_margin_per_or_hour_usd}
                  onChange={(e) => setDraftConfig({ ...draftConfig, target_margin_per_or_hour_usd: Number(e.target.value) })}
                />
              </div>
              <div className="cer-form-row">
                <label>Minimum Contribution Margin (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={draftConfig.min_contribution_margin_pct}
                  onChange={(e) => setDraftConfig({ ...draftConfig, min_contribution_margin_pct: Number(e.target.value) })}
                />
              </div>
              <div className="cer-form-row">
                <label>Minimum Case Volume Gate</label>
                <input
                  type="number"
                  min={1}
                  value={draftConfig.min_cases_for_statistical_validity}
                  onChange={(e) => setDraftConfig({ ...draftConfig, min_cases_for_statistical_validity: Number(e.target.value) })}
                />
              </div>
              <div className="cer-modal-footer">
                <button type="button" className="cer-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="cer-btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
