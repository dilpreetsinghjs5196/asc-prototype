import React, { useState, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileCheck,
  ShieldCheck,
  RefreshCw,
  Download,
  Search,
  Filter,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Database,
  Info,
  Clock,
  ArrowRight,
  Edit3,
  FileText
} from 'lucide-react';
import {
  getExcelImportTelemetry,
  getImportTemplates,
  getImportBatches,
  getStagedRows,
  uploadAndProcessFile,
  correctStagedRow,
  commitStagedBatch,
  autoMapHeaders,
  computeExcelImportSeal,
  normalizeFacilityId
} from '../services/excelCsvImportService';
import './ExcelCsvImportView.css';

export default function ExcelCsvImportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('staged_rows'); // 'staged_rows' | 'batches_ledger' | 'template_schemas'
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('TEMPLATE_IMPLANT_PURCHASES');
  const [selectedBatchId, setSelectedBatchId] = useState('c2222222-2222-2222-2222-222222222222');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Interactive File Upload & Mapping Wizard State
  const [isUploading, setIsUploading] = useState(false);
  const [showMappingWizard, setShowMappingWizard] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [previewMappings, setPreviewMappings] = useState([]);

  // Inline Row Edit State
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Banners & Notifications
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load Data
  const telemetry = useMemo(() => getExcelImportTelemetry(facilityId), [facilityId, refreshKey]);
  const templates = useMemo(() => getImportTemplates(), []);
  const batches = useMemo(() => getImportBatches(facilityId), [facilityId, refreshKey]);
  const currentBatch = useMemo(() => batches.find(b => b.id === selectedBatchId) || batches[0], [batches, selectedBatchId]);
  const stagedRows = useMemo(() => getStagedRows(currentBatch?.id), [currentBatch, refreshKey]);

  // Selected Template Spec
  const currentTemplate = useMemo(() => templates.find(t => t.code === selectedTemplateCode) || templates[0], [templates, selectedTemplateCode]);

  // Filtered Staged Rows
  const filteredStagedRows = useMemo(() => {
    return stagedRows.filter(r => {
      if (statusFilter !== 'ALL' && r.validationStatus !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const rawMatch = JSON.stringify(r.rawData).toLowerCase().includes(q);
      const mappedMatch = JSON.stringify(r.mappedData).toLowerCase().includes(q);
      const errorMatch = (r.errorDetails || []).some(e => e.message.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
      return rawMatch || mappedMatch || errorMatch;
    });
  }, [stagedRows, statusFilter, searchQuery]);

  // Handle Load Sample File into Wizard
  const handleLoadSampleFile = useCallback(() => {
    const tmpl = currentTemplate;
    const sampleHeaders = tmpl.sampleHeaders;
    const sampleRows = tmpl.sampleRows;
    const mappings = autoMapHeaders(sampleHeaders, tmpl.code);

    setPendingUploadData({
      filename: `${tmpl.name.replace(/\s+/g, '_')}_Sample.csv`,
      fileSizeBytes: 42800,
      fileMimeType: 'text/csv',
      templateCode: tmpl.code,
      rawHeaders: sampleHeaders,
      rows: sampleRows
    });
    setPreviewMappings(mappings);
    setShowMappingWizard(true);
  }, [currentTemplate]);

  // Handle Commit Staged Upload Wizard
  const handleConfirmUpload = useCallback(() => {
    if (!pendingUploadData) return;
    setIsUploading(true);
    setTimeout(() => {
      try {
        const result = uploadAndProcessFile(pendingUploadData, facilityId, 'facility_admin');
        setSelectedBatchId(result.batch.id);
        setShowMappingWizard(false);
        setPendingUploadData(null);
        setRefreshKey(k => k + 1);
        setBanner({
          show: true,
          type: 'success',
          message: `Successfully processed ${result.stagedRows.length} rows for batch ${result.batch.batchCode}. ${result.batch.quarantinedRows} quarantined for review.`
        });
      } catch (err) {
        setBanner({ show: true, type: 'error', message: err.message });
      } finally {
        setIsUploading(false);
      }
    }, 450);
  }, [pendingUploadData, facilityId]);

  // Handle Inline Edit Start
  const handleStartEdit = useCallback((row) => {
    setEditingRowId(row.id);
    setEditFormData({ ...row.mappedData });
  }, []);

  // Handle Inline Edit Save
  const handleSaveEdit = useCallback((rowId) => {
    try {
      const result = correctStagedRow(rowId, editFormData, currentBatch.templateCode);
      setEditingRowId(null);
      setRefreshKey(k => k + 1);
      if (result.row.validationStatus === 'VALIDATED') {
        setBanner({
          show: true,
          type: 'success',
          message: `Row #${result.row.rowIndex} successfully corrected and validated!`
        });
      } else {
        setBanner({
          show: true,
          type: 'error',
          message: `Row #${result.row.rowIndex} updated, but still has ${result.row.errorCount} validation issues.`
        });
      }
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  }, [editFormData, currentBatch]);

  // Handle Commit Valid Rows
  const handleCommitBatch = useCallback(() => {
    if (!currentBatch) return;
    try {
      const res = commitStagedBatch(currentBatch.id, facilityId, 'facility_admin');
      setRefreshKey(k => k + 1);
      setBanner({
        show: true,
        type: 'success',
        message: `Atomically committed ${res.rowsCommitted} records for ${res.batchCode}! Cryptographic Seal: ${res.commitSeal.slice(0, 20)}...`
      });
    } catch (err) {
      setBanner({ show: true, type: 'error', message: err.message });
    }
  }, [currentBatch, facilityId]);

  // Download Sample Template CSV helper
  const handleDownloadSample = useCallback(() => {
    const tmpl = currentTemplate;
    const headerStr = tmpl.sampleHeaders.join(',');
    const rowsStr = tmpl.sampleRows.map(r => tmpl.sampleHeaders.map(h => `"${r[h] || ''}"`).join(',')).join('\n');
    const csvContent = `data:text/csv;charset=utf-8,${encodeURIComponent(`${headerStr}\n${rowsStr}`)}`;
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `${tmpl.code}_Template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBanner({
      show: true,
      type: 'success',
      message: `Downloaded sample spreadsheet template for ${tmpl.name}.`
    });
  }, [currentTemplate]);

  return (
    <div className="eci-container">
      {/* Notification Banner */}
      {banner.show && (
        <div className={`eci-banner eci-banner-${banner.type}`}>
          <div className="eci-banner-content">
            {banner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="eci-btn-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Control Card */}
      <div className="eci-header-card">
        <div className="eci-header-left">
          <div className="eci-header-badges">
            <span className="eci-badge-facility">{facilityName}</span>
            <span className="eci-badge-phase">Phase F2: Ingestion Engine</span>
            <span className="eci-badge-status">
              <span className="eci-status-dot"></span>
              Schema Ingestion Ready
            </span>
          </div>
          <p className="eci-header-note">
            Deterministic spreadsheet parsing, fuzzy column auto-binding, row-level validation, inline exception corrections, and transactional atomic commit.
          </p>
        </div>
        <div className="eci-header-actions">
          <button className="eci-btn-secondary" onClick={handleDownloadSample} title="Download CSV Template">
            <Download size={14} />
            <span>Sample Template</span>
          </button>
          <button className="eci-btn-secondary" onClick={() => setIsDrawerOpen(true)} title="View Cryptographic Audit Trail">
            <ShieldCheck size={14} />
            <span>Audit Provenance</span>
          </button>
          <button className="eci-btn-primary" onClick={handleLoadSampleFile}>
            <UploadCloud size={14} />
            <span>Upload Spreadsheet</span>
          </button>
        </div>
      </div>

      {/* 6-Card Telemetry Ribbon */}
      <div className="eci-telemetry-ribbon">
        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">TOTAL IMPORTED</span>
            <Layers size={16} className="eci-tcard-icon text-sky" />
          </div>
          <div className="eci-tcard-value">{telemetry.totalImportedRows.toLocaleString()}</div>
          <div className="eci-tcard-subtext">Rows across {telemetry.totalBatches} batches</div>
        </div>

        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">CLEAN INGESTION RATE</span>
            <CheckCircle2 size={16} className="eci-tcard-icon text-emerald" />
          </div>
          <div className="eci-tcard-value text-emerald">{telemetry.cleanIngestionRatePct}%</div>
          <div className="eci-tcard-subtext">{telemetry.totalValidRows} clean / {telemetry.totalImportedRows} total</div>
        </div>

        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">QUARANTINED ROWS</span>
            <AlertTriangle size={16} className="eci-tcard-icon text-amber" />
          </div>
          <div className="eci-tcard-value text-amber">{telemetry.totalQuarantinedRows}</div>
          <div className="eci-tcard-subtext">Pending inline correction</div>
        </div>

        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">COMMITTED RECORDS</span>
            <Database size={16} className="eci-tcard-icon text-sky" />
          </div>
          <div className="eci-tcard-value">{telemetry.totalCommittedRows.toLocaleString()}</div>
          <div className="eci-tcard-subtext">Platform domain tables</div>
        </div>

        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">HEADER MATCH SCORE</span>
            <FileSpreadsheet size={16} className="eci-tcard-icon text-blue" />
          </div>
          <div className="eci-tcard-value">{telemetry.headerMatchScorePct}%</div>
          <div className="eci-tcard-subtext">Fuzzy auto-mapping avg</div>
        </div>

        <div className="eci-telemetry-card">
          <div className="eci-tcard-header">
            <span className="eci-tcard-label">INGESTION SEAL</span>
            <ShieldCheck size={16} className="eci-tcard-icon text-emerald" />
          </div>
          <div className="eci-tcard-value eci-seal-hash" title={telemetry.latestCommitSeal}>
            {telemetry.latestCommitSeal.slice(0, 16)}...
          </div>
          <div className="eci-tcard-subtext">SHA-256 Tamper-Evident</div>
        </div>
      </div>

      {/* Column Auto-Mapping & Ingestion Wizard Modal */}
      {showMappingWizard && pendingUploadData && (
        <div className="eci-modal-overlay">
          <div className="eci-modal-panel">
            <div className="eci-modal-header">
              <div className="eci-mheader-title">
                <FileSpreadsheet size={18} className="text-sky" />
                <h3>Column Auto-Mapping & Ingestion Wizard</h3>
              </div>
              <button className="eci-btn-icon-close" onClick={() => setShowMappingWizard(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="eci-modal-body">
              <div className="eci-wizard-summary">
                <div className="eci-wsummary-item">
                  <span className="eci-wlabel">Filename:</span>
                  <span className="eci-wval">{pendingUploadData.filename}</span>
                </div>
                <div className="eci-wsummary-item">
                  <span className="eci-wlabel">Template:</span>
                  <span className="eci-wval">{currentTemplate.name}</span>
                </div>
                <div className="eci-wsummary-item">
                  <span className="eci-wlabel">Parsed Rows:</span>
                  <span className="eci-wval">{pendingUploadData.rows.length} rows</span>
                </div>
              </div>

              <div className="eci-wizard-table-wrap">
                <table className="eci-table eci-wizard-table">
                  <thead>
                    <tr>
                      <th>Source Spreadsheet Column</th>
                      <th>Target Canonical Field</th>
                      <th>Requirement</th>
                      <th>Match Confidence</th>
                      <th>Mapping Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewMappings.map((m, idx) => (
                      <tr key={idx}>
                        <td className="eci-font-mono">{m.sourceHeader}</td>
                        <td>
                          <span className="eci-target-pill">
                            {m.targetField || '<Unmapped>'}
                          </span>
                        </td>
                        <td>
                          {m.isRequired ? (
                            <span className="eci-badge-required">REQUIRED</span>
                          ) : (
                            <span className="eci-badge-optional">OPTIONAL</span>
                          )}
                        </td>
                        <td>
                          <span className={`eci-conf-badge eci-conf-${m.confidenceTier.toLowerCase()}`}>
                            {m.confidenceScore}% {m.confidenceTier}
                          </span>
                        </td>
                        <td>
                          {m.targetField ? (
                            <span className="eci-status-ok"><Check size={14} /> Bound</span>
                          ) : (
                            <span className="eci-status-warn"><AlertTriangle size={14} /> Unbound</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="eci-modal-footer">
              <button className="eci-btn-secondary" onClick={() => setShowMappingWizard(false)}>
                Cancel
              </button>
              <button className="eci-btn-primary" onClick={handleConfirmUpload} disabled={isUploading}>
                {isUploading ? <RefreshCw size={14} className="eci-spin" /> : <Check size={14} />}
                <span>Process & Stage {pendingUploadData.rows.length} Rows</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="eci-tabs-bar">
        <button
          className={`eci-tab-btn ${activeSubTab === 'staged_rows' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('staged_rows')}
        >
          <Edit3 size={15} />
          <span>Staged Rows & Exceptions ({stagedRows.length})</span>
        </button>
        <button
          className={`eci-tab-btn ${activeSubTab === 'batches_ledger' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('batches_ledger')}
        >
          <Layers size={15} />
          <span>File Import Batches ({batches.length})</span>
        </button>
        <button
          className={`eci-tab-btn ${activeSubTab === 'template_schemas' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('template_schemas')}
        >
          <FileCheck size={15} />
          <span>Ingestion Templates & Schemas ({templates.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: STAGED ROWS & INLINE EXCEPTION GRID */}
      {activeSubTab === 'staged_rows' && (
        <div className="eci-table-card">
          <div className="eci-table-toolbar">
            <div className="eci-batch-selector-group">
              <span className="eci-toolbar-label">Active Batch:</span>
              <select
                className="eci-select"
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                {batches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.batchCode} - {b.filename} ({b.totalRows} rows) [{b.status}]
                  </option>
                ))}
              </select>
            </div>

            <div className="eci-search-box">
              <Search size={14} className="text-slate" />
              <input
                type="text"
                placeholder="Search staged rows by field value, code, or error message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="eci-btn-icon-clear" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="eci-filter-group">
              <Filter size={14} className="text-slate" />
              <select
                className="eci-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="QUARANTINED">Quarantined Exceptions Only</option>
                <option value="VALIDATED">Validated Clean Only</option>
                <option value="COMMITTED">Committed Only</option>
              </select>
            </div>

            <button
              className="eci-btn-primary"
              onClick={handleCommitBatch}
              disabled={stagedRows.filter(r => r.validationStatus === 'VALIDATED').length === 0}
            >
              <CheckCircle2 size={14} />
              <span>Commit Valid Rows ({stagedRows.filter(r => r.validationStatus === 'VALIDATED').length})</span>
            </button>
          </div>

          <div className="eci-table-responsive">
            <table className="eci-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Row #</th>
                  <th style={{ width: '130px' }}>Status</th>
                  <th>Key Mapped Fields</th>
                  <th>Validation Errors / Notes</th>
                  <th style={{ width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStagedRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="eci-empty-cell">
                      No staged rows match the selected filters for this batch.
                    </td>
                  </tr>
                ) : (
                  filteredStagedRows.map((row) => {
                    const isEditing = editingRowId === row.id;
                    return (
                      <tr key={row.id} className={row.validationStatus === 'QUARANTINED' ? 'eci-row-quarantined' : ''}>
                        <td className="eci-row-num">#{row.rowIndex}</td>
                        <td>
                          <span className={`eci-status-badge eci-status-${row.validationStatus.toLowerCase()}`}>
                            {row.validationStatus}
                          </span>
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="eci-inline-edit-fields">
                              {Object.entries(row.mappedData).map(([key, val]) => (
                                <div key={key} className="eci-edit-field-item">
                                  <label>{key}:</label>
                                  <input
                                    type="text"
                                    value={editFormData[key] !== undefined ? editFormData[key] : val}
                                    onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                                    className="eci-edit-input"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="eci-mapped-preview">
                              {Object.entries(row.mappedData).map(([k, v]) => (
                                <span key={k} className="eci-field-chip">
                                  <strong>{k}:</strong> {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {row.errorDetails && row.errorDetails.length > 0 ? (
                            <div className="eci-error-list">
                              {row.errorDetails.map((err, eIdx) => (
                                <span key={eIdx} className="eci-error-tag">
                                  <AlertTriangle size={12} />
                                  <strong>{err.code}:</strong> {err.message}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="eci-text-clean">
                              <CheckCircle2 size={13} className="text-emerald" /> Validated Clean
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="eci-action-btn-group">
                              <button
                                className="eci-btn-mini-save"
                                onClick={() => handleSaveEdit(row.id)}
                                title="Save & Re-evaluate"
                              >
                                <Check size={13} /> Save
                              </button>
                              <button
                                className="eci-btn-mini-cancel"
                                onClick={() => setEditingRowId(null)}
                                title="Cancel Edit"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="eci-btn-mini-edit"
                              onClick={() => handleStartEdit(row)}
                              title="Edit Row Cells"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: BATCHES LEDGER */}
      {activeSubTab === 'batches_ledger' && (
        <div className="eci-table-card">
          <div className="eci-table-responsive">
            <table className="eci-table">
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Template Code</th>
                  <th>Source File</th>
                  <th>File Size</th>
                  <th>Status</th>
                  <th>Rows (Total / Valid / Quarantined)</th>
                  <th>Duration</th>
                  <th>Commit Seal</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={b.id === selectedBatchId ? 'eci-row-selected' : ''}>
                    <td className="eci-font-mono eci-batch-code">{b.batchCode}</td>
                    <td>{b.templateName}</td>
                    <td className="eci-filename">
                      <FileSpreadsheet size={14} className="text-sky" />
                      <span>{b.filename}</span>
                    </td>
                    <td>{Math.round(b.fileSizeBytes / 1024)} KB</td>
                    <td>
                      <span className={`eci-status-badge eci-status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      <div className="eci-row-counts">
                        <span className="eci-count-tot">{b.totalRows} tot</span>
                        <span className="eci-count-val">{b.validRows} val</span>
                        {b.quarantinedRows > 0 && (
                          <span className="eci-count-quar">{b.quarantinedRows} err</span>
                        )}
                      </div>
                    </td>
                    <td>{b.processingDurationMs} ms</td>
                    <td>
                      {b.commitSeal ? (
                        <span className="eci-seal-chip" title={b.commitSeal}>
                          {b.commitSeal.slice(0, 14)}...
                        </span>
                      ) : (
                        <span className="text-slate">Unsealed</span>
                      )}
                    </td>
                    <td className="eci-time">{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: TEMPLATES & SCHEMAS CATALOG */}
      {activeSubTab === 'template_schemas' && (
        <div className="eci-templates-grid">
          {templates.map((tmpl) => (
            <div key={tmpl.code} className="eci-schema-card">
              <div className="eci-scard-header">
                <div className="eci-scard-title">
                  <FileText size={18} className="text-sky" />
                  <h4>{tmpl.name}</h4>
                </div>
                <span className="eci-target-table-badge">Table: {tmpl.targetTable}</span>
              </div>
              <p className="eci-scard-desc">{tmpl.description}</p>

              <div className="eci-columns-section">
                <span className="eci-col-title">Required Columns:</span>
                <div className="eci-col-chips">
                  {tmpl.requiredColumns.map(c => (
                    <span key={c} className="eci-chip-req">{c}</span>
                  ))}
                </div>
              </div>

              <div className="eci-columns-section">
                <span className="eci-col-title">Optional Columns:</span>
                <div className="eci-col-chips">
                  {tmpl.optionalColumns.map(c => (
                    <span key={c} className="eci-chip-opt">{c}</span>
                  ))}
                </div>
              </div>

              <div className="eci-scard-footer">
                <button
                  className="eci-btn-secondary"
                  onClick={() => {
                    setSelectedTemplateCode(tmpl.code);
                    handleLoadSampleFile();
                  }}
                >
                  <UploadCloud size={13} />
                  <span>Test Sample Ingestion</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-out Provenance Drawer */}
      {isDrawerOpen && (
        <div className="eci-drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="eci-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="eci-drawer-header">
              <div className="eci-dheader-title">
                <ShieldCheck size={20} className="text-emerald" />
                <h3>Cryptographic Ingestion Provenance</h3>
              </div>
              <button className="eci-btn-icon-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="eci-drawer-body">
              <p className="eci-drawer-desc">
                Immutable audit ledger recording file upload checksums, schema auto-bindings, user corrections, and SHA-256 commit seals.
              </p>

              <div className="eci-provenance-box">
                <span className="eci-plabel">Facility Tenancy UUID:</span>
                <span className="eci-pval eci-font-mono">{facilityId}</span>
              </div>

              <div className="eci-provenance-box">
                <span className="eci-plabel">Latest Batch Seal:</span>
                <span className="eci-pval eci-font-mono text-emerald">{telemetry.latestCommitSeal}</span>
              </div>

              <h4 className="eci-dsubhead">Batches Audit Log</h4>
              <div className="eci-audit-list">
                {batches.map(b => (
                  <div key={b.id} className="eci-audit-item">
                    <div className="eci-aitem-top">
                      <span className="eci-font-mono">{b.batchCode}</span>
                      <span className={`eci-status-badge eci-status-${b.status.toLowerCase()}`}>{b.status}</span>
                    </div>
                    <div className="eci-aitem-mid">
                      <span>File: {b.filename}</span>
                      <span>Rows: {b.totalRows}</span>
                    </div>
                    {b.commitSeal && (
                      <div className="eci-aitem-seal">
                        <span className="text-slate">Seal: </span>
                        <span className="eci-font-mono text-emerald">{b.commitSeal}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="eci-drawer-footer">
              <button className="eci-btn-secondary" onClick={() => setIsDrawerOpen(false)}>
                Close Audit Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
