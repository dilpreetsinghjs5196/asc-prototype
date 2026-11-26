import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Layers,
  Database,
  FileCode2,
  Lock,
  ArrowRight,
  Play,
  Plus,
  X
} from 'lucide-react';
import {
  CANONICAL_SOURCE_SYSTEMS,
  getSprConfig,
  getSprTelemetry,
  getSprSourceSystems,
  getSprMappingVersions,
  getSprIngestionBatches,
  getSprRecordLineage,
  getSprAuditChain,
  getSprVerificationRuns,
  registerSourceMappingVersion,
  verifyProvenanceChainIntegrity,
  normalizeFacilityId
} from '../services/sourceProvenanceService';
import './SourceProvenanceView.css';

export default function SourceProvenanceView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('tracer'); // 'tracer' | 'batches' | 'mappings' | 'chain'
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLineageId, setSelectedLineageId] = useState('lin-501');
  const [isAuditing, setIsAuditing] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [sourceSystems, setSourceSystems] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [batches, setBatches] = useState([]);
  const [lineages, setLineages] = useState([]);
  const [auditChain, setAuditChain] = useState([]);
  const [verificationRuns, setVerificationRuns] = useState([]);

  const [newMappingForm, setNewMappingForm] = useState({
    source_system: 'SIS_EHR',
    entity_type: 'SURGICAL_CASE',
    version_tag: 'map-v2.5.0',
    approved_by: 'data_steward@naplessurgery.com'
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, sys, map, bat, lin, chn, runs] = await Promise.all([
          getSprConfig(facilityId),
          getSprTelemetry(facilityId),
          getSprSourceSystems(facilityId),
          getSprMappingVersions(facilityId),
          getSprIngestionBatches(facilityId),
          getSprRecordLineage(facilityId),
          getSprAuditChain(facilityId),
          getSprVerificationRuns(facilityId)
        ]);
        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setSourceSystems(sys);
        setMappings(map);
        setBatches(bat);
        setLineages(lin);
        setAuditChain(chn);
        setVerificationRuns(runs);
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Source Provenance registry: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  const filteredLineages = useMemo(() => {
    return lineages.filter(item => {
      if (sourceFilter !== 'ALL' && item.source_system !== sourceFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${item.lineage_code} ${item.target_record_id} ${item.source_record_id} ${item.batch_control_number} ${item.mapping_version_tag} ${item.source_system}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [lineages, sourceFilter, searchQuery]);

  const selectedLineage = useMemo(() => {
    return filteredLineages.find(l => l.id === selectedLineageId) || filteredLineages[0] || null;
  }, [filteredLineages, selectedLineageId]);

  const selectedBatch = useMemo(() => {
    if (!selectedLineage) return null;
    return batches.find(b => b.batch_control_number === selectedLineage.batch_control_number) || null;
  }, [batches, selectedLineage]);

  const selectedEvents = useMemo(() => {
    if (!selectedLineage) return [];
    return auditChain.filter(e => e.lineage_id === selectedLineage.id);
  }, [auditChain, selectedLineage]);

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleRunIntegrityAudit = async () => {
    setIsAuditing(true);
    try {
      const report = await verifyProvenanceChainIntegrity(facilityId, 'compliance@naplessurgery.com');
      setRefreshKey(k => k + 1);
      showToast(
        report.intact ? 'success' : 'error',
        `Chain Audit ${report.run_code}: Audited ${report.records_audited} events · Breaks: ${report.chain_breaks_detected} · Reproducibility: ${report.reproducibility_rate}%`
      );
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsAuditing(false);
    }
  };

  const handlePublishMapping = async (e) => {
    e.preventDefault();
    try {
      const created = await registerSourceMappingVersion(facilityId, {
        ...newMappingForm,
        field_transform_spec_json: { updated_schema: 'CANONICAL_ISO_STRICT' }
      });
      setIsMappingModalOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', `Published mapping ${created.mapping_code} (${created.version_tag}) and retired superseded version cleanly.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  return (
    <div className="spr-container">
      {/* Header Bar */}
      <div className="spr-header-bar">
        <div className="spr-header-title">
          <div className="spr-title-icon">
            <History size={20} />
          </div>
          <div>
            <h2>Source Provenance, Lineage & Cryptographic Audit Chain</h2>
            <p className="spr-subtitle">
              {facilityName} · End-to-End Source System, Source ID, Batch Envelope, Mapping Version & 7-Year Hash-Chain Attestation
            </p>
          </div>
        </div>
        <div className="spr-header-actions">
          <button className="spr-btn-secondary" onClick={() => setIsMappingModalOpen(true)}>
            <Plus size={15} />
            Publish Mapping Version
          </button>
          <button className="spr-btn-primary" onClick={handleRunIntegrityAudit} disabled={isAuditing}>
            <Play size={15} />
            {isAuditing ? 'Auditing Chain...' : 'Verify Chain Integrity'}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner.show && (
        <div className={`spr-banner spr-banner-${banner.type}`}>
          <div className="spr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="spr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="spr-telemetry-grid">
          <div className="spr-kpi-card">
            <div className="spr-kpi-label">
              <Database size={14} className="text-sky-600" />
              Tracked Lineage Records
            </div>
            <div className="spr-kpi-value">{telemetry.tracked_lineage_count}</div>
            <div className="spr-kpi-meta">Across {sourceSystems.length} governed source systems</div>
          </div>

          <div className="spr-kpi-card">
            <div className="spr-kpi-label">
              <FileCode2 size={14} className="text-emerald-600" />
              Active Mapping Versions
            </div>
            <div className="spr-kpi-value">{telemetry.active_mapping_versions_count}</div>
            <div className="spr-kpi-meta">SemVer schema transform specs active</div>
          </div>

          <div className="spr-kpi-card">
            <div className="spr-kpi-label">
              <Layers size={14} className="text-amber-600" />
              Audited Batch Envelopes
            </div>
            <div className="spr-kpi-value">{telemetry.ingestion_batches_count}</div>
            <div className="spr-kpi-meta">{telemetry.audit_chain_events_count} chained events · {telemetry.retention_days}d retention</div>
          </div>

          <div className="spr-kpi-card">
            <div className="spr-kpi-label">
              <ShieldCheck size={14} className="text-emerald-600" />
              Chain Reproducibility
            </div>
            <div className="spr-kpi-value">{Number(telemetry.chain_reproducibility_rate).toFixed(2)}%</div>
            <div className="spr-kpi-meta spr-mono-cell" title={telemetry.latest_sync_seal}>
              Seal: {telemetry.latest_sync_seal?.slice(0, 22)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Controls */}
      <div className="spr-controls-bar">
        <div className="spr-subtabs">
          <button className={`spr-subtab ${activeSubTab === 'tracer' ? 'active' : ''}`} onClick={() => setActiveSubTab('tracer')}>
            <History size={14} />
            Record Lineage Tracer ({lineages.length})
          </button>
          <button className={`spr-subtab ${activeSubTab === 'batches' ? 'active' : ''}`} onClick={() => setActiveSubTab('batches')}>
            <Layers size={14} />
            Batch Envelopes ({batches.length})
          </button>
          <button className={`spr-subtab ${activeSubTab === 'mappings' ? 'active' : ''}`} onClick={() => setActiveSubTab('mappings')}>
            <FileCode2 size={14} />
            Mapping Versions ({mappings.length})
          </button>
          <button className={`spr-subtab ${activeSubTab === 'chain' ? 'active' : ''}`} onClick={() => setActiveSubTab('chain')}>
            <Lock size={14} />
            Hash Chain & Audits ({auditChain.length})
          </button>
        </div>

        <div className="spr-filter-group">
          <div className="spr-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Trace Target ID, Source ID, Batch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="spr-select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="ALL">All Source Systems</option>
            {CANONICAL_SOURCE_SYSTEMS.map(src => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Subtab 1: Record Lineage Tracer */}
      {activeSubTab === 'tracer' && (
        <div className="spr-split-workspace">
          <div className="spr-list-pane">
            {filteredLineages.map(item => (
              <div
                key={item.id}
                className={`spr-lineage-card ${selectedLineage?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedLineageId(item.id)}
              >
                <div className="spr-card-top">
                  <span className="spr-code">{item.lineage_code}</span>
                  <span className="spr-badge spr-badge-sky">{item.source_system}</span>
                </div>
                <div className="spr-target-id">{item.target_entity_type} · <strong>{item.target_record_id}</strong></div>
                <div className="spr-card-meta">Src ID: {item.source_record_id}</div>
                <div className="spr-card-meta">Batch: {item.batch_control_number} ({item.mapping_version_tag})</div>
              </div>
            ))}
          </div>

          <div className="spr-detail-pane">
            {!selectedLineage ? (
              <div className="spr-empty-state">Select a tracked lineage record to inspect its provenance chain.</div>
            ) : (
              <div>
                <div className="spr-detail-header">
                  <div>
                    <h3>{selectedLineage.lineage_code} → {selectedLineage.target_record_id}</h3>
                    <p className="spr-subtitle">Entity: {selectedLineage.target_entity_type} · Secret Guard: <code>{config?.client_secret_encrypted}</code></p>
                  </div>
                  <span className="spr-badge spr-badge-emerald">VERIFIED_LINEAGE</span>
                </div>

                {/* Visual Provenance Breadcrumb Flow */}
                <div className="spr-flow-ribbon">
                  <div className="spr-flow-node">
                    <span className="spr-flow-step">1. Origin System</span>
                    <strong>{selectedLineage.source_system}</strong>
                    <code>{selectedLineage.source_record_id}</code>
                  </div>
                  <ArrowRight size={16} className="spr-flow-arrow" />
                  <div className="spr-flow-node">
                    <span className="spr-flow-step">2. Batch Envelope</span>
                    <strong>{selectedLineage.batch_control_number}</strong>
                    <span>{selectedBatch ? `${selectedBatch.payload_format} · ${selectedBatch.records_accepted} rows` : 'Committed'}</span>
                  </div>
                  <ArrowRight size={16} className="spr-flow-arrow" />
                  <div className="spr-flow-node">
                    <span className="spr-flow-step">3. Mapping Spec</span>
                    <strong>{selectedLineage.mapping_version_tag}</strong>
                    <code>{selectedLineage.raw_payload_hash}</code>
                  </div>
                  <ArrowRight size={16} className="spr-flow-arrow" />
                  <div className="spr-flow-node spr-flow-node-final">
                    <span className="spr-flow-step">4. Target Entity</span>
                    <strong>{selectedLineage.target_record_id}</strong>
                    <code>{selectedLineage.sha256_lineage_seal.slice(0, 18)}...</code>
                  </div>
                </div>

                <h4>Hash-Chained Event History ({selectedEvents.length})</h4>
                <div className="spr-table-wrap">
                  <table className="spr-table">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Event Type</th>
                        <th>Actor</th>
                        <th>Mapping</th>
                        <th>Prev Chain Seal</th>
                        <th>Event Seal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEvents.map(ev => (
                        <tr key={ev.id}>
                          <td>#{ev.event_seq}</td>
                          <td><span className="spr-badge spr-badge-sky">{ev.event_type}</span></td>
                          <td>{ev.actor_email}</td>
                          <td><code>{ev.mapping_version_tag}</code></td>
                          <td className="spr-mono-cell" title={ev.prev_chain_seal}>{ev.prev_chain_seal.slice(0, 18)}...</td>
                          <td className="spr-mono-cell" title={ev.sha256_event_seal}>{ev.sha256_event_seal.slice(0, 18)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 2: Ingestion Batch Envelopes */}
      {activeSubTab === 'batches' && (
        <div className="spr-card-panel">
          <h3>Ingestion Batch Envelopes & Checksums</h3>
          <div className="spr-table-wrap">
            <table className="spr-table">
              <thead>
                <tr>
                  <th>Batch Control #</th>
                  <th>Source System</th>
                  <th>Format</th>
                  <th>Mapping Version</th>
                  <th>Received / Accepted / Quarantined</th>
                  <th>Status</th>
                  <th>SHA-256 Batch Seal</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="spr-code">{b.batch_control_number}</td>
                    <td>{b.source_system}</td>
                    <td>{b.payload_format}</td>
                    <td><code>{b.mapping_version_tag}</code></td>
                    <td>{b.records_received} / {b.records_accepted} / {b.records_quarantined}</td>
                    <td><span className="spr-badge spr-badge-emerald">{b.batch_status}</span></td>
                    <td className="spr-mono-cell" title={b.sha256_batch_seal}>{b.sha256_batch_seal.slice(0, 20)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Schema Mapping Versions */}
      {activeSubTab === 'mappings' && (
        <div className="spr-card-panel">
          <h3>Schema Mapping Versions & Effective Windows</h3>
          <div className="spr-table-wrap">
            <table className="spr-table">
              <thead>
                <tr>
                  <th>Mapping Code</th>
                  <th>Source System</th>
                  <th>Target Entity</th>
                  <th>Version Tag</th>
                  <th>Approved By</th>
                  <th>State</th>
                  <th>SHA-256 Spec Seal</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id}>
                    <td className="spr-code">{m.mapping_code}</td>
                    <td>{m.source_system}</td>
                    <td>{m.entity_type}</td>
                    <td><code>{m.version_tag}</code></td>
                    <td>{m.approved_by}</td>
                    <td>
                      <span className={`spr-badge ${m.is_active ? 'spr-badge-emerald' : 'spr-badge-slate'}`}>
                        {m.is_active ? 'ACTIVE' : 'RETIRED'}
                      </span>
                    </td>
                    <td className="spr-mono-cell" title={m.sha256_spec_seal}>{m.sha256_spec_seal.slice(0, 20)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Hash Chain & Attestation Runs */}
      {activeSubTab === 'chain' && (
        <div className="spr-stack">
          <div className="spr-card-panel">
            <h3>Chain Integrity Attestation Runs</h3>
            <div className="spr-table-wrap">
              <table className="spr-table">
                <thead>
                  <tr>
                    <th>Run Code</th>
                    <th>Events Audited</th>
                    <th>Breaks Detected</th>
                    <th>Orphaned Batches</th>
                    <th>Reproducibility</th>
                    <th>Executed By</th>
                    <th>SHA-256 Sync Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {verificationRuns.map(r => (
                    <tr key={r.id}>
                      <td className="spr-code">{r.run_code}</td>
                      <td>{r.records_audited}</td>
                      <td>{r.chain_breaks_detected}</td>
                      <td>{r.orphaned_batches_detected}</td>
                      <td><span className="spr-badge spr-badge-emerald">{Number(r.reproducibility_rate).toFixed(2)}%</span></td>
                      <td>{r.executed_by}</td>
                      <td className="spr-mono-cell" title={r.sha256_sync_seal}>{r.sha256_sync_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="spr-card-panel">
            <h3>Global Append-Only Cryptographic Audit Chain</h3>
            <div className="spr-table-wrap">
              <table className="spr-table">
                <thead>
                  <tr>
                    <th>Seq #</th>
                    <th>Event Type</th>
                    <th>Actor</th>
                    <th>Mapping Version</th>
                    <th>Previous Link Seal</th>
                    <th>Current Event Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {auditChain.map(ev => (
                    <tr key={ev.id}>
                      <td>#{ev.event_seq}</td>
                      <td><span className="spr-badge spr-badge-sky">{ev.event_type}</span></td>
                      <td>{ev.actor_email}</td>
                      <td><code>{ev.mapping_version_tag}</code></td>
                      <td className="spr-mono-cell" title={ev.prev_chain_seal}>{ev.prev_chain_seal.slice(0, 20)}...</td>
                      <td className="spr-mono-cell" title={ev.sha256_event_seal}>{ev.sha256_event_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Publish Mapping Version Modal */}
      {isMappingModalOpen && (
        <div className="spr-modal-backdrop">
          <div className="spr-modal">
            <div className="spr-modal-header">
              <h3>Publish New Mapping Version</h3>
              <button className="spr-banner-close" onClick={() => setIsMappingModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handlePublishMapping} className="spr-modal-body">
              <div className="spr-form-row">
                <label>Source System</label>
                <select
                  value={newMappingForm.source_system}
                  onChange={(e) => setNewMappingForm({ ...newMappingForm, source_system: e.target.value })}
                >
                  {CANONICAL_SOURCE_SYSTEMS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="spr-form-row">
                <label>Target Entity Type</label>
                <input
                  type="text"
                  value={newMappingForm.entity_type}
                  onChange={(e) => setNewMappingForm({ ...newMappingForm, entity_type: e.target.value })}
                  required
                />
              </div>
              <div className="spr-form-row">
                <label>SemVer Mapping Tag (map-vX.Y.Z)</label>
                <input
                  type="text"
                  value={newMappingForm.version_tag}
                  onChange={(e) => setNewMappingForm({ ...newMappingForm, version_tag: e.target.value })}
                  required
                />
              </div>
              <div className="spr-modal-footer">
                <button type="button" className="spr-btn-secondary" onClick={() => setIsMappingModalOpen(false)}>Cancel</button>
                <button type="submit" className="spr-btn-primary">Publish & Seal Spec</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
