import React, { useState, useMemo, useEffect } from 'react';
import {
  ShieldAlert,
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
  CANONICAL_URGENCY_TIERS,
  CANONICAL_APPEAL_ACTIONS,
  getDarConfig,
  updateDarConfig,
  getDarTelemetry,
  getDarEditions,
  getDarAgingSnapshots,
  getDarDenialWorkqueue,
  getDarCarcRootCauses,
  getDarAppealResolutions,
  getDarDispatchLogs,
  compileDenialArEdition,
  recordAppealResolutionAction,
  dispatchDenialArDigest,
  normalizeFacilityId
} from '../services/denialArReportService';
import './DenialArReportView.css';

const URGENCY_BADGE_CLASS = {
  CRITICAL_FILING_THREAT: 'dar-badge-rose',
  HIGH_VALUE_APPEAL: 'dar-badge-amber',
  STANDARD_FOLLOWUP: 'dar-badge-sky',
  LOW_RECOVERY_WRITEOFF: 'dar-badge-emerald'
};

export default function DenialArReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('workqueue'); // 'workqueue' | 'aging' | 'carc' | 'appeals'
  const [selectedEditionId, setSelectedEditionId] = useState('dar-ed-202611');
  const [selectedUrgency, setSelectedUrgency] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedDenialId, setSelectedDenialId] = useState('den-1');
  const [appealAction, setAppealAction] = useState('SUBMIT_LEVEL_1_APPEAL');
  const [claimedRecovery, setClaimedRecovery] = useState('24300');
  const [actionNote, setActionNote] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [editions, setEditions] = useState([]);
  const [agingBuckets, setAgingBuckets] = useState([]);
  const [workqueue, setWorkqueue] = useState([]);
  const [carcClusters, setCarcClusters] = useState([]);
  const [resolutions, setResolutions] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    dso_benchmark_days: 35,
    max_ar_over_90_pct: 12,
    target_first_pass_resolution_pct: 92,
    timely_filing_warning_days: 14
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, eds, ress, dsps] = await Promise.all([
          getDarConfig(facilityId),
          getDarTelemetry(facilityId),
          getDarEditions(facilityId),
          getDarAppealResolutions(facilityId),
          getDarDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [buckets, items, carcs] = targetEd
          ? await Promise.all([
              getDarAgingSnapshots(facilityId, targetEd.id),
              getDarDenialWorkqueue(facilityId, {
                edition_id: targetEd.id,
                urgency_tier: selectedUrgency,
                denial_category: selectedCategory
              }),
              getDarCarcRootCauses(facilityId, targetEd.id)
            ])
          : [[], [], []];

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setEditions(eds);
        setAgingBuckets(buckets);
        setWorkqueue(items);
        setCarcClusters(carcs);
        setResolutions(ress);
        setDispatchLogs(dsps);
        setDraftConfig({
          dso_benchmark_days: cfg.dso_benchmark_days,
          max_ar_over_90_pct: cfg.max_ar_over_90_pct,
          target_first_pass_resolution_pct: cfg.target_first_pass_resolution_pct,
          timely_filing_warning_days: cfg.timely_filing_warning_days
        });
        if (items.length > 0) {
          setSelectedDenialId(prev => (items.some(i => i.id === prev) ? prev : items[0].id));
        }
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Denial & AR Report: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, selectedUrgency, selectedCategory, refreshKey]);

  const activeItem = useMemo(
    () => workqueue.find(w => w.id === selectedDenialId) || workqueue[0] || null,
    [workqueue, selectedDenialId]
  );

  const denialCategories = useMemo(
    () => Array.from(new Set(workqueue.map(w => w.denial_category))),
    [workqueue]
  );

  const handleSelectItem = (item) => {
    setSelectedDenialId(item.id);
    setClaimedRecovery(String(item.expected_recovery_usd));
  };

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compileDenialArEdition(facilityId, { period_code: '2026-12' });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Compiled conserved Denial & AR edition ${res.edition.edition_code} (DSO ${res.edition.calculated_dso_days}d).`
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
      const log = await dispatchDenialArDigest(facilityId, edId);
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Denial & AR report packet dispatched via H0 (${log.rpt_execution_code}).`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateDarConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: 'DSO benchmark & timely filing warning thresholds updated cleanly.' });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleRecordAppeal = async (e) => {
    e.preventDefault();
    if (!activeItem) return;
    try {
      await recordAppealResolutionAction(facilityId, activeItem.id, {
        action_type: appealAction,
        claimed_recovery_usd: Number(claimedRecovery || 0),
        notes: actionNote
      });
      setActionNote('');
      setRefreshKey(k => k + 1);
      setBanner({ show: true, type: 'success', message: `Sealed appeal/resolution logged for ${activeItem.denial_code}.` });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const fmtCurrency = (v) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v || 0));

  return (
    <div className="dar-container">
      {/* Header Bar */}
      <div className="dar-header-bar">
        <div className="dar-header-title">
          <div className="dar-title-icon"><ShieldAlert size={20} /></div>
          <div>
            <h2>Denials, Appeals & GAAP AR Aging Report (H8)</h2>
            <p className="dar-subtitle">
              {facilityName} · Conserved 6-Bucket AR Schedule · DSO Target (&le;{config?.dso_benchmark_days ?? 35}d) & Timely Filing Escalation
            </p>
          </div>
        </div>
        <div className="dar-header-actions">
          <button type="button" className="dar-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={14} /> AR & DSO Targets
          </button>
          <button type="button" className="dar-btn-secondary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={14} /> {isCompiling ? 'Compiling...' : 'Compile Edition'}
          </button>
          <button type="button" className="dar-btn-primary" onClick={handleDispatch}>
            <Send size={14} /> Dispatch H0 Packet
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`dar-banner dar-banner-${banner.type === 'error' ? 'error' : 'success'}`}>
          <div className="dar-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button type="button" className="dar-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="dar-telemetry-grid">
          <div className="dar-kpi-card">
            <div className="dar-kpi-label"><DollarSign size={14} /> Total Gross AR & DSO</div>
            <div className="dar-kpi-value">{fmtCurrency(telemetry.total_gross_ar_usd)} · {telemetry.calculated_dso_days}d</div>
            <div className="dar-kpi-meta">Target DSO benchmark: {config?.dso_benchmark_days ?? 35} days</div>
          </div>
          <div className="dar-kpi-card">
            <div className="dar-kpi-label"><Clock size={14} /> AR Aged &gt; 90 Days</div>
            <div className="dar-kpi-value">{Number(telemetry.ar_over_90_pct || 0).toFixed(1)}% ({fmtCurrency(telemetry.ar_over_90_usd)})</div>
            <div className="dar-kpi-meta">Max ceiling: {config?.max_ar_over_90_pct ?? 12}%</div>
          </div>
          <div className="dar-kpi-card">
            <div className="dar-kpi-label"><AlertTriangle size={14} /> Open Denied Exposure</div>
            <div className="dar-kpi-value">{fmtCurrency(telemetry.open_denied_exposure_usd)}</div>
            <div className="dar-kpi-meta">{telemetry.critical_filing_threats} critical timely-filing alert(s)</div>
          </div>
          <div className="dar-kpi-card">
            <div className="dar-kpi-label"><ShieldCheck size={14} /> Expected Appeal Recovery</div>
            <div className="dar-kpi-value">{fmtCurrency(telemetry.expected_appeal_recovery_usd)}</div>
            <div className="dar-kpi-meta dar-mono-cell">
              {telemetry.latest_sync_seal ? `${telemetry.latest_sync_seal.slice(0, 22)}...` : 'No seal'}
            </div>
          </div>
        </div>
      )}

      {/* Subtabs & Filter Bar */}
      <div className="dar-controls-bar">
        <div className="dar-subtabs">
          <button
            type="button"
            className={`dar-subtab ${activeSubTab === 'workqueue' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('workqueue')}
          >
            <ShieldAlert size={14} /> Denial Workqueue ({workqueue.length})
          </button>
          <button
            type="button"
            className={`dar-subtab ${activeSubTab === 'aging' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('aging')}
          >
            <Clock size={14} /> GAAP 6-Bucket Aging ({agingBuckets.length})
          </button>
          <button
            type="button"
            className={`dar-subtab ${activeSubTab === 'carc' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('carc')}
          >
            <FileText size={14} /> CARC Clusters ({carcClusters.length})
          </button>
          <button
            type="button"
            className={`dar-subtab ${activeSubTab === 'appeals' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('appeals')}
          >
            <ClipboardCheck size={14} /> Appeals & Dispatches ({resolutions.length + dispatchLogs.length})
          </button>
        </div>

        <div className="dar-controls-right">
          <select
            className="dar-select"
            value={selectedUrgency}
            onChange={(e) => setSelectedUrgency(e.target.value)}
            aria-label="Urgency Filter"
          >
            <option value="ALL">All Urgency Tiers</option>
            {CANONICAL_URGENCY_TIERS.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="dar-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Category Filter"
          >
            <option value="ALL">All Denial Categories</option>
            {denialCategories.map(cat => (
              <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            className="dar-select"
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

      {/* Subtab 1: Denial Workqueue + Recovery Inspector */}
      {activeSubTab === 'workqueue' && (
        <div className="dar-split-layout">
          <div className="dar-card-panel">
            <div className="dar-panel-head">
              <h3>Prioritized Denial Recovery Workqueue</h3>
              <span className="dar-target-pill">
                <Clock size={13} /> Filing Warning: &le;{config?.timely_filing_warning_days ?? 14} days remaining
              </span>
            </div>
            <div className="dar-table-wrap">
              <table className="dar-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Denial / Claim</th>
                    <th>Payer</th>
                    <th>CARC</th>
                    <th>Exposure</th>
                    <th>Prob</th>
                    <th>Exp Recovery</th>
                    <th>Filing</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {workqueue.map(item => (
                    <tr
                      key={item.id}
                      className={activeItem?.id === item.id ? 'dar-row-selected' : ''}
                      onClick={() => handleSelectItem(item)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="dar-code">#{item.rank_in_facility}</td>
                      <td>
                        <div className="dar-item-title">{item.denial_code} · {item.claim_number}</div>
                        <div className="dar-mono-cell">{item.denial_category.replace(/_/g, ' ')}</div>
                      </td>
                      <td>{item.payer_name}</td>
                      <td className="dar-code">CARC {item.carc_code}</td>
                      <td>{fmtCurrency(item.denied_exposure_usd)}</td>
                      <td>{Number(item.recovery_probability_pct).toFixed(0)}%</td>
                      <td className="dar-code">{fmtCurrency(item.expected_recovery_usd)}</td>
                      <td className="dar-code">{item.days_to_timely_filing}d</td>
                      <td>
                        <span className={`dar-badge ${URGENCY_BADGE_CLASS[item.urgency_tier] || 'dar-badge-sky'}`}>
                          {item.urgency_tier.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {workqueue.length === 0 && (
                    <tr>
                      <td colSpan={9} className="dar-empty-state">No denials match the active urgency/category filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recovery Waterfall & Appeal Action Box */}
          {activeItem && (
            <div className="dar-card-panel">
              <h3>Claim Dispute Inspector: {activeItem.denial_code}</h3>
              <div className="dar-detail-list">
                <div className="dar-dt-row">
                  <span>Billed Claim Charge ({activeItem.claim_number})</span>
                  <strong className="dar-code">{fmtCurrency(activeItem.billed_amount_usd)}</strong>
                </div>
                <div className="dar-dt-row dar-dt-warn">
                  <span>Denied Exposure at Risk (CARC {activeItem.carc_code})</span>
                  <strong className="dar-code">{fmtCurrency(activeItem.denied_exposure_usd)}</strong>
                </div>
                <div className="dar-dt-row dar-dt-highlight">
                  <span>Expected Appeal Recovery ({activeItem.recovery_probability_pct}%)</span>
                  <strong className="dar-code">{fmtCurrency(activeItem.expected_recovery_usd)}</strong>
                </div>
                <div className="dar-dt-row">
                  <span>Assigned Recovery Team / Appeal State</span>
                  <span className="dar-badge dar-badge-sky">{activeItem.assigned_team} · {activeItem.appeal_status}</span>
                </div>
                <div className="dar-dt-row">
                  <span>Statutory Filing Window Remaining</span>
                  <strong className="dar-code">{activeItem.days_to_timely_filing} days</strong>
                </div>
              </div>

              <form className="dar-action-form" onSubmit={handleRecordAppeal}>
                <h4>Record Appeal Filing or Approved Write-Off</h4>
                <div className="dar-action-row">
                  <select
                    className="dar-select"
                    value={appealAction}
                    onChange={(e) => setAppealAction(e.target.value)}
                  >
                    {CANONICAL_APPEAL_ACTIONS.map(act => (
                      <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <input
                    className="dar-amount-input"
                    type="number"
                    min="0"
                    step="50"
                    placeholder="Recovery $"
                    value={claimedRecovery}
                    onChange={(e) => setClaimedRecovery(e.target.value)}
                  />
                  <input
                    className="dar-note-input"
                    type="text"
                    placeholder="Enter operative note link, auth reference, or write-off justification (>= 5 chars)..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                  <button type="submit" className="dar-btn-primary">Log Appeal</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: GAAP 6-Bucket AR Aging */}
      {activeSubTab === 'aging' && (
        <div className="dar-card-panel">
          <h3>Conserved GAAP 6-Bucket Accounts Receivable (AR) Aging Schedule</h3>
          <div className="dar-table-wrap">
            <table className="dar-table">
              <thead>
                <tr>
                  <th>Aging Bucket</th>
                  <th>Claim Count</th>
                  <th>Gross AR ($)</th>
                  <th>Share %</th>
                  <th>Expected Collectible ($)</th>
                  <th>Risk Tier</th>
                </tr>
              </thead>
              <tbody>
                {agingBuckets.map(b => (
                  <tr key={b.id}>
                    <td className="dar-item-title">{b.bucket_label}</td>
                    <td>{b.claim_count}</td>
                    <td className="dar-code">{fmtCurrency(b.ar_amount_usd)}</td>
                    <td className="dar-code">{Number(b.share_pct).toFixed(1)}%</td>
                    <td>{fmtCurrency(b.expected_collectible_usd)}</td>
                    <td>
                      <span className={`dar-badge ${b.bucket_code === '0_30' ? 'dar-badge-emerald' : b.bucket_code === '181_PLUS' ? 'dar-badge-rose' : 'dar-badge-amber'}`}>
                        {b.risk_category.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: CARC Root-Cause Clusters */}
      {activeSubTab === 'carc' && (
        <div className="dar-card-panel">
          <h3>CARC Reason-Code Root-Cause Denial Clusters</h3>
          <div className="dar-table-wrap">
            <table className="dar-table">
              <thead>
                <tr>
                  <th>CARC Code</th>
                  <th>Description</th>
                  <th>Primary Driver Payer</th>
                  <th>Claims</th>
                  <th>Denied Dollars</th>
                  <th>Avg Recovery %</th>
                </tr>
              </thead>
              <tbody>
                {carcClusters.map(c => (
                  <tr key={c.id}>
                    <td className="dar-code">CARC {c.carc_code}</td>
                    <td>{c.carc_description}</td>
                    <td>{c.primary_payer}</td>
                    <td>{c.claim_count}</td>
                    <td className="dar-code">{fmtCurrency(c.denied_dollars_usd)}</td>
                    <td className="dar-code">{Number(c.avg_recovery_pct).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Appeals Audit & H0 Dispatches */}
      {activeSubTab === 'appeals' && (
        <div className="dar-stack">
          <div className="dar-card-panel">
            <h3>Sealed Appeals, Rebill & Write-Off Decision Log</h3>
            <div className="dar-table-wrap">
              <table className="dar-table">
                <thead>
                  <tr>
                    <th>Denial Code</th>
                    <th>Action Type</th>
                    <th>Claimed Recovery</th>
                    <th>Actor</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutions.map(r => (
                    <tr key={r.id}>
                      <td className="dar-code">{r.denial_code}</td>
                      <td><span className="dar-badge dar-badge-sky">{r.action_type}</span></td>
                      <td className="dar-code">{fmtCurrency(r.claimed_recovery_usd)}</td>
                      <td>{r.actor_email} ({r.actor_role})</td>
                      <td>{r.notes}</td>
                      <td className="dar-mono-cell">{r.sha256_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dar-card-panel">
            <h3>H0 Confidential Dispatch History (RPT-H8-DENIAL-AR)</h3>
            <div className="dar-table-wrap">
              <table className="dar-table">
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
                      <td className="dar-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel}</td>
                      <td>{d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="dar-badge dar-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="dar-mono-cell">{d.sha256_sync_seal.slice(0, 22)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AR & DSO Targets Modal */}
      {isConfigOpen && (
        <div className="dar-modal-backdrop">
          <div className="dar-modal">
            <div className="dar-modal-header">
              <h3>DSO, Aging Ceiling & Timely Filing SLA Thresholds</h3>
              <button type="button" className="dar-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="dar-modal-body">
              <div className="dar-form-row">
                <label>DSO Benchmark Target (Days &ge; 10)</label>
                <input
                  type="number"
                  min={10}
                  value={draftConfig.dso_benchmark_days}
                  onChange={(e) => setDraftConfig({ ...draftConfig, dso_benchmark_days: Number(e.target.value) })}
                />
              </div>
              <div className="dar-form-row">
                <label>Max AR Aged &gt; 90 Days Ceiling (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step="0.5"
                  value={draftConfig.max_ar_over_90_pct}
                  onChange={(e) => setDraftConfig({ ...draftConfig, max_ar_over_90_pct: Number(e.target.value) })}
                />
              </div>
              <div className="dar-form-row">
                <label>Timely Filing Critical Warning Window (Days &ge; 3)</label>
                <input
                  type="number"
                  min={3}
                  value={draftConfig.timely_filing_warning_days}
                  onChange={(e) => setDraftConfig({ ...draftConfig, timely_filing_warning_days: Number(e.target.value) })}
                />
              </div>
              <div className="dar-form-row">
                <label>First-Pass Clean Resolution Target (%)</label>
                <input
                  type="number"
                  min={50}
                  max={100}
                  step="0.5"
                  value={draftConfig.target_first_pass_resolution_pct}
                  onChange={(e) => setDraftConfig({ ...draftConfig, target_first_pass_resolution_pct: Number(e.target.value) })}
                />
              </div>
              <div className="dar-modal-footer">
                <button type="button" className="dar-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="dar-btn-primary">Save Targets</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
