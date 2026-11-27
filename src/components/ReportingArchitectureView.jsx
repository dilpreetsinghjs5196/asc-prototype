import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sliders,
  X,
  Play,
  CalendarDays,
  Download,
  Lock,
  Plus,
  Pause,
  FileSpreadsheet
} from 'lucide-react';
import {
  CANONICAL_EXPORT_FORMATS,
  CANONICAL_REPORT_CATEGORIES,
  CANONICAL_SCHEDULE_CADENCES,
  CANONICAL_DELIVERY_CHANNELS,
  getRptConfig,
  updateRptConfig,
  getRptTelemetry,
  getRptDefinitions,
  getRptSchedules,
  getRptExecutions,
  getRptExportArtifacts,
  getRptAccessAudit,
  generateReportRun,
  createReportSchedule,
  toggleReportSchedule,
  normalizeFacilityId
} from '../services/reportingArchitectureService';
import './ReportingArchitectureView.css';

export default function ReportingArchitectureView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('catalog'); // 'catalog' | 'schedules' | 'artifacts' | 'audit'
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReportCode, setSelectedReportCode] = useState('RPT-H1-DAILY-BRIEF');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSchedModalOpen, setIsSchedModalOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [accessAudit, setAccessAudit] = useState([]);

  const [runParams, setRunParams] = useState({
    export_format: 'PDF',
    actor_role: 'CFO / Finance Director',
    dq_trust_score: 94.8,
    date_from: '2026-11-01',
    date_to: '2026-11-27',
    row_limit: 500
  });

  const [schedForm, setSchedForm] = useState({
    report_code: 'RPT-H2-LEAKAGE',
    cadence: 'WEEKLY',
    cron_expression: '0 7 * * 1',
    delivery_channel: 'EMAIL_DIGEST',
    export_format: 'XLSX',
    recipient_emails: 'cfo@naplessurgery.com, rcm_lead@naplessurgery.com'
  });

  const [draftConfig, setDraftConfig] = useState({
    enforce_dq_trust_gate: true,
    min_financial_trust_score: 75,
    watermark_draft_exports: true,
    max_export_rows: 50000
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, defs, sch, exe, art, aud] = await Promise.all([
          getRptConfig(facilityId),
          getRptTelemetry(facilityId),
          getRptDefinitions(facilityId),
          getRptSchedules(facilityId),
          getRptExecutions(facilityId),
          getRptExportArtifacts(facilityId),
          getRptAccessAudit(facilityId)
        ]);
        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setDefinitions(defs);
        setSchedules(sch);
        setExecutions(exe);
        setArtifacts(art);
        setAccessAudit(aud);
        setDraftConfig({
          enforce_dq_trust_gate: cfg.enforce_dq_trust_gate,
          min_financial_trust_score: cfg.min_financial_trust_score,
          watermark_draft_exports: cfg.watermark_draft_exports,
          max_export_rows: cfg.max_export_rows
        });
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Reporting Architecture: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  const filteredDefs = useMemo(() => {
    return definitions.filter(d => {
      if (categoryFilter !== 'ALL' && d.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${d.report_code} ${d.title} ${d.category} ${d.report_phase} ${d.data_source_modules.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [definitions, categoryFilter, searchQuery]);

  const selectedDef = useMemo(() => {
    return filteredDefs.find(d => d.report_code === selectedReportCode) || filteredDefs[0] || null;
  }, [filteredDefs, selectedReportCode]);

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    if (!selectedDef) return;
    setIsGenerating(true);
    try {
      const res = await generateReportRun(facilityId, {
        report_code: selectedDef.report_code,
        export_format: runParams.export_format,
        actor_email: `${runParams.actor_role.toLowerCase().replace(/[^a-z]+/g, '_')}@naplessurgery.com`,
        actor_role: runParams.actor_role,
        dq_trust_score: Number(runParams.dq_trust_score),
        filters: {
          date_from: runParams.date_from,
          date_to: runParams.date_to,
          row_limit: Number(runParams.row_limit)
        }
      });
      setRefreshKey(k => k + 1);
      showToast(
        'success',
        `Generated ${res.artifact.file_name} (${res.execution.trust_gate_status}) · Seal: ${res.execution.sha256_report_seal.slice(0, 22)}...`
      );
    } catch (err) {
      setRefreshKey(k => k + 1);
      showToast('error', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    try {
      const created = await createReportSchedule(facilityId, {
        ...schedForm,
        actor_email: 'cfo@naplessurgery.com',
        actor_role: 'CFO / Finance Director'
      });
      setIsSchedModalOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', `Scheduled ${created.schedule_code} for ${created.report_code} (${created.cron_expression}).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleToggleSchedule = async (sched) => {
    try {
      const updated = await toggleReportSchedule(facilityId, sched.id, {
        actor_email: 'admin@naplessurgery.com',
        actor_role: 'Facility Administrator'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Schedule ${updated.schedule_code} is now ${updated.is_enabled ? 'ENABLED' : 'PAUSED'}.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      await updateRptConfig(facilityId, draftConfig);
      setIsConfigOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', 'Saved Enterprise Reporting governance & DQ Trust Gate policies.');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const trustBadgeClass = (status) => {
    switch (status) {
      case 'CERTIFIED': return 'rpt-badge-emerald';
      case 'PROVISIONAL_WATERMARKED': return 'rpt-badge-amber';
      case 'BLOCKED_TRUST_GATE': return 'rpt-badge-rose';
      default: return 'rpt-badge-slate';
    }
  };

  return (
    <div className="rpt-container">
      {/* Header Bar */}
      <div className="rpt-header-bar">
        <div className="rpt-header-title">
          <div className="rpt-title-icon">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <h2>Enterprise Reporting Architecture, Exports & Scheduling</h2>
            <p className="rpt-subtitle">
              {facilityName} · Unified H1–H9 Catalog, Normalized Filters, Trust-Gate Watermarking, Cron Delivery & RBAC Audit
            </p>
          </div>
        </div>
        <div className="rpt-header-actions">
          <button className="rpt-btn-secondary" onClick={() => setIsConfigOpen(true)}>
            <Sliders size={15} />
            Governance Config
          </button>
          <button className="rpt-btn-primary" onClick={() => setIsSchedModalOpen(true)}>
            <Plus size={15} />
            New Delivery Schedule
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {banner.show && (
        <div className={`rpt-banner rpt-banner-${banner.type}`}>
          <div className="rpt-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="rpt-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="rpt-telemetry-grid">
          <div className="rpt-kpi-card">
            <div className="rpt-kpi-label">
              <FileText size={14} className="text-sky-600" />
              Canonical Report Catalog
            </div>
            <div className="rpt-kpi-value">{telemetry.active_definitions_count}</div>
            <div className="rpt-kpi-meta">Unified H1–H9 reports & RBAC contracts</div>
          </div>

          <div className="rpt-kpi-card">
            <div className="rpt-kpi-label">
              <CalendarDays size={14} className="text-emerald-600" />
              Enabled Cron Schedules
            </div>
            <div className="rpt-kpi-value">{telemetry.enabled_schedules_count}</div>
            <div className="rpt-kpi-meta">Automated PDF/XLSX digest deliveries</div>
          </div>

          <div className="rpt-kpi-card">
            <div className="rpt-kpi-label">
              <Download size={14} className="text-emerald-600" />
              Sealed Report Runs
            </div>
            <div className="rpt-kpi-value">{telemetry.completed_executions_count}</div>
            <div className="rpt-kpi-meta">RBAC Denials Caught: {telemetry.access_denials_count}</div>
          </div>

          <div className="rpt-kpi-card">
            <div className="rpt-kpi-label">
              <ShieldCheck size={14} className="text-amber-600" />
              DQ Trust Gate Floor
            </div>
            <div className="rpt-kpi-value">{Number(telemetry.min_financial_trust_score).toFixed(1)}%</div>
            <div className="rpt-kpi-meta rpt-mono-cell" title={telemetry.latest_sync_seal}>
              Seal: {telemetry.latest_sync_seal?.slice(0, 22)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Bar & Filters */}
      <div className="rpt-controls-bar">
        <div className="rpt-subtabs">
          <button className={`rpt-subtab ${activeSubTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveSubTab('catalog')}>
            <FileText size={14} />
            Catalog & Generator ({definitions.length})
          </button>
          <button className={`rpt-subtab ${activeSubTab === 'schedules' ? 'active' : ''}`} onClick={() => setActiveSubTab('schedules')}>
            <CalendarDays size={14} />
            Delivery Schedules ({schedules.length})
          </button>
          <button className={`rpt-subtab ${activeSubTab === 'artifacts' ? 'active' : ''}`} onClick={() => setActiveSubTab('artifacts')}>
            <Download size={14} />
            Executions & Artifacts ({executions.length})
          </button>
          <button className={`rpt-subtab ${activeSubTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveSubTab('audit')}>
            <Lock size={14} />
            RBAC Access Audit ({accessAudit.length})
          </button>
        </div>

        <div className="rpt-filter-group">
          <div className="rpt-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search report code, phase, module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="rpt-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="ALL">All Categories</option>
            {CANONICAL_REPORT_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtab 1: Report Catalog & Interactive Generator */}
      {activeSubTab === 'catalog' && (
        <div className="rpt-split-workspace">
          <div className="rpt-list-pane">
            {filteredDefs.map(def => (
              <div
                key={def.id}
                className={`rpt-def-card ${selectedDef?.report_code === def.report_code ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedReportCode(def.report_code);
                  setRunParams(prev => ({
                    ...prev,
                    export_format: def.supported_formats[0] || 'PDF'
                  }));
                }}
              >
                <div className="rpt-card-top">
                  <span className="rpt-code">{def.report_code}</span>
                  <span className="rpt-badge rpt-badge-sky">{def.report_phase}</span>
                </div>
                <div className="rpt-def-title">{def.title}</div>
                <div className="rpt-card-meta">{def.category} · Formats: {def.supported_formats.join(', ')}</div>
              </div>
            ))}
          </div>

          <div className="rpt-detail-pane">
            {!selectedDef ? (
              <div className="rpt-empty-state">Select a report definition to configure filters and generate a sealed output.</div>
            ) : (
              <div>
                <div className="rpt-detail-header">
                  <div>
                    <div className="rpt-detail-title-row">
                      <h3>{selectedDef.title}</h3>
                      <span className="rpt-badge rpt-badge-emerald">{selectedDef.version_tag}</span>
                    </div>
                    <p className="rpt-subtitle">
                      Code: <code>{selectedDef.report_code}</code> · Required Permission: <code>{selectedDef.required_permission}</code>
                    </p>
                  </div>
                  <div className="rpt-secret-pill">Secret: <code>{config?.client_secret_encrypted}</code></div>
                </div>

                <div className="rpt-contract-box">
                  <div><strong>Allowed Roles:</strong> {selectedDef.allowed_roles.join(', ')}</div>
                  <div><strong>Upstream Sources:</strong> {selectedDef.data_source_modules.join(', ')}</div>
                </div>

                <form onSubmit={handleGenerateReport} className="rpt-gen-form">
                  <div className="rpt-form-grid">
                    <div className="rpt-form-row">
                      <label>Export Format</label>
                      <select
                        value={runParams.export_format}
                        onChange={(e) => setRunParams({ ...runParams, export_format: e.target.value })}
                      >
                        {selectedDef.supported_formats.map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>

                    <div className="rpt-form-row">
                      <label>Executing Caller Role (RBAC Check)</label>
                      <select
                        value={runParams.actor_role}
                        onChange={(e) => setRunParams({ ...runParams, actor_role: e.target.value })}
                      >
                        <option value="CFO / Finance Director">CFO / Finance Director</option>
                        <option value="Facility Administrator">Facility Administrator</option>
                        <option value="RCM Billing Lead">RCM Billing Lead</option>
                        <option value="Clinical Nursing Director">Clinical Nursing Director</option>
                        <option value="Data Operations Steward">Data Operations Steward</option>
                        <option value="External Read-Only Viewer">External Read-Only Viewer (Unauthorized Test)</option>
                      </select>
                    </div>

                    <div className="rpt-form-row">
                      <label>Date From</label>
                      <input
                        type="date"
                        value={runParams.date_from}
                        onChange={(e) => setRunParams({ ...runParams, date_from: e.target.value })}
                      />
                    </div>

                    <div className="rpt-form-row">
                      <label>Date To</label>
                      <input
                        type="date"
                        value={runParams.date_to}
                        onChange={(e) => setRunParams({ ...runParams, date_to: e.target.value })}
                      />
                    </div>

                    <div className="rpt-form-row">
                      <label>DQ Financial Trust Score at Run (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="100"
                        value={runParams.dq_trust_score}
                        onChange={(e) => setRunParams({ ...runParams, dq_trust_score: Number(e.target.value) })}
                      />
                    </div>

                    <div className="rpt-form-row">
                      <label>Row Limit (Max {config?.max_export_rows || 50000})</label>
                      <input
                        type="number"
                        min="1"
                        max={config?.max_export_rows || 50000}
                        value={runParams.row_limit}
                        onChange={(e) => setRunParams({ ...runParams, row_limit: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="rpt-gen-actions">
                    <button type="submit" className="rpt-btn-primary" disabled={isGenerating}>
                      <Play size={15} />
                      {isGenerating ? 'Validating RBAC & Trust Gate...' : 'Generate & Seal Report Run'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 2: Delivery Schedules */}
      {activeSubTab === 'schedules' && (
        <div className="rpt-card-panel">
          <h3>Automated Recurring Delivery Schedules</h3>
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Schedule Code</th>
                  <th>Report Code</th>
                  <th>Cadence / Cron</th>
                  <th>Channel & Format</th>
                  <th>Recipients</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id}>
                    <td className="rpt-code">{s.schedule_code}</td>
                    <td><code>{s.report_code}</code></td>
                    <td>{s.cadence} (<code>{s.cron_expression}</code>)</td>
                    <td>{s.delivery_channel} · <strong>{s.export_format}</strong></td>
                    <td>{s.recipient_emails.join(', ')}</td>
                    <td>
                      <span className={`rpt-badge ${s.is_enabled ? 'rpt-badge-emerald' : 'rpt-badge-slate'}`}>
                        {s.is_enabled ? 'ENABLED' : 'PAUSED'}
                      </span>
                    </td>
                    <td>
                      <button className="rpt-btn-mini" onClick={() => handleToggleSchedule(s)}>
                        {s.is_enabled ? <Pause size={12} /> : <Play size={12} />}
                        {s.is_enabled ? 'Pause' : 'Resume'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Executions & Export Artifacts */}
      {activeSubTab === 'artifacts' && (
        <div className="rpt-stack">
          <div className="rpt-card-panel">
            <h3>Report Execution Ledger</h3>
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>Execution Code</th>
                    <th>Report</th>
                    <th>Mode & Format</th>
                    <th>Rows</th>
                    <th>DQ Trust</th>
                    <th>Trust Gate Status</th>
                    <th>SHA-256 Report Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(ex => (
                    <tr key={ex.id}>
                      <td className="rpt-code">{ex.execution_code}</td>
                      <td><code>{ex.report_code}</code></td>
                      <td>{ex.generation_mode} · {ex.export_format}</td>
                      <td>{ex.row_count}</td>
                      <td>{Number(ex.dq_trust_score_at_run).toFixed(1)}%</td>
                      <td><span className={`rpt-badge ${trustBadgeClass(ex.trust_gate_status)}`}>{ex.trust_gate_status}</span></td>
                      <td className="rpt-mono-cell" title={ex.sha256_report_seal}>{ex.sha256_report_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rpt-card-panel">
            <h3>Sealed Export Artifacts & Watermarks</h3>
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr>
                    <th>Artifact Code</th>
                    <th>File Name</th>
                    <th>Format & Size</th>
                    <th>Watermark</th>
                    <th>Exported By</th>
                    <th>SHA-256 Checksum</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map(art => (
                    <tr key={art.id}>
                      <td className="rpt-code">{art.artifact_code}</td>
                      <td>{art.file_name}</td>
                      <td>{art.export_format} · {(art.byte_size / 1024).toFixed(1)} KB</td>
                      <td>
                        <span className={`rpt-badge ${art.is_watermarked ? 'rpt-badge-amber' : 'rpt-badge-emerald'}`}>
                          {art.is_watermarked ? art.watermark_text : 'UNWATERMARKED_CERTIFIED'}
                        </span>
                      </td>
                      <td>{art.exported_by}</td>
                      <td className="rpt-mono-cell" title={art.content_checksum_sha256}>{art.content_checksum_sha256.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 4: RBAC & Access Audit Log */}
      {activeSubTab === 'audit' && (
        <div className="rpt-card-panel">
          <h3>RBAC Authorization & Export Audit Trail</h3>
          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Report Code</th>
                  <th>Action</th>
                  <th>Actor & Role</th>
                  <th>Decision</th>
                  <th>Reason / Note</th>
                  <th>SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {accessAudit.map(aud => (
                  <tr key={aud.id}>
                    <td>{new Date(aud.created_at).toLocaleString()}</td>
                    <td><code>{aud.report_code}</code></td>
                    <td>{aud.action_type}</td>
                    <td>{aud.actor_email} ({aud.actor_role})</td>
                    <td>
                      <span className={`rpt-badge ${aud.access_granted ? 'rpt-badge-emerald' : 'rpt-badge-rose'}`}>
                        {aud.access_granted ? 'GRANTED' : 'DENIED'}
                      </span>
                    </td>
                    <td>{aud.denial_reason || 'Authorized per role policy'}</td>
                    <td className="rpt-mono-cell" title={aud.sha256_seal}>{aud.sha256_seal.slice(0, 18)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Schedule Modal */}
      {isSchedModalOpen && (
        <div className="rpt-modal-backdrop">
          <div className="rpt-modal">
            <div className="rpt-modal-header">
              <h3>Create Recurring Report Delivery Schedule</h3>
              <button className="rpt-banner-close" onClick={() => setIsSchedModalOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSchedule} className="rpt-modal-body">
              <div className="rpt-form-row">
                <label>Report Definition</label>
                <select value={schedForm.report_code} onChange={(e) => setSchedForm({ ...schedForm, report_code: e.target.value })}>
                  {definitions.map(d => <option key={d.report_code} value={d.report_code}>{d.report_code} — {d.title}</option>)}
                </select>
              </div>
              <div className="rpt-form-row">
                <label>Cadence</label>
                <select value={schedForm.cadence} onChange={(e) => setSchedForm({ ...schedForm, cadence: e.target.value })}>
                  {CANONICAL_SCHEDULE_CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="rpt-form-row">
                <label>5-Field Cron Expression</label>
                <input type="text" value={schedForm.cron_expression} onChange={(e) => setSchedForm({ ...schedForm, cron_expression: e.target.value })} required />
              </div>
              <div className="rpt-form-row">
                <label>Delivery Channel</label>
                <select value={schedForm.delivery_channel} onChange={(e) => setSchedForm({ ...schedForm, delivery_channel: e.target.value })}>
                  {CANONICAL_DELIVERY_CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              </div>
              <div className="rpt-form-row">
                <label>Export Format</label>
                <select value={schedForm.export_format} onChange={(e) => setSchedForm({ ...schedForm, export_format: e.target.value })}>
                  {CANONICAL_EXPORT_FORMATS.map(fmt => <option key={fmt} value={fmt}>{fmt}</option>)}
                </select>
              </div>
              <div className="rpt-form-row">
                <label>Recipients (comma-separated)</label>
                <input type="text" value={schedForm.recipient_emails} onChange={(e) => setSchedForm({ ...schedForm, recipient_emails: e.target.value })} required />
              </div>
              <div className="rpt-modal-footer">
                <button type="button" className="rpt-btn-secondary" onClick={() => setIsSchedModalOpen(false)}>Cancel</button>
                <button type="submit" className="rpt-btn-primary">Create Cron Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Governance Config Modal */}
      {isConfigOpen && config && (
        <div className="rpt-modal-backdrop">
          <div className="rpt-modal">
            <div className="rpt-modal-header">
              <h3>Reporting Governance & DQ Trust Gate</h3>
              <button className="rpt-banner-close" onClick={() => setIsConfigOpen(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSaveConfig} className="rpt-modal-body">
              <div className="rpt-form-row">
                <label>Minimum DQ Financial Trust Score (%)</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={draftConfig.min_financial_trust_score}
                  onChange={(e) => setDraftConfig({ ...draftConfig, min_financial_trust_score: Number(e.target.value) })}
                />
              </div>
              <div className="rpt-form-row">
                <label>Max Export Row Cap</label>
                <input
                  type="number"
                  min="100"
                  max="500000"
                  value={draftConfig.max_export_rows}
                  onChange={(e) => setDraftConfig({ ...draftConfig, max_export_rows: Number(e.target.value) })}
                />
              </div>
              <label className="rpt-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftConfig.enforce_dq_trust_gate}
                  onChange={(e) => setDraftConfig({ ...draftConfig, enforce_dq_trust_gate: e.target.checked })}
                />
                <span>Enforce Module 16 G2 Financial Completeness Trust Gate</span>
              </label>
              <label className="rpt-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftConfig.watermark_draft_exports}
                  onChange={(e) => setDraftConfig({ ...draftConfig, watermark_draft_exports: e.target.checked })}
                />
                <span>Watermark Provisional Exports Below Trust Floor</span>
              </label>
              <div className="rpt-modal-footer">
                <button type="button" className="rpt-btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancel</button>
                <button type="submit" className="rpt-btn-primary">Save Governance Policy</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
