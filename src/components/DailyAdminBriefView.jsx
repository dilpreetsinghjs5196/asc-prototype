import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  X,
  Activity,
  DollarSign,
  Users,
  Send,
  Check,
  Clock,
  FileCheck2
} from 'lucide-react';
import {
  getDabConfig,
  updateDabConfig,
  getDabTelemetry,
  getDabDailySnapshots,
  getDabActionItems,
  getDabOrSuitePulse,
  getDabSurgeonRoster,
  getDabAcknowledgments,
  getDabDispatchLogs,
  compileDailyAdminBrief,
  updateDabActionStatus,
  signOffDailyBrief,
  dispatchDailyBriefDigest,
  normalizeFacilityId
} from '../services/dailyAdminBriefService';
import './DailyAdminBriefView.css';

export default function DailyAdminBriefView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('blockers'); // 'blockers' | 'or_pulse' | 'surgeons' | 'history'
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('snap-20261127');
  const [resolutionNotes, setResolutionNotes] = useState({});
  const [isCompiling, setIsCompiling] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [orPulse, setOrPulse] = useState([]);
  const [surgeonRoster, setSurgeonRoster] = useState([]);
  const [acknowledgments, setAcknowledgments] = useState([]);
  const [dispatchLogs, setDispatchLogs] = useState([]);

  const [draftConfig, setDraftConfig] = useState({
    brief_cutoff_hour: 6,
    prebill_hold_alert_limit: 3,
    or_idle_alert_minutes: 45,
    include_cash_snapshot: true,
    include_dq_gate_status: true
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, snaps, acts, rooms, docs, acks, dlog] = await Promise.all([
          getDabConfig(facilityId),
          getDabTelemetry(facilityId),
          getDabDailySnapshots(facilityId),
          getDabActionItems(facilityId),
          getDabOrSuitePulse(facilityId),
          getDabSurgeonRoster(facilityId),
          getDabAcknowledgments(facilityId),
          getDabDispatchLogs(facilityId)
        ]);
        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setSnapshots(snaps);
        setActionItems(acts);
        setOrPulse(rooms);
        setSurgeonRoster(docs);
        setAcknowledgments(acks);
        setDispatchLogs(dlog);
        setDraftConfig({
          brief_cutoff_hour: cfg.brief_cutoff_hour,
          prebill_hold_alert_limit: cfg.prebill_hold_alert_limit,
          or_idle_alert_minutes: cfg.or_idle_alert_minutes,
          include_cash_snapshot: cfg.include_cash_snapshot,
          include_dq_gate_status: cfg.include_dq_gate_status
        });
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Daily Admin Brief: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  const activeSnapshot = useMemo(() => {
    return snapshots.find(s => s.id === selectedSnapshotId) || snapshots[0] || null;
  }, [snapshots, selectedSnapshotId]);

  const scopedActions = useMemo(() => {
    if (!activeSnapshot) return [];
    const list = actionItems.filter(a => a.snapshot_id === activeSnapshot.id);
    return list.length > 0 ? list : actionItems;
  }, [actionItems, activeSnapshot]);

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleCompileBrief = async () => {
    setIsCompiling(true);
    try {
      const nextDate = new Date(Date.now() + snapshots.length * 86400000).toISOString().slice(0, 10);
      const compiled = await compileDailyAdminBrief(facilityId, {
        brief_date: nextDate,
        actor_email: 'admin@naplessurgery.com'
      });
      setSelectedSnapshotId(compiled.id);
      setRefreshKey(k => k + 1);
      showToast('success', `Compiled edition ${compiled.brief_code} (${compiled.readiness_status}) · Seal: ${compiled.sha256_brief_seal.slice(0, 22)}...`);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleActionTransition = async (act, nextStatus) => {
    try {
      const note = resolutionNotes[act.id] || '';
      const res = await updateDabActionStatus(facilityId, act.id, {
        status: nextStatus,
        resolution_note: note,
        actor_email: 'admin@naplessurgery.com',
        actor_role: 'Facility Administrator'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `${act.action_code} marked ${nextStatus}. Brief readiness is now ${res.snapshot_readiness}.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSignOff = async () => {
    if (!activeSnapshot) return;
    try {
      const ack = await signOffDailyBrief(facilityId, activeSnapshot.id, {
        actor_email: 'admin@naplessurgery.com',
        actor_role: 'Facility Administrator',
        notes: '06:30 AM Morning Operational Huddle Reviewed & Signed Off'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Administrator Sign-Off recorded for ${activeSnapshot.brief_code} (${ack.sha256_seal.slice(0, 20)}...).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleDispatchDigest = async () => {
    if (!activeSnapshot) return;
    try {
      const log = await dispatchDailyBriefDigest(facilityId, activeSnapshot.id, {
        delivery_channel: 'EMAIL_DIGEST',
        export_format: 'PDF',
        recipient_count: 4,
        actor_email: 'admin@naplessurgery.com'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Dispatched ${log.rpt_execution_code} via ${log.delivery_channel} (${log.recipient_count} recipients).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateDabConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', 'Updated Daily Admin Brief delivery & threshold configuration.');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const readinessBadge = (status) => {
    switch (status) {
      case 'GREEN_ON_TRACK': return 'dab-badge-emerald';
      case 'AMBER_ATTENTION_REQUIRED': return 'dab-badge-amber';
      case 'RED_ACTION_CRITICAL': return 'dab-badge-rose';
      default: return 'dab-badge-slate';
    }
  };

  const priorityBadge = (tier) => {
    switch (tier) {
      case 'P0_CRITICAL': return 'dab-badge-rose';
      case 'P1_HIGH': return 'dab-badge-amber';
      default: return 'dab-badge-sky';
    }
  };

  return (
    <div className="dab-container">
      {/* Header Bar */}
      <div className="dab-header-bar">
        <div className="dab-header-title">
          <div className="dab-title-icon">
            <CalendarDays size={20} />
          </div>
          <div>
            <h2>Daily Administrator Operational & Financial Brief</h2>
            <p className="dab-subtitle">
              {facilityName} · {activeSnapshot?.brief_code || 'DAB'} ({activeSnapshot?.brief_date}) · {activeSnapshot?.executive_headline}
            </p>
          </div>
        </div>
        <div className="dab-header-actions">
          <button className="dab-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={15} />
            Brief Rules
          </button>
          <button className="dab-btn-secondary" onClick={handleDispatchDigest}>
            <Send size={15} />
            Dispatch H0 Digest
          </button>
          <button className="dab-btn-primary" onClick={handleCompileBrief} disabled={isCompiling}>
            <Activity size={15} />
            {isCompiling ? 'Compiling Brief...' : 'Compile Fresh Edition'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`dab-banner dab-banner-${banner.type}`}>
          <div className="dab-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="dab-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && activeSnapshot && (
        <div className="dab-telemetry-grid">
          <div className="dab-kpi-card">
            <div className="dab-kpi-label">
              <Clock size={14} className="text-sky-600" />
              OR Prime Utilization & FCOTS
            </div>
            <div className="dab-kpi-value">{Number(activeSnapshot.or_prime_time_util_pct).toFixed(1)}%</div>
            <div className="dab-kpi-meta">
              FCOTS: {Number(activeSnapshot.fcots_on_time_rate_pct).toFixed(0)}% · Avg Turnover: {activeSnapshot.avg_turnover_minutes}m
            </div>
          </div>

          <div className="dab-kpi-card">
            <div className="dab-kpi-label">
              <DollarSign size={14} className="text-emerald-600" />
              Projected Day Contribution Margin
            </div>
            <div className="dab-kpi-value">
              ${Number(activeSnapshot.projected_contribution_margin_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="dab-kpi-meta">
              Gross Net Rev: ${Number(activeSnapshot.projected_net_revenue_usd).toLocaleString('en-US')} ({activeSnapshot.scheduled_cases_count} cases)
            </div>
          </div>

          <div className="dab-kpi-card">
            <div className="dab-kpi-label">
              <AlertTriangle size={14} className="text-amber-600" />
              Open Admin Blockers & Holds
            </div>
            <div className="dab-kpi-value">{telemetry.open_action_count}</div>
            <div className="dab-kpi-meta">
              Pre-bill holds: {activeSnapshot.unbilled_hold_cases_count} · IEQ backlog: {activeSnapshot.open_ieq_exceptions_count}
            </div>
          </div>

          <div className="dab-kpi-card">
            <div className="dab-kpi-label">
              <ShieldCheck size={14} className="text-emerald-600" />
              Day Readiness & Seal
            </div>
            <div className="dab-kpi-value-badge">
              <span className={`dab-badge ${readinessBadge(activeSnapshot.readiness_status)}`}>
                {activeSnapshot.readiness_status}
              </span>
            </div>
            <div className="dab-kpi-meta dab-mono-cell" title={activeSnapshot.sha256_brief_seal}>
              DQ: {activeSnapshot.dq_trust_score}% · {activeSnapshot.sha256_brief_seal?.slice(0, 18)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Bar */}
      <div className="dab-controls-bar">
        <div className="dab-subtabs">
          <button className={`dab-subtab ${activeSubTab === 'blockers' ? 'active' : ''}`} onClick={() => setActiveSubTab('blockers')}>
            <AlertTriangle size={14} />
            Morning Action Blockers ({scopedActions.length})
          </button>
          <button className={`dab-subtab ${activeSubTab === 'or_pulse' ? 'active' : ''}`} onClick={() => setActiveSubTab('or_pulse')}>
            <Activity size={14} />
            OR Suite Pulse ({orPulse.length})
          </button>
          <button className={`dab-subtab ${activeSubTab === 'surgeons' ? 'active' : ''}`} onClick={() => setActiveSubTab('surgeons')}>
            <Users size={14} />
            Surgeon Day Roster ({surgeonRoster.length})
          </button>
          <button className={`dab-subtab ${activeSubTab === 'history' ? 'active' : ''}`} onClick={() => setActiveSubTab('history')}>
            <FileCheck2 size={14} />
            Sign-Offs & H0 Dispatches ({acknowledgments.length})
          </button>
        </div>

        <button className="dab-btn-primary" onClick={handleSignOff}>
          <Check size={15} />
          Admin Morning Sign-Off
        </button>
      </div>

      {/* Subtab 1: Action Blockers */}
      {activeSubTab === 'blockers' && (
        <div className="dab-card-panel">
          <h3>Prioritized Pre-Start Blockers & Backfill Opportunities</h3>
          <div className="dab-action-list">
            {scopedActions.map(act => (
              <div key={act.id} className="dab-action-row">
                <div className="dab-action-main">
                  <div className="dab-action-top">
                    <span className="dab-code">{act.action_code}</span>
                    <span className={`dab-badge ${priorityBadge(act.priority_tier)}`}>{act.priority_tier}</span>
                    <span className="dab-badge dab-badge-slate">{act.domain}</span>
                    <span className={`dab-badge ${act.status === 'RESOLVED' ? 'dab-badge-emerald' : 'dab-badge-amber'}`}>{act.status}</span>
                  </div>
                  <h4>{act.title}</h4>
                  <p>{act.detail_summary}</p>
                  <div className="dab-action-meta">
                    Owner: <strong>{act.owner_role}</strong> ({act.assignee_email}) · Exposure: <strong>${Number(act.financial_impact_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
                {(act.status === 'OPEN' || act.status === 'ACKNOWLEDGED') && (
                  <div className="dab-action-controls">
                    <input
                      type="text"
                      className="dab-note-input"
                      placeholder="Resolution / escalation note (>=5 chars)..."
                      value={resolutionNotes[act.id] || ''}
                      onChange={(e) => setResolutionNotes({ ...resolutionNotes, [act.id]: e.target.value })}
                    />
                    <div className="dab-btn-group">
                      <button className="dab-btn-secondary" onClick={() => handleActionTransition(act, 'ACKNOWLEDGED')}>Ack</button>
                      <button className="dab-btn-primary" onClick={() => handleActionTransition(act, 'RESOLVED')}>Resolve</button>
                      <button className="dab-btn-secondary" onClick={() => handleActionTransition(act, 'DEFERRED')}>Defer</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 2: OR Suite Pulse */}
      {activeSubTab === 'or_pulse' && (
        <div className="dab-card-panel">
          <h3>OR Suite Capacity, FCOTS Delays & Turnover Averages</h3>
          <div className="dab-table-wrap">
            <table className="dab-table">
              <thead>
                <tr>
                  <th>Suite</th>
                  <th>Primary Specialty</th>
                  <th>Cases</th>
                  <th>Booked / Prime Min</th>
                  <th>Utilization %</th>
                  <th>FCOTS Delay</th>
                  <th>Turnover Avg</th>
                  <th>Open Backfill</th>
                </tr>
              </thead>
              <tbody>
                {orPulse.map(rm => (
                  <tr key={rm.id}>
                    <td className="dab-code">{rm.room_code}</td>
                    <td>{rm.specialty_primary}</td>
                    <td>{rm.scheduled_cases}</td>
                    <td>{rm.booked_minutes} / {rm.available_prime_minutes} min</td>
                    <td><strong>{Number(rm.utilization_pct).toFixed(1)}%</strong></td>
                    <td>
                      <span className={`dab-badge ${rm.fcots_delay_minutes > 0 ? 'dab-badge-amber' : 'dab-badge-emerald'}`}>
                        {rm.fcots_delay_minutes} min
                      </span>
                    </td>
                    <td>{rm.avg_turnover_minutes} min</td>
                    <td>{rm.open_backfill_minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Surgeon Day Roster */}
      {activeSubTab === 'surgeons' && (
        <div className="dab-card-panel">
          <h3>Today’s Operating Surgeon Roster & Readiness Checks</h3>
          <div className="dab-table-wrap">
            <table className="dab-table">
              <thead>
                <tr>
                  <th>Surgeon</th>
                  <th>Specialty</th>
                  <th>Scheduled Cases</th>
                  <th>Doc Holds</th>
                  <th>Implant Alerts</th>
                  <th>Projected Day Margin</th>
                  <th>Readiness</th>
                </tr>
              </thead>
              <tbody>
                {surgeonRoster.map(sr => (
                  <tr key={sr.id}>
                    <td><strong>{sr.surgeon_name}</strong></td>
                    <td>{sr.specialty}</td>
                    <td>{sr.scheduled_cases}</td>
                    <td>{sr.doc_hold_count}</td>
                    <td>{sr.implant_alert_count}</td>
                    <td>${Number(sr.projected_margin_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`dab-badge ${sr.readiness_flag === 'CLEARED' ? 'dab-badge-emerald' : sr.readiness_flag === 'CRITICAL_MISSING' ? 'dab-badge-rose' : 'dab-badge-amber'}`}>
                        {sr.readiness_flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Acknowledgments & Dispatches */}
      {activeSubTab === 'history' && (
        <div className="dab-stack">
          <div className="dab-card-panel">
            <h3>Administrator Sign-Off & Action Provenance</h3>
            <div className="dab-table-wrap">
              <table className="dab-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action Type</th>
                    <th>Actor & Role</th>
                    <th>Notes</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {acknowledgments.map(k => (
                    <tr key={k.id}>
                      <td>{new Date(k.created_at).toLocaleString()}</td>
                      <td><span className="dab-badge dab-badge-sky">{k.action_type}</span></td>
                      <td>{k.actor_email} ({k.actor_role})</td>
                      <td>{k.notes}</td>
                      <td className="dab-mono-cell" title={k.sha256_seal}>{k.sha256_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dab-card-panel">
            <h3>H0 Daily Brief Digest Dispatches ({dispatchLogs.length})</h3>
            <div className="dab-table-wrap">
              <table className="dab-table">
                <thead>
                  <tr>
                    <th>H0 Execution #</th>
                    <th>Channel & Format</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>Dispatched By</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchLogs.map(d => (
                    <tr key={d.id}>
                      <td className="dab-code">{d.rpt_execution_code}</td>
                      <td>{d.delivery_channel} · {d.export_format}</td>
                      <td>{d.recipient_count}</td>
                      <td><span className="dab-badge dab-badge-emerald">{d.dispatch_status}</span></td>
                      <td>{d.dispatched_by}</td>
                      <td className="dab-mono-cell" title={d.sha256_sync_seal}>{d.sha256_sync_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Brief Rules Modal */}
      {isConfigOpen && config && (
        <div className="dab-modal-backdrop">
          <div className="dab-modal">
            <div className="dab-modal-header">
              <h3>Daily Admin Brief Compilation & Alert Rules</h3>
              <button className="dab-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="dab-modal-body">
              <div className="dab-form-row">
                <label>Morning Delivery Cutoff Hour (0–23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={draftConfig.brief_cutoff_hour}
                  onChange={(e) => setDraftConfig({ ...draftConfig, brief_cutoff_hour: Number(e.target.value) })}
                />
              </div>
              <div className="dab-form-row">
                <label>Pre-Bill Hold Alert Limit (Cases)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={draftConfig.prebill_hold_alert_limit}
                  onChange={(e) => setDraftConfig({ ...draftConfig, prebill_hold_alert_limit: Number(e.target.value) })}
                />
              </div>
              <div className="dab-form-row">
                <label>Secret Key Mask</label>
                <code>{config.client_secret_encrypted}</code>
              </div>
              <div className="dab-modal-footer">
                <button type="button" className="dab-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="dab-btn-primary">Save Brief Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
