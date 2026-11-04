import React, { useState, useMemo } from 'react';
import {
  FileText,
  Upload,
  Download,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  Layers,
  ArrowRight,
  RefreshCw,
  Link,
  ShieldCheck,
  FileCode,
  FileCheck2
} from 'lucide-react';
import edi837IngestionService, {
  BATCH_STATUSES,
  BATCH_STATUS_CONFIG,
  SNIP_VALIDATION_STATUSES,
  MATCH_STATUSES,
  EXCEPTION_TYPES,
  calculateIngestionKpis
} from '../lib/edi837IngestionService';
import './Edi837IngestionView.css';

export default function Edi837IngestionView() {
  const initialData = useMemo(() => edi837IngestionService.getBaselineSampleData(), []);
  
  const [batches, setBatches] = useState(initialData.batches);
  const [stagedClaims, setStagedClaims] = useState(initialData.stagedClaims);
  const [exceptions, setExceptions] = useState(initialData.exceptions);
  const [surgeries] = useState(initialData.surgeries);

  const [activeTab, setActiveTab] = useState('batches'); // 'batches' | 'claims' | 'exceptions' | 'inspector'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [formatFilter, setFormatFilter] = useState('ALL');

  // Selected for Inspect Modal
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [selectedException, setSelectedException] = useState(null);

  // Compute live KPIs
  const kpis = useMemo(() => {
    return calculateIngestionKpis(batches, exceptions);
  }, [batches, exceptions]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchSearch = searchTerm === '' ||
        b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.submitterIdentifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.receiverIdentifier.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      const matchFormat = formatFilter === 'ALL' || b.formatType === formatFilter;
      return matchSearch && matchStatus && matchFormat;
    });
  }, [batches, searchTerm, statusFilter, formatFilter]);

  // Filtered Staged Claims
  const filteredClaims = useMemo(() => {
    return stagedClaims.filter(c => {
      const matchSearch = searchTerm === '' ||
        c.patientControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subscriberMemberId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.primaryPayerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || c.matchStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [stagedClaims, searchTerm, statusFilter]);

  // Filtered Exceptions
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      const matchSearch = searchTerm === '' ||
        e.patientControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.errorMessage.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || e.resolutionStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [exceptions, searchTerm, statusFilter]);

  // Simulate Ingesting a new EDI 837 Payload
  const handleSimulateIngestion = () => {
    const rawSample = `ISA*00*          *00*          *ZZ*AVALITY        *ZZ*FIRSTCOAST     *261104*1200*^*00501*000098499*0*P*:~GS*HC*AVALITY*FIRSTCOAST*20261104*1200*3*X*005010X223A2~ST*837*0003*005010X223A2~BHT*0019*00*BATCH03*20261104*1200*CH~NM1*85*2*NAPLES SURGERY CENTER*****XX*1942049182~NM1*PR*3*FLORIDA FIRST COAST*****PI*00590~CLM*CLM-2026-0893*2450.00***24:B:1*Y*A*Y*Y~DTP*472*D8*20261016~NM1*IL*1*HAYES*DEVON****MI*FLM773410~NM1*82*1*STERLING*FRANK****XX*1749201948~SV2*0490*HC:45385:SG*1850.00*UN*1~SV2*0272*HC:99070:SG*600.00*UN*1~SE*14*0003~GE*1*3~IEA*1*000098499~`;

    const parsed = edi837IngestionService.parseEdi837Content(rawSample);
    if (!parsed.success) {
      alert('Simulation error: ' + parsed.error);
      return;
    }

    const validatedClaims = parsed.claims.map(c => {
      const snipRes = edi837IngestionService.validateSnipRules(c);
      return {
        ...c,
        id: `staged-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        batchId: `batch-837i-sim-${Date.now()}`,
        facilityId: 'fac-naples-01',
        snipValidationStatus: snipRes.status,
        snipErrors: snipRes.errors,
        lineItemCount: c.lines.length
      };
    });

    const matchedClaims = edi837IngestionService.matchClaimsAgainstSurgeries(validatedClaims, surgeries);

    const newBatch = {
      id: `batch-837i-sim-${Date.now()}`,
      facilityId: 'fac-naples-01',
      batchNumber: `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-SIM`,
      fileName: `EDI837I_SIM_${Date.now()}.x12`,
      fileHashSha256: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
      formatType: parsed.formatType,
      isaControlNumber: parsed.isaControlNumber,
      submitterIdentifier: parsed.submitterId,
      receiverIdentifier: parsed.receiverId,
      status: BATCH_STATUSES.COMPLETED_CLEAN,
      totalClaimsCount: matchedClaims.length,
      matchedClaimsCount: matchedClaims.filter(c => c.matchScore >= 90).length,
      exceptionClaimsCount: matchedClaims.filter(c => c.matchScore < 90).length,
      totalBilledCharge: matchedClaims.reduce((acc, c) => acc + c.totalBilledCharge, 0),
      ingestedAt: new Date().toISOString(),
      rawPayloadPreview: rawSample
    };

    setBatches(prev => [newBatch, ...prev]);
    setStagedClaims(prev => [...matchedClaims, ...prev]);
    alert(`Successfully ingested 837 Batch ${newBatch.batchNumber} with ${matchedClaims.length} claim(s)! 100% matched to Surgery Log.`);
  };

  // Resolve Exception
  const handleResolveException = (excId, action = 'MANUAL_MATCH') => {
    setExceptions(prev => prev.map(e => {
      if (e.id === excId) {
        return {
          ...e,
          resolutionStatus: 'RESOLVED',
          resolutionAction: action,
          resolvedAt: new Date().toISOString()
        };
      }
      return e;
    }));
    setSelectedException(null);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Batch Number', 'File Name', 'Format', 'Submitter', 'Receiver', 'Claims Count', 'Matched', 'Exceptions', 'Total Billed', 'Status', 'Ingested At'];
    const rows = batches.map(b => [
      b.batchNumber,
      b.fileName,
      b.formatType,
      b.submitterIdentifier,
      b.receiverIdentifier,
      b.totalClaimsCount,
      b.matchedClaimsCount,
      b.exceptionClaimsCount,
      `$${b.totalBilledCharge.toFixed(2)}`,
      b.status,
      b.ingestedAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `edi_837_ingestion_summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="edi837-container">
      {/* Top Header Toolbar */}
      <div className="edi837-topbar">
        <div className="edi837-topbar-left">
          <div className="edi837-header-icon-badge">
            <Upload size={22} />
          </div>
          <div>
            <h1 className="edi837-title">837 EDI Ingestion & Case Matching Engine</h1>
            <p className="edi837-subtitle">
              ANSI ASC X12 837I/P Clearinghouse Ingestion, WEDI SNIP 1–4 Validation & Deterministic Case Linking
            </p>
          </div>
        </div>

        <div className="edi837-topbar-right">
          <button onClick={handleSimulateIngestion} className="edi837-action-btn edi837-primary-btn" title="Simulate 837 X12 Inbound File">
            <RefreshCw size={14} />
            <span>Simulate 837 Ingestion</span>
          </button>
          <button onClick={handleExportCsv} className="edi837-action-btn edi837-export-btn" title="Export Ingestion Summary">
            <Download size={14} />
            <span>Export Summary CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="edi837-kpi-banner-grid">
        <div className="edi837-kpi-card edi837-highlight-card">
          <div className="edi837-kpi-header">
            <span className="edi837-kpi-label">Total Batches Processed</span>
            <FileText size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="edi837-kpi-value-row">
            <span className="edi837-kpi-value">{kpis.totalBatches}</span>
          </div>
          <div className="edi837-kpi-footnote">{kpis.totalClaimsIngested} claims staged</div>
        </div>

        <div className="edi837-kpi-card edi837-success-card">
          <div className="edi837-kpi-header">
            <span className="edi837-kpi-label">Clean Ingestion Rate</span>
            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          </div>
          <div className="edi837-kpi-value-row">
            <span className="edi837-kpi-value" style={{ color: '#34d399' }}>
              {batches.length > 0 ? Math.round((batches.filter(b => b.status === BATCH_STATUSES.COMPLETED_CLEAN).length / batches.length) * 100) : 0}%
            </span>
          </div>
          <div className="edi837-kpi-footnote">WEDI SNIP 1–4 Validated</div>
        </div>

        <div className="edi837-kpi-card edi837-highlight-card">
          <div className="edi837-kpi-header">
            <span className="edi837-kpi-label">Case Auto-Match Rate</span>
            <Link size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="edi837-kpi-value-row">
            <span className="edi837-kpi-value" style={{ color: '#38bdf8' }}>{kpis.autoMatchRatePct}%</span>
          </div>
          <div className="edi837-kpi-footnote">Deterministic Case/MRN matching</div>
        </div>

        <div className="edi837-kpi-card edi837-warning-card">
          <div className="edi837-kpi-header">
            <span className="edi837-kpi-label">Open Exceptions Queue</span>
            <AlertTriangle size={16} style={{ color: '#fbbf24' }} />
          </div>
          <div className="edi837-kpi-value-row">
            <span className="edi837-kpi-value" style={{ color: '#fbbf24' }}>{kpis.openExceptionsCount}</span>
          </div>
          <div className="edi837-kpi-footnote">${kpis.atRiskExceptionAmount.toLocaleString()} at-risk charges</div>
        </div>
      </div>

      {/* Tab Navigation Strip */}
      <div className="edi837-tabs-bar">
        <div className="edi837-tab-navigation">
          <button
            className={`edi837-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
            onClick={() => { setActiveTab('batches'); setStatusFilter('ALL'); }}
          >
            <Layers size={15} />
            <span>Ingestion Batches ({batches.length})</span>
          </button>
          <button
            className={`edi837-tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
            onClick={() => { setActiveTab('claims'); setStatusFilter('ALL'); }}
          >
            <FileCheck2 size={15} />
            <span>Staged Claims & Matching ({stagedClaims.length})</span>
          </button>
          <button
            className={`edi837-tab-btn ${activeTab === 'exceptions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('exceptions'); setStatusFilter('ALL'); }}
          >
            <AlertCircle size={15} />
            <span>Exceptions Queue ({exceptions.filter(e => e.resolutionStatus === 'OPEN').length})</span>
          </button>
          <button
            className={`edi837-tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
            onClick={() => { setActiveTab('inspector'); setStatusFilter('ALL'); }}
          >
            <FileCode size={15} />
            <span>X12 SNIP Syntax Inspector</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="edi837-toolbar">
        <div className="edi837-toolbar-left">
          <div className="edi837-search-box">
            <Search size={15} className="edi837-search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'batches'
                  ? 'Search by batch #, file name, submitter...'
                  : activeTab === 'claims'
                  ? 'Search by control #, patient, member ID...'
                  : 'Search exception reason, patient, batch...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="edi837-search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="edi837-clear-btn" title="Clear Search">
                <X size={14} />
              </button>
            )}
          </div>

          {activeTab === 'batches' && (
            <div className="edi837-filter-group">
              <label className="edi837-filter-label">Format:</label>
              <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)} className="edi837-select">
                <option value="ALL">All Formats</option>
                <option value="837I">837I Institutional (UB-04)</option>
                <option value="837P">837P Professional (CMS-1500)</option>
              </select>
            </div>
          )}

          <div className="edi837-filter-group">
            <label className="edi837-filter-label">Status:</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="edi837-select">
              <option value="ALL">All Statuses</option>
              {activeTab === 'batches' && Object.values(BATCH_STATUSES).map(s => (
                <option key={s} value={s}>{BATCH_STATUS_CONFIG[s]?.label || s}</option>
              ))}
              {activeTab === 'claims' && Object.values(MATCH_STATUSES).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              {activeTab === 'exceptions' && (
                <>
                  <option value="OPEN">Open Exceptions</option>
                  <option value="RESOLVED">Resolved Exceptions</option>
                </>
              )}
            </select>
          </div>

          {(searchTerm || statusFilter !== 'ALL' || formatFilter !== 'ALL') && (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setFormatFilter('ALL'); }}
              className="edi837-reset-btn"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="edi837-toolbar-right">
          <span className="edi837-results-badge">
            Showing <strong style={{ color: '#34d399' }}>{
              activeTab === 'batches' ? filteredBatches.length :
              activeTab === 'claims' ? filteredClaims.length :
              activeTab === 'exceptions' ? filteredExceptions.length :
              batches.length
            }</strong> records
          </span>
        </div>
      </div>

      {/* TAB 1: BATCHES */}
      {activeTab === 'batches' && (
        <div className="table-responsive">
          <table className="edi837-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Batch Number</th>
                <th style={{ width: '220px' }}>File & Hash</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Format</th>
                <th style={{ width: '200px' }}>Submitter / Receiver</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Claims</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Matched</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Exceptions</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Total Billed</th>
                <th style={{ width: '160px', textAlign: 'center' }}>Batch Status</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No 837 batches match active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const cfg = BATCH_STATUS_CONFIG[b.status] || {};
                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{b.batchNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{new Date(b.ingestedAt).toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#f8fafc' }}>{b.fileName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                          SHA: {b.fileHashSha256.slice(0, 16)}...
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="edi837-badge edi837-badge-sky">{b.formatType}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{b.submitterIdentifier}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>➔ {b.receiverIdentifier}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{b.totalClaimsCount}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#34d399' }}>{b.matchedClaimsCount}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: b.exceptionClaimsCount > 0 ? '#fb7185' : '#64748b' }}>
                        {b.exceptionClaimsCount}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        ${b.totalBilledCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`edi837-badge ${
                          b.status === BATCH_STATUSES.COMPLETED_CLEAN ? 'edi837-badge-emerald' :
                          b.status === BATCH_STATUSES.COMPLETED_WITH_EXCEPTIONS ? 'edi837-badge-amber' :
                          'edi837-badge-sky'
                        }`}>
                          {cfg.label || b.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => setSelectedBatch(b)} className="edi837-inspect-btn">
                          <Eye size={13} style={{ color: '#38bdf8' }} />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: STAGED CLAIMS & MATCHING */}
      {activeTab === 'claims' && (
        <div className="table-responsive">
          <table className="edi837-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Patient Control #</th>
                <th style={{ width: '180px' }}>Patient & Member ID</th>
                <th style={{ width: '130px' }}>Date of Service</th>
                <th style={{ width: '180px' }}>Primary Payer</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Billed Charge</th>
                <th style={{ width: '130px', textAlign: 'center' }}>SNIP Validation</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Match Confidence</th>
                <th style={{ width: '180px' }}>Linked Surgery Case</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No staged claims found.
                  </td>
                </tr>
              ) : (
                filteredClaims.map(c => {
                  const isMatched = c.matchScore >= 90;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{c.patientControlNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Batch: {c.batchId}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#f8fafc' }}>{c.patientName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>ID: {c.subscriberMemberId}</div>
                      </td>
                      <td>{c.dateOfService}</td>
                      <td>
                        <div style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{c.primaryPayerName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>NPI: {c.billingProviderNpi}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        ${c.totalBilledCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`edi837-badge ${c.snipValidationStatus === SNIP_VALIDATION_STATUSES.PASSED ? 'edi837-badge-emerald' : 'edi837-badge-amber'}`}>
                          {c.snipValidationStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`edi837-badge ${isMatched ? 'edi837-badge-emerald' : 'edi837-badge-rose'}`}>
                          {c.matchScore}% {isMatched ? 'Exact' : 'Unmatched'}
                        </span>
                      </td>
                      <td>
                        {c.matchedSurgeryId ? (
                          <div>
                            <span style={{ color: '#34d399', fontWeight: 600 }}>Case #{c.matchedSurgeryId}</span>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Verified in OR Log</div>
                          </div>
                        ) : (
                          <span style={{ color: '#fb7185', fontSize: '12px', fontWeight: 500 }}>No Surgery Link</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => setSelectedClaim(c)} className="edi837-inspect-btn">
                          <Eye size={13} style={{ color: '#38bdf8' }} />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: EXCEPTION RESOLUTION QUEUE */}
      {activeTab === 'exceptions' && (
        <div className="table-responsive">
          <table className="edi837-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Control # / Patient</th>
                <th style={{ width: '140px' }}>Batch Number</th>
                <th style={{ width: '180px' }}>Exception Type</th>
                <th style={{ width: '280px' }}>Reason / Error Details</th>
                <th style={{ width: '120px', textAlign: 'right' }}>At-Risk AR</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Resolution Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredExceptions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    Exception queue is clear! 100% of claims resolved.
                  </td>
                </tr>
              ) : (
                filteredExceptions.map(exc => (
                  <tr key={exc.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{exc.patientControlNumber}</div>
                      <div style={{ fontSize: '12px', color: '#f8fafc' }}>{exc.patientName}</div>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>{exc.batchNumber}</div>
                    </td>
                    <td>
                      <span className={`edi837-badge ${exc.severity === 'FATAL' ? 'edi837-badge-rose' : 'edi837-badge-amber'}`}>
                        {exc.exceptionType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{exc.errorMessage}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#fbbf24' }}>
                      ${exc.totalBilledCharge.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`edi837-badge ${exc.resolutionStatus === 'OPEN' ? 'edi837-badge-rose' : 'edi837-badge-emerald'}`}>
                        {exc.resolutionStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {exc.resolutionStatus === 'OPEN' ? (
                        <button onClick={() => setSelectedException(exc)} className="edi837-resolve-btn">
                          <CheckCircle2 size={13} />
                          <span>Remediate</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#34d399' }}>{exc.resolutionAction}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: X12 SNIP SYNTAX INSPECTOR */}
      {activeTab === 'inspector' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#38bdf8' }}>
              WEDI SNIP Validation Governance Levels (1–4)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '14px' }}>
              <div style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #34d399' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#34d399' }}>SNIP Level 1: Syntax & Delimiters</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>ISA, GS, ST, SE envelope checks and mandatory delimiter structure.</div>
              </div>
              <div style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #38bdf8' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#38bdf8' }}>SNIP Level 2: HIPAA Requirements</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Valid 10-digit NPIs, Place of Service = 24 (ASC), claim frequency codes.</div>
              </div>
              <div style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #fbbf24' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#fbbf24' }}>SNIP Level 3: Mathematical Balance</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>CLM02 total billed sum strictly equals the sum of itemized line charges.</div>
              </div>
              <div style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #94a3b8' }}>
                <div style={{ fontWeight: 600, fontSize: '12px', color: '#94a3b8' }}>SNIP Level 4: Situational Rules</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Institutional 837I revenue codes must be valid 4-digit numeric series.</div>
              </div>
            </div>
          </div>

          <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#f8fafc' }}>
              Sample 837I Electronic Transmission Raw Segment Stream
            </h4>
            <pre className="edi837-code-block">
{batches[0]?.rawPayloadPreview || 'No payload loaded.'}
            </pre>
          </div>
        </div>
      )}

      {/* INSPECT MODAL: BATCH DETAILS */}
      {selectedBatch && (
        <div className="edi837-modal-overlay" onClick={() => setSelectedBatch(null)}>
          <div className="edi837-modal" onClick={e => e.stopPropagation()}>
            <div className="edi837-modal-header">
              <h3 className="edi837-modal-title">Batch Transmission Inspector: {selectedBatch.batchNumber}</h3>
              <button onClick={() => setSelectedBatch(null)} className="edi837-modal-close"><X size={18} /></button>
            </div>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '13px' }}>
                <div><strong>File:</strong> {selectedBatch.fileName}</div>
                <div><strong>Format:</strong> {selectedBatch.formatType}</div>
                <div><strong>Submitter:</strong> {selectedBatch.submitterIdentifier}</div>
                <div><strong>Receiver:</strong> {selectedBatch.receiverIdentifier}</div>
                <div><strong>Total Claims:</strong> {selectedBatch.totalClaimsCount}</div>
                <div><strong>Total Billed:</strong> ${selectedBatch.totalBilledCharge.toLocaleString()}</div>
              </div>
              <h4 style={{ margin: '18px 0 8px 0', fontSize: '13px', color: '#38bdf8' }}>Raw ANSI X12 Envelope:</h4>
              <pre className="edi837-code-block">{selectedBatch.rawPayloadPreview}</pre>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT MODAL: CLAIM DETAILS */}
      {selectedClaim && (
        <div className="edi837-modal-overlay" onClick={() => setSelectedClaim(null)}>
          <div className="edi837-modal" onClick={e => e.stopPropagation()}>
            <div className="edi837-modal-header">
              <h3 className="edi837-modal-title">Staged Claim Audit: {selectedClaim.patientControlNumber}</h3>
              <button onClick={() => setSelectedClaim(null)} className="edi837-modal-close"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div><strong>Patient:</strong> {selectedClaim.patientName} (DOB: {selectedClaim.patientDob || 'N/A'})</div>
              <div><strong>Subscriber Member ID:</strong> {selectedClaim.subscriberMemberId}</div>
              <div><strong>Primary Payer:</strong> {selectedClaim.primaryPayerName}</div>
              <div><strong>Billing NPI:</strong> {selectedClaim.billingProviderNpi} | <strong>Rendering NPI:</strong> {selectedClaim.renderingProviderNpi}</div>
              <div><strong>Total Billed Charge:</strong> ${selectedClaim.totalBilledCharge.toLocaleString()}</div>
              <div><strong>SNIP Validation:</strong> <span style={{ color: '#34d399', fontWeight: 600 }}>{selectedClaim.snipValidationStatus}</span></div>

              <h4 style={{ margin: '14px 0 6px 0', fontSize: '13px', color: '#38bdf8' }}>Itemized Service Lines:</h4>
              <div className="table-responsive">
                <table className="edi837-table">
                  <thead>
                    <tr>
                      <th>Rev Code</th>
                      <th>CPT / HCPCS</th>
                      <th>Modifiers</th>
                      <th style={{ textAlign: 'right' }}>Charge</th>
                      <th style={{ textAlign: 'center' }}>Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedClaim.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td>{l.revenueCode}</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{l.cptCode}</td>
                        <td>{l.modifiers?.join(', ') || 'None'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${l.grossCharge.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>{l.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REMEDIATE EXCEPTION MODAL */}
      {selectedException && (
        <div className="edi837-modal-overlay" onClick={() => setSelectedException(null)}>
          <div className="edi837-modal" onClick={e => e.stopPropagation()}>
            <div className="edi837-modal-header">
              <h3 className="edi837-modal-title">Exception Remediation: {selectedException.patientControlNumber}</h3>
              <button onClick={() => setSelectedException(null)} className="edi837-modal-close"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#fb7185', fontWeight: 600 }}>{selectedException.exceptionType}</div>
                <div style={{ color: '#cbd5e1', marginTop: '4px' }}>{selectedException.errorMessage}</div>
              </div>

              <div>
                <strong>Candidate Surgery to Link:</strong>
                <select id="surgery-link-select" className="edi837-select" style={{ width: '100%', marginTop: '6px' }}>
                  {surgeries.map(s => (
                    <option key={s.id} value={s.id}>
                      Case #{s.id} — {s.patientName} ({s.procedureName}) - DOS: {s.date}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={() => handleResolveException(selectedException.id, 'MANUAL_LINK_CASE')}
                  className="edi837-action-btn edi837-primary-btn"
                >
                  <Link size={14} />
                  <span>Confirm Link to Surgery</span>
                </button>
                <button
                  onClick={() => handleResolveException(selectedException.id, 'OVERRIDE_EXCEPTION')}
                  className="edi837-action-btn edi837-reset-btn"
                >
                  <span>Override / Discard</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

