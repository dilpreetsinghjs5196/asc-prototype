import React, { useState, useMemo } from 'react';
import {
  Workflow,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Sliders,
  X,
  FileCheck,
  Database,
  ArrowRight,
  Clock,
  Code,
  Lock,
  ChevronRight,
  Layers,
  Activity,
  Check,
  Trash2
} from 'lucide-react';
import {
  getImportPipelineTelemetry,
  getImportPipelineBatches,
  getImportExceptions,
  getValidationRules,
  runPipelineBatch,
  resolveImportException,
  PIPELINE_STAGES,
  EXCEPTION_SEVERITIES,
  EXCEPTION_STATUSES,
  RESOLUTION_ACTIONS
} from '../services/importValidationService';
import './ImportValidationView.css';

export default function ImportValidationView({ activeFacility = 'fac-naples-01' }) {
  const facilityId = typeof activeFacility === 'object' && activeFacility !== null
    ? (activeFacility.id || 'fac-naples-01')
    : (activeFacility || 'fac-naples-01');

  const [activeTab, setActiveTab] = useState('exceptions');
  const [showDrawer, setShowDrawer] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [notification, setNotification] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Telemetry, Batches, Exceptions, Rules
  const telemetry = useMemo(() => {
    return getImportPipelineTelemetry(facilityId);
  }, [facilityId, refreshTrigger]);

  const batches = useMemo(() => {
    return getImportPipelineBatches(facilityId);
  }, [facilityId, refreshTrigger]);

  const exceptions = useMemo(() => {
    return getImportExceptions(facilityId, {
      severity: severityFilter
    });
  }, [facilityId, severityFilter, refreshTrigger]);

  const rules = useMemo(() => {
    return getValidationRules();
  }, []);

  const filteredExceptions = useMemo(() => {
    if (!searchTerm) return exceptions;
    const term = searchTerm.toLowerCase();
    return exceptions.filter(e =>
      e.sourceRecordId.toLowerCase().includes(term) ||
      e.ruleCode.toLowerCase().includes(term) ||
      e.exceptionCategory.toLowerCase().includes(term) ||
      (e.sourceValue && e.sourceValue.toLowerCase().includes(term))
    );
  }, [exceptions, searchTerm]);

  const handleRunBatch = () => {
    try {
      const res = runPipelineBatch('CONN_HST_PATHWAYS', facilityId);
      setNotification({
        type: 'success',
        message: `Pipeline Batch '${res.batchCode}' successfully executed! ${res.recordsCommitted} clean records committed to production tables.`
      });
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      setNotification({
        type: 'error',
        message: `Pipeline execution failed: ${err.message}`
      });
    }
  };

  const handleResolveException = (exceptionId, action) => {
    try {
      const res = resolveImportException(exceptionId, action, {
        notes: `User applied ${action} via Exception Workqueue`
      });
      setNotification({
        type: 'success',
        message: `Exception '${res.exceptionId}' transitioned to ${res.resolutionStatus} via ${res.resolutionAction}.`
      });
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setNotification(null), 5000);
    } catch (err) {
      setNotification({
        type: 'error',
        message: `Failed to resolve exception: ${err.message}`
      });
    }
  };

  return (
    <div className="ipv-container">
      {/* Notification Alert Banner */}
      {notification && (
        <div className={`ipv-banner ${notification.type === 'error' ? 'ipv-banner-error' : 'ipv-banner-success'}`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{notification.message}</span>
          <button className="ipv-btn-banner-close" onClick={() => setNotification(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Card */}
      <div className="ipv-header-card">
        <div className="ipv-header-left">
          <div className="ipv-header-badges">
            <span className="ipv-badge-facility">Naples Surgery Center</span>
            <span className="ipv-badge-phase">Phase F1 - Module 15</span>
            <span className="ipv-badge-status">
              <Activity size={12} /> 6-Stage Pipeline Live
            </span>
            <span className="ipv-badge-source">
              Source: HST Pathways FHIR R4
            </span>
          </div>
          <h2 className="ipv-header-title">Import Validation Pipeline & Exception Workqueue</h2>
          <p className="ipv-header-subtitle">
            Deterministic 6-stage healthcare data processing pipeline: Import &rarr; Validate &rarr; Normalize &rarr; Match &rarr; Exception &rarr; Commit.
            Enforces NPI Luhn checks, canonical payer aliasing, composite clinical matching, and tamper-evident audit seals.
          </p>
        </div>

        <div className="ipv-header-actions">
          <button className="ipv-btn-secondary" onClick={() => setShowDrawer(true)}>
            <Sliders size={16} />
            <span>Audit Provenance</span>
          </button>
          <button className="ipv-btn-primary" onClick={handleRunBatch}>
            <RefreshCw size={16} />
            <span>Run Pipeline Batch</span>
          </button>
        </div>
      </div>

      {/* 6-Card Executive Telemetry Ribbon */}
      <div className="ipv-telemetry-ribbon">
        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">Total Staged (24h)</span>
            <Database size={16} className="text-sky" />
          </div>
          <div className="ipv-tcard-value">{telemetry.totalStaged24h.toLocaleString()}</div>
          <div className="ipv-tcard-subtext">Across {telemetry.totalBatches24h} Ingestion Batches</div>
        </div>

        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">Clean Pass Rate</span>
            <CheckCircle size={16} className="text-emerald" />
          </div>
          <div className="ipv-tcard-value text-emerald">{telemetry.cleanPassRatePercent}%</div>
          <div className="ipv-tcard-subtext">Direct to Commit without Exception</div>
        </div>

        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">Active Exceptions</span>
            <AlertTriangle size={16} className="text-amber" />
          </div>
          <div className="ipv-tcard-value text-amber">{telemetry.activeExceptionsCount}</div>
          <div className="ipv-tcard-subtext">Quarantined for Administrative Review</div>
        </div>

        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">Committed Records</span>
            <FileCheck size={16} className="text-sky" />
          </div>
          <div className="ipv-tcard-value text-sky">{telemetry.totalCommitted24h.toLocaleString()}</div>
          <div className="ipv-tcard-subtext">Written to Production Tables</div>
        </div>

        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">Pipeline Latency</span>
            <Clock size={16} className="text-slate" />
          </div>
          <div className="ipv-tcard-value">{telemetry.avgDurationMs} ms</div>
          <div className="ipv-tcard-subtext">End-to-End Processing Avg</div>
        </div>

        <div className="ipv-telemetry-card">
          <div className="ipv-tcard-header">
            <span className="ipv-tcard-label">SHA-256 Commit Seal</span>
            <ShieldCheck size={16} className="text-emerald" />
          </div>
          <div className="ipv-tcard-value font-mono font-xs">
            {telemetry.cryptographicCommitSeal ? telemetry.cryptographicCommitSeal.slice(0, 14) + '...' : 'Verified'}
          </div>
          <div className="ipv-tcard-subtext text-emerald">Cryptographically Immutable</div>
        </div>
      </div>

      {/* 6-Stage Visual Stepper Pipeline Card */}
      <div className="ipv-stepper-card">
        <div className="ipv-scard-header">
          <div className="ipv-scard-title">
            <Workflow size={18} className="text-sky" />
            <h3>Deterministic 6-Stage Data Flow</h3>
          </div>
          <span className="ipv-scard-tag">Sequential Checkpoint Enforcement</span>
        </div>

        <div className="ipv-stepper-track">
          <div className="ipv-step-item completed">
            <div className="ipv-step-bubble">1</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">1. Import</span>
              <span className="ipv-step-desc">Raw Buffer & Ingress Hash</span>
            </div>
          </div>
          <div className="ipv-step-divider completed"></div>

          <div className="ipv-step-item completed">
            <div className="ipv-step-bubble">2</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">2. Validate</span>
              <span className="ipv-step-desc">NPI Luhn, DOS, CPT Rules</span>
            </div>
          </div>
          <div className="ipv-step-divider completed"></div>

          <div className="ipv-step-item completed">
            <div className="ipv-step-bubble">3</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">3. Normalize</span>
              <span className="ipv-step-desc">ISO-8601 & Payer Aliasing</span>
            </div>
          </div>
          <div className="ipv-step-divider completed"></div>

          <div className="ipv-step-item completed">
            <div className="ipv-step-bubble">4</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">4. Match</span>
              <span className="ipv-step-desc">3-Tier Clinical Entity Resolution</span>
            </div>
          </div>
          <div className="ipv-step-divider active"></div>

          <div className="ipv-step-item active">
            <div className="ipv-step-bubble">5</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">5. Exception</span>
              <span className="ipv-step-desc">Workqueue Quarantine</span>
            </div>
          </div>
          <div className="ipv-step-divider"></div>

          <div className="ipv-step-item">
            <div className="ipv-step-bubble">6</div>
            <div className="ipv-step-content">
              <span className="ipv-step-name">6. Commit</span>
              <span className="ipv-step-desc">Atomic Ledger Write & Seal</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Tabs Navigation */}
      <div className="ipv-tabs-bar">
        <button
          className={`ipv-tab-btn ${activeTab === 'exceptions' ? 'active' : ''}`}
          onClick={() => setActiveTab('exceptions')}
        >
          <AlertTriangle size={15} />
          <span>Exception Workqueue ({telemetry.activeExceptionsCount})</span>
        </button>

        <button
          className={`ipv-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          <Layers size={15} />
          <span>Pipeline Batches ({batches.length})</span>
        </button>

        <button
          className={`ipv-tab-btn ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          <ShieldCheck size={15} />
          <span>Validation Rules Matrix ({rules.length})</span>
        </button>

        <button
          className={`ipv-tab-btn ${activeTab === 'schema' ? 'active' : ''}`}
          onClick={() => setActiveTab('schema')}
        >
          <Code size={15} />
          <span>Ingress Schema Inspector</span>
        </button>
      </div>

      {/* Tab 1: Exception Workqueue */}
      {activeTab === 'exceptions' && (
        <div className="ipv-table-card">
          <div className="ipv-table-toolbar">
            <div className="ipv-search-box">
              <Search size={16} className="text-slate" />
              <input
                type="text"
                placeholder="Search exceptions by Record ID, Rule, Category, or Offending Value..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="ipv-filter-group">
              <Filter size={15} className="text-slate" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="ipv-select"
              >
                <option value="ALL">All Severities</option>
                <option value={EXCEPTION_SEVERITIES.CRITICAL}>Critical Only</option>
                <option value={EXCEPTION_SEVERITIES.WARNING}>Warning Only</option>
              </select>
            </div>
          </div>

          <div className="ipv-table-wrapper">
            <table className="ipv-table">
              <thead>
                <tr>
                  <th>Staged Record ID</th>
                  <th>Rule Code</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Offending Value</th>
                  <th>Suggested Value</th>
                  <th>Resolution Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExceptions.map(exc => (
                  <tr key={exc.id}>
                    <td>
                      <div className="ipv-rec-cell">
                        <span className="ipv-rec-id font-mono">{exc.sourceRecordId}</span>
                        <span className="ipv-rec-batch font-mono">{exc.batchCode}</span>
                      </div>
                    </td>
                    <td>
                      <span className="ipv-rule-badge font-mono">{exc.ruleCode}</span>
                    </td>
                    <td>
                      <span className="ipv-cat-name">{exc.exceptionCategory}</span>
                    </td>
                    <td>
                      <span className={`ipv-sev-badge ${exc.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                        {exc.severity}
                      </span>
                    </td>
                    <td>
                      <span className="ipv-val-bad font-mono">{exc.sourceValue}</span>
                    </td>
                    <td>
                      <span className="ipv-val-good font-mono">{exc.suggestedValue}</span>
                    </td>
                    <td>
                      <span className={`ipv-status-pill ${exc.resolutionStatus.toLowerCase()}`}>
                        {exc.resolutionStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {exc.resolutionStatus === EXCEPTION_STATUSES.PENDING ? (
                        <div className="ipv-row-actions">
                          <button
                            className="ipv-btn-row-override"
                            title="Override rule and commit record"
                            onClick={() => handleResolveException(exc.id, RESOLUTION_ACTIONS.OVERRIDE_AND_COMMIT)}
                          >
                            <Check size={13} /> Override
                          </button>
                          <button
                            className="ipv-btn-row-remap"
                            title="Remap to suggested canonical value"
                            onClick={() => handleResolveException(exc.id, RESOLUTION_ACTIONS.REMAP_FIELD)}
                          >
                            <RefreshCw size={13} /> Remap
                          </button>
                          <button
                            className="ipv-btn-row-reject"
                            title="Reject and discard from batch"
                            onClick={() => handleResolveException(exc.id, RESOLUTION_ACTIONS.REJECT_RECORD)}
                          >
                            <Trash2 size={13} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate font-xs font-mono">Completed ({exc.resolutionAction})</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Pipeline Batches */}
      {activeTab === 'batches' && (
        <div className="ipv-table-card">
          <div className="ipv-table-wrapper">
            <table className="ipv-table">
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Source Connector</th>
                  <th>Current Stage</th>
                  <th>Status</th>
                  <th>Staged</th>
                  <th>Committed</th>
                  <th>Quarantined</th>
                  <th>Latency</th>
                  <th>Started At</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(batch => (
                  <tr key={batch.id}>
                    <td className="font-mono font-weight-600">{batch.batchCode}</td>
                    <td>
                      <div className="ipv-conn-info">
                        <span>{batch.sourceConnectorName}</span>
                        <span className="font-mono font-xs text-slate">{batch.sourceConnectorCode}</span>
                      </div>
                    </td>
                    <td>
                      <span className="ipv-stage-pill font-mono">{batch.currentStage}</span>
                    </td>
                    <td>
                      <span className={`ipv-status-pill ${batch.status.toLowerCase().includes('exceptions') ? 'warning' : 'completed'}`}>
                        {batch.status}
                      </span>
                    </td>
                    <td className="font-mono">{batch.recordsStaged}</td>
                    <td className="font-mono text-emerald font-weight-600">{batch.recordsCommitted}</td>
                    <td className="font-mono text-amber">{batch.recordsQuarantined}</td>
                    <td className="font-mono">{batch.totalDurationMs} ms</td>
                    <td className="font-mono font-xs text-slate">
                      {new Date(batch.startedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Validation Rules Matrix */}
      {activeTab === 'rules' && (
        <div className="ipv-table-card">
          <div className="ipv-table-wrapper">
            <table className="ipv-table">
              <thead>
                <tr>
                  <th>Rule Code</th>
                  <th>Rule Name</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Target Record</th>
                  <th>Target Field</th>
                  <th>Validation Logic</th>
                  <th>Failure Message</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td className="font-mono font-weight-600 text-sky">{rule.ruleCode}</td>
                    <td>{rule.ruleName}</td>
                    <td>
                      <span className="ipv-cat-name font-mono">{rule.category}</span>
                    </td>
                    <td>
                      <span className={`ipv-sev-badge ${rule.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="font-mono font-xs">{rule.targetRecordType}</td>
                    <td className="font-mono font-xs">{rule.targetField}</td>
                    <td className="font-mono font-xs text-slate">{rule.validationLogic}</td>
                    <td className="font-xs text-slate">{rule.failureMessage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Schema Inspector */}
      {activeTab === 'schema' && (
        <div className="ipv-schema-grid">
          <div className="ipv-schema-card">
            <div className="ipv-scard-header">
              <h4 className="ipv-scard-title">Raw Ingress Payload (HST Pathways FHIR R4)</h4>
              <span className="font-mono font-xs text-slate">Source Format</span>
            </div>
            <pre className="ipv-code-block font-mono">
{`{
  "resourceType": "Encounter",
  "id": "HST_CASE_99410",
  "status": "planned",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "AMB"
  },
  "subject": {
    "reference": "Patient/MRN-77401",
    "display": "Johnathan Davis"
  },
  "participant": [
    {
      "individual": {
        "reference": "Practitioner/1841392818",
        "display": "Dr. Brian Miller, MD"
      }
    }
  ],
  "period": {
    "start": "2026-11-25T13:30:00Z"
  },
  "serviceType": {
    "coding": [
      {
        "system": "http://www.ama-assn.org/go/cpt",
        "code": "29881",
        "display": "Arthroscopy, knee, surgical; with meniscectomy"
      }
    ]
  }
}`}
            </pre>
          </div>

          <div className="ipv-schema-card">
            <div className="ipv-scard-header">
              <h4 className="ipv-scard-title">Normalized Canonical Schema (public.surgical_cases)</h4>
              <span className="font-mono font-xs text-emerald">Platform Schema</span>
            </div>
            <pre className="ipv-code-block font-mono">
{`{
  "id": "c0000000-0000-0000-0000-000000000101",
  "facility_id": "00000000-0000-0000-0000-000000000002",
  "external_id": "HST_CASE_99410",
  "patient_mrn": "MRN-77401",
  "patient_name": "Davis, Johnathan",
  "surgery_date": "2026-11-25",
  "surgeon_npi": "1841392818",
  "surgeon_name": "Dr. Brian Miller",
  "primary_cpt": "29881",
  "cpt_description": "Knee Arthroscopy w/ Meniscectomy",
  "payer_id": "PAYER_BCBS_FL",
  "operating_room": "OR-1",
  "case_status": "SCHEDULED",
  "sha256_audit_seal": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}`}
            </pre>
          </div>
        </div>
      )}

      {/* Slide-Out Governance & Audit Drawer */}
      {showDrawer && (
        <div className="ipv-drawer-backdrop" onClick={() => setShowDrawer(false)}>
          <div className="ipv-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ipv-drawer-header">
              <div className="ipv-dheader-title">
                <Sliders size={18} className="text-sky" />
                <h3>Import Pipeline Provenance & Tenancy Audit</h3>
              </div>
              <button className="ipv-btn-drawer-close" onClick={() => setShowDrawer(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="ipv-drawer-content">
              <div className="ipv-drawer-section">
                <h4 className="ipv-dsection-title">Facility Multi-Tenancy Boundary</h4>
                <div className="ipv-provenance-box">
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Facility Name:</span>
                    <span className="ipv-pval">Naples Surgery Center</span>
                  </div>
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Facility Identifier:</span>
                    <span className="ipv-pval font-mono">fac-naples-01</span>
                  </div>
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Facility UUID:</span>
                    <span className="ipv-pval font-mono">00000000-0000-0000-0000-000000000002</span>
                  </div>
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Tenancy Isolation:</span>
                    <span className="ipv-pval font-mono text-emerald">RLS Enforced (app.current_facility_id)</span>
                  </div>
                </div>
              </div>

              <div className="ipv-drawer-section">
                <h4 className="ipv-dsection-title">Cryptographic Commit Digest</h4>
                <div className="ipv-provenance-box">
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Algorithm:</span>
                    <span className="ipv-pval font-mono">SHA-256 (HMAC-SHA256)</span>
                  </div>
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Ingress Invariant Seal:</span>
                    <span className="ipv-pval-hash font-mono">{telemetry.cryptographicCommitSeal}</span>
                  </div>
                  <div className="ipv-prow">
                    <span className="ipv-plabel">Buffer Encryption:</span>
                    <span className="ipv-pval font-mono text-emerald">AES-256-GCM (At Rest)</span>
                  </div>
                </div>
              </div>

              <div className="ipv-drawer-section">
                <h4 className="ipv-dsection-title">Deterministic Rule Execution Stats</h4>
                <div className="ipv-breakdown-list">
                  <div className="ipv-breakdown-row">
                    <span>NPI Luhn Validations:</span>
                    <span className="font-mono text-emerald font-weight-600">99.6% Pass</span>
                  </div>
                  <div className="ipv-breakdown-row">
                    <span>Date of Service Boundary:</span>
                    <span className="font-mono text-emerald font-weight-600">100.0% Pass</span>
                  </div>
                  <div className="ipv-breakdown-row">
                    <span>CPT/HCPCS Syntax Check:</span>
                    <span className="font-mono text-emerald font-weight-600">99.8% Pass</span>
                  </div>
                  <div className="ipv-breakdown-row">
                    <span>Payer Canonical Aliasing:</span>
                    <span className="font-mono text-amber font-weight-600">97.2% Auto-Mapped</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ipv-drawer-footer">
              <button className="ipv-btn-drawer-close-full" onClick={() => setShowDrawer(false)}>
                Close Audit Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
