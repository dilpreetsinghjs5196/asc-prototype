import React, { useState, useMemo, useEffect } from 'react';
import {
  Landmark,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  X,
  Send,
  Lock,
  Check,
  FileText
} from 'lucide-react';
import {
  VALID_SIGNOFF_TRANSITIONS,
  getMcrConfig,
  updateMcrConfig,
  getMcrTelemetry,
  getMcrEditions,
  getMcrPnlBridge,
  getMcrCashBridge,
  getMcrVarianceCommentary,
  getMcrSignoffs,
  getMcrDispatchLogs,
  compileMonthlyCfoReport,
  verifyVarianceCommentary,
  advanceCfoSignoff,
  dispatchMonthlyCfoDigest,
  normalizeFacilityId
} from '../services/monthlyCfoReportService';
import './MonthlyCfoReportView.css';

export default function MonthlyCfoReportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('pnl'); // 'pnl' | 'cash' | 'variances' | 'signoffs'
  const [selectedEditionId, setSelectedEditionId] = useState('mcr-ed-202611');
  const [varianceNotes, setVarianceNotes] = useState({});
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [editions, setEditions] = useState([]);
  const [pnlLines, setPnlLines] = useState([]);
  const [cashBridge, setCashBridge] = useState(null);
  const [variances, setVariances] = useState([]);
  const [signoffs, setSignoffs] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    close_day_of_month: 5,
    min_trust_score_for_signoff: 75,
    require_dq_trust_gate: true
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, eds, sgn, dsp] = await Promise.all([
          getMcrConfig(facilityId),
          getMcrTelemetry(facilityId),
          getMcrEditions(facilityId),
          getMcrSignoffs(facilityId),
          getMcrDispatchLogs(facilityId)
        ]);
        const targetEd = eds.find(e => e.id === selectedEditionId) || eds[0];
        const [pnl, cash, vars] = targetEd
          ? await Promise.all([
              getMcrPnlBridge(facilityId, targetEd.id),
              getMcrCashBridge(facilityId, targetEd.id),
              getMcrVarianceCommentary(facilityId, targetEd.id)
            ])
          : [[], null, []];

        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setEditions(eds);
        setPnlLines(pnl);
        setCashBridge(cash);
        setVariances(vars);
        setSignoffs(sgn);
        setDispatchLogs(dsp);
        setDraftConfig({
          close_day_of_month: cfg.close_day_of_month,
          min_trust_score_for_signoff: cfg.min_trust_score_for_signoff,
          require_dq_trust_gate: cfg.require_dq_trust_gate
        });
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Monthly CFO Report: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, selectedEditionId, refreshKey]);

  const activeEdition = useMemo(() => {
    return editions.find(e => e.id === selectedEditionId) || editions[0] || null;
  }, [editions, selectedEditionId]);

  const nextCloseTarget = activeEdition
    ? (VALID_SIGNOFF_TRANSITIONS[activeEdition.signoff_status] || [])[0] || null
    : null;

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleCompileEdition = async () => {
    setIsCompiling(true);
    try {
      const period = `2026-${String(Math.min(12, 11 + editions.length)).padStart(2, '0')}`;
      const res = await compileMonthlyCfoReport(facilityId, { fiscal_period: period });
      setSelectedEditionId(res.edition.id);
      setRefreshKey(k => k + 1);
      showToast('success', `Compiled ${res.edition.report_code} ($${res.edition.ebitda_usd.toLocaleString('en-US')} EBITDA / ${res.edition.ebitda_margin_pct}%).`);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleVerifyVariance = async (item) => {
    try {
      const note = varianceNotes[item.id] || item.driver_summary;
      const updated = await verifyVarianceCommentary(facilityId, item.id, {
        driver_summary: note,
        actor_email: 'controller@naplessurgery.com'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Verified variance explanation ${updated.variance_code} (${updated.line_code}).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleAdvanceSignoff = async () => {
    if (!activeEdition || !nextCloseTarget) return;
    try {
      const res = await advanceCfoSignoff(facilityId, activeEdition.id, {
        target_status: nextCloseTarget
      });
      setRefreshKey(k => k + 1);
      showToast('success', `${res.edition.report_code} certified to ${res.edition.signoff_status} (${res.signoff_entry.sha256_seal.slice(0, 20)}...).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDispatchDigest = async () => {
    if (!activeEdition) return;
    try {
      const log = await dispatchMonthlyCfoDigest(facilityId, activeEdition.id, {
        delivery_channel: 'EMAIL_DIGEST',
        export_format: 'PDF',
        recipient_count: 4
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Dispatched ${log.rpt_execution_code} via ${log.delivery_channel}.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateMcrConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', 'Updated Monthly CFO Close Trust Gate & Variance thresholds.');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const signoffBadge = (st) => {
    if (st === 'LOCKED_CLOSED') return 'mcr-badge-emerald';
    if (st === 'CFO_SIGNED_OFF' || st === 'CONTROLLER_VERIFIED') return 'mcr-badge-sky';
    return 'mcr-badge-amber';
  };

  return (
    <div className="mcr-container">
      {/* Header Bar */}
      <div className="mcr-header-bar">
        <div className="mcr-header-title">
          <div className="mcr-title-icon">
            <Landmark size={20} />
          </div>
          <div>
            <h2>Monthly CFO Financial & Operational Report</h2>
            <p className="mcr-subtitle">
              {facilityName} · {activeEdition?.report_code} ({activeEdition?.fiscal_period}) · Completed Cases: {activeEdition?.completed_cases} · AR DSO: {activeEdition?.ar_days_dso}d
            </p>
          </div>
        </div>
        <div className="mcr-header-actions">
          <button className="mcr-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={15} />
            Close Rules
          </button>
          <button className="mcr-btn-secondary" onClick={handleDispatchDigest}>
            <Send size={15} />
            Dispatch H0 Package
          </button>
          <button className="mcr-btn-primary" onClick={handleCompileEdition} disabled={isCompiling}>
            <FileText size={15} />
            {isCompiling ? 'Closing Period...' : 'Compile Next Month'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`mcr-banner mcr-banner-${banner.type}`}>
          <div className="mcr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="mcr-banner-close" onClick={() => setBanner({ ...banner, show: false })}><X size={14} /></button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && activeEdition && (
        <div className="mcr-telemetry-grid">
          <div className="mcr-kpi-card">
            <div className="mcr-kpi-label"><DollarSign size={14} className="text-sky-600" />Net Patient Revenue</div>
            <div className="mcr-kpi-value">${Number(activeEdition.net_patient_revenue_usd).toLocaleString('en-US')}</div>
            <div className="mcr-kpi-meta">Gross: ${Number(activeEdition.gross_charges_usd).toLocaleString('en-US')} · Budget Var: +${Number(activeEdition.budget_variance_usd).toLocaleString('en-US')}</div>
          </div>

          <div className="mcr-kpi-card">
            <div className="mcr-kpi-label"><TrendingUp size={14} className="text-emerald-600" />Monthly Operating EBITDA</div>
            <div className="mcr-kpi-value">${Number(activeEdition.ebitda_usd).toLocaleString('en-US')}</div>
            <div className="mcr-kpi-meta">Margin: <strong>{activeEdition.ebitda_margin_pct}%</strong> (Target: {telemetry.ebitda_target_margin_pct}%)</div>
          </div>

          <div className="mcr-kpi-card">
            <div className="mcr-kpi-label"><Landmark size={14} className="text-emerald-600" />Ending Cash & Liquidity</div>
            <div className="mcr-kpi-value">${Number(activeEdition.ending_cash_usd).toLocaleString('en-US')}</div>
            <div className="mcr-kpi-meta">DCOH: {activeEdition.days_cash_on_hand}d · Cash/EBITDA: {activeEdition.cash_to_ebitda_conversion_pct}%</div>
          </div>

          <div className="mcr-kpi-card">
            <div className="mcr-kpi-label"><ShieldCheck size={14} className="text-amber-600" />Period Close & Trust Gate</div>
            <div className="mcr-kpi-value-badge">
              <span className={`mcr-badge ${signoffBadge(activeEdition.signoff_status)}`}>{activeEdition.signoff_status}</span>
            </div>
            <div className="mcr-kpi-meta mcr-mono-cell" title={activeEdition.sha256_report_seal}>
              DQ: {activeEdition.dq_trust_score}% · {activeEdition.sha256_report_seal?.slice(0, 18)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Bar + Close Action */}
      <div className="mcr-controls-bar">
        <div className="mcr-subtabs">
          <button className={`mcr-subtab ${activeSubTab === 'pnl' ? 'active' : ''}`} onClick={() => setActiveSubTab('pnl')}>
            <TrendingUp size={14} />P&L Waterfall
          </button>
          <button className={`mcr-subtab ${activeSubTab === 'cash' ? 'active' : ''}`} onClick={() => setActiveSubTab('cash')}>
            <Landmark size={14} />Cash Flow & AR Bridge
          </button>
          <button className={`mcr-subtab ${activeSubTab === 'variances' ? 'active' : ''}`} onClick={() => setActiveSubTab('variances')}>
            <AlertTriangle size={14} />Variance Commentary ({variances.length})
          </button>
          <button className={`mcr-subtab ${activeSubTab === 'signoffs' ? 'active' : ''}`} onClick={() => setActiveSubTab('signoffs')}>
            <Lock size={14} />Close Sign-Offs & Dispatches ({signoffs.length})
          </button>
        </div>

        <div className="mcr-controls-right">
          <select className="mcr-select" value={selectedEditionId} onChange={(e) => setSelectedEditionId(e.target.value)}>
            {editions.map(ed => (
              <option key={ed.id} value={ed.id}>{ed.fiscal_period} ({ed.signoff_status})</option>
            ))}
          </select>
          {nextCloseTarget && (
            <button className="mcr-btn-primary" onClick={handleAdvanceSignoff}>
              <Check size={14} />
              Advance → {nextCloseTarget}
            </button>
          )}
        </div>
      </div>

      {/* Subtab 1: P&L Bridge */}
      {activeSubTab === 'pnl' && (
        <div className="mcr-card-panel">
          <h3>GAAP Management P&L & Budget Variance Bridge</h3>
          <div className="mcr-table-wrap">
            <table className="mcr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>P&L Line Item</th>
                  <th>Section</th>
                  <th>Actual ($)</th>
                  <th>Budget ($)</th>
                  <th>Variance ($)</th>
                  <th>Variance (%)</th>
                </tr>
              </thead>
              <tbody>
                {pnlLines.map(line => (
                  <tr key={line.id} className={line.section === 'EBITDA' ? 'mcr-ebitda-row' : ''}>
                    <td className="mcr-code">{line.line_code}</td>
                    <td><strong>{line.line_label}</strong></td>
                    <td>{line.section}</td>
                    <td>${Number(line.actual_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(line.budget_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(line.variance_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`mcr-badge ${line.is_favorable ? 'mcr-badge-emerald' : 'mcr-badge-rose'}`}>
                        {line.variance_pct > 0 ? `+${line.variance_pct}%` : `${line.variance_pct}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: Cash Flow Bridge */}
      {activeSubTab === 'cash' && cashBridge && (
        <div className="mcr-card-panel">
          <h3>Monthly Cash Roll-Forward & GL Variance Check</h3>
          <div className="mcr-cash-grid">
            <div className="mcr-cash-row"><span>Opening Cash Balance</span><strong>${Number(cashBridge.opening_cash_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
            <div className="mcr-cash-row"><span>(+) Operating Collections Inflows</span><strong className="text-emerald-600">+${Number(cashBridge.operating_cash_inflows_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
            <div className="mcr-cash-row"><span>(-) Payroll & AP Supplier Outflows</span><strong className="text-rose-600">-${Number(cashBridge.payroll_ap_outflows_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
            <div className="mcr-cash-row"><span>(-) CapEx & Debt Service Outflows</span><strong className="text-rose-600">-${Number(cashBridge.capex_debt_outflows_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
            <div className="mcr-cash-row mcr-cash-total"><span>Closing Reconciled Cash Balance</span><strong>${Number(cashBridge.closing_cash_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div>
            <div className="mcr-cash-row"><span>Sub-Ledger to Bank GL Variance</span><span className="mcr-badge mcr-badge-emerald">${Number(cashBridge.cash_variance_against_gl_usd).toFixed(2)} (RECONCILED)</span></div>
          </div>
        </div>
      )}

      {/* Subtab 3: Material Variance Commentary */}
      {activeSubTab === 'variances' && (
        <div className="mcr-card-panel">
          <h3>Material Budget Variances Requiring Steward Verification (≥5%)</h3>
          {variances.length === 0 ? (
            <div className="mcr-empty-state">Zero open material variances for this period.</div>
          ) : (
            <div className="mcr-var-list">
              {variances.map(v => (
                <div key={v.id} className="mcr-var-card">
                  <div className="mcr-var-top">
                    <span className="mcr-code">{v.variance_code} · {v.line_code}</span>
                    <span className={`mcr-badge ${v.status === 'VERIFIED' ? 'mcr-badge-emerald' : 'mcr-badge-amber'}`}>{v.status}</span>
                  </div>
                  <h4>{v.line_label} (+${Number(v.variance_usd).toLocaleString('en-US')} / +{v.variance_pct}%)</h4>
                  <p>{v.driver_summary}</p>
                  <div className="mcr-var-action-hint">Action: {v.corrective_action} · Owner: <strong>{v.owner_role}</strong></div>
                  {v.status === 'OPEN_EXPLANATION' && (
                    <div className="mcr-var-controls">
                      <input
                        type="text"
                        className="mcr-note-input"
                        placeholder="Confirm/update variance driver explanation (>=5 chars)..."
                        value={varianceNotes[v.id] ?? v.driver_summary}
                        onChange={(e) => setVarianceNotes({ ...varianceNotes, [v.id]: e.target.value })}
                      />
                      <button className="mcr-btn-primary" onClick={() => handleVerifyVariance(v)}>
                        <Check size={14} />Verify Explanation
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subtab 4: Close Sign-Offs & Dispatches */}
      {activeSubTab === 'signoffs' && (
        <div className="mcr-stack">
          <div className="mcr-card-panel">
            <h3>Dual-Key Period Close Certification Ledger</h3>
            <div className="mcr-table-wrap">
              <table className="mcr-table">
                <thead>
                  <tr><th>Timestamp</th><th>Transition</th><th>Actor & Role</th><th>Notes</th><th>SHA-256 Seal</th></tr>
                </thead>
                <tbody>
                  {signoffs.map(s => (
                    <tr key={s.id}>
                      <td>{new Date(s.created_at).toLocaleString()}</td>
                      <td><code>{s.from_status} → {s.to_status}</code></td>
                      <td>{s.actor_email} ({s.actor_role})</td>
                      <td>{s.notes}</td>
                      <td className="mcr-mono-cell" title={s.sha256_seal}>{s.sha256_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mcr-card-panel">
            <h3>H0 Executive Distribution Dispatches ({dispatchLogs.length})</h3>
            <div className="mcr-table-wrap">
              <table className="mcr-table">
                <thead>
                  <tr><th>H0 Execution #</th><th>Channel & Format</th><th>Recipients</th><th>Status</th><th>SHA-256 Seal</th></tr>
                </thead>
                <tbody>
                  {dispatchLogs.map(d => (
                    <tr key={d.id}>
                      <td className="mcr-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel} · {d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="mcr-badge mcr-badge-emerald">{d.dispatch_status}</span></td>
                      <td className="mcr-mono-cell" title={d.sha256_sync_seal}>{d.sha256_sync_seal.slice(0, 20)}...</td>
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
        <div className="mcr-modal-backdrop">
          <div className="mcr-modal">
            <div className="mcr-modal-header">
              <h3>Monthly CFO Close & Trust Gate Rules</h3>
              <button className="mcr-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="mcr-modal-body">
              <div className="mcr-form-row">
                <label>Target Close Day of Month (1–28)</label>
                <input type="number" min="1" max="28" value={draftConfig.close_day_of_month} onChange={(e) => setDraftConfig({ ...draftConfig, close_day_of_month: Number(e.target.value) })} />
              </div>
              <div className="mcr-form-row">
                <label>Min DQ Trust Score for CFO Sign-Off (%)</label>
                <input type="number" min="50" max="100" value={draftConfig.min_trust_score_for_signoff} onChange={(e) => setDraftConfig({ ...draftConfig, min_trust_score_for_signoff: Number(e.target.value) })} />
              </div>
              <label className="mcr-checkbox-row">
                <input type="checkbox" checked={draftConfig.require_dq_trust_gate} onChange={(e) => setDraftConfig({ ...draftConfig, require_dq_trust_gate: e.target.checked })} />
                <span>Require G2 Financial Completeness Gate Pass Before CFO Lock</span>
              </label>
              <div className="mcr-form-row">
                <label>Secret Key Mask</label>
                <code>{config.client_secret_encrypted}</code>
              </div>
              <div className="mcr-modal-footer">
                <button type="button" className="mcr-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="mcr-btn-primary">Save Close Policy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
