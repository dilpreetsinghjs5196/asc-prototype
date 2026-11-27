import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  DollarSign,
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
  CANONICAL_BLOCK_TIERS,
  CANONICAL_MEC_ACTIONS,
  getObrConfig,
  updateObrConfig,
  getObrTelemetry,
  getObrSuiteBenchmarks,
  getObrEditions,
  getObrBlockScorecards,
  getObrReleaseEvents,
  getObrMecActions,
  getObrDispatchLogs,
  compileOrBlockEdition,
  recordMecGovernanceAction,
  dispatchOrBlockDigest,
  normalizeFacilityId
} from '../services/orBlockReportService';
import './OrBlockReportView.css';

const TIER_BADGE_CLASS = {
  EXCEEDS_BENCHMARK: 'obr-badge-emerald',
  MEETS_BENCHMARK: 'obr-badge-sky',
  UNDERUTILIZED_WARNING: 'obr-badge-amber',
  CRITICAL_UNDERUTILIZATION: 'obr-badge-rose'
};

const RELEASE_BADGE_CLASS = {
  COMPLIANT_ON_TIME: 'obr-badge-emerald',
  LATE_RELEASE: 'obr-badge-amber',
  NO_SHOW_ABANDONED: 'obr-badge-rose'
};

export default function OrBlockReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('leaderboard'); // 'leaderboard' | 'suites' | 'releases' | 'governance'
  const [selectedEditionId, setSelectedEditionId] = useState('obr-ed-202611');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedBlockId, setSelectedBlockId] = useState('blk-wal');
  const [mecActionType, setMecActionType] = useState('ISSUE_60D_NOTICE');
  const [hoursDelta, setHoursDelta] = useState('-4');
  const [mecNote, setMecNote] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [suiteBenchmarks, setSuiteBenchmarks] = useState([]);
  const [editions, setEditions] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [releaseEvents, setReleaseEvents] = useState([]);
  const [mecActions, setMecActions] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    target_block_utilization_pct: 75,
    max_allowable_turnover_mins: 45,
    release_notice_cutoff_hours: 72,
    hourly_margin_benchmark_usd: 1250
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, bms, eds, acts, dsps] = await Promise.all([
          getObrConfig(facilityId),
          getObrTelemetry(facilityId),
          getObrSuiteBenchmarks(facilityId),
          getObrEditions(facilityId),
          getObrMecActions(facilityId),
          getObrDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [cards, rels] = await Promise.all([
          targetEd
            ? getObrBlockScorecards(facilityId, {
                edition_id: targetEd.id,
                block_tier: selectedTier,
                specialty: selectedSpecialty
              })
            : [],
          getObrReleaseEvents(facilityId)
        ]);

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setSuiteBenchmarks(bms);
        setEditions(eds);
        setScorecards(cards);
        setReleaseEvents(rels);
        setMecActions(acts);
        setDispatchLogs(dsps);
        setDraftConfig({
          target_block_utilization_pct: cfg.target_block_utilization_pct,
          max_allowable_turnover_mins: cfg.max_allowable_turnover_mins,
          release_notice_cutoff_hours: cfg.release_notice_cutoff_hours,
          hourly_margin_benchmark_usd: cfg.hourly_margin_benchmark_usd
        });
        if (cards.length > 0) {
          setSelectedBlockId(prev => (cards.some(c => c.id === prev) ? prev : cards[0].id));
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load OR Block Report: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, selectedTier, selectedSpecialty, refreshKey]);

  const activeBlock = useMemo(
    () => scorecards.find(c => c.id === selectedBlockId) || scorecards[0] || null,
    [scorecards, selectedBlockId]
  );

  const selectedReleases = useMemo(() => {
    if (!activeBlock) return [];
    return releaseEvents.filter(r => r.block_owner_code === activeBlock.block_owner_code);
  }, [releaseEvents, activeBlock]);

  const specialties = useMemo(
    () => Array.from(new Set(scorecards.map(s => s.specialty))),
    [scorecards]
  );

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compileOrBlockEdition(facilityId, { period_code: '2026-12' });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled conserved OR Block edition ${res.edition.edition_code} (${res.edition.facility_adjusted_util_pct}% adjusted util).`
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
      const log = await dispatchOrBlockDigest(facilityId, edId);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `OR Block report packet dispatched via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateObrConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: 'OR block utilization benchmarks & release cutoff hours saved.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordMec = async (e) => {
    e.preventDefault();
    if (!activeBlock) return;
    try {
      await recordMecGovernanceAction(facilityId, activeBlock.id, {
        action_type: mecActionType,
        hours_delta: Number(hoursDelta || 0),
        notes: mecNote
      });
      setMecNote('');
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: `Sealed MEC governance action logged for ${activeBlock.block_owner_code}.` });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  const fmtHours = (mins) => `${(Number(mins || 0) / 60).toFixed(1)}h`;

  return (
    <div className="obr-container">
      {/* Header Bar */}
      <div className="obr-header-bar">
        <div className="obr-header-title">
          <div className="obr-title-icon"><CalendarDays size={20} /></div>
          <div>
            <h2>OR Utilization, Block Releases & Financial Yield Report (H7)</h2>
            <p className="obr-subtitle">
              {facilityName} · Raw vs Adjusted Utilization · {config?.release_notice_cutoff_hours ?? 72}h Release Cutoff & MEC Rightsizing Governance
            </p>
          </div>
        </div>
        <div className="obr-header-actions">
          <button type="button" className="obr-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> Utilization Targets
          </button>
          <button type="button" className="obr-btn-secondary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Edition'}
          </button>
          <button type="button" className="obr-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Dispatch H0 Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`obr-banner obr-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="obr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="obr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="obr-telemetry-grid">
          <div className="obr-kpi-card">
            <div className="obr-kpi-label"><CalendarDays size={14} /> Blocks & Utilized Hours</div>
            <div className="obr-kpi-value">{telemetry.blocks_evaluated} Blocks · {telemetry.total_utilized_hours}h</div>
            <div className="obr-kpi-meta">{telemetry.total_abandoned_idle_hours}h idle abandoned capacity</div>
          </div>
          <div className="obr-kpi-card">
            <div className="obr-kpi-label"><Clock size={14} /> Adjusted Block Utilization</div>
            <div className="obr-kpi-value">{Number(telemetry.facility_adjusted_util_pct || 0).toFixed(1)}%</div>
            <div className="obr-kpi-meta">Benchmark floor: {config?.target_block_utilization_pct ?? 75}%</div>
          </div>
          <div className="obr-kpi-card">
            <div className="obr-kpi-label"><DollarSign size={14} /> Block Contribution Margin</div>
            <div className="obr-kpi-value">{fmtCurrency(telemetry.total_contribution_margin_usd)}</div>
            <div className="obr-kpi-meta">Edition: {telemetry.latest_edition_code || 'N/A'}</div>
          </div>
          <div className="obr-kpi-card">
            <div className="obr-kpi-label"><ShieldCheck size={14} /> Recoverable Idle Opportunity</div>
            <div className="obr-kpi-value">{fmtCurrency(telemetry.recoverable_capacity_value_usd)}</div>
            <div className="obr-kpi-meta obr-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Filter Bar */}
      <div className="obr-controls-bar">
        <div className="obr-subtabs">
          <button
            type="button"
            className={`obr-subtab ${activeSubTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('leaderboard')}
          >
            <CalendarDays size={14} /> Block Leaderboard ({scorecards.length})
          </button>
          <button
            type="button"
            className={`obr-subtab ${activeSubTab === 'suites' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('suites')}
          >
            <TrendingUp size={14} /> OR Suite Benchmarks ({suiteBenchmarks.length})
          </button>
          <button
            type="button"
            className={`obr-subtab ${activeSubTab === 'releases' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('releases')}
          >
            <FileText size={14} /> Release Events ({releaseEvents.length})
          </button>
          <button
            type="button"
            className={`obr-subtab ${activeSubTab === 'governance' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('governance')}
          >
            <ClipboardCheck size={14} /> MEC Actions & Dispatches ({mecActions.length + dispatchLogs.length})
          </button>
        </div>

        <div className="obr-controls-right">
          <select
            className="obr-select"
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            aria-label="Block Tier Filter"
          >
            <option value="ALL">All Utilization Tiers</option>
            {CANONICAL_BLOCK_TIERS.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="obr-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            aria-label="Specialty Filter"
          >
            <option value="ALL">All Specialties</option>
            {specialties.map(sp => (
              <option key={sp} value={sp}>{sp}</option>
            ))}
          </select>

          <select
            className="obr-select"
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

      {/* Subtab 1: Block Leaderboard + Time Conservation Inspector */}
      {activeSubTab === 'leaderboard' && (
        <div className="obr-split-layout">
          <div className="obr-card-panel">
            <div className="obr-panel-head">
              <h3>Allocated OR Block Performance Leaderboard</h3>
              <span className="obr-target-pill">
                <Clock size={13} /> Release Cutoff: {config?.release_notice_cutoff_hours ?? 72}h · Idle Val: {fmtCurrency(config?.hourly_margin_benchmark_usd ?? 1250)}/hr
              </span>
            </div>
            <div className="obr-table-wrap">
              <table className="obr-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Block Owner</th>
                    <th>Suite</th>
                    <th>Alloc / Util</th>
                    <th>Raw %</th>
                    <th>Adj %</th>
                    <th>FCOTS</th>
                    <th>Margin / Hr</th>
                    <th>Idle Opp Cost</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecards.map(c => (
                    <tr
                      key={c.id}
                      className={activeBlock?.id === c.id ? 'obr-row-selected' : ''}
                      onClick={() => setSelectedBlockId(c.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="obr-code">#{c.rank_in_facility}</td>
                      <td>
                        <div className="obr-owner-name">{c.block_owner_name}</div>
                        <div className="obr-mono-cell">{c.block_owner_code} · {c.specialty}</div>
                      </td>
                      <td>{c.suite_name}</td>
                      <td>{fmtHours(c.allocated_minutes)} / {fmtHours(c.utilized_in_block_minutes)}</td>
                      <td>{Number(c.raw_utilization_pct).toFixed(1)}%</td>
                      <td className="obr-code">{Number(c.adjusted_utilization_pct).toFixed(1)}%</td>
                      <td>{Number(c.fcots_on_time_pct).toFixed(1)}%</td>
                      <td className="obr-code">{fmtCurrency(c.margin_per_utilized_hour_usd)}/hr</td>
                      <td className="obr-code">{fmtCurrency(c.opportunity_cost_usd)}</td>
                      <td>
                        <span className={`obr-badge ${TIER_BADGE_CLASS[c.block_tier] || 'obr-badge-sky'}`}>
                          {c.block_tier.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {scorecards.length === 0 && (
                    <tr>
                      <td colSpan={10} className="obr-empty-state">No OR blocks match active tier/specialty filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Time Conservation & MEC Action Box */}
          {activeBlock && (
            <div className="obr-card-panel">
              <h3>Time Reconciliation: {activeBlock.block_owner_code}</h3>
              <div className="obr-waterfall-list">
                <div className="obr-wf-row">
                  <span>Gross Allocated Block Time</span>
                  <strong className="obr-code">{fmtHours(activeBlock.allocated_minutes)} ({activeBlock.allocated_minutes}m)</strong>
                </div>
                <div className="obr-wf-row obr-wf-sub">
                  <span>(−) Compliant Released Hours (&ge;72h notice)</span>
                  <span>{fmtHours(activeBlock.on_time_released_minutes)}</span>
                </div>
                <div className="obr-wf-row obr-wf-highlight">
                  <span>Utilized Surgical Hours ({activeBlock.adjusted_utilization_pct}% Adj)</span>
                  <strong className="obr-code">{fmtHours(activeBlock.utilized_in_block_minutes)}</strong>
                </div>
                <div className="obr-wf-row obr-wf-warn">
                  <span>Abandoned Idle Unfilled Hours</span>
                  <strong className="obr-code">{fmtHours(activeBlock.abandoned_idle_minutes)} ({fmtCurrency(activeBlock.opportunity_cost_usd)})</strong>
                </div>
                <div className="obr-wf-row">
                  <span>Recommended MEC Rightsizing</span>
                  <span className={`obr-badge ${TIER_BADGE_CLASS[activeBlock.block_tier] || 'obr-badge-sky'}`}>
                    {activeBlock.rightsizing_action.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div className="obr-rel-mini">
                <h4>Recent Release Events ({activeBlock.block_owner_code})</h4>
                {selectedReleases.length > 0 ? (
                  <ul className="obr-mini-list">
                    {selectedReleases.map(r => (
                      <li key={r.id}>
                        <span><strong>{r.block_date}</strong> · {r.released_hours}h ({r.notice_hours_prior}h prior)</span>
                        <span className={`obr-badge ${RELEASE_BADGE_CLASS[r.release_classification] || 'obr-badge-sky'}`}>
                          {r.release_classification.replace(/_/g, ' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="obr-empty-inline">Zero release events logged for this block owner in period.</p>
                )}
              </div>

              <form className="obr-action-form" onSubmit={handleRecordMec}>
                <h4>Log Sealed MEC Block Governance Action</h4>
                <div className="obr-action-row">
                  <select
                    className="obr-select"
                    value={mecActionType}
                    onChange={(e) => setMecActionType(e.target.value)}
                  >
                    {CANONICAL_MEC_ACTIONS.map(act => (
                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    className="obr-hours-input"
                    type="number"
                    step="0.5"
                    placeholder="Hrs delta"
                    value={hoursDelta}
                    onChange={(e) => setHoursDelta(e.target.value)}
                  />
                  <input
                    className="obr-note-input"
                    type="text"
                    placeholder="Document utilization notice or reallocation rationale (>= 5 chars)..."
                    value={mecNote}
                    onChange={(e) => setMecNote(e.target.value)}
                  />
                  <button type="submit" className="obr-btn-primary">Log MEC Action</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: OR Suite Benchmarks */}
      {activeSubTab === 'suites' && (
        <div className="obr-card-panel">
          <h3>OR Suite Efficiency & Financial Yield Benchmarks</h3>
          <div className="obr-table-wrap">
            <table className="obr-table">
              <thead>
                <tr>
                  <th>Suite Name</th>
                  <th>Target Utilization %</th>
                  <th>Target Turnover</th>
                  <th>FCOTS Target %</th>
                  <th>Target Revenue / OR Hr</th>
                </tr>
              </thead>
              <tbody>
                {suiteBenchmarks.map(b => (
                  <tr key={b.id}>
                    <td className="obr-owner-name">{b.suite_name}</td>
                    <td className="obr-code">{Number(b.target_utilization_pct).toFixed(1)}%</td>
                    <td>{b.target_turnover_minutes} min</td>
                    <td className="obr-code">{Number(b.fcots_target_pct).toFixed(1)}%</td>
                    <td className="obr-code">{fmtCurrency(b.revenue_per_hour_target_usd)}/hr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Release Events */}
      {activeSubTab === 'releases' && (
        <div className="obr-card-panel">
          <h3>Block Release Compliance & Recoverable Capacity Backfills</h3>
          <div className="obr-table-wrap">
            <table className="obr-table">
              <thead>
                <tr>
                  <th>Block Date</th>
                  <th>Owner Code</th>
                  <th>OR Suite</th>
                  <th>Released Hrs</th>
                  <th>Notice Prior</th>
                  <th>Classification</th>
                  <th>Backfilled Hrs</th>
                  <th>Recovered Margin</th>
                </tr>
              </thead>
              <tbody>
                {releaseEvents.map(r => (
                  <tr key={r.id}>
                    <td className="obr-code">{r.block_date}</td>
                    <td className="obr-code">{r.block_owner_code}</td>
                    <td>{r.suite_name}</td>
                    <td>{Number(r.released_hours).toFixed(1)}h</td>
                    <td>{r.notice_hours_prior}h</td>
                    <td>
                      <span className={`obr-badge ${RELEASE_BADGE_CLASS[r.release_classification] || 'obr-badge-sky'}`}>
                        {r.release_classification.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{Number(r.backfilled_hours).toFixed(1)}h</td>
                    <td className="obr-code">{fmtCurrency(r.recovered_margin_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: MEC Governance Actions & H0 Dispatches */}
      {activeSubTab === 'governance' && (
        <div className="obr-stack">
          <div className="obr-card-panel">
            <h3>Medical Executive Committee (MEC) Block Allocation Audit Log</h3>
            <div className="obr-table-wrap">
              <table className="obr-table">
                <thead>
                  <tr>
                    <th>Block Owner</th>
                    <th>Action Type</th>
                    <th>Hours Delta</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {mecActions.map(a => (
                    <tr key={a.id}>
                      <td className="obr-code">{a.block_owner_code}</td>
                      <td><span className="obr-badge obr-badge-sky">{a.action_type}</span></td>
                      <td className="obr-code">{a.hours_delta > 0 ? `+${a.hours_delta}h` : `${a.hours_delta}h`}</td>
                      <td>{a.actor_email} ({a.actor_role})</td>
                      <td>{a.notes}</td>
                      <td className="obr-mono-cell">{a.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="obr-card-panel">
            <h3>H0 Confidential Dispatch History (RPT-H7-OR-BLOCK)</h3>
            <div className="obr-table-wrap">
              <table className="obr-table">
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
                      <td className="obr-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="obr-badge obr-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="obr-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Targets & Cutoff Modal */}
      {isConfigOpen && (
        <div className="obr-modal-backdrop">
          <div className="obr-modal">
            <div className="obr-modal-header">
              <h3>OR Block Utilization & Release Policy Targets</h3>
              <button type="button" className="obr-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="obr-modal-body">
              <div className="obr-form-row">
                <label>Target Block Utilization (%) [20–100]</label>
                <input
                  type="number"
                  min={20}
                  max={100}
                  step="0.5"
                  value={draftConfig.target_block_utilization_pct}
                  onChange={(e) => setDraftConfig({ ...draftConfig, target_block_utilization_pct: Number(e.target.value) })}
                />
              </div>
              <div className="obr-form-row">
                <label>Compliant Release Cutoff Notice (Hours prior)</label>
                <input
                  type="number"
                  min={12}
                  value={draftConfig.release_notice_cutoff_hours}
                  onChange={(e) => setDraftConfig({ ...draftConfig, release_notice_cutoff_hours: Number(e.target.value) })}
                />
              </div>
              <div className="obr-form-row">
                <label>Max Allowable Turnover Credit (Minutes)</label>
                <input
                  type="number"
                  min={10}
                  value={draftConfig.max_allowable_turnover_mins}
                  onChange={(e) => setDraftConfig({ ...draftConfig, max_allowable_turnover_mins: Number(e.target.value) })}
                />
              </div>
              <div className="obr-form-row">
                <label>Idle Opportunity Valuation ($ / OR Hour)</label>
                <input
                  type="number"
                  min={0}
                  step="50"
                  value={draftConfig.hourly_margin_benchmark_usd}
                  onChange={(e) => setDraftConfig({ ...draftConfig, hourly_margin_benchmark_usd: Number(e.target.value) })}
                />
              </div>
              <div className="obr-modal-footer">
                <button type="button" className="obr-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="obr-btn-primary">Save Targets</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
