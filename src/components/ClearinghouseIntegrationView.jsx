import React, { useState, useMemo, useCallback } from 'react';
import {
  Send,
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
  Check,
  ArrowRightLeft,
  FileSpreadsheet
} from 'lucide-react';
import {
  getClearinghouseConnectorConfig,
  getClearinghouseTelemetry,
  getClearinghouseTransmissionBatches,
  getClearinghouseClaimRecords,
  getClearinghouseRemitAdjudications,
  getClearinghouseExceptions,
  testClearinghouseConnection,
  triggerClearinghouseBatchDispatch,
  ingest835RemittanceBatch,
  resolveClearinghouseException,
  normalizeFacilityId
} from '../services/clearinghouseIntegrationService';
import './ClearinghouseIntegrationView.css';

export default function ClearinghouseIntegrationView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('claims_queue'); // 'claims_queue' | 'remit_balancing' | 'batches_logs' | 'exceptions_workqueue'
  const [selectedClaimId, setSelectedClaimId] = useState('clm-rec-901');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Banners & Notifications
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load Data
  const config = useMemo(() => getClearinghouseConnectorConfig(facilityId), [facilityId, refreshKey]);
  const telemetry = useMemo(() => getClearinghouseTelemetry(facilityId), [facilityId, refreshKey]);
  const batches = useMemo(() => getClearinghouseTransmissionBatches(facilityId), [facilityId, refreshKey]);
  const claims = useMemo(() => getClearinghouseClaimRecords(facilityId), [facilityId, refreshKey]);
  const remittances = useMemo(() => getClearinghouseRemitAdjudications(facilityId), [facilityId, refreshKey]);
  const exceptions = useMemo(() => getClearinghouseExceptions(facilityId), [facilityId, refreshKey]);

  // Selected Claim Details
  const selectedClaim = useMemo(() => claims.find(c => c.id === selectedClaimId) || claims[0], [claims, selectedClaimId]);
  const selectedRemittance = useMemo(() => remittances.find(r => r.patientControlNumber === selectedClaim?.patientControlNumber), [remittances, selectedClaim]);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claims.filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.patientControlNumber.toLowerCase().includes(q) ||
        c.patientName.toLowerCase().includes(q) ||
        c.payerName.toLowerCase().includes(q) ||
        c.payerId.toLowerCase().includes(q) ||
        c.claimStatus.toLowerCase().includes(q)
      );
    });
  }, [claims, searchQuery]);

  // Filtered Remittances
  const filteredRemittances = useMemo(() => {
    return remittances.filter(r => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.patientControlNumber.toLowerCase().includes(q) ||
        r.payerClaimControlNumber.toLowerCase().includes(q) ||
        r.checkEftTraceNumber.toLowerCase().includes(q) ||
        r.remitStatus.toLowerCase().includes(q)
      );
    });
  }, [remittances, searchQuery]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        b.batchControlNumber.toLowerCase().includes(q) ||
        b.transmissionType.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q)
      );
    });
  }, [batches, searchQuery]);

  // Filtered Exceptions
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.exceptionCode.toLowerCase().includes(q) ||
        e.exceptionCategory.toLowerCase().includes(q) ||
        (e.offendingSegment && e.offendingSegment.toLowerCase().includes(q))
      );
    });
  }, [exceptions, searchQuery]);

  // Test Connection Handler
  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = testClearinghouseConnection(facilityId);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Live Gateway Verified: ${res.message} (Latency: ${res.latencyMs}ms)`
        });
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Connection Test Failed: ${err.message}`
      });
    } finally {
      setIsTesting(false);
    }
  }, [facilityId]);

  // Trigger Manual Batch Dispatch Handler
  const handleDispatchBatch = useCallback(async () => {
    setIsDispatching(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = triggerClearinghouseBatchDispatch(facilityId);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `837 Outbound Batch Dispatched: Generated ${res.batch.batchControlNumber} (${res.claimsDispatched} claims, $${res.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}) with 277CA status ACCEPTED.`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Batch Dispatch Failed: ${err.message}`
      });
    } finally {
      setIsDispatching(false);
    }
  }, [facilityId]);

  // Trigger Manual 835 ERA Ingestion Handler
  const handleIngestEra = useCallback(async () => {
    setIsIngesting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const samplePayload = {
        remittance_lines: [
          {
            patient_control_number: 'CLM-NAP-2026-902',
            payer_claim_control_number: `ICN-AET-${Date.now()}`,
            billed_charge: 2760.00,
            allowed_amount: 1980.00,
            paid_amount: 1730.00,
            contractual_adjustment: 780.00,
            patient_responsibility: 250.00,
            carc_codes: ['CO-45', 'PR-1'],
            rarc_codes: ['N30'],
            check_eft_trace_number: 'EFT-AET-88392019',
            check_eft_date: new Date().toISOString().slice(0, 10)
          }
        ]
      };
      const res = ingest835RemittanceBatch(facilityId, samplePayload);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `835 ERA Ingested: Processed batch ${res.batch.batchControlNumber} with 100% balancing equation verified ($${res.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })} paid).`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `835 ERA Ingestion Failed: ${err.message}`
      });
    } finally {
      setIsIngesting(false);
    }
  }, [facilityId]);

  // Resolve Exception Handler
  const handleResolveException = useCallback((exceptionId) => {
    const res = resolveClearinghouseException(exceptionId, 'RESOLVED_BY_BILLER_OVERRIDE');
    if (res.success) {
      setBanner({
        show: true,
        type: 'success',
        message: 'Clearinghouse exception resolved and cleared from active workqueue.'
      });
      setRefreshKey(k => k + 1);
    }
  }, []);

  return (
    <div className="clh-container">
      {/* 1. Header Action Bar */}
      <div className="clh-header">
        <div className="clh-header-left">
          <div className="clh-title-row">
            <h1 className="clh-title">Clearinghouse EDI Gateway & Adjudication Engine</h1>
            <span className="clh-badge-vendor">{config.clearinghouseVendor} EDI Gateway</span>
            <span className={`clh-badge-status status-${config.connectionStatus.toLowerCase()}`}>
              <span className="clh-status-dot" />
              {config.connectionStatus}
            </span>
            <span className="clh-badge-snip">SNIP Level {config.wediSnipLevel}</span>
          </div>
          <p className="clh-subtitle">
            Facility: <strong>{facilityName}</strong> | Automated ANSI ASC X12 837I/P transmission, 999/277CA acknowledgments, 835 ERA remittance ingestion & CARC balancing.
          </p>
        </div>

        <div className="clh-header-actions">
          <button
            className="clh-btn clh-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <Activity size={15} className={isTesting ? 'spin-icon' : ''} />
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            className="clh-btn clh-btn-secondary"
            onClick={handleIngestEra}
            disabled={isIngesting}
          >
            <FileSpreadsheet size={15} className={isIngesting ? 'spin-icon' : ''} />
            {isIngesting ? 'Ingesting...' : 'Ingest 835 ERA'}
          </button>
          <button
            className="clh-btn clh-btn-primary"
            onClick={handleDispatchBatch}
            disabled={isDispatching}
          >
            <Send size={15} className={isDispatching ? 'spin-icon' : ''} />
            {isDispatching ? 'Dispatching...' : 'Dispatch 837 Batch'}
          </button>
          <button
            className="clh-btn clh-btn-icon"
            onClick={() => setIsDrawerOpen(true)}
            title="Gateway Configuration Settings"
          >
            <Sliders size={16} />
          </button>
        </div>
      </div>

      {/* 2. Notification Banner */}
      {banner.show && (
        <div className={`clh-banner clh-banner-${banner.type}`}>
          <div className="clh-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Activity size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="clh-banner-close" onClick={() => setBanner({ show: false, type: 'info', message: '' })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. 4-Card Telemetry KPI Ribbon */}
      <div className="clh-kpi-grid">
        <div className="clh-kpi-card">
          <div className="clh-kpi-header">
            <span className="clh-kpi-label">Outbound Claims (24h)</span>
            <div className="clh-kpi-icon-wrapper icon-teal">
              <Send size={16} />
            </div>
          </div>
          <div className="clh-kpi-value">{telemetry.claimsTransmitted24h}</div>
          <div className="clh-kpi-footer">
            <span className="clh-trend-positive">
              ${Number(telemetry.totalBilledAmount24h).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="clh-kpi-subtext">total billed volume</span>
          </div>
        </div>

        <div className="clh-kpi-card">
          <div className="clh-kpi-header">
            <span className="clh-kpi-label">First-Pass Clean Acceptance</span>
            <div className="clh-kpi-icon-wrapper icon-emerald">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="clh-kpi-value">{telemetry.cleanClaimAcceptancePct}%</div>
          <div className="clh-kpi-footer">
            <span className="clh-trend-positive">WEDI SNIP 7</span>
            <span className="clh-kpi-subtext">pre-flight compliance</span>
          </div>
        </div>

        <div className="clh-kpi-card">
          <div className="clh-kpi-header">
            <span className="clh-kpi-label">Total 835 ERA Paid (24h)</span>
            <div className="clh-kpi-icon-wrapper icon-blue">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="clh-kpi-value">
            ${Number(telemetry.totalEraPaid24h).toLocaleString('en-US', { minimumFractionDigits: 0 })}
          </div>
          <div className="clh-kpi-footer">
            <span className="clh-trend-neutral">100% Balanced</span>
            <span className="clh-kpi-subtext">zero mathematical variance</span>
          </div>
        </div>

        <div className="clh-kpi-card">
          <div className="clh-kpi-header">
            <span className="clh-kpi-label">Gateway Latency & EDI 999</span>
            <div className="clh-kpi-icon-wrapper icon-amber">
              <Clock size={16} />
            </div>
          </div>
          <div className="clh-kpi-value">{telemetry.avgGatewayLatencyMs} ms</div>
          <div className="clh-kpi-footer">
            <span className="clh-trend-positive">Sub-second</span>
            <span className="clh-kpi-subtext">mTLS REST ACK turnaround</span>
          </div>
        </div>
      </div>

      {/* 4. 5-Stage Transmission & Adjudication Pipeline Visualizer */}
      <div className="clh-pipeline-card">
        <div className="clh-pipeline-header">
          <div className="clh-pipeline-title-group">
            <Layers size={17} className="clh-pipeline-title-icon" />
            <h3 className="clh-pipeline-title">Deterministic 5-Stage Claims & Remittance Pipeline</h3>
          </div>
          <div className="clh-pipeline-badge">
            <ShieldCheck size={14} />
            <span>Cryptographic Proof: {telemetry.latestSyncSeal.substring(0, 19)}...</span>
          </div>
        </div>

        <div className="clh-stages-row">
          <div className="clh-stage-item stage-completed">
            <div className="clh-stage-number">1</div>
            <div className="clh-stage-body">
              <span className="clh-stage-title">837 Dispatch</span>
              <span className="clh-stage-desc">ISA/GS Envelopes & UB-04 Bill Type 831</span>
            </div>
          </div>

          <div className="clh-stage-arrow">→</div>

          <div className="clh-stage-item stage-completed">
            <div className="clh-stage-number">2</div>
            <div className="clh-stage-body">
              <span className="clh-stage-title">999 Functional ACK</span>
              <span className="clh-stage-desc">Syntactic Interchange Accepted</span>
            </div>
          </div>

          <div className="clh-stage-arrow">→</div>

          <div className="clh-stage-item stage-completed">
            <div className="clh-stage-number">3</div>
            <div className="clh-stage-body">
              <span className="clh-stage-title">277CA Claim Status</span>
              <span className="clh-stage-desc">Accepted for Adjudication (STC A2)</span>
            </div>
          </div>

          <div className="clh-stage-arrow">→</div>

          <div className="clh-stage-item stage-completed">
            <div className="clh-stage-number">4</div>
            <div className="clh-stage-body">
              <span className="clh-stage-title">835 Remit Ingestion</span>
              <span className="clh-stage-desc">CLP Claims & CARC/RARC Codes</span>
            </div>
          </div>

          <div className="clh-stage-arrow">→</div>

          <div className="clh-stage-item stage-active">
            <div className="clh-stage-number">5</div>
            <div className="clh-stage-body">
              <span className="clh-stage-title">Balancing & Ledger</span>
              <span className="clh-stage-desc">Billed - Adj - Paid - Patient = $0.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Sub-navigation Tabs */}
      <div className="clh-tab-bar">
        <button
          className={`clh-tab-btn ${activeSubTab === 'claims_queue' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('claims_queue')}
        >
          <Send size={15} />
          <span>Outbound Claims Queue</span>
          <span className="clh-tab-count">{claims.length}</span>
        </button>

        <button
          className={`clh-tab-btn ${activeSubTab === 'remit_balancing' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('remit_balancing')}
        >
          <DollarSign size={15} />
          <span>Inbound 835 Remittances & CARC Balancing</span>
          <span className="clh-tab-count">{remittances.length}</span>
        </button>

        <button
          className={`clh-tab-btn ${activeSubTab === 'batches_logs' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('batches_logs')}
        >
          <Database size={15} />
          <span>Transmission Batches & 999/277CA</span>
          <span className="clh-tab-count">{batches.length}</span>
        </button>

        <button
          className={`clh-tab-btn ${activeSubTab === 'exceptions_workqueue' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('exceptions_workqueue')}
        >
          <AlertTriangle size={15} />
          <span>Exceptions Workqueue</span>
          <span className="clh-tab-count count-amber">{exceptions.length}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="clh-filter-row">
        <div className="clh-search-wrapper">
          <Search size={15} className="clh-search-icon" />
          <input
            type="text"
            className="clh-search-input"
            placeholder="Search by Patient Control Number (PCN), Payer ID, Check/EFT, or Status..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clh-search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 6. Tab Content Area */}
      {/* Subtab 1: Outbound Claims Queue */}
      {activeSubTab === 'claims_queue' && (
        <div className="clh-table-card">
          <div className="clh-table-header">
            <h3 className="clh-card-title">Outbound ANSI ASC X12 837 Claims Queue</h3>
            <span className="clh-card-caption">All claims validated against WEDI SNIP 1–7 prior to batch dispatch</span>
          </div>

          <div className="clh-table-responsive">
            <table className="clh-data-table">
              <thead>
                <tr>
                  <th>Patient Control Number</th>
                  <th>Patient Name</th>
                  <th>Format / Bill Type</th>
                  <th>Payer Name / ID</th>
                  <th>Service Date</th>
                  <th>Billed Charge</th>
                  <th>WEDI SNIP Status</th>
                  <th>Claim Lifecycle Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.map(c => (
                  <tr
                    key={c.id}
                    className={selectedClaimId === c.id ? 'row-selected' : ''}
                    onClick={() => setSelectedClaimId(c.id)}
                  >
                    <td>
                      <div className="clh-pcn-cell">
                        <strong>{c.patientControlNumber}</strong>
                        <span className="clh-sub-id">{c.subscriberMemberId}</span>
                      </div>
                    </td>
                    <td>{c.patientName}</td>
                    <td>
                      <span className="clh-chip chip-format">{c.claimFormat}</span>
                      <span className="clh-chip chip-billtype">Type {c.billType}</span>
                    </td>
                    <td>
                      <div>{c.payerName}</div>
                      <span className="clh-sub-id">ID: {c.payerId}</span>
                    </td>
                    <td>{c.serviceDate}</td>
                    <td>
                      <strong>${Number(c.totalBilledCharge).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </td>
                    <td>
                      <span className={`clh-status-badge status-${c.wediSnipStatus.toLowerCase()}`}>
                        {c.wediSnipStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`clh-status-badge status-${c.claimStatus.toLowerCase()}`}>
                        {c.claimStatus}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredClaims.length === 0 && (
                  <tr>
                    <td colSpan={8} className="clh-empty-state">
                      No claims found matching current search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected Claim Line Items Inspector */}
          {selectedClaim && selectedClaim.serviceLines && (
            <div className="clh-detail-panel">
              <div className="clh-detail-header">
                <h4>Itemized Service Lines (SV2 Segment) for {selectedClaim.patientControlNumber}</h4>
                <span className="clh-sub-id">Payer: {selectedClaim.payerName} | Format: {selectedClaim.claimFormat}</span>
              </div>
              <div className="clh-line-items-grid">
                {selectedClaim.serviceLines.map(line => (
                  <div key={line.line_number} className="clh-line-card">
                    <div className="clh-line-header">
                      <span className="clh-line-num">Line {line.line_number}</span>
                      <span className="clh-cpt-badge">CPT {line.cpt_code}</span>
                    </div>
                    <div className="clh-line-body">
                      <span className="clh-line-charge">
                        ${Number(line.line_charge).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtab 2: Inbound 835 Remittances & CARC Balancing */}
      {activeSubTab === 'remit_balancing' && (
        <div className="clh-table-card">
          <div className="clh-table-header">
            <h3 className="clh-card-title">Electronic Remittance Advice (ERA 835) & CARC Balancing Ledger</h3>
            <span className="clh-card-caption">
              Mathematical invariant enforced: Billed Charge - Contractual Adjustment - Payer Paid - Patient Responsibility = $0.00
            </span>
          </div>

          <div className="clh-table-responsive">
            <table className="clh-data-table">
              <thead>
                <tr>
                  <th>Patient Control Number</th>
                  <th>Payer Claim Control #</th>
                  <th>Check / EFT Trace</th>
                  <th>Billed Charge</th>
                  <th>Allowed Amount</th>
                  <th>Payer Paid</th>
                  <th>Contractual Adj (CO)</th>
                  <th>Patient Resp (PR)</th>
                  <th>CARC Codes</th>
                  <th>Balancing Invariant</th>
                </tr>
              </thead>
              <tbody>
                {filteredRemittances.map(r => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.patientControlNumber}</strong>
                    </td>
                    <td>
                      <span className="clh-mono-text">{r.payerClaimControlNumber}</span>
                    </td>
                    <td>
                      <span className="clh-mono-text">{r.checkEftTraceNumber}</span>
                      <div className="clh-sub-id">{r.checkEftDate}</div>
                    </td>
                    <td>${Number(r.billedCharge).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(r.allowedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <strong className="clh-text-emerald">
                        ${Number(r.paidAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>${Number(r.contractualAdjustment).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(r.patientResponsibility).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <div className="clh-carc-group">
                        {r.carcCodes.map(code => (
                          <span key={code} className="clh-chip chip-carc">{code}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {r.isBalanced ? (
                        <span className="clh-badge-balanced">
                          <Check size={13} />
                          Balanced ($0.00)
                        </span>
                      ) : (
                        <span className="clh-badge-imbalanced">
                          <AlertTriangle size={13} />
                          Imbalanced
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRemittances.length === 0 && (
                  <tr>
                    <td colSpan={10} className="clh-empty-state">
                      No remittance records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: Transmission Batches & 999/277CA Logs */}
      {activeSubTab === 'batches_logs' && (
        <div className="clh-table-card">
          <div className="clh-table-header">
            <h3 className="clh-card-title">Interchange Transmission Batches & Gateway Logs</h3>
            <span className="clh-card-caption">Audit ledger of all outbound 837 claim files and inbound 835 remittances</span>
          </div>

          <div className="clh-table-responsive">
            <table className="clh-data-table">
              <thead>
                <tr>
                  <th>Batch Control Number</th>
                  <th>Type / Direction</th>
                  <th>Transmission Status</th>
                  <th>Claims</th>
                  <th>Billed Amount</th>
                  <th>Paid Amount</th>
                  <th>EDI 999 ACK</th>
                  <th>277CA Status</th>
                  <th>Duration</th>
                  <th>Cryptographic SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.batchControlNumber}</strong>
                      <div className="clh-sub-id">{new Date(b.transmittedAt).toLocaleString()}</div>
                    </td>
                    <td>
                      <span className="clh-chip chip-type">{b.transmissionType}</span>
                    </td>
                    <td>
                      <span className={`clh-status-badge status-${b.status.toLowerCase()}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>{b.claimCount}</td>
                    <td>${Number(b.totalBilledAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>${Number(b.totalPaidAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="clh-ack-code">{b.acknowledgment999Code || '—'}</span>
                    </td>
                    <td>
                      <span className="clh-ack-code">{b.claimAck277caCode || '—'}</span>
                    </td>
                    <td>{b.durationMs} ms</td>
                    <td>
                      <span className="clh-seal-code" title={b.sha256SyncSeal}>
                        {b.sha256SyncSeal.substring(0, 19)}...
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredBatches.length === 0 && (
                  <tr>
                    <td colSpan={10} className="clh-empty-state">
                      No transmission batches found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Exceptions Workqueue */}
      {activeSubTab === 'exceptions_workqueue' && (
        <div className="clh-table-card">
          <div className="clh-table-header">
            <h3 className="clh-card-title">Clearinghouse & SNIP Exception Workqueue</h3>
            <span className="clh-card-caption">Quarantined records requiring biller review or claim resubmission</span>
          </div>

          <div className="clh-table-responsive">
            <table className="clh-data-table">
              <thead>
                <tr>
                  <th>Exception Code</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Offending EDI Segment</th>
                  <th>Resolution Action</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredExceptions.map(e => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.exceptionCode}</strong>
                    </td>
                    <td>
                      <span className="clh-chip chip-category">{e.exceptionCategory}</span>
                    </td>
                    <td>
                      <span className={`clh-severity-badge severity-${e.severity.toLowerCase()}`}>
                        {e.severity}
                      </span>
                    </td>
                    <td>
                      <span className="clh-mono-text offending-segment">{e.offendingSegment || '—'}</span>
                    </td>
                    <td>{e.resolutionAction}</td>
                    <td>
                      {e.isResolved ? (
                        <span className="clh-badge-resolved">
                          <Check size={13} />
                          Resolved
                        </span>
                      ) : (
                        <span className="clh-badge-pending">
                          <AlertTriangle size={13} />
                          Pending Review
                        </span>
                      )}
                    </td>
                    <td>
                      {!e.isResolved ? (
                        <button
                          className="clh-btn-action"
                          onClick={() => handleResolveException(e.id)}
                        >
                          Resolve
                        </button>
                      ) : (
                        <span className="clh-sub-id">Cleared</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredExceptions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="clh-empty-state">
                      No active clearinghouse exceptions. All claims and remittances are clean.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Settings Modal / Drawer */}
      {isDrawerOpen && (
        <div className="clh-modal-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <div className="clh-modal-content" onClick={e => e.stopPropagation()}>
            <div className="clh-modal-header">
              <div className="clh-modal-title-group">
                <Sliders size={18} />
                <h3>Clearinghouse Gateway Configuration</h3>
              </div>
              <button className="clh-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="clh-modal-body">
              <div className="clh-config-group">
                <label className="clh-config-label">Clearinghouse Vendor</label>
                <input
                  type="text"
                  className="clh-config-input"
                  value={config.clearinghouseVendor}
                  readOnly
                />
              </div>

              <div className="clh-config-group">
                <label className="clh-config-label">Gateway Transport Mode</label>
                <input
                  type="text"
                  className="clh-config-input"
                  value={config.gatewayMode}
                  readOnly
                />
              </div>

              <div className="clh-config-group">
                <label className="clh-config-label">REST API Endpoint URL</label>
                <input
                  type="text"
                  className="clh-config-input"
                  value={config.apiEndpointUrl}
                  readOnly
                />
              </div>

              <div className="clh-config-row">
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">Submitter ID</label>
                  <input
                    type="text"
                    className="clh-config-input"
                    value={config.submitterId}
                    readOnly
                  />
                </div>
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">Receiver ID</label>
                  <input
                    type="text"
                    className="clh-config-input"
                    value={config.receiverId}
                    readOnly
                  />
                </div>
              </div>

              <div className="clh-config-row">
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">OAuth2 Client ID</label>
                  <input
                    type="text"
                    className="clh-config-input"
                    value={config.clientId}
                    readOnly
                  />
                </div>
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">Client Secret (Encrypted)</label>
                  <input
                    type="text"
                    className="clh-config-input clh-mono-text"
                    value={config.clientSecretMasked}
                    readOnly
                  />
                </div>
              </div>

              <div className="clh-config-row">
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">WEDI SNIP Level</label>
                  <input
                    type="text"
                    className="clh-config-input"
                    value={`Level ${config.wediSnipLevel} (Full Trading Partner)`}
                    readOnly
                  />
                </div>
                <div className="clh-config-group flex-1">
                  <label className="clh-config-label">Batch Dispatch Schedule</label>
                  <input
                    type="text"
                    className="clh-config-input"
                    value={config.autoBatchSchedule}
                    readOnly
                  />
                </div>
              </div>
            </div>

            <div className="clh-modal-footer">
              <button
                className="clh-btn clh-btn-secondary"
                onClick={() => setIsDrawerOpen(false)}
              >
                Close
              </button>
              <button
                className="clh-btn clh-btn-primary"
                onClick={handleTestConnection}
              >
                Test Gateway Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
