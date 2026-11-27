import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  X,
  Send,
  Search,
  Layers,
  Building2,
  History,
  Check
} from 'lucide-react';
import {
  CANONICAL_LEAKAGE_CATEGORIES,
  CANONICAL_OPPORTUNITY_STATUSES,
  getWlrConfig,
  updateWlrConfig,
  getWlrTelemetry,
  getWlrEditions,
  getWlrPriorityOpportunities,
  getWlrCategoryBreakdown,
  getWlrPayerSummary,
  getWlrWeeklyActions,
  getWlrDispatchLogs,
  compileWeeklyLeakageReport,
  updateOpportunityRecoveryStatus,
  dispatchWeeklyLeakageDigest,
  normalizeFacilityId
} from '../services/weeklyLeakageReportService';
import './WeeklyRevenueLeakageReportView.css';

export default function WeeklyRevenueLeakageReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('queue'); // 'queue' | 'categories' | 'payers' | 'audit'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [recoveryInputs, setRecoveryInputs] = useState({});
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [editions, setEditions] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [payers, setPayers] = useState([]);
  const [actions, setActions] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    materiality_threshold_usd: 250,
    include_unbilled_cases: true,
    include_implant_carveouts: true,
    include_payer_underpayments: true
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, eds, opps, cats, pays, acts, dsp] = await Promise.all([
          getWlrConfig(facilityId),
          getWlrTelemetry(facilityId),
          getWlrEditions(facilityId),
          getWlrPriorityOpportunities(facilityId),
          getWlrCategoryBreakdown(facilityId),
          getWlrPayerSummary(facilityId),
          getWlrWeeklyActions(facilityId),
          getWlrDispatchLogs(facilityId)
        ]);
        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setEditions(eds);
        setOpportunities(opps);
        setCategories(cats);
        setPayers(pays);
        setActions(acts);
        setDispatchLogs(dsp);
        setDraftConfig({
          materiality_threshold_usd: cfg.materiality_threshold_usd,
          include_unbilled_cases: cfg.include_unbilled_cases,
          include_implant_carveouts: cfg.include_implant_carveouts,
          include_payer_underpayments: cfg.include_payer_underpayments
        });
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Weekly Leakage Report: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  const activeEdition = editions[0] || null;

  const filteredOpps = useMemo(() => {
    return opportunities.filter(opp => {
      if (categoryFilter !== 'ALL' && opp.leakage_category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && opp.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${opp.opportunity_code} ${opp.payer_name} ${opp.surgeon_name} ${opp.case_or_claim_ref} ${opp.leakage_category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [opportunities, categoryFilter, statusFilter, searchQuery]);

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const res = await compileWeeklyLeakageReport(facilityId, { actor_email: 'cfo@naplessurgery.com' });
      setRefreshKey(k => k + 1);
      showToast('success', `Compiled weekly edition ${res.edition.week_code} ($${res.edition.expected_net_recovery_usd.toLocaleString('en-US')} expected recovery).`);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleDispatchDigest = async () => {
    if (!activeEdition) return;
    try {
      const log = await dispatchWeeklyLeakageDigest(facilityId, activeEdition.id, {
        delivery_channel: 'EMAIL_DIGEST',
        export_format: 'XLSX',
        recipient_count: 3,
        actor_email: 'cfo@naplessurgery.com'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Dispatched Monday H0 leakage digest ${log.rpt_execution_code} (${log.sha256_sync_seal.slice(0, 20)}...).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleUpdateOpp = async (opp, nextStatus) => {
    const input = recoveryInputs[opp.id] || {};
    try {
      const res = await updateOpportunityRecoveryStatus(facilityId, opp.id, {
        status: nextStatus,
        recovered_usd: nextStatus === 'RECOVERED' ? Number(input.amount ?? opp.expected_net_recovery_usd) : 0,
        resolution_note: input.note || (nextStatus === 'SUBMITTED_PAYER' ? 'Submitted payer appeal packet' : ''),
        actor_email: 'rcm_lead@naplessurgery.com',
        actor_role: 'RCM Billing Lead'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `${res.opportunity.opportunity_code} updated to ${nextStatus}. Edition WoW recovered: $${res.edition_realized_wow_usd.toLocaleString('en-US')}.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateWlrConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', 'Updated Weekly Revenue Leakage materiality & ranking rules.');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const tierBadge = (tier) => {
    if (tier === 'P0_IMMEDIATE') return 'wlr-badge-rose';
    if (tier === 'P1_THIS_WEEK') return 'wlr-badge-amber';
    return 'wlr-badge-sky';
  };

  const statusBadge = (status) => {
    if (status === 'RECOVERED') return 'wlr-badge-emerald';
    if (status === 'IN_RECOVERY' || status === 'SUBMITTED_PAYER') return 'wlr-badge-sky';
    if (status === 'WRITTEN_OFF') return 'wlr-badge-slate';
    return 'wlr-badge-amber';
  };

  return (
    <div className="wlr-container">
      {/* Header Bar */}
      <div className="wlr-header-bar">
        <div className="wlr-header-title">
          <div className="wlr-title-icon">
            <TrendingUp size={20} />
          </div>
          <div>
            <h2>Weekly Revenue Leakage & Prioritized Recovery Report</h2>
            <p className="wlr-subtitle">
              {facilityName} · {activeEdition?.week_code || 'WLR'} ({activeEdition?.week_start_date} → {activeEdition?.week_end_date}) · WoW Delta: {activeEdition?.wow_leakage_delta_pct}%
            </p>
          </div>
        </div>
        <div className="wlr-header-actions">
          <button className="wlr-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={15} />
            Report Rules
          </button>
          <button className="wlr-btn-secondary" onClick={handleDispatchDigest}>
            <Send size={15} />
            Dispatch H0 Digest
          </button>
          <button className="wlr-btn-primary" onClick={handleCompileEdition} disabled={isCompiling}>
            <TrendingUp size={15} />
            {isCompiling ? 'Compiling Week...' : 'Compile Weekly Report'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`wlr-banner wlr-banner-${banner.type}`}>
          <div className="wlr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="wlr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && activeEdition && (
        <div className="wlr-telemetry-grid">
          <div className="wlr-kpi-card">
            <div className="wlr-kpi-label">
              <AlertTriangle size={14} className="text-amber-600" />
              Gross Identified Leakage
            </div>
            <div className="wlr-kpi-value">
              ${Number(activeEdition.total_identified_leakage_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="wlr-kpi-meta">Materiality floor: ${telemetry.materiality_threshold_usd}</div>
          </div>

          <div className="wlr-kpi-card">
            <div className="wlr-kpi-label">
              <DollarSign size={14} className="text-emerald-600" />
              Expected Net Recovery
            </div>
            <div className="wlr-kpi-value">
              ${Number(activeEdition.expected_net_recovery_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="wlr-kpi-meta">Probability-weighted recoverable dollars</div>
          </div>

          <div className="wlr-kpi-card">
            <div className="wlr-kpi-label">
              <CheckCircle2 size={14} className="text-sky-600" />
              Realized Recovered (WoW)
            </div>
            <div className="wlr-kpi-value">
              ${Number(activeEdition.realized_recovered_wow_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="wlr-kpi-meta">Open P0 Immediate items: {telemetry.open_p0_count}</div>
          </div>

          <div className="wlr-kpi-card">
            <div className="wlr-kpi-label">
              <ShieldCheck size={14} className="text-emerald-600" />
              Audit Seal & Edition
            </div>
            <div className="wlr-kpi-value">{activeEdition.week_code}</div>
            <div className="wlr-kpi-meta wlr-mono-cell" title={activeEdition.sha256_report_seal}>
              Seal: {activeEdition.sha256_report_seal?.slice(0, 20)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Bar & Filters */}
      <div className="wlr-controls-bar">
        <div className="wlr-subtabs">
          <button className={`wlr-subtab ${activeSubTab === 'queue' ? 'active' : ''}`} onClick={() => setActiveSubTab('queue')}>
            <TrendingUp size={14} />
            Prioritized Recovery Queue ({opportunities.length})
          </button>
          <button className={`wlr-subtab ${activeSubTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveSubTab('categories')}>
            <Layers size={14} />
            Category Breakdown ({categories.length})
          </button>
          <button className={`wlr-subtab ${activeSubTab === 'payers' ? 'active' : ''}`} onClick={() => setActiveSubTab('payers')}>
            <Building2 size={14} />
            Payer Exposure ({payers.length})
          </button>
          <button className={`wlr-subtab ${activeSubTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveSubTab('audit')}>
            <History size={14} />
            Recovery Log & Dispatches ({actions.length})
          </button>
        </div>

        <div className="wlr-filter-group">
          <div className="wlr-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search claim, surgeon, payer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="wlr-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="ALL">All Categories</option>
            {CANONICAL_LEAKAGE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="wlr-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses</option>
            {CANONICAL_OPPORTUNITY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Subtab 1: Prioritized Recovery Queue */}
      {activeSubTab === 'queue' && (
        <div className="wlr-card-panel">
          <h3>Urgency & Recovery-Weighted Action Queue</h3>
          <div className="wlr-opp-list">
            {filteredOpps.map(opp => (
              <div key={opp.id} className="wlr-opp-row">
                <div className="wlr-opp-main">
                  <div className="wlr-opp-top">
                    <span className="wlr-code">{opp.opportunity_code}</span>
                    <span className={`wlr-badge ${tierBadge(opp.priority_tier)}`}>{opp.priority_tier}</span>
                    <span className="wlr-badge wlr-badge-slate">{opp.leakage_category}</span>
                    <span className={`wlr-badge ${statusBadge(opp.status)}`}>{opp.status}</span>
                    <span className="wlr-filing-tag">Timely Filing: {opp.days_to_timely_filing_limit}d</span>
                  </div>
                  <div className="wlr-opp-title">
                    {opp.case_or_claim_ref} · <strong>{opp.payer_name}</strong> · {opp.surgeon_name}
                  </div>
                  <div className="wlr-opp-meta">
                    Gross: <strong>${Number(opp.gross_leakage_usd).toLocaleString('en-US')}</strong> · Prob: {opp.recovery_probability_pct}% · Expected Net: <strong>${Number(opp.expected_net_recovery_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> · Score: {opp.priority_score}
                  </div>
                </div>

                {opp.status !== 'RECOVERED' && opp.status !== 'WRITTEN_OFF' && (
                  <div className="wlr-opp-controls">
                    <div className="wlr-inline-inputs">
                      <input
                        type="number"
                        className="wlr-amt-input"
                        placeholder={`Recovered ($${opp.expected_net_recovery_usd})`}
                        value={recoveryInputs[opp.id]?.amount ?? ''}
                        onChange={(e) => setRecoveryInputs({
                          ...recoveryInputs,
                          [opp.id]: { ...recoveryInputs[opp.id], amount: e.target.value }
                        })}
                      />
                      <input
                        type="text"
                        className="wlr-note-input"
                        placeholder="Recovery note (>=5 chars)..."
                        value={recoveryInputs[opp.id]?.note ?? ''}
                        onChange={(e) => setRecoveryInputs({
                          ...recoveryInputs,
                          [opp.id]: { ...recoveryInputs[opp.id], note: e.target.value }
                        })}
                      />
                    </div>
                    <div className="wlr-btn-group">
                      <button className="wlr-btn-secondary" onClick={() => handleUpdateOpp(opp, 'SUBMITTED_PAYER')}>Submit Payer</button>
                      <button className="wlr-btn-primary" onClick={() => handleUpdateOpp(opp, 'RECOVERED')}>
                        <Check size={14} />
                        Mark Recovered
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 2: Category Breakdown */}
      {activeSubTab === 'categories' && (
        <div className="wlr-card-panel">
          <h3>Leakage Exposure by Category & WoW Trend</h3>
          <div className="wlr-table-wrap">
            <table className="wlr-table">
              <thead>
                <tr>
                  <th>Leakage Category</th>
                  <th>Items</th>
                  <th>Gross Exposure ($)</th>
                  <th>Expected Net Recovery ($)</th>
                  <th>WoW Delta</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td className="wlr-code">{c.leakage_category}</td>
                    <td>{c.item_count}</td>
                    <td>${Number(c.gross_leakage_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td><strong>${Number(c.expected_net_recovery_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
                    <td>
                      <span className={`wlr-badge ${c.wow_change_pct <= 0 ? 'wlr-badge-emerald' : 'wlr-badge-rose'}`}>
                        {c.wow_change_pct > 0 ? `+${c.wow_change_pct}%` : `${c.wow_change_pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Payer Concentration */}
      {activeSubTab === 'payers' && (
        <div className="wlr-card-panel">
          <h3>Payer Concentration & Timely Filing Urgency</h3>
          <div className="wlr-table-wrap">
            <table className="wlr-table">
              <thead>
                <tr>
                  <th>Payer</th>
                  <th>Open Items</th>
                  <th>Gross Exposure ($)</th>
                  <th>Expected Net Recovery ($)</th>
                  <th>Shortest Timely Filing Window</th>
                </tr>
              </thead>
              <tbody>
                {payers.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.payer_name}</strong></td>
                    <td>{p.item_count}</td>
                    <td>${Number(p.gross_leakage_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(p.expected_net_recovery_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`wlr-badge ${p.min_timely_filing_days <= 14 ? 'wlr-badge-rose' : 'wlr-badge-sky'}`}>
                        {p.min_timely_filing_days} days remaining
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Recovery Audit & Dispatches */}
      {activeSubTab === 'audit' && (
        <div className="wlr-stack">
          <div className="wlr-card-panel">
            <h3>Immutable Recovery Action & Payout Provenance</h3>
            <div className="wlr-table-wrap">
              <table className="wlr-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Recovered ($)</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map(a => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                      <td><span className="wlr-badge wlr-badge-sky">{a.action_type}</span></td>
                      <td>{a.actor_email}</td>
                      <td>${Number(a.recovered_amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td>{a.notes}</td>
                      <td className="wlr-mono-cell" title={a.sha256_seal}>{a.sha256_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="wlr-card-panel">
            <h3>H0 Monday Digest Dispatches ({dispatchLogs.length})</h3>
            <div className="wlr-table-wrap">
              <table className="wlr-table">
                <thead>
                  <tr>
                    <th>H0 Execution #</th>
                    <th>Channel & Format</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLogs.map(d => (
                    <tr key={d.id}>
                      <td className="wlr-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel} · {d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="wlr-badge wlr-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="wlr-mono-cell" title={d.sha256_sync_seal}>{d.sha256_sync_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {isConfigOpen && config && (
        <div className="wlr-modal-backdrop">
          <div className="wlr-modal">
            <div className="wlr-modal-header">
              <h3>Weekly Leakage Materiality & Inclusion Rules</h3>
              <button className="wlr-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="wlr-modal-body">
              <div className="wlr-form-row">
                <label>Materiality Threshold ($ USD)</label>
                <input
                  type="number"
                  min="0"
                  step="25"
                  value={draftConfig.materiality_threshold_usd}
                  onChange={(e) => setDraftConfig({ ...draftConfig, materiality_threshold_usd: Number(e.target.value) })}
                />
              </div>
              <label className="wlr-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftConfig.include_unbilled_cases}
                  onChange={(e) => setDraftConfig({ ...draftConfig, include_unbilled_cases: e.target.checked })}
                />
                <span>Include Completed Unbilled Surgical Encounters</span>
              </label>
              <label className="wlr-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftConfig.include_implant_carveouts}
                  onChange={(e) => setDraftConfig({ ...draftConfig, include_implant_carveouts: e.target.checked })}
                />
                <span>Include High-Cost Implant Carveout Omissions</span>
              </label>
              <div className="wlr-form-row">
                <label>Secret Key Mask</label>
                <code>{config.client_secret_encrypted}</code>
              </div>
              <div className="wlr-modal-footer">
                <button type="button" className="wlr-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="wlr-btn-primary">Save Rules</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
