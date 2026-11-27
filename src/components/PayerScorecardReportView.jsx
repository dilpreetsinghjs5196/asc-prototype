import React, { useState, useMemo, useEffect } from 'react';
import {
  Scale,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  Clock,
  Sliders,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  ClipboardCheck
} from 'lucide-react';
import {
  CANONICAL_PAYER_GRADES,
  CANONICAL_NEGOTIATION_ACTIONS,
  getPsrConfig,
  updatePsrConfig,
  getPsrTelemetry,
  getPsrCategoryBenchmarks,
  getPsrEditions,
  getPsrPayerScorecards,
  getPsrContractVariances,
  getPsrNegotiationActions,
  getPsrDispatchLogs,
  compilePayerScorecardEdition,
  recordPayerNegotiationAction,
  dispatchPayerScorecardDigest,
  normalizeFacilityId
} from '../services/payerScorecardReportService';
import './PayerScorecardReportView.css';

const GRADE_BADGE_CLASS = {
  A_PREFERRED: 'psr-badge-emerald',
  B_STANDARD: 'psr-badge-sky',
  C_FRICTIONAL: 'psr-badge-amber',
  D_HIGH_RISK: 'psr-badge-rose',
  F_CRITICAL: 'psr-badge-rose'
};

export default function PayerScorecardReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('leaderboard'); // 'leaderboard' | 'benchmarks' | 'shortfalls' | 'negotiations'
  const [selectedEditionId, setSelectedEditionId] = useState('psr-ed-2026q4');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedGrade, setSelectedGrade] = useState('ALL');
  const [selectedCardId, setSelectedCardId] = useState('pcard-med');
  const [actionType, setActionType] = useState('UNDERPAYMENT_DEMAND');
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
  const [variances, setVariances] = useState([]);
  const [negotiationActions, setNegotiationActions] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftWeights, setDraftWeights] = useState({
    weight_contract_yield_pct: 35,
    weight_payment_velocity_pct: 25,
    weight_clean_claim_rate_pct: 25,
    weight_carveout_recovery_pct: 15,
    target_yield_floor_pct: 95,
    target_days_to_pay: 30,
    critical_renewal_window_days: 90
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, bms, eds, acts, dsps] = await Promise.all([
          getPsrConfig(facilityId),
          getPsrTelemetry(facilityId),
          getPsrCategoryBenchmarks(facilityId),
          getPsrEditions(facilityId),
          getPsrNegotiationActions(facilityId),
          getPsrDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [cards, varRows] = await Promise.all([
          targetEd
            ? getPsrPayerScorecards(facilityId, {
                edition_id: targetEd.id,
                category: selectedCategory,
                grade: selectedGrade
              })
            : [],
          getPsrContractVariances(facilityId)
        ]);

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setBenchmarks(bms);
        setEditions(eds);
        setScorecards(cards);
        setVariances(varRows);
        setNegotiationActions(acts);
        setDispatchLogs(dsps);
        setDraftWeights({
          weight_contract_yield_pct: cfg.weight_contract_yield_pct,
          weight_payment_velocity_pct: cfg.weight_payment_velocity_pct,
          weight_clean_claim_rate_pct: cfg.weight_clean_claim_rate_pct,
          weight_carveout_recovery_pct: cfg.weight_carveout_recovery_pct,
          target_yield_floor_pct: cfg.target_yield_floor_pct,
          target_days_to_pay: cfg.target_days_to_pay,
          critical_renewal_window_days: cfg.critical_renewal_window_days
        });
        if (cards.length > 0) {
          setSelectedCardId(prev => (cards.some(c => c.id === prev) ? prev : cards[0].id));
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Payer Scorecard: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, selectedCategory, selectedGrade, refreshKey]);

  const activeCard = useMemo(
    () => scorecards.find(c => c.id === selectedCardId) || scorecards[0] || null,
    [scorecards, selectedCardId]
  );

  const selectedVariances = useMemo(() => {
    if (!activeCard) return [];
    return variances.filter(v => v.payer_code === activeCard.payer_code);
  }, [variances, activeCard]);

  const draftWeightTotal = useMemo(() => (
    Number(draftWeights.weight_contract_yield_pct || 0) +
    Number(draftWeights.weight_payment_velocity_pct || 0) +
    Number(draftWeights.weight_clean_claim_rate_pct || 0) +
    Number(draftWeights.weight_carveout_recovery_pct || 0)
  ).toFixed(2), [draftWeights]);

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compilePayerScorecardEdition(facilityId, { period_code: '2026-12' });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled edition ${res.edition.edition_code} (${res.scorecards.length} contracted payers ranked).`
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
      const log = await dispatchPayerScorecardDigest(facilityId, edId);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Payer scorecard packet dispatched via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updatePsrConfig(facilityId, draftWeights);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: '4-pillar payer rubric weights and SLA floors saved cleanly.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordAction = async (e) => {
    e.preventDefault();
    if (!activeCard) return;
    try {
      await recordPayerNegotiationAction(facilityId, activeCard.id, {
        action_type: actionType,
        target_recovery_usd: activeCard.underpayment_leakage_usd,
        notes: actionNote
      });
      setActionNote('');
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: `Sealed negotiation action logged for ${activeCard.payer_code}.` });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <div className="psr-container">
      {/* Header Bar */}
      <div className="psr-header-bar">
        <div className="psr-header-title">
          <div className="psr-title-icon"><Scale size={20} /></div>
          <div>
            <h2>Payer Reimbursement & Contract Scorecard (H5)</h2>
            <p className="psr-subtitle">
              {facilityName} · Conserved 4-Pillar Grading (35/25/25/15) · Contract Yield, Adjudication Velocity & Renewal Radar
            </p>
          </div>
        </div>
        <div className="psr-header-actions">
          <button type="button" className="psr-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> Rubric Weights
          </button>
          <button type="button" className="psr-btn-secondary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Edition'}
          </button>
          <button type="button" className="psr-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Dispatch H0 Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`psr-banner psr-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="psr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="psr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="psr-telemetry-grid">
          <div className="psr-kpi-card">
            <div className="psr-kpi-label"><Scale size={14} /> Payers Evaluated</div>
            <div className="psr-kpi-value">{telemetry.payers_evaluated} Plans</div>
            <div className="psr-kpi-meta">Mean grade index: {Number(telemetry.avg_composite_score || 0).toFixed(1)} / 100</div>
          </div>
          <div className="psr-kpi-card">
            <div className="psr-kpi-label"><DollarSign size={14} /> Net Payer Collections</div>
            <div className="psr-kpi-value">{fmtCurrency(telemetry.total_net_collections_usd)}</div>
            <div className="psr-kpi-meta">Edition: {telemetry.latest_edition_code || 'N/A'}</div>
          </div>
          <div className="psr-kpi-card">
            <div className="psr-kpi-label"><AlertTriangle size={14} /> Contract Underpayment Leakage</div>
            <div className="psr-kpi-value">{fmtCurrency(telemetry.total_underpayment_leakage_usd)}</div>
            <div className="psr-kpi-meta">Expected allowed minus collected</div>
          </div>
          <div className="psr-kpi-card">
            <div className="psr-kpi-label"><ShieldCheck size={14} /> Renewal Notice Alerts</div>
            <div className="psr-kpi-value">{telemetry.urgent_renewals_count} Urgent</div>
            <div className="psr-kpi-meta psr-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Filters */}
      <div className="psr-controls-bar">
        <div className="psr-subtabs">
          <button
            type="button"
            className={`psr-subtab ${activeSubTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('leaderboard')}
          >
            <Scale size={14} /> Ranked Payers ({scorecards.length})
          </button>
          <button
            type="button"
            className={`psr-subtab ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('benchmarks')}
          >
            <TrendingUp size={14} /> Category Benchmarks ({benchmarks.length})
          </button>
          <button
            type="button"
            className={`psr-subtab ${activeSubTab === 'shortfalls' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('shortfalls')}
          >
            <FileText size={14} /> Contract Shortfalls ({variances.length})
          </button>
          <button
            type="button"
            className={`psr-subtab ${activeSubTab === 'negotiations' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('negotiations')}
          >
            <ClipboardCheck size={14} /> Negotiations & Dispatches ({negotiationActions.length + dispatchLogs.length})
          </button>
        </div>

        <div className="psr-controls-right">
          <select
            className="psr-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Payer Category Filter"
          >
            <option value="ALL">All Categories</option>
            {benchmarks.map(b => (
              <option key={b.id} value={b.payer_category}>{b.payer_category.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="psr-select"
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            aria-label="Grade Filter"
          >
            <option value="ALL">All Grades</option>
            {CANONICAL_PAYER_GRADES.map(g => (
              <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="psr-select"
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

      {/* Subtab 1: Ranked Payer Scorecards + 4-Pillar Inspector */}
      {activeSubTab === 'leaderboard' && (
        <div className="psr-split-layout">
          <div className="psr-card-panel">
            <div className="psr-panel-head">
              <h3>Contracted Payer Leaderboard</h3>
              <span className="psr-target-pill">
                <Clock size={13} /> Floor Yield: {config?.target_yield_floor_pct ?? 95}% · Target DTP: {config?.target_days_to_pay ?? 30}d
              </span>
            </div>
            <div className="psr-table-wrap">
              <table className="psr-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Payer Plan</th>
                    <th>Category</th>
                    <th>Yield</th>
                    <th>Leakage</th>
                    <th>Days to Pay</th>
                    <th>Denial %</th>
                    <th>Renewal</th>
                    <th>Score</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.map(c => (
                    <tr
                      key={c.id}
                      className={activeCard?.id === c.id ? 'psr-row-selected' : ''}
                      onClick={() => setSelectedCardId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="psr-code">#{c.rank_in_facility}</td>
                      <td>
                        <div className="psr-payer-name">{c.payer_name}</div>
                        <div className="psr-mono-cell">{c.payer_code} · {c.methodology} ({c.claim_count} claims)</div>
                      </td>
                      <td>{c.payer_category.replace(/_/g, ' ')}</td>
                      <td className="psr-code">{Number(c.contract_yield_pct).toFixed(1)}%</td>
                      <td className="psr-code">{fmtCurrency(c.underpayment_leakage_usd)}</td>
                      <td>{c.avg_days_to_pay}d</td>
                      <td>{Number(c.first_pass_denial_pct).toFixed(1)}%</td>
                      <td>
                        <span className={`psr-badge ${c.renewal_alert_status === 'RENEWAL_NOTICE_URGENT' ? 'psr-badge-amber' : 'psr-badge-emerald'}`}>
                          {c.days_to_renewal}d
                        </span>
                      </td>
                      <td className="psr-code">{Number(c.composite_score).toFixed(1)}</td>
                      <td>
                        <span className={`psr-badge ${GRADE_BADGE_CLASS[c.performance_grade] || 'psr-badge-sky'}`}>
                          {c.performance_grade.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scorecards.length === 0 && (
                    <tr>
                      <td colSpan={10} className="psr-empty-state">No payers match the selected category/grade filter.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4-Pillar Inspector & Negotiation Demand Box */}
          {activeCard && (
            <div className="psr-card-panel">
              <h3>4-Pillar Breakdown: {activeCard.payer_name}</h3>
              <div className="psr-pillar-list">
                <div className="psr-pillar-item">
                  <div className="psr-pillar-row">
                    <span>Contract Yield Compliance ({config?.weight_contract_yield_pct ?? 35}%)</span>
                    <strong>{activeCard.pillar_scores?.contract_yield_score ?? 0}</strong>
                  </div>
                  <div className="psr-bar-track">
                    <div className="psr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.contract_yield_score || 0)}%` }} />
                  </div>
                </div>
                <div className="psr-pillar-item">
                  <div className="psr-pillar-row">
                    <span>Payment Velocity / DSO ({config?.weight_payment_velocity_pct ?? 25}%)</span>
                    <strong>{activeCard.pillar_scores?.payment_velocity_score ?? 0}</strong>
                  </div>
                  <div className="psr-bar-track">
                    <div className="psr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.payment_velocity_score || 0)}%` }} />
                  </div>
                </div>
                <div className="psr-pillar-item">
                  <div className="psr-pillar-row">
                    <span>First-Pass Clean Claim Rate ({config?.weight_clean_claim_rate_pct ?? 25}%)</span>
                    <strong>{activeCard.pillar_scores?.clean_claim_rate_score ?? 0}</strong>
                  </div>
                  <div className="psr-bar-track">
                    <div className="psr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.clean_claim_rate_score || 0)}%` }} />
                  </div>
                </div>
                <div className="psr-pillar-item">
                  <div className="psr-pillar-row">
                    <span>Carve-Out & Implant Recovery ({config?.weight_carveout_recovery_pct ?? 15}%)</span>
                    <strong>{activeCard.pillar_scores?.carveout_recovery_score ?? 0}</strong>
                  </div>
                  <div className="psr-bar-track">
                    <div className="psr-bar-fill" style={{ width: `${Math.min(100, activeCard.pillar_scores?.carveout_recovery_score || 0)}%` }} />
                  </div>
                </div>
              </div>

              <div className="psr-cpt-mini">
                <h4>Top CPT Contract Shortfalls ({activeCard.payer_code})</h4>
                {selectedVariances.length > 0 ? (
                  <ul className="psr-mini-list">
                    {selectedVariances.map(v => (
                      <li key={v.id}>
                        <span><strong>{v.cpt_code}</strong> · {v.procedure_label} ({v.claim_count} claims)</span>
                        <span className="psr-code">-{fmtCurrency(v.shortfall_usd)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="psr-empty-inline">Zero material CPT contract shortfalls flagged for this payer.</p>
                )}
              </div>

              <form className="psr-action-form" onSubmit={handleRecordAction}>
                <h4>Log Sealed Negotiation / Demand Action</h4>
                <div className="psr-action-row">
                  <select
                    className="psr-select"
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                  >
                    {CANONICAL_NEGOTIATION_ACTIONS.map(act => (
                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    className="psr-note-input"
                    type="text"
                    placeholder="Document demand target or contract notice rationale (>= 5 chars)..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                  <button type="submit" className="psr-btn-primary">Log Action</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Category Benchmarks */}
      {activeSubTab === 'benchmarks' && (
        <div className="psr-card-panel">
          <h3>Payer Category SLA & Financial Benchmarks</h3>
          <div className="psr-table-wrap">
            <table className="psr-table">
              <thead>
                <tr>
                  <th>Payer Category</th>
                  <th>Target Contract Yield</th>
                  <th>Target Days to Pay</th>
                  <th>Max Denial Rate</th>
                  <th>Target Carve-Out Recovery</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map(b => (
                  <tr key={b.id}>
                    <td className="psr-payer-name">{b.payer_category.replace(/_/g, ' ')}</td>
                    <td className="psr-code">{Number(b.target_yield_pct).toFixed(1)}%</td>
                    <td>{b.target_days_to_pay} days</td>
                    <td>{Number(b.max_denial_rate_pct).toFixed(1)}%</td>
                    <td className="psr-code">{Number(b.target_carveout_recovery_pct).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: CPT Contract Shortfalls */}
      {activeSubTab === 'shortfalls' && (
        <div className="psr-card-panel">
          <h3>CPT Contract Shortfalls & Implant Carve-Out Audit</h3>
          <div className="psr-table-wrap">
            <table className="psr-table">
              <thead>
                <tr>
                  <th>Payer Code</th>
                  <th>CPT</th>
                  <th>Procedure Description</th>
                  <th>Claims</th>
                  <th>Contract Allowed</th>
                  <th>Actual Paid</th>
                  <th>Shortfall</th>
                  <th>Root Cause</th>
                </tr>
              </thead>
              <tbody>
                {variances.map(v => (
                  <tr key={v.id}>
                    <td className="psr-code">{v.payer_code}</td>
                    <td className="psr-code">{v.cpt_code}</td>
                    <td>{v.procedure_label}</td>
                    <td>{v.claim_count}</td>
                    <td>{fmtCurrency(v.contract_allowed_usd)}</td>
                    <td>{fmtCurrency(v.actual_paid_usd)}</td>
                    <td className="psr-code">{fmtCurrency(v.shortfall_usd)}</td>
                    <td><span className="psr-badge psr-badge-amber">{v.variance_reason.replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Negotiations & H0 Dispatches */}
      {activeSubTab === 'negotiations' && (
        <div className="psr-stack">
          <div className="psr-card-panel">
            <h3>Payer Negotiation & Recovery Action Log</h3>
            <div className="psr-table-wrap">
              <table className="psr-table">
                <thead>
                  <tr>
                    <th>Payer</th>
                    <th>Action Type</th>
                    <th>Target Recovery</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {negotiationActions.map(a => (
                    <tr key={a.id}>
                      <td className="psr-code">{a.payer_code}</td>
                      <td><span className="psr-badge psr-badge-sky">{a.action_type}</span></td>
                      <td className="psr-code">{fmtCurrency(a.target_recovery_usd)}</td>
                      <td>{a.actor_email} ({a.actor_role})</td>
                      <td>{a.notes}</td>
                      <td className="psr-mono-cell">{a.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="psr-card-panel">
            <h3>H0 Confidential Dispatch History (RPT-H5-PAYER-CARD)</h3>
            <div className="psr-table-wrap">
              <table className="psr-table">
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
                      <td className="psr-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="psr-badge psr-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="psr-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rubric Weights & SLA Floors Modal */}
      {isConfigOpen && (
        <div className="psr-modal-backdrop">
          <div className="psr-modal">
            <div className="psr-modal-header">
              <h3>Payer Scorecard Rubric Weights & SLA Floors</h3>
              <button type="button" className="psr-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="psr-modal-body">
              <div className="psr-form-row">
                <label>Contract Yield Compliance Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_contract_yield_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_contract_yield_pct: Number(e.target.value) })}
                />
              </div>
              <div className="psr-form-row">
                <label>Payment Velocity / DSO Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_payment_velocity_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_payment_velocity_pct: Number(e.target.value) })}
                />
              </div>
              <div className="psr-form-row">
                <label>First-Pass Clean Claim Rate Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_clean_claim_rate_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_clean_claim_rate_pct: Number(e.target.value) })}
                />
              </div>
              <div className="psr-form-row">
                <label>Carve-Out & Implant Recovery Weight (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={draftWeights.weight_carveout_recovery_pct}
                  onChange={(e) => setDraftWeights({ ...draftWeights, weight_carveout_recovery_pct: Number(e.target.value) })}
                />
              </div>
              <div className="psr-weight-sum">
                Conserved Total Weight: <strong>{draftWeightTotal}%</strong> (must equal 100.00%)
              </div>
              <div className="psr-form-row">
                <label>Critical Renewal Notice Window (Days)</label>
                <input
                  type="number"
                  min={15}
                  value={draftWeights.critical_renewal_window_days}
                  onChange={(e) => setDraftWeights({ ...draftWeights, critical_renewal_window_days: Number(e.target.value) })}
                />
              </div>
              <div className="psr-modal-footer">
                <button type="button" className="psr-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="psr-btn-primary">Save Rubric</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
