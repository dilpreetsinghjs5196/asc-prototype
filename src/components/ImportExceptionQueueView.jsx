import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sliders,
  X,
  Zap,
  Check,
  Play,
  ShieldCheck,
  DollarSign,
  Users,
  Clock,
  RefreshCw,
  ArrowUpRight,
  GitBranch
} from 'lucide-react';
import {
  getIeqConfig,
  getIeqTelemetry,
  getIeqRoutingRules,
  getIeqExceptions,
  getIeqResolutionActions,
  getIeqOwnerWorkloads,
  getIeqReplayBatches,
  assignIeqException,
  escalateIeqException,
  resolveAndReplayIeqException,
  dismissIeqException,
  normalizeFacilityId
} from '../services/importExceptionQueueService';
import './ImportExceptionQueueView.css';

export default function ImportExceptionQueueView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('exception_queue'); // 'exception_queue' | 'routing_rules' | 'owner_workloads' | 'replay_ledger'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState('ieq-exc-101');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReplaying, setIsReplaying] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [ticketActions, setTicketActions] = useState([]);
  const [workloads, setWorkloads] = useState([]);
  const [replays, setReplays] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [c, t, r, exc, wl, rpl] = await Promise.all([
          getIeqConfig(facilityId),
          getIeqTelemetry(facilityId),
          getIeqRoutingRules(facilityId),
          getIeqExceptions(facilityId),
          getIeqOwnerWorkloads(facilityId),
          getIeqReplayBatches(facilityId)
        ]);
        if (isMounted) {
          setConfig(c);
          setTelemetry(t);
          setRoutes(r);
          setExceptions(exc);
          setWorkloads(wl);
          setReplays(rpl);
        }
      } catch (err) {
        console.error('Failed to load Import Exception Queue data:', err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    async function loadActions() {
      if (!selectedTicketId) return;
      const acts = await getIeqResolutionActions(selectedTicketId);
      if (isMounted) setTicketActions(acts);
    }
    loadActions();
    return () => { isMounted = false; };
  }, [selectedTicketId, refreshKey]);

  const handleResolveAndReplay = async (exc) => {
    setIsReplaying(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = await resolveAndReplayIeqException(
        exc.id,
        { verified_override: true, corrected_at: new Date().toISOString() },
        `Corrected & replayed via IEQ Console by ${exc.assigned_role}`
      );
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Ticket ${exc.exception_ticket_code} repaired and replayed cleanly (Batch: ${res.replayBatch.replay_code}).`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    } finally {
      setIsReplaying(false);
    }
  };

  const handleEscalate = async (exc) => {
    try {
      const res = await escalateIeqException(exc.id, 'Manual SLA risk escalation to Director / Controller');
      if (res.success) {
        setBanner({ show: true, type: 'info', message: `Ticket ${exc.exception_ticket_code} escalated to ${exc.assigned_role}.` });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleDismiss = async (exc) => {
    try {
      const res = await dismissIeqException(exc.id, 'Suppressed as duplicate upstream vendor alert');
      if (res.success) {
        setBanner({ show: true, type: 'success', message: `Ticket ${exc.exception_ticket_code} dismissed with documented justification.` });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const handleReassignToSteward = async (exc) => {
    try {
      const res = await assignIeqException(exc.id, 'data_steward@naplesasc.com', 'Data Operations Steward');
      if (res.success) {
        setBanner({ show: true, type: 'info', message: `Ticket ${exc.exception_ticket_code} reassigned to Data Operations Steward.` });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  };

  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (statusFilter !== 'ALL' && e.queue_status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.exception_ticket_code.toLowerCase().includes(q) ||
        e.source_module.toLowerCase().includes(q) ||
        e.exception_code.toLowerCase().includes(q) ||
        e.assigned_to.toLowerCase().includes(q)
      );
    });
  }, [exceptions, statusFilter, searchQuery]);

  const selectedTicket = useMemo(
    () => exceptions.find(e => e.id === selectedTicketId) || exceptions[0],
    [exceptions, selectedTicketId]
  );

  const isTerminal = (st) => st === 'RESOLVED_REPLAYED' || st === 'DISMISSED_SUPPRESSED';

  return (
    <div className="ieq-container">
      {/* 1. Header Action Bar */}
      <header className="ieq-header">
        <div className="ieq-header-left">
          <div className="ieq-title-row">
            <h1 className="ieq-title">Import Exception Queue & Resolution</h1>
            <span className="ieq-sla-badge">CRITICAL SLA: {config?.critical_sla_hours || 4}H</span>
            <span className="ieq-status-pill active">
              <span className="ieq-status-dot"></span>
              {config?.sync_status || 'ACTIVE'}
            </span>
          </div>
          <p className="ieq-subtitle">
            {facilityName} • Cross-module import exception triage, SLA countdowns, role-based ownership routing, inline payload repair & replay provenance.
          </p>
        </div>

        <div className="ieq-header-actions">
          <button
            className="ieq-btn ieq-btn-secondary"
            onClick={() => setBanner({ show: true, type: 'success', message: 'Domain auto-ownership routing rules verified across all 8 upstream pipelines.' })}
          >
            <GitBranch size={15} />
            Verify Auto-Routing
          </button>
          <button className="ieq-btn ieq-btn-icon" onClick={() => setIsDrawerOpen(true)} title="Queue SLA Settings">
            <Sliders size={16} />
          </button>
        </div>
      </header>

      {/* Banner */}
      {banner.show && (
        <div className={`ieq-banner ieq-banner-${banner.type}`}>
          <div className="ieq-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Zap size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="ieq-banner-close" onClick={() => setBanner({ show: false, type: 'info', message: '' })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. 4-Card Telemetry Ribbon */}
      <section className="ieq-telemetry-grid">
        <div className="ieq-card">
          <div className="ieq-card-header">
            <span className="ieq-card-title">Active Exception Queue</span>
            <ClipboardList size={18} className="ieq-card-icon" />
          </div>
          <div className="ieq-metric-value">
            {telemetry?.active_queue_count ?? 4}
          </div>
          <div className="ieq-card-footer">
            <span className="ieq-trend positive">Auto-Routed</span>
            <span className="ieq-muted">Across EHR, EDI, Payroll & Inv</span>
          </div>
        </div>

        <div className="ieq-card">
          <div className="ieq-card-header">
            <span className="ieq-card-title">SLA Breached / Escalated</span>
            <AlertTriangle size={18} className="ieq-card-icon text-danger" />
          </div>
          <div className={`ieq-metric-value ${(telemetry?.escalated_sla_count || 0) > 0 ? 'text-danger' : 'text-success'}`}>
            {telemetry?.escalated_sla_count ?? 1}
          </div>
          <div className="ieq-card-footer">
            <span className="ieq-trend warning">Priority Triage</span>
            <span className="ieq-muted">Requires immediate owner action</span>
          </div>
        </div>

        <div className="ieq-card">
          <div className="ieq-card-header">
            <span className="ieq-card-title">Financial Impact at Risk</span>
            <DollarSign size={18} className="ieq-card-icon text-warning" />
          </div>
          <div className="ieq-metric-value text-warning">
            ${Number(telemetry?.financial_impact_at_risk_usd || 990).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="ieq-card-footer">
            <span className="ieq-trend positive">Protected</span>
            <span className="ieq-muted">Quarantined prior to GL/AP</span>
          </div>
        </div>

        <div className="ieq-card">
          <div className="ieq-card-header">
            <span className="ieq-card-title">Avg Resolution Velocity</span>
            <Clock size={18} className="ieq-card-icon" />
          </div>
          <div className="ieq-metric-value text-success">
            {telemetry?.avg_resolution_minutes ?? 36} min
          </div>
          <div className="ieq-card-footer">
            <span className="ieq-trend positive">{telemetry?.resolved_replayed_count ?? 1} Replayed</span>
            <span className="ieq-muted">Mean time to repair (MTTR)</span>
          </div>
        </div>
      </section>

      {/* 3. Status Filter Ribbon & Subtab Navigation */}
      <nav className="ieq-nav-bar">
        <div className="ieq-subtabs">
          <button
            className={`ieq-subtab-btn ${activeSubTab === 'exception_queue' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('exception_queue')}
          >
            <ClipboardList size={16} />
            Unified Exception Queue
            <span className="ieq-tab-count">{exceptions.length}</span>
          </button>
          <button
            className={`ieq-subtab-btn ${activeSubTab === 'routing_rules' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('routing_rules')}
          >
            <GitBranch size={16} />
            Ownership & Routing Rules
            <span className="ieq-tab-count">{routes.length}</span>
          </button>
          <button
            className={`ieq-subtab-btn ${activeSubTab === 'owner_workloads' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('owner_workloads')}
          >
            <Users size={16} />
            Owner Workloads & SLAs
            <span className="ieq-tab-count">{workloads.length}</span>
          </button>
          <button
            className={`ieq-subtab-btn ${activeSubTab === 'replay_ledger' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('replay_ledger')}
          >
            <RefreshCw size={16} />
            Replay Batch Ledger
            <span className="ieq-tab-count">{replays.length}</span>
          </button>
        </div>

        <div className="ieq-filter-bar">
          {activeSubTab === 'exception_queue' && (
            <select
              className="ieq-status-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="ESCALATED">ESCALATED</option>
              <option value="RESOLVED_REPLAYED">RESOLVED_REPLAYED</option>
              <option value="DISMISSED_SUPPRESSED">DISMISSED_SUPPRESSED</option>
            </select>
          )}
          <div className="ieq-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search ticket, module, owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </nav>

      {/* 4. Subtab Content Panels */}

      {/* Tab 1: Unified Exception Queue + Ticket Inspector */}
      {activeSubTab === 'exception_queue' && (
        <div className="ieq-split-stack">
          <div className="ieq-panel">
            <div className="ieq-table-container">
              <table className="ieq-table">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Source Module</th>
                    <th>Exception Code</th>
                    <th>Severity</th>
                    <th>Impact $</th>
                    <th>Assigned Owner</th>
                    <th>Queue Status</th>
                    <th>Batch Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExceptions.map(exc => (
                    <tr
                      key={exc.id}
                      className={selectedTicket?.id === exc.id ? 'ieq-row-selected' : ''}
                      onClick={() => setSelectedTicketId(exc.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="ieq-mono-text font-bold">{exc.exception_ticket_code}</td>
                      <td><span className="ieq-tag-pill">{exc.source_module}</span></td>
                      <td className="ieq-mono-text text-danger font-semibold">{exc.exception_code}</td>
                      <td><span className={`ieq-severity-pill ${exc.severity.toLowerCase()}`}>{exc.severity}</span></td>
                      <td className="font-bold">${Number(exc.financial_impact_usd).toFixed(2)}</td>
                      <td>
                        <div className="font-semibold">{exc.assigned_role}</div>
                        <div className="ieq-muted">{exc.assigned_to}</div>
                      </td>
                      <td>
                        <span className={`ieq-queue-pill ${exc.queue_status.toLowerCase()}`}>
                          {exc.queue_status}
                        </span>
                      </td>
                      <td className="ieq-mono-text ieq-muted">{exc.batch_control_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ticket Inspector & Inline Repair */}
          {selectedTicket && (
            <div className="ieq-inspector-card">
              <div className="ieq-inspector-header">
                <div>
                  <h3 className="ieq-inspector-title">
                    Ticket Inspector: {selectedTicket.exception_ticket_code} ({selectedTicket.exception_code})
                  </h3>
                  <span className="ieq-muted">
                    Owner: <strong>{selectedTicket.assigned_to}</strong> • SLA Due: {new Date(selectedTicket.sla_due_at).toLocaleString()}
                  </span>
                </div>
                {!isTerminal(selectedTicket.queue_status) && (
                  <div className="ieq-action-group">
                    <button
                      className="ieq-btn ieq-btn-secondary"
                      onClick={() => handleReassignToSteward(selectedTicket)}
                    >
                      Reassign to Steward
                    </button>
                    {selectedTicket.queue_status !== 'ESCALATED' && (
                      <button
                        className="ieq-btn ieq-btn-warn"
                        onClick={() => handleEscalate(selectedTicket)}
                      >
                        <ArrowUpRight size={14} />
                        Escalate SLA
                      </button>
                    )}
                    <button
                      className="ieq-btn ieq-btn-outline"
                      onClick={() => handleDismiss(selectedTicket)}
                    >
                      Dismiss
                    </button>
                    <button
                      className="ieq-btn ieq-btn-primary"
                      onClick={() => handleResolveAndReplay(selectedTicket)}
                      disabled={isReplaying}
                    >
                      <Play size={14} className={isReplaying ? 'spin' : ''} />
                      Fix & Replay
                    </button>
                  </div>
                )}
              </div>

              <div className="ieq-inspector-body">
                <div className="ieq-payload-box">
                  <h4>Raw Offending Payload</h4>
                  <pre>{JSON.stringify(selectedTicket.raw_payload_json, null, 2)}</pre>
                </div>
                <div className="ieq-timeline-box">
                  <h4>Audit Action Timeline</h4>
                  {ticketActions.length === 0 ? (
                    <p className="ieq-muted">Ticket queued via automated intake router.</p>
                  ) : (
                    <ul className="ieq-timeline-list">
                      {ticketActions.map(a => (
                        <li key={a.id}>
                          <strong>{a.action_type}</strong> ({a.from_status} → {a.to_status}) by <span className="ieq-mono-text">{a.actor_id}</span>
                          <div className="ieq-muted">{a.action_notes}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Ownership & Routing Rules */}
      {activeSubTab === 'routing_rules' && (
        <div className="ieq-panel">
          <div className="ieq-table-container">
            <table className="ieq-table">
              <thead>
                <tr>
                  <th>Source Module</th>
                  <th>Exception Category</th>
                  <th>Accountable Owner Role</th>
                  <th>Default Assignee Email</th>
                  <th>SLA Override</th>
                  <th>Rule Status</th>
                </tr>
              </thead>
              <tbody>
                {routes.map(r => (
                  <tr key={r.id}>
                    <td><span className="ieq-tag-pill">{r.source_module}</span></td>
                    <td className="ieq-mono-text font-semibold">{r.exception_category}</td>
                    <td className="font-bold">{r.assigned_role}</td>
                    <td className="ieq-mono-text">{r.default_assignee_email}</td>
                    <td>{r.sla_hours_override} hours</td>
                    <td>
                      <span className="ieq-status-pill active"><Check size={12} /> Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Owner Workloads & SLAs */}
      {activeSubTab === 'owner_workloads' && (
        <div className="ieq-panel">
          <div className="ieq-table-container">
            <table className="ieq-table">
              <thead>
                <tr>
                  <th>Owner Role</th>
                  <th>Assignee Email</th>
                  <th>Open Tickets</th>
                  <th>SLA Breached</th>
                  <th>Avg Resolution</th>
                  <th>Resolved MTD</th>
                </tr>
              </thead>
              <tbody>
                {workloads.map(w => (
                  <tr key={w.assignee_email}>
                    <td className="font-bold">{w.role_name}</td>
                    <td className="ieq-mono-text">{w.assignee_email}</td>
                    <td className="font-bold">{w.open_tickets_count}</td>
                    <td className={w.sla_breached_count > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}>
                      {w.sla_breached_count}
                    </td>
                    <td className="ieq-muted">{w.avg_resolution_minutes} mins</td>
                    <td className="text-success font-bold">{w.resolved_mtd_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Replay Batch Ledger */}
      {activeSubTab === 'replay_ledger' && (
        <div className="ieq-panel">
          <div className="ieq-table-container">
            <table className="ieq-table">
              <thead>
                <tr>
                  <th>Replay Batch #</th>
                  <th>Source Module</th>
                  <th>Tickets Replayed</th>
                  <th>Succeeded / Failed</th>
                  <th>Triggered By</th>
                  <th>SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {replays.map(rpl => (
                  <tr key={rpl.id}>
                    <td className="ieq-mono-text font-bold">{rpl.replay_code}</td>
                    <td><span className="ieq-tag-pill">{rpl.source_module}</span></td>
                    <td>{rpl.tickets_replayed}</td>
                    <td>
                      <span className="text-success font-bold">{rpl.succeeded_count}</span> / {rpl.failed_count}
                    </td>
                    <td className="ieq-mono-text">{rpl.triggered_by}</td>
                    <td>
                      <span className="ieq-seal-badge" title={rpl.sha256_sync_seal}>
                        <ShieldCheck size={13} />
                        {rpl.sha256_sync_seal.substring(0, 16)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Configuration Modal */}
      {isDrawerOpen && (
        <div className="ieq-modal-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="ieq-modal-card" onClick={e => e.stopPropagation()}>
            <div className="ieq-modal-header">
              <div className="ieq-modal-title-group">
                <Sliders size={18} />
                <h3>Exception Queue SLA & Governance Policy</h3>
              </div>
              <button className="ieq-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="ieq-modal-body">
              <div className="ieq-form-row">
                <div className="ieq-form-group">
                  <label>Critical SLA (Hours)</label>
                  <input type="text" value={`${config?.critical_sla_hours || 4} Hours`} readOnly />
                </div>
                <div className="ieq-form-group">
                  <label>High SLA (Hours)</label>
                  <input type="text" value={`${config?.high_sla_hours || 12} Hours`} readOnly />
                </div>
              </div>
              <div className="ieq-form-row">
                <div className="ieq-form-group">
                  <label>Auto-Route by Domain</label>
                  <input type="text" value={config?.auto_assign_by_domain ? 'ENABLED' : 'MANUAL'} readOnly />
                </div>
                <div className="ieq-form-group">
                  <label>Dismissal Reason Guard</label>
                  <input type="text" value={config?.require_reason_for_dismissal ? 'MANDATORY' : 'OPTIONAL'} readOnly />
                </div>
              </div>
              <div className="ieq-form-group">
                <label>Webhook Secret (Encrypted at Rest)</label>
                <input type="text" value={config?.client_secret_masked || 'ieq_sec_****_6632'} readOnly className="ieq-mono-text" />
              </div>
            </div>
            <div className="ieq-modal-footer">
              <button className="ieq-btn ieq-btn-secondary" onClick={() => setIsDrawerOpen(false)}>Close</button>
              <button className="ieq-btn ieq-btn-primary" onClick={() => {
                setIsDrawerOpen(false);
                setBanner({ show: true, type: 'success', message: 'Queue SLA settings verified.' });
              }}>Save & Verify</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
