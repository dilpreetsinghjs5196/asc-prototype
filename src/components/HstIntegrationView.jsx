import React, { useState, useMemo, useCallback } from 'react';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  Database,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  FileText,
  ExternalLink,
  ChevronRight,
  Sliders,
  X,
  Play,
  Zap,
  Tag
} from 'lucide-react';
import {
  getHstConnectorConfig,
  getHstTelemetry,
  getHstSyncBatches,
  getHstCaseMappings,
  getHstMilestones,
  getHstChargeItems,
  testHstConnection,
  triggerManualHstSync,
  auditHstCaseCharges,
  normalizeFacilityId
} from '../services/hstIntegrationService';
import './HstIntegrationView.css';

export default function HstIntegrationView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('milestones'); // 'milestones' | 'charges' | 'cases' | 'batches'
  const [selectedCaseId, setSelectedCaseId] = useState('HST-2026-901');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Banners & Notifications
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load Data
  const config = useMemo(() => getHstConnectorConfig(facilityId), [facilityId, refreshKey]);
  const telemetry = useMemo(() => getHstTelemetry(facilityId), [facilityId, refreshKey]);
  const batches = useMemo(() => getHstSyncBatches(facilityId), [facilityId, refreshKey]);
  const caseMappings = useMemo(() => getHstCaseMappings(facilityId), [facilityId, refreshKey]);
  const milestones = useMemo(() => getHstMilestones(facilityId), [facilityId, refreshKey]);
  const chargeItems = useMemo(() => getHstChargeItems(facilityId), [facilityId, refreshKey]);

  // Selected Case Details
  const selectedCase = useMemo(() => caseMappings.find(c => c.hstCaseId === selectedCaseId) || caseMappings[0], [caseMappings, selectedCaseId]);
  const selectedMilestone = useMemo(() => milestones.find(m => m.hstCaseId === selectedCaseId), [milestones, selectedCaseId]);
  const selectedCharges = useMemo(() => chargeItems.filter(c => c.hstCaseId === selectedCaseId), [chargeItems, selectedCaseId]);
  const chargeAudit = useMemo(() => auditHstCaseCharges(selectedCharges), [selectedCharges]);

  // Filtered Milestones
  const filteredMilestones = useMemo(() => {
    return milestones.filter(m => {
      const parentCase = caseMappings.find(c => c.hstCaseId === m.hstCaseId);
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchCase = m.hstCaseId.toLowerCase().includes(q);
      const matchSurgeon = parentCase?.surgeonName?.toLowerCase().includes(q);
      const matchCpt = parentCase?.primaryCpt?.toLowerCase().includes(q);
      const matchRoom = parentCase?.orRoomName?.toLowerCase().includes(q);
      return matchCase || matchSurgeon || matchCpt || matchRoom;
    });
  }, [milestones, caseMappings, searchQuery]);

  // Test Connection Handshake
  const handleTestConnection = useCallback(() => {
    setIsTesting(true);
    setTimeout(() => {
      try {
        const res = testHstConnection(facilityId);
        setBanner({
          show: true,
          type: 'success',
          message: `${res.message} Latency: ${res.latencyMs} ms.`
        });
      } catch (err) {
        setBanner({ show: true, type: 'error', message: err.message });
      } finally {
        setIsTesting(false);
      }
    }, 400);
  }, [facilityId]);

  // Trigger Manual Sync
  const handleTriggerSync = useCallback(() => {
    setIsSyncing(true);
    setTimeout(() => {
      try {
        const res = triggerManualHstSync(facilityId);
        setRefreshKey(k => k + 1);
        setBanner({
          show: true,
          type: 'success',
          message: `${res.message} Batch SHA-256: ${res.batch.sha256SyncSeal.slice(0, 24)}...`
        });
      } catch (err) {
        setBanner({ show: true, type: 'error', message: err.message });
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  }, [facilityId]);

  return (
    <div className="hst-container">
      {/* Notification Banner */}
      {banner.show && (
        <div className={`hst-banner hst-banner-${banner.type}`}>
          <div className="hst-banner-content">
            {banner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="hst-btn-banner-close" onClick={() => setBanner({ show: false, message: '' })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Control Card */}
      <div className="hst-header-card">
        <div className="hst-header-left">
          <div className="hst-header-badges">
            <span className="hst-badge-facility">{facilityName}</span>
            <span className="hst-badge-phase">Phase F4 - Module 15</span>
            <span className="hst-badge-center">Center: {config.hstCenterId}</span>
            <span className={`hst-badge-status ${config.syncStatus === 'CONNECTED' ? 'status-connected' : 'status-warning'}`}>
              <span className="hst-status-dot"></span>
              {config.syncStatus}
            </span>
          </div>
          <p className="hst-header-note">
            Bi-directional HST Pathways integration gateway: incremental 15-minute cursor polling, HST eChart 10-milestone chronology, and Practice Management itemized charge audit.
          </p>
        </div>

        <div className="hst-header-actions">
          <button
            className="hst-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
            title="Perform ping handshake with HST Pathways API Gateway"
          >
            <Zap size={14} className={isTesting ? 'animate-spin text-amber' : 'text-sky'} />
            <span>{isTesting ? 'Handshaking...' : 'Test Connection'}</span>
          </button>

          <button
            className="hst-btn-primary"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            title="Execute on-demand incremental synchronization"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>

          <button
            className="hst-btn-settings"
            onClick={() => setIsDrawerOpen(true)}
            title="Configure HST Pathways API endpoint and credentials"
          >
            <Sliders size={15} />
          </button>
        </div>
      </div>

      {/* Telemetry Ribbon */}
      <div className="hst-telemetry-ribbon">
        <div className="hst-tcard">
          <div className="hst-tcard-header">
            <span className="hst-tcard-label">Synced Encounters (24h)</span>
            <Activity size={16} className="text-sky" />
          </div>
          <div className="hst-tcard-value">{telemetry.totalSyncedCases}</div>
          <div className="hst-tcard-subtext">Across active operational window</div>
        </div>

        <div className="hst-tcard">
          <div className="hst-tcard-header">
            <span className="hst-tcard-label">Milestone Completeness</span>
            <CheckCircle2 size={16} className="text-emerald" />
          </div>
          <div className="hst-tcard-value text-emerald">{telemetry.milestoneCompletenessPct}%</div>
          <div className="hst-tcard-subtext">10-point chronological valid events</div>
        </div>

        <div className="hst-tcard">
          <div className="hst-tcard-header">
            <span className="hst-tcard-label">Total Charges Captured</span>
            <DollarSign size={16} className="text-emerald" />
          </div>
          <div className="hst-tcard-value text-emerald">${telemetry.totalChargesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="hst-tcard-subtext">{telemetry.totalChargesCaptured} itemized billing lines synced</div>
        </div>

        <div className="hst-tcard">
          <div className="hst-tcard-header">
            <span className="hst-tcard-label">Sync Latency & Health</span>
            <Clock size={16} className="text-sky" />
          </div>
          <div className="hst-tcard-value text-sky">88 ms</div>
          <div className="hst-tcard-subtext">Last synced {config.lastSuccessfulSyncAt ? new Date(config.lastSuccessfulSyncAt).toLocaleTimeString() : 'Never'}</div>
        </div>
      </div>

      {/* 10-Milestone Interactive Stepper for Selected Encounter */}
      <div className="hst-milestone-stepper-card">
        <div className="hst-stepper-header">
          <div className="hst-stepper-title">
            <Clock size={16} className="text-sky" />
            <span>HST eChart Perioperative Chronology: <strong>{selectedCase.hstCaseId}</strong> ({selectedCase.surgeonName} &bull; CPT {selectedCase.primaryCpt} &bull; {selectedCase.orRoomName})</span>
          </div>
          <div className="hst-stepper-actions">
            <span className="hst-badge-pill">Turnover: {selectedMilestone?.turnoverMinutes ? `${selectedMilestone.turnoverMinutes} min` : 'N/A'}</span>
            <span className="hst-badge-pill">OR Time: {selectedMilestone?.totalRoomMinutes ? `${selectedMilestone.totalRoomMinutes} min` : 'N/A'}</span>
            <span className="hst-badge-pill">Surgery: {selectedMilestone?.surgicalDurationMinutes ? `${selectedMilestone.surgicalDurationMinutes} min` : 'N/A'}</span>
          </div>
        </div>

        <div className="hst-stepper-steps">
          {[
            { label: 'Arrival', time: selectedMilestone?.patientArrivalTime, desc: 'ASC Registration' },
            { label: 'Pre-Op In', time: selectedMilestone?.preopInTime, desc: 'Pre-op Bay Entry' },
            { label: 'Room In', time: selectedMilestone?.roomInTime, desc: 'Wheels In OR' },
            { label: 'Anesthesia', time: selectedMilestone?.anesthesiaStartTime, desc: 'Induction Begun' },
            { label: 'Incision', time: selectedMilestone?.incisionTime, desc: 'Cut / Scope In' },
            { label: 'Closure', time: selectedMilestone?.closeTime, desc: 'Dressings Applied' },
            { label: 'Anes End', time: selectedMilestone?.anesthesiaEndTime, desc: 'Reversal Complete' },
            { label: 'Room Out', time: selectedMilestone?.roomOutTime, desc: 'Wheels Out' },
            { label: 'PACU In', time: selectedMilestone?.pacuInTime, desc: 'Phase I Recovery' },
            { label: 'Discharge', time: selectedMilestone?.dischargeTime, desc: 'Aldrete >= 9' }
          ].map((step, idx) => {
            const hasPassed = Boolean(step.time);
            return (
              <div key={idx} className={`hst-step-node ${hasPassed ? 'completed' : 'pending'}`}>
                <div className="hst-step-circle">{idx + 1}</div>
                <div className="hst-step-info">
                  <span className="hst-step-label">{step.label}</span>
                  <span className="hst-step-time">
                    {hasPassed ? new Date(step.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                  </span>
                  <span className="hst-step-desc">{step.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="hst-subtabs-bar">
        <button
          className={`hst-subtab-btn ${activeSubTab === 'milestones' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('milestones')}
        >
          <Clock size={15} />
          <span>Perioperative Milestones ({milestones.length})</span>
        </button>

        <button
          className={`hst-subtab-btn ${activeSubTab === 'charges' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('charges')}
        >
          <DollarSign size={15} />
          <span>HST Practice Management Charges ({chargeItems.length})</span>
        </button>

        <button
          className={`hst-subtab-btn ${activeSubTab === 'cases' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('cases')}
        >
          <Database size={15} />
          <span>Case Mapping Registry ({caseMappings.length})</span>
        </button>

        <button
          className={`hst-subtab-btn ${activeSubTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('batches')}
        >
          <Layers size={15} />
          <span>Sync Batches & Ledger ({batches.length})</span>
        </button>
      </div>

      {/* Subtab 1: Perioperative Milestones */}
      {activeSubTab === 'milestones' && (
        <div className="hst-table-card">
          <div className="hst-table-toolbar">
            <div className="hst-search-box">
              <Search size={15} className="text-slate" />
              <input
                type="text"
                placeholder="Search milestones by Case ID, Surgeon, CPT, or OR Suite..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="hst-toolbar-stats">
              <span className="hst-stat-pill">Active Encounters: {filteredMilestones.length}</span>
            </div>
          </div>

          <div className="hst-table-responsive">
            <table className="hst-table">
              <thead>
                <tr>
                  <th>HST Case ID</th>
                  <th>Surgeon & CPT</th>
                  <th>OR Room</th>
                  <th>Arrival & Pre-Op</th>
                  <th>Wheels In & Cut</th>
                  <th>Close & Wheels Out</th>
                  <th>PACU & Discharge</th>
                  <th>Turnover</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredMilestones.map(m => {
                  const parentCase = caseMappings.find(c => c.hstCaseId === m.hstCaseId);
                  const isSelected = m.hstCaseId === selectedCaseId;
                  return (
                    <tr
                      key={m.id}
                      className={isSelected ? 'selected-row' : ''}
                      onClick={() => setSelectedCaseId(m.hstCaseId)}
                    >
                      <td className="font-mono font-weight-600 text-sky">{m.hstCaseId}</td>
                      <td>
                        <div className="font-weight-600">{parentCase?.surgeonName || 'Unknown Surgeon'}</div>
                        <div className="hst-cell-subtext font-mono">CPT {parentCase?.primaryCpt}</div>
                      </td>
                      <td>
                        <span className="hst-room-tag">{parentCase?.orRoomName || 'OR-1'}</span>
                      </td>
                      <td>
                        <div>{m.patientArrivalTime ? new Date(m.patientArrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                        <div className="hst-cell-subtext">{m.preopInTime ? new Date(m.preopInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                      </td>
                      <td>
                        <div>{m.roomInTime ? new Date(m.roomInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                        <div className="hst-cell-subtext text-emerald">{m.incisionTime ? new Date(m.incisionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                      </td>
                      <td>
                        <div>{m.closeTime ? new Date(m.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                        <div className="hst-cell-subtext">{m.roomOutTime ? new Date(m.roomOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                      </td>
                      <td>
                        <div>{m.pacuInTime ? new Date(m.pacuInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                        <div className="hst-cell-subtext">{m.dischargeTime ? new Date(m.dischargeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</div>
                      </td>
                      <td>
                        {m.turnoverMinutes ? (
                          <span className={`hst-turnover-badge ${m.turnoverMinutes > 30 ? 'badge-warning' : 'badge-good'}`}>
                            {m.turnoverMinutes} min
                          </span>
                        ) : (
                          <span className="text-slate">--</span>
                        )}
                      </td>
                      <td>
                        {m.isChronologyValid ? (
                          <span className="hst-badge-clean">
                            <CheckCircle2 size={12} /> Valid
                          </span>
                        ) : (
                          <span className="hst-badge-anomaly">
                            <AlertTriangle size={12} /> Inversion
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="hst-btn-inspect"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedCaseId(m.hstCaseId);
                          }}
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 2: Itemized Charge Items */}
      {activeSubTab === 'charges' && (
        <div className="hst-table-card">
          <div className="hst-charge-audit-summary">
            <div className="hst-audit-metric">
              <span className="hst-am-label">Selected Case</span>
              <span className="hst-am-val text-sky font-mono">{selectedCase.hstCaseId}</span>
            </div>
            <div className="hst-audit-metric">
              <span className="hst-am-label">Gross Billed</span>
              <span className="hst-am-val text-emerald">${chargeAudit.totalCharges.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="hst-audit-metric">
              <span className="hst-am-label">Direct Cost</span>
              <span className="hst-am-val">${chargeAudit.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="hst-audit-metric">
              <span className="hst-am-label">Implants Consumed</span>
              <span className="hst-am-val text-amber">{chargeAudit.implantCount} Units</span>
            </div>
          </div>

          <div className="hst-table-responsive">
            <table className="hst-table">
              <thead>
                <tr>
                  <th>Line Item ID</th>
                  <th>Category</th>
                  <th>Code & Description</th>
                  <th>Rev Code</th>
                  <th>Mod</th>
                  <th>Qty</th>
                  <th>Unit Charge</th>
                  <th>Total Charge</th>
                  <th>Cost</th>
                  <th>Lot / Serial</th>
                </tr>
              </thead>
              <tbody>
                {selectedCharges.map(ch => (
                  <tr key={ch.id}>
                    <td className="font-mono text-sky">{ch.lineItemId}</td>
                    <td>
                      <span className={`hst-cat-pill cat-${ch.chargeCategory.toLowerCase()}`}>
                        {ch.chargeCategory}
                      </span>
                    </td>
                    <td>
                      <div className="font-weight-600 font-mono">{ch.code}</div>
                      <div className="hst-cell-subtext">{ch.description}</div>
                    </td>
                    <td className="font-mono">{ch.revenueCode || '--'}</td>
                    <td className="font-mono text-amber">{ch.modifierCode || '--'}</td>
                    <td className="font-mono">{ch.quantity}</td>
                    <td className="font-mono">${ch.unitCharge.toFixed(2)}</td>
                    <td className="font-mono font-weight-600 text-emerald">${ch.totalCharge.toFixed(2)}</td>
                    <td className="font-mono text-slate">${ch.costAmount.toFixed(2)}</td>
                    <td className="font-mono text-slate">{ch.lotNumber || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Case Mapping Registry */}
      {activeSubTab === 'cases' && (
        <div className="hst-table-card">
          <div className="hst-table-responsive">
            <table className="hst-table">
              <thead>
                <tr>
                  <th>HST Case ID</th>
                  <th>HST Case #</th>
                  <th>Patient MRN</th>
                  <th>Surgery Date</th>
                  <th>Surgeon (NPI)</th>
                  <th>Primary CPT</th>
                  <th>OR Room</th>
                  <th>eChart Status</th>
                  <th>Billing Status</th>
                </tr>
              </thead>
              <tbody>
                {caseMappings.map(c => (
                  <tr key={c.id}>
                    <td className="font-mono font-weight-600 text-sky">{c.hstCaseId}</td>
                    <td className="font-mono">{c.hstCaseNumber}</td>
                    <td className="font-mono text-slate">{c.hstPatientMrn}</td>
                    <td>{c.surgeryDate}</td>
                    <td>
                      <div className="font-weight-600">{c.surgeonName}</div>
                      <div className="hst-cell-subtext font-mono">NPI: {c.surgeonNpi}</div>
                    </td>
                    <td className="font-mono font-weight-600">{c.primaryCpt}</td>
                    <td>
                      <span className="hst-room-tag">{c.orRoomName}</span>
                    </td>
                    <td>
                      <span className={`hst-badge-pill ${c.echartDocumentationStatus === 'LOCKED' ? 'status-locked' : 'status-pending'}`}>
                        {c.echartDocumentationStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`hst-badge-pill ${c.billingStatus === 'BILLED' ? 'status-billed' : 'status-warning'}`}>
                        {c.billingStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Sync Batches & Provenance Ledger */}
      {activeSubTab === 'batches' && (
        <div className="hst-table-card">
          <div className="hst-table-responsive">
            <table className="hst-table">
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Cases (Ret/Ins/Upd)</th>
                  <th>Charges Synced</th>
                  <th>Duration</th>
                  <th>Completed At</th>
                  <th>SHA-256 Provenance Seal</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="font-mono font-weight-600 text-sky">{b.batchCode}</td>
                    <td>
                      <span className="hst-badge-pill">{b.syncType}</span>
                    </td>
                    <td>
                      <span className="hst-badge-clean">
                        <CheckCircle2 size={12} /> {b.status}
                      </span>
                    </td>
                    <td className="font-mono">
                      {b.casesRetrieved} / <span className="text-emerald">+{b.casesInserted}</span> / {b.casesUpdated}
                    </td>
                    <td className="font-mono text-emerald font-weight-600">{b.chargesSynced}</td>
                    <td className="font-mono text-slate">{b.durationMs} ms</td>
                    <td className="hst-cell-subtext">{new Date(b.completedAt).toLocaleString()}</td>
                    <td className="font-mono font-xs text-sky">
                      {b.sha256SyncSeal.slice(0, 32)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-Out Settings Drawer */}
      {isDrawerOpen && (
        <div className="hst-drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="hst-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="hst-drawer-header">
              <div className="hst-dheader-title">
                <Sliders size={18} className="text-sky" />
                <h3>HST Pathways Gateway Configuration</h3>
              </div>
              <button className="hst-btn-drawer-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="hst-drawer-content">
              <div className="hst-form-group">
                <label>HST Pathways Center Identifier</label>
                <input type="text" readOnly value={config.hstCenterId} className="hst-input font-mono" />
              </div>

              <div className="hst-form-group">
                <label>API Endpoint Gateway URL</label>
                <input type="text" readOnly value={config.apiEndpointUrl} className="hst-input font-mono" />
              </div>

              <div className="hst-form-group">
                <label>Authentication Protocol</label>
                <input type="text" readOnly value={`${config.authType} (Mutual TLS & Bearer Token)`} className="hst-input" />
              </div>

              <div className="hst-form-group">
                <label>Client ID</label>
                <input type="text" readOnly value={config.clientId} className="hst-input font-mono" />
              </div>

              <div className="hst-form-group">
                <label>Client Secret (Encrypted at Rest)</label>
                <input type="text" readOnly value={config.clientSecretEncrypted} className="hst-input font-mono text-slate" />
              </div>

              <div className="hst-form-group">
                <label>Incremental Cursor Polling Frequency</label>
                <input type="text" readOnly value={`${config.pollingIntervalMinutes} minutes (Automatic Sync Enabled)`} className="hst-input" />
              </div>

              <div className="hst-config-status-box">
                <div className="hst-cs-row">
                  <span>Connection Health</span>
                  <span className="text-emerald font-weight-600">{config.healthStatus}</span>
                </div>
                <div className="hst-cs-row">
                  <span>Last Sync Cursor</span>
                  <span className="text-slate font-mono font-xs">{config.lastSyncCursorAt ? new Date(config.lastSyncCursorAt).toLocaleString() : '--'}</span>
                </div>
              </div>
            </div>

            <div className="hst-drawer-footer">
              <button className="hst-btn-drawer-close-full" onClick={() => setIsDrawerOpen(false)}>
                Close Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
