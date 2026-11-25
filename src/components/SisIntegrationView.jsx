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
  getSisConnectorConfig,
  getSisTelemetry,
  getSisSyncBatches,
  getSisCaseMappings,
  getSisMilestones,
  getSisChargeItems,
  testSisConnection,
  triggerManualSync,
  auditCaseCharges,
  normalizeFacilityId
} from '../services/sisIntegrationService';
import './SisIntegrationView.css';

export default function SisIntegrationView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('milestones'); // 'milestones' | 'charges' | 'batches' | 'config'
  const [selectedCaseId, setSelectedCaseId] = useState('SIS-2026-8801');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Banners & Notifications
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load Data
  const config = useMemo(() => getSisConnectorConfig(facilityId), [facilityId, refreshKey]);
  const telemetry = useMemo(() => getSisTelemetry(facilityId), [facilityId, refreshKey]);
  const batches = useMemo(() => getSisSyncBatches(facilityId), [facilityId, refreshKey]);
  const caseMappings = useMemo(() => getSisCaseMappings(facilityId), [facilityId, refreshKey]);
  const milestones = useMemo(() => getSisMilestones(facilityId), [facilityId, refreshKey]);
  const chargeItems = useMemo(() => getSisChargeItems(facilityId), [facilityId, refreshKey]);

  // Selected Case Details
  const selectedCase = useMemo(() => caseMappings.find(c => c.sisCaseId === selectedCaseId) || caseMappings[0], [caseMappings, selectedCaseId]);
  const selectedMilestone = useMemo(() => milestones.find(m => m.sisCaseId === selectedCaseId), [milestones, selectedCaseId]);
  const selectedCharges = useMemo(() => chargeItems.filter(c => c.sisCaseId === selectedCaseId), [chargeItems, selectedCaseId]);
  const chargeAudit = useMemo(() => auditCaseCharges(selectedCharges), [selectedCharges]);

  // Filtered Milestones
  const filteredMilestones = useMemo(() => {
    return milestones.filter(m => {
      const parentCase = caseMappings.find(c => c.sisCaseId === m.sisCaseId);
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const matchCase = m.sisCaseId.toLowerCase().includes(q);
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
        const res = testSisConnection(facilityId);
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

  // Manual Trigger Sync
  const handleTriggerSync = useCallback(() => {
    setIsSyncing(true);
    setTimeout(() => {
      try {
        const res = triggerManualSync(facilityId);
        setRefreshKey(k => k + 1);
        setBanner({
          show: true,
          type: 'success',
          message: `${res.message} Batch: ${res.batch.batchCode}.`
        });
      } catch (err) {
        setBanner({ show: true, type: 'error', message: err.message });
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  }, [facilityId]);

  return (
    <div className="sis-container">
      {/* Notification Banner */}
      {banner.show && (
        <div className={`sis-banner sis-banner-${banner.type}`}>
          <div className="sis-banner-content">
            {banner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="sis-btn-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Control Card */}
      <div className="sis-header-card">
        <div className="sis-header-left">
          <div className="sis-header-badges">
            <span className="sis-badge-facility">{facilityName}</span>
            <span className="sis-badge-phase">Phase F3: SIS Gateway</span>
            <span className="sis-badge-status">
              <span className="sis-status-dot"></span>
              {telemetry.syncStatus} - {telemetry.healthStatus}
            </span>
          </div>
          <p className="sis-header-note">
            Continuous bi-directional synchronization with SIS EHR/PMS (SIS Exchange / SIS AdvantX). Normalizes perioperative milestones, validates chronological invariants, and reconciles itemized surgical charges.
          </p>
        </div>
        <div className="sis-header-actions">
          <button className="sis-btn-secondary" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? <RefreshCw size={14} className="sis-spin" /> : <Activity size={14} />}
            <span>Test Connection</span>
          </button>
          <button className="sis-btn-secondary" onClick={() => setIsDrawerOpen(true)} title="View Cryptographic Ingestion Ledger">
            <ShieldCheck size={14} />
            <span>Audit Provenance</span>
          </button>
          <button className="sis-btn-primary" onClick={handleTriggerSync} disabled={isSyncing}>
            {isSyncing ? <RefreshCw size={14} className="sis-spin" /> : <Play size={14} />}
            <span>Trigger Sync Now</span>
          </button>
        </div>
      </div>

      {/* 6-Card Telemetry Ribbon */}
      <div className="sis-telemetry-ribbon">
        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">CONNECTION STATE</span>
            <Server size={16} className="sis-tcard-icon text-emerald" />
          </div>
          <div className="sis-tcard-value text-emerald">{telemetry.healthStatus}</div>
          <div className="sis-tcard-subtext">SIS Exchange API v2</div>
        </div>

        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">24H SYNCED CASES</span>
            <Layers size={16} className="sis-tcard-icon text-sky" />
          </div>
          <div className="sis-tcard-value">{telemetry.totalSyncedCases}</div>
          <div className="sis-tcard-subtext">Clinical encounters</div>
        </div>

        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">MILESTONE COMPLETENESS</span>
            <CheckCircle2 size={16} className="sis-tcard-icon text-emerald" />
          </div>
          <div className="sis-tcard-value text-emerald">{telemetry.milestoneCompletenessPct}%</div>
          <div className="sis-tcard-subtext">Chronologically validated</div>
        </div>

        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">CLINICAL-TO-BILLING LAG</span>
            <Clock size={16} className="sis-tcard-icon text-sky" />
          </div>
          <div className="sis-tcard-value">{telemetry.avgClinicalToBillingLagHours} hrs</div>
          <div className="sis-tcard-subtext">Surg close to charge post</div>
        </div>

        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">SYNCED CHARGES</span>
            <DollarSign size={16} className="sis-tcard-icon text-blue" />
          </div>
          <div className="sis-tcard-value">${telemetry.totalChargesAmount.toLocaleString()}</div>
          <div className="sis-tcard-subtext">{telemetry.totalChargesCaptured} itemized charge lines</div>
        </div>

        <div className="sis-telemetry-card">
          <div className="sis-tcard-header">
            <span className="sis-tcard-label">PROVENANCE SEAL</span>
            <ShieldCheck size={16} className="sis-tcard-icon text-emerald" />
          </div>
          <div className="sis-tcard-value sis-seal-hash" title={telemetry.latestSyncSeal}>
            {telemetry.latestSyncSeal.slice(0, 16)}...
          </div>
          <div className="sis-tcard-subtext">SHA-256 Tamper-Evident</div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="sis-tabs-bar">
        <button
          className={`sis-tab-btn ${activeSubTab === 'milestones' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('milestones')}
        >
          <Clock size={15} />
          <span>Perioperative Milestones & Chronology ({milestones.length})</span>
        </button>
        <button
          className={`sis-tab-btn ${activeSubTab === 'charges' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('charges')}
        >
          <DollarSign size={15} />
          <span>AdvantX Itemized Charges & Margin ({chargeItems.length})</span>
        </button>
        <button
          className={`sis-tab-btn ${activeSubTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('batches')}
        >
          <Layers size={15} />
          <span>Sync Batches Ledger ({batches.length})</span>
        </button>
        <button
          className={`sis-tab-btn ${activeSubTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('config')}
        >
          <Sliders size={15} />
          <span>Connector Configuration</span>
        </button>
      </div>

      {/* SUB-TAB 1: PERIOPERATIVE MILESTONES & CHRONOLOGY */}
      {activeSubTab === 'milestones' && (
        <div className="sis-milestone-panel">
          <div className="sis-table-toolbar">
            <div className="sis-search-box">
              <Search size={14} className="text-slate" />
              <input
                type="text"
                placeholder="Search milestones by SIS Case ID, Surgeon, CPT, or Room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="sis-btn-icon-clear" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="sis-milestone-legend">
              <span className="sis-legend-item"><span className="sis-dot-green"></span> Chronology Valid</span>
              <span className="sis-legend-item"><span className="sis-dot-amber"></span> Anomaly Flag</span>
            </div>
          </div>

          <div className="sis-milestones-cards-grid">
            {filteredMilestones.map((m) => {
              const c = caseMappings.find(item => item.sisCaseId === m.sisCaseId);
              return (
                <div
                  key={m.id}
                  className={`sis-milestone-card ${selectedCaseId === m.sisCaseId ? 'active' : ''}`}
                  onClick={() => setSelectedCaseId(m.sisCaseId)}
                >
                  <div className="sis-mcard-top">
                    <div>
                      <span className="sis-case-tag">{m.sisCaseId}</span>
                      <span className="sis-room-tag">{c?.orRoomName || 'OR-1'}</span>
                    </div>
                    <span className="sis-status-clean-badge">
                      <CheckCircle2 size={13} className="text-emerald" /> Valid Sequence
                    </span>
                  </div>

                  <div className="sis-mcard-meta">
                    <span className="sis-meta-surgeon">{c?.surgeonName}</span>
                    <span className="sis-meta-cpt">CPT: {c?.primaryCpt}</span>
                  </div>

                  {/* 6-Stage Perioperative Visualizer */}
                  <div className="sis-timeline-stepper">
                    <div className="sis-tstep">
                      <span className="sis-tlabel">Check-In</span>
                      <span className="sis-ttime">{m.checkInTime ? new Date(m.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                    <div className="sis-tdivider"></div>
                    <div className="sis-tstep">
                      <span className="sis-tlabel">Room In</span>
                      <span className="sis-ttime">{m.roomInTime ? new Date(m.roomInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                    <div className="sis-tdivider"></div>
                    <div className="sis-tstep">
                      <span className="sis-tlabel">Incision</span>
                      <span className="sis-ttime">{m.incisionTime ? new Date(m.incisionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                    <div className="sis-tdivider"></div>
                    <div className="sis-tstep">
                      <span className="sis-tlabel">Close</span>
                      <span className="sis-ttime">{m.closeTime ? new Date(m.closeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                    <div className="sis-tdivider"></div>
                    <div className="sis-tstep">
                      <span className="sis-tlabel">Room Out</span>
                      <span className="sis-ttime">{m.roomOutTime ? new Date(m.roomOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                    <div className="sis-tdivider"></div>
                    <div className="sis-tstep">
                      <span className="sis-tlabel">PACU Out</span>
                      <span className="sis-ttime">{m.pacuOutTime ? new Date(m.pacuOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}</span>
                    </div>
                  </div>

                  <div className="sis-mcard-footer">
                    <div className="sis-duration-pill">
                      <span>Room: <strong>{m.totalRoomMinutes} min</strong></span>
                    </div>
                    <div className="sis-duration-pill">
                      <span>Cut-to-Close: <strong>{m.surgicalDurationMinutes} min</strong></span>
                    </div>
                    <div className="sis-duration-pill">
                      <span>Turnover: <strong>{m.turnoverMinutes} min</strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ADVANTX ITEMIZED CHARGES & MARGIN AUDIT */}
      {activeSubTab === 'charges' && (
        <div className="sis-charges-panel">
          {/* Case Picker Strip */}
          <div className="sis-charges-header-bar">
            <div className="sis-cselector-group">
              <span className="sis-toolbar-label">Select Case:</span>
              <select
                className="sis-select"
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
              >
                {caseMappings.map(c => (
                  <option key={c.id} value={c.sisCaseId}>
                    {c.sisCaseId} - {c.surgeonName} ({c.primaryCpt}) [{c.billingStatus}]
                  </option>
                ))}
              </select>
            </div>

            {/* Case Level Margin Mini-Ribbon */}
            <div className="sis-case-summary-pills">
              <div className="sis-spill">
                <span className="sis-splabel">TOTAL CHARGES:</span>
                <span className="sis-spval">${chargeAudit.totalCharges.toLocaleString()}</span>
              </div>
              <div className="sis-spill">
                <span className="sis-splabel">DIRECT COST:</span>
                <span className="sis-spval">${chargeAudit.totalCost.toLocaleString()}</span>
              </div>
              <div className="sis-spill">
                <span className="sis-splabel">EST. MARGIN:</span>
                <span className="sis-spval text-emerald">${chargeAudit.estimatedContributionMargin.toLocaleString()}</span>
              </div>
              <div className="sis-spill">
                <span className="sis-splabel">IMPLANTS:</span>
                <span className="sis-spval">{chargeAudit.implantConstructCount} items</span>
              </div>
            </div>
          </div>

          <div className="sis-table-card">
            <div className="sis-table-responsive">
              <table className="sis-table">
                <thead>
                  <tr>
                    <th>Line ID</th>
                    <th>Category</th>
                    <th>Code / Catalog #</th>
                    <th>Item Description</th>
                    <th>Qty</th>
                    <th>Unit Charge</th>
                    <th>Total Charge</th>
                    <th>Cost Amount</th>
                    <th>Implant Construct</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCharges.map((chg) => (
                    <tr key={chg.id}>
                      <td className="sis-font-mono">{chg.lineItemId}</td>
                      <td>
                        <span className={`sis-cat-badge sis-cat-${chg.chargeCategory.toLowerCase()}`}>
                          {chg.chargeCategory.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="sis-font-mono"><strong>{chg.code}</strong></td>
                      <td>{chg.description}</td>
                      <td>{chg.quantity}</td>
                      <td>${chg.unitCharge.toFixed(2)}</td>
                      <td className="sis-bold-num">${chg.totalCharge.toFixed(2)}</td>
                      <td>${chg.costAmount.toFixed(2)}</td>
                      <td>
                        {chg.isImplantConstruct ? (
                          <span className="sis-implant-badge">
                            <Tag size={12} /> {chg.lotNumber || 'Tracked'}
                          </span>
                        ) : (
                          <span className="text-slate">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SYNC BATCHES LEDGER */}
      {activeSubTab === 'batches' && (
        <div className="sis-table-card">
          <div className="sis-table-responsive">
            <table className="sis-table">
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Sync Type</th>
                  <th>Status</th>
                  <th>Cases (Retrieved / Ins / Upd)</th>
                  <th>Milestones Parsed</th>
                  <th>Charges Synced</th>
                  <th>Duration</th>
                  <th>Cryptographic Seal</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="sis-font-mono sis-batch-code">{b.batchCode}</td>
                    <td>
                      <span className="sis-sync-type-pill">{b.syncType}</span>
                    </td>
                    <td>
                      <span className={`sis-status-badge sis-status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="sis-row-counts">
                        <span className="sis-count-tot">{b.casesRetrieved} tot</span>
                        <span className="sis-count-val">{b.casesInserted} new</span>
                        <span className="sis-count-upd">{b.casesUpdated} upd</span>
                      </div>
                    </td>
                    <td>{b.milestonesParsed}</td>
                    <td>{b.chargesSynced}</td>
                    <td>{b.durationMs} ms</td>
                    <td>
                      <span className="sis-seal-chip" title={b.sha256SyncSeal}>
                        {b.sha256SyncSeal.slice(0, 14)}...
                      </span>
                    </td>
                    <td className="sis-time">{new Date(b.completedAt || b.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: CONNECTOR CONFIGURATION */}
      {activeSubTab === 'config' && (
        <div className="sis-config-panel">
          <div className="sis-config-card">
            <div className="sis-ccard-header">
              <Server size={18} className="text-sky" />
              <h4>SIS Exchange Gateway Settings</h4>
            </div>

            <div className="sis-config-grid">
              <div className="sis-cfield">
                <label>API Endpoint URL:</label>
                <input type="text" readOnly value={config.apiEndpointUrl} className="sis-input-readonly" />
              </div>
              <div className="sis-cfield">
                <label>SIS Facility Code:</label>
                <input type="text" readOnly value={config.sisFacilityCode} className="sis-input-readonly" />
              </div>
              <div className="sis-cfield">
                <label>Authentication Protocol:</label>
                <input type="text" readOnly value={config.authType} className="sis-input-readonly" />
              </div>
              <div className="sis-cfield">
                <label>OAuth2 Client ID:</label>
                <input type="text" readOnly value={config.clientId} className="sis-input-readonly" />
              </div>
              <div className="sis-cfield">
                <label>Incremental Polling Interval:</label>
                <input type="text" readOnly value={`${config.pollingIntervalMinutes} minutes`} className="sis-input-readonly" />
              </div>
              <div className="sis-cfield">
                <label>Last Sync Cursor Timestamp:</label>
                <input type="text" readOnly value={new Date(config.lastSyncCursorAt).toLocaleString()} className="sis-input-readonly" />
              </div>
            </div>

            <div className="sis-config-footer">
              <span className="sis-text-clean">
                <CheckCircle2 size={14} className="text-emerald" /> Gateway Connected & Heartbeat Operational
              </span>
              <button className="sis-btn-secondary" onClick={handleTestConnection} disabled={isTesting}>
                <Activity size={14} /> Ping Handshake
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out Provenance Drawer */}
      {isDrawerOpen && (
        <div className="sis-drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="sis-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sis-drawer-header">
              <div className="sis-dheader-title">
                <ShieldCheck size={20} className="text-emerald" />
                <h3>SIS Gateway Ingestion Provenance</h3>
              </div>
              <button className="sis-btn-icon-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="sis-drawer-body">
              <p className="sis-drawer-desc">
                Cryptographic audit trail recording SIS Exchange incremental poll events, electronic nursing milestone locks, and SHA-256 sync digests.
              </p>

              <div className="sis-provenance-box">
                <span className="sis-plabel">Facility Tenancy UUID:</span>
                <span className="sis-pval sis-font-mono">{facilityId}</span>
              </div>

              <div className="sis-provenance-box">
                <span className="sis-plabel">Latest Sync Seal:</span>
                <span className="sis-pval sis-font-mono text-emerald">{telemetry.latestSyncSeal}</span>
              </div>

              <h4 className="sis-dsubhead">Ingestion Batches Audit History</h4>
              <div className="sis-audit-list">
                {batches.map(b => (
                  <div key={b.id} className="sis-audit-item">
                    <div className="sis-aitem-top">
                      <span className="sis-font-mono">{b.batchCode}</span>
                      <span className={`sis-status-badge sis-status-${b.status.toLowerCase()}`}>{b.status}</span>
                    </div>
                    <div className="sis-aitem-mid">
                      <span>Type: {b.syncType}</span>
                      <span>Cases: {b.casesRetrieved}</span>
                    </div>
                    <div className="sis-aitem-seal">
                      <span className="text-slate">Seal: </span>
                      <span className="sis-font-mono text-emerald">{b.sha256SyncSeal}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sis-drawer-footer">
              <button className="sis-btn-secondary" onClick={() => setIsDrawerOpen(false)}>
                Close Audit Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
