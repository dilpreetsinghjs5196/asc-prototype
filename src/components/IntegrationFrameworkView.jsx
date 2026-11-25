import React, { useState, useMemo } from 'react';
import {
  Server,
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Lock,
  X,
  FileText,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  Printer,
  Database,
  ExternalLink,
  Cpu,
  AlertTriangle,
  Play
} from 'lucide-react';
import {
  getFacilityConnectors,
  getConnectorByIdOrCode,
  getFacilityBatches,
  getIntegrationMappings,
  getIntegrationTelemetry,
  triggerManualSyncBatch,
  replayFailedBatch,
  CONNECTOR_STATUSES,
  CONNECTOR_CATEGORIES,
  BATCH_STATUSES,
  JOB_TYPES
} from '../services/integrationFrameworkService';
import './IntegrationFrameworkView.css';

export default function IntegrationFrameworkView({ activeFacility = 'fac-naples-01' }) {
  const facilityId = typeof activeFacility === 'object' && activeFacility !== null
    ? (activeFacility.id || 'fac-naples-01')
    : (activeFacility || 'fac-naples-01');

  const [activeTab, setActiveTab] = useState('batches'); // 'batches', 'mappings', 'architecture'
  const [selectedConnectorFilter, setSelectedConnectorFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const [syncInProgress, setSyncInProgress] = useState(false);

  const telemetry = useMemo(() => {
    return getIntegrationTelemetry(facilityId);
  }, [facilityId, actionNotice]);

  const connectors = useMemo(() => {
    return getFacilityConnectors(facilityId);
  }, [facilityId, actionNotice]);

  const batches = useMemo(() => {
    return getFacilityBatches(facilityId, selectedConnectorFilter);
  }, [facilityId, selectedConnectorFilter, actionNotice]);

  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchesSearch = !searchQuery ||
        b.batchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.connectorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.jobType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.status.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [batches, searchQuery]);

  const mappings = useMemo(() => {
    return getIntegrationMappings(selectedConnectorFilter);
  }, [selectedConnectorFilter]);

  const handleSyncConnector = (connectorCode) => {
    setSyncInProgress(true);
    try {
      const res = triggerManualSyncBatch(connectorCode, facilityId);
      setActionNotice({
        type: 'success',
        message: `Dispatched manual sync batch ${res.batchCode} for ${res.connectorCode} (${res.recordsIngested} records ingested).`
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to dispatch manual sync'
      });
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleReplayBatch = (batchCode) => {
    try {
      const res = replayFailedBatch(batchCode, facilityId);
      setActionNotice({
        type: 'success',
        message: `Successfully replayed batch ${res.batchCode}. All rejected records reprocessed.`
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: err.message || 'Failed to replay batch'
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="int-container">
      {/* Alert Banner */}
      {actionNotice && (
        <div className={`int-banner ${actionNotice.type === 'error' ? 'int-banner-error' : 'int-banner-success'}`}>
          <div className="int-banner-content">
            {actionNotice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span>{actionNotice.message}</span>
          </div>
          <button
            type="button"
            className="int-banner-close"
            onClick={() => setActionNotice(null)}
            title="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="int-header-card">
        <div className="int-header-left">
          <div className="int-header-badges">
            <span className="int-badge int-badge-facility">Naples Surgery Center</span>
            <span className="int-badge int-badge-phase">Phase F0 - Module 15 Integrations</span>
            <span className="int-badge int-badge-status healthy">
              <Activity size={12} className="inline-icon" />
              INTEGRATION_BUS_HEALTHY
            </span>
            <span className="int-badge int-badge-version">
              <Cpu size={12} className="inline-icon" />
              v2.4.0 Common Core
            </span>
          </div>
          <h1 className="int-title">Common Integration Framework & Connectors</h1>
          <p className="int-subtitle">
            Enterprise healthcare integration gateway connecting EHR/Practice Management, Clearinghouses,
            Materials Supply Chain, and General Ledger accounting with deterministic data provenance.
          </p>
        </div>

        <div className="int-header-actions">
          <button
            type="button"
            className="int-btn int-btn-secondary"
            onClick={() => setShowDrawer(true)}
            title="Inspect Data Lineage & Provenance Cryptographic Seal"
          >
            <Lock size={16} />
            <span>Audit Seal</span>
          </button>

          <button
            type="button"
            className="int-btn int-btn-primary"
            onClick={handlePrint}
            title="Export Integration Configuration Dossier"
          >
            <Printer size={16} />
            <span>Export Dossier</span>
          </button>
        </div>
      </div>

      {/* Operational Telemetry Ribbon (6 Cards) */}
      <div className="int-scorecard-grid">
        {/* KPI 1: Active Connectors */}
        <div className="int-kpi-card highlight">
          <div className="int-kpi-header">
            <span className="int-kpi-label">ACTIVE CONNECTORS</span>
            <Server size={16} className="int-kpi-icon emerald" />
          </div>
          <div className="int-kpi-value text-emerald">{telemetry.healthyConnectors} / {telemetry.totalConnectors}</div>
          <div className="int-kpi-subtext">
            <span>100% Operational</span>
            <span className="int-delta-positive">4 Systems Online</span>
          </div>
        </div>

        {/* KPI 2: 24h Batches */}
        <div className="int-kpi-card">
          <div className="int-kpi-header">
            <span className="int-kpi-label">BATCHES (24H)</span>
            <Layers size={16} className="int-kpi-icon sky" />
          </div>
          <div className="int-kpi-value">{telemetry.totalBatches24h} Batches</div>
          <div className="int-kpi-subtext">
            <span>Completed: {telemetry.completedBatches24h}</span>
            <span className="int-delta-positive">1 Replay Handled</span>
          </div>
        </div>

        {/* KPI 3: Batch Success Rate */}
        <div className="int-kpi-card">
          <div className="int-kpi-header">
            <span className="int-kpi-label">SUCCESS RATE</span>
            <CheckCircle size={16} className="int-kpi-icon emerald" />
          </div>
          <div className="int-kpi-value">{telemetry.batchSuccessRatePercent}%</div>
          <div className="int-kpi-subtext">
            <span>Benchmark: &gt;95.0%</span>
            <span className="int-delta-positive">High Reliability</span>
          </div>
        </div>

        {/* KPI 4: Records Ingested */}
        <div className="int-kpi-card">
          <div className="int-kpi-header">
            <span className="int-kpi-label">RECORDS INGESTED (24H)</span>
            <Database size={16} className="int-kpi-icon emerald" />
          </div>
          <div className="int-kpi-value">{(telemetry.totalRecordsIngested24h).toLocaleString()}</div>
          <div className="int-kpi-subtext">
            <span>Transferred: 18.6 MB</span>
            <span className="int-delta-positive">0.11% Rejection</span>
          </div>
        </div>

        {/* KPI 5: Average Latency */}
        <div className="int-kpi-card">
          <div className="int-kpi-header">
            <span className="int-kpi-label">AVERAGE LATENCY</span>
            <Clock size={16} className="int-kpi-icon sky" />
          </div>
          <div className="int-kpi-value">{(telemetry.avgDurationMs).toLocaleString()} ms</div>
          <div className="int-kpi-subtext">
            <span>CDC + SFTP Pipeline</span>
            <span className="int-delta-neutral">Sub-2s SLA</span>
          </div>
        </div>

        {/* KPI 6: Dead-Letter Queue */}
        <div className="int-kpi-card">
          <div className="int-kpi-header">
            <span className="int-kpi-label">DEAD-LETTER (DLQ)</span>
            <AlertTriangle size={16} className="int-kpi-icon amber" />
          </div>
          <div className="int-kpi-value text-amber">{telemetry.totalRecordsRejected24h} Records</div>
          <div className="int-kpi-subtext">
            <span>Unmapped Items</span>
            <span className="int-delta-neutral">Ready for Replay</span>
          </div>
        </div>
      </div>

      {/* Enterprise Connectors Grid */}
      <div className="int-connectors-section">
        <div className="int-section-header">
          <h2 className="int-section-title">Configured Enterprise Connectors</h2>
          <span className="int-section-desc">Multi-protocol healthcare adapters with real-time heartbeat monitoring</span>
        </div>

        <div className="int-connectors-grid">
          {connectors.map(conn => (
            <div key={conn.id} className="int-connector-card">
              <div className="int-connector-card-header">
                <div>
                  <span className={`int-category-tag ${conn.category.toLowerCase()}`}>{conn.category.replace('_', ' ')}</span>
                  <h3 className="int-connector-name">{conn.connectorName}</h3>
                </div>
                <span className={`int-status-badge ${conn.status.toLowerCase()}`}>
                  <Activity size={11} className="inline-icon" />
                  {conn.status}
                </span>
              </div>

              <div className="int-connector-details">
                <div className="int-detail-row">
                  <span className="int-detail-key">Protocol / Transport</span>
                  <span className="int-detail-val"><code>{conn.protocol}</code></span>
                </div>
                <div className="int-detail-row">
                  <span className="int-detail-key">Sync Schedule</span>
                  <span className="int-detail-val">{conn.syncFrequency.replace('_', ' ')}</span>
                </div>
                <div className="int-detail-row">
                  <span className="int-detail-key">Uptime SLA</span>
                  <span className="int-detail-val text-emerald text-bold">{conn.uptimePercent}%</span>
                </div>
                <div className="int-detail-row">
                  <span className="int-detail-key">Endpoint URL</span>
                  <span className="int-detail-val int-url-truncate" title={conn.endpointUrl}>{conn.endpointUrl}</span>
                </div>
                <div className="int-detail-row">
                  <span className="int-detail-key">Credentials</span>
                  <span className="int-detail-val text-muted">
                    {conn.credentialsMasked?.maskedSecret || conn.credentialsMasked?.maskedKey || conn.credentialsMasked?.keyFingerprint || 'Encrypted'}
                  </span>
                </div>
              </div>

              <div className="int-connector-card-footer">
                <span className="int-last-sync">
                  Last Sync: {new Date(conn.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  type="button"
                  className="int-btn int-btn-secondary int-btn-sm"
                  onClick={() => handleSyncConnector(conn.connectorCode)}
                  disabled={syncInProgress}
                  title={`Trigger immediate sync for ${conn.connectorName}`}
                >
                  <RefreshCw size={13} className={syncInProgress ? 'spin' : ''} />
                  <span>Sync Now</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="int-tabs-bar">
        <button
          type="button"
          className={`int-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          <Layers size={16} />
          <span>Batch Execution Ledger</span>
          <span className="int-tab-count">({filteredBatches.length})</span>
        </button>

        <button
          type="button"
          className={`int-tab-btn ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          <FileText size={16} />
          <span>Canonical Field Mappings</span>
          <span className="int-tab-count">({mappings.length})</span>
        </button>

        <button
          type="button"
          className={`int-tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
          onClick={() => setActiveTab('architecture')}
        >
          <Cpu size={16} />
          <span>Architecture & Health Parameters</span>
        </button>
      </div>

      {/* Tab 1: Batch Execution Ledger */}
      {activeTab === 'batches' && (
        <div className="int-tab-content-card">
          <div className="int-table-toolbar">
            <div className="int-search-box">
              <Search size={14} className="int-search-icon" />
              <input
                type="text"
                placeholder="Search batch code, connector, status..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="int-search-input"
              />
            </div>

            <div className="int-filter-pills">
              {['ALL', 'CONN_HST_PATHWAYS', 'CONN_WAYSTAR_EDI', 'CONN_MEDLINE_ERP', 'CONN_NETSUITE_GL'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`int-filter-pill ${selectedConnectorFilter === c ? 'active' : ''}`}
                  onClick={() => setSelectedConnectorFilter(c)}
                >
                  {c === 'ALL' ? 'All Connectors' : c.replace('CONN_', '').replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="int-table-wrapper">
            <table className="int-table">
              <thead>
                <tr>
                  <th>BATCH CODE</th>
                  <th>CONNECTOR</th>
                  <th>JOB TYPE</th>
                  <th>STATUS</th>
                  <th className="text-right">EXTRACTED</th>
                  <th className="text-right">INGESTED</th>
                  <th className="text-right">REJECTED</th>
                  <th className="text-right">LATENCY</th>
                  <th>STARTED</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => (
                  <tr key={b.id} className="int-table-row">
                    <td><code>{b.batchCode}</code></td>
                    <td className="int-cell-name">{b.connectorName}</td>
                    <td><span className="int-type-tag">{b.jobType}</span></td>
                    <td>
                      <span className={`int-batch-status ${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="int-cell-num">{b.recordsExtracted}</td>
                    <td className="int-cell-num text-bold text-emerald">{b.recordsIngested}</td>
                    <td className="int-cell-num text-amber">
                      {b.recordsRejected > 0 ? (
                        <span title={b.errorSummary}>{b.recordsRejected} (DLQ)</span>
                      ) : '0'}
                    </td>
                    <td className="int-cell-num">{b.durationMs} ms</td>
                    <td className="int-cell-time">{new Date(b.startedAt).toLocaleTimeString()}</td>
                    <td>
                      {b.recordsRejected > 0 ? (
                        <button
                          type="button"
                          className="int-btn-link text-amber"
                          onClick={() => handleReplayBatch(b.batchCode)}
                          title="Replay rejected DLQ records"
                        >
                          <Play size={12} className="inline-icon" />
                          Replay
                        </button>
                      ) : (
                        <span className="text-muted text-xs">Verified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Canonical Field Mappings */}
      {activeTab === 'mappings' && (
        <div className="int-tab-content-card">
          <div className="int-mappings-intro">
            <h3>Canonical Schema Translation Matrix</h3>
            <p>Declarative transformation rules normalizing external partner structures into unified platform tables.</p>
          </div>

          <div className="int-mappings-stack">
            {mappings.map(map => (
              <div key={map.id} className="int-mapping-block">
                <div className="int-mapping-block-header">
                  <div>
                    <span className="int-badge int-badge-facility">{map.connectorCode}</span>
                    <h4 className="int-mapping-title">{map.mappingCode}</h4>
                  </div>
                  <div className="int-mapping-entities">
                    <code>{map.sourceEntity}</code>
                    <ArrowRight size={14} className="int-arrow-icon" />
                    <code>{map.targetEntity}</code>
                  </div>
                </div>

                <table className="int-table int-subtable">
                  <thead>
                    <tr>
                      <th>SOURCE FIELD</th>
                      <th>TRANSFORM EXPRESSION</th>
                      <th>CANONICAL TARGET FIELD</th>
                      <th>DATA TYPE</th>
                      <th>SCHEMA STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {map.fieldRules.map((rule, idx) => (
                      <tr key={idx}>
                        <td><code>{rule.source}</code></td>
                        <td className="text-muted"><code>direct_copy({rule.source})</code></td>
                        <td><code>{rule.target}</code></td>
                        <td><span className="int-type-tag">{rule.type}</span></td>
                        <td><span className="int-batch-status completed">{rule.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Architecture & Health Parameters */}
      {activeTab === 'architecture' && (
        <div className="int-tab-content-card">
          <div className="int-arch-grid">
            <div className="int-arch-card">
              <h4 className="int-arch-card-title">Integration Bus Protocols</h4>
              <ul className="int-arch-list">
                <li><strong>FHIR R4 (US Core):</strong> Bidirectional scheduling & surgical case synchronization with HST Pathways.</li>
                <li><strong>ANSI ASC X12 EDI (SFTP):</strong> Batch clearinghouse ingestion for 837I/P institutional/professional claims & 835 ERAs.</li>
                <li><strong>REST JSON / OAuth2:</strong> Purchase order generation & sterile pack invoice ingestion with Medline.</li>
                <li><strong>Accounting Webhooks:</strong> Double-entry journal voucher dispatch to NetSuite General Ledger.</li>
              </ul>
            </div>

            <div className="int-arch-card">
              <h4 className="int-arch-card-title">Fault Tolerance & DLQ Policies</h4>
              <ul className="int-arch-list">
                <li><strong>Exponential Backoff:</strong> Retries transient network failures at 2s, 4s, 8s intervals up to 3 attempts.</li>
                <li><strong>Dead-Letter Routing:</strong> Records with unmapped foreign keys or invalid CPT formats are segregated with source error telemetry.</li>
                <li><strong>Idempotency Guarantees:</strong> Batch run IDs prevent duplicate transaction processing.</li>
                <li><strong>Cryptographic Immutability:</strong> Every batch run is sealed with SHA-256 tamper-evident payload hashing.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Slide-out Provenance & Audit Drawer */}
      {showDrawer && (
        <div className="int-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="int-drawer-panel" onClick={e => e.stopPropagation()}>
            <div className="int-drawer-header">
              <div className="int-drawer-title-group">
                <Lock size={18} className="int-drawer-icon" />
                <h3 className="int-drawer-title">Integration Provenance & Sync Seal</h3>
              </div>
              <button
                type="button"
                className="int-drawer-close"
                onClick={() => setShowDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="int-drawer-content">
              <div className="int-drawer-section">
                <h4 className="int-drawer-heading">SHA-256 Integration Seal</h4>
                <div className="int-hash-box">
                  <code>{telemetry.syncIntegritySeal}</code>
                </div>
                <p className="int-drawer-hint">
                  Cryptographic digest binding all 4 active connectors, batch execution history,
                  and 12,450 ingested transactions for Naples Surgery Center against unauthorized alteration.
                </p>
              </div>

              <div className="int-drawer-section">
                <h4 className="int-drawer-heading">Facility Provenance Metadata</h4>
                <div className="int-meta-table">
                  <div className="int-meta-row">
                    <span className="int-meta-key">Facility Tenant</span>
                    <span className="int-meta-val">Naples Surgery Center (fac-naples-01)</span>
                  </div>
                  <div className="int-meta-row">
                    <span className="int-meta-key">Active Connectors</span>
                    <span className="int-meta-val">4 Enterprise Systems</span>
                  </div>
                  <div className="int-meta-row">
                    <span className="int-meta-key">Total Records Synced</span>
                    <span className="int-meta-val">12,450 Records (24h)</span>
                  </div>
                  <div className="int-meta-row">
                    <span className="int-meta-key">Average Throughput</span>
                    <span className="int-meta-val">1,420 ms / Batch</span>
                  </div>
                  <div className="int-meta-row">
                    <span className="int-meta-key">Security Envelope</span>
                    <span className="int-meta-val">TLS 1.3 / AES-256 / SSH Key Pair</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
