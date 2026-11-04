import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Receipt,
  Download,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  Layers,
  RefreshCw,
  Link,
  ShieldCheck,
  FileCode,
  FileCheck2,
  ArrowRight
} from 'lucide-react';
import edi835RemittanceService, {
  REMITTANCE_BATCH_STATUSES,
  REMITTANCE_BATCH_CONFIG,
  CLAIM_STATUS_CODES,
  COMMON_CARC_CODES,
  REMITTANCE_MATCH_STATUSES,
  REMITTANCE_EXCEPTION_TYPES,
  calculateRemittanceKpis
} from '../lib/edi835RemittanceService';
import './Edi835RemittanceView.css';

export default function Edi835RemittanceView() {
  const initialData = useMemo(() => edi835RemittanceService.getBaselineSampleData(), []);

  const [batches, setBatches] = useState(initialData.batches);
  const [claimPayments, setClaimPayments] = useState(initialData.claimPayments);
  const [exceptions, setExceptions] = useState(initialData.exceptions);
  const [activeClaims] = useState(initialData.activeClaims);

  const [activeTab, setActiveTab] = useState('batches'); // 'batches' | 'claims' | 'lines' | 'exceptions'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');

  // Selected for Inspect Modals
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [selectedException, setSelectedException] = useState(null);

  // Compute live executive KPIs
  const kpis = useMemo(() => {
    return calculateRemittanceKpis(batches, claimPayments, exceptions);
  }, [batches, claimPayments, exceptions]);

  // Flattened all lines for Tab 3
  const allLines = useMemo(() => {
    const list = [];
    claimPayments.forEach(c => {
      (c.lines || []).forEach((l, idx) => {
        list.push({
          id: `${c.id}-line-${idx}`,
          claimControlNumber: c.patientControlNumber,
          patientName: c.patientName,
          primaryPayerName: c.primaryPayerName,
          ...l
        });
      });
    });
    return list;
  }, [claimPayments]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const matchSearch = searchTerm === '' ||
        b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.checkEftTraceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.payerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.fileName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || b.status === statusFilter;
      const matchMethod = methodFilter === 'ALL' || b.paymentMethodCode === methodFilter;
      return matchSearch && matchStatus && matchMethod;
    });
  }, [batches, searchTerm, statusFilter, methodFilter]);

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return claimPayments.filter(c => {
      const matchSearch = searchTerm === '' ||
        c.patientControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.subscriberMemberId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.primaryPayerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || c.matchStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [claimPayments, searchTerm, statusFilter]);

  // Filtered Lines
  const filteredLines = useMemo(() => {
    return allLines.filter(l => {
      const matchSearch = searchTerm === '' ||
        l.claimControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.cptCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.carcCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.patientName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [allLines, searchTerm]);

  // Filtered Exceptions
  const filteredExceptions = useMemo(() => {
    return exceptions.filter(e => {
      const matchSearch = searchTerm === '' ||
        e.patientControlNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.checkEftTraceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.errorMessage.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || e.resolutionStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [exceptions, searchTerm, statusFilter]);

  // Simulate Ingesting a new EDI 835 Remittance File
  const handleSimulateIngestion = () => {
    const rawSample = `ISA*00*          *00*          *ZZ*AETNAHEALTH    *ZZ*NAPLESSURG     *261104*1400*^*00501*000098599*0*P*:~GS*HP*AETNAHEALTH*NAPLESSURG*20261104*1400*3*X*005010X221A1~ST*835*0003*005010X221A1~BPR*I*1100.00*C*ACH*CCP*01*123456789*DA*987654321*1942049182**01*999999999*DA*111111111*20261104~TRN*1*EFT-9912048819*1942049182~N1*PR*AETNA COMMERCIAL HEALTH~N1*PE*NAPLES SURGERY CENTER*XX*1942049182~CLP*CLM-2026-0893*1*2450.00*1100.00*0.00*12*ICN-9912048819~NM1*QC*1*HAYES*DEVON****MI*AET773410~SVC*HC:45385:SG*1850.00*850.00**1~CAS*CO*45*1000.00~SVC*HC:99070:SG*600.00*250.00**1~CAS*CO*45*350.00~SE*16*0003~GE*1*3~IEA*1*000098599~`;

    const parsed = edi835RemittanceService.parseEdi835Content(rawSample);
    if (!parsed.success) {
      alert('835 Simulation error: ' + parsed.error);
      return;
    }

    const matchedPayments = edi835RemittanceService.matchPaymentsAgainstClaims(
      parsed.claimPayments,
      activeClaims,
      []
    );

    const newBatch = {
      id: `era-835-sim-${Date.now()}`,
      facilityId: 'fac-naples-01',
      batchNumber: `ERA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-SIM`,
      fileName: `ERA835_SIM_${Date.now()}.x12`,
      fileHashSha256: '7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d',
      checkEftTraceNumber: parsed.checkEftTraceNumber,
      paymentMethodCode: parsed.paymentMethodCode,
      totalPaymentAmount: parsed.totalPaymentAmount,
      paymentEffectiveDate: parsed.paymentEffectiveDate,
      payerName: parsed.payerName,
      payerIdentifier: '00320',
      payeeName: parsed.payeeName,
      payeeNpi: parsed.payeeNpi,
      status: REMITTANCE_BATCH_STATUSES.BALANCED_POSTED,
      totalClaimsCount: matchedPayments.length,
      matchedClaimsCount: matchedPayments.filter(c => c.matchScore >= 90).length,
      exceptionClaimsCount: matchedPayments.filter(c => c.matchScore < 90).length,
      rawPayloadPreview: rawSample,
      ingestedAt: new Date().toISOString()
    };

    setBatches(prev => [newBatch, ...prev]);
    setClaimPayments(prev => [...matchedPayments, ...prev]);
    alert(`Successfully processed 835 Remittance Check ${newBatch.checkEftTraceNumber} ($${newBatch.totalPaymentAmount.toFixed(2)})! 100% balanced and re-associated.`);
  };

  // Resolve Exception
  const handleResolveException = (excId, targetClaimId) => {
    setExceptions(prev => prev.map(e => {
      if (e.id === excId) {
        return {
          ...e,
          resolutionStatus: 'RESOLVED',
          resolutionAction: `MANUAL_REASSOCIATE_${targetClaimId || 'POSTED'}`,
          resolvedAt: new Date().toISOString()
        };
      }
      return e;
    }));
    setSelectedException(null);
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Batch Number', 'EFT / Check #', 'Payer', 'Effective Date', 'Total Payment', 'Claims Count', 'Matched', 'Status', 'Ingested At'];
    const rows = batches.map(b => [
      b.batchNumber,
      b.checkEftTraceNumber,
      b.payerName,
      b.paymentEffectiveDate,
      `$${b.totalPaymentAmount.toFixed(2)}`,
      b.totalClaimsCount,
      b.matchedClaimsCount,
      b.status,
      b.ingestedAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `edi_835_remittance_summary_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="edi835-container">
      {/* Top Header Toolbar */}
      <div className="edi835-topbar">
        <div className="edi835-topbar-left">
          <div className="edi835-header-icon-badge">
            <Receipt size={22} />
          </div>
          <div>
            <h1 className="edi835-title">835 Remittance Advice & Electronic Posting Engine</h1>
            <p className="edi835-subtitle">
              ANSI ASC X12 835 ERA Ingestion, CLP Adjudication, Line-Level CARC Balancing & Auto-Post Reassociation
            </p>
          </div>
        </div>

        <div className="edi835-topbar-right">
          <button onClick={handleSimulateIngestion} className="edi835-action-btn edi835-primary-btn" title="Simulate 835 Inbound Remittance">
            <RefreshCw size={14} />
            <span>Simulate 835 Ingestion</span>
          </button>
          <button onClick={handleExportCsv} className="edi835-action-btn edi835-export-btn" title="Export Remittance Summary">
            <Download size={14} />
            <span>Export Summary CSV</span>
          </button>
        </div>
      </div>

      {/* 4 Executive KPI Cards */}
      <div className="edi835-kpi-banner-grid">
        <div className="edi835-kpi-card edi835-highlight-card">
          <div className="edi835-kpi-header">
            <span className="edi835-kpi-label">Total Remittance Deposited</span>
            <DollarSign size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="edi835-kpi-value-row">
            <span className="edi835-kpi-value">${kpis.totalRemittanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="edi835-kpi-footnote">Across {kpis.totalBatches} check/EFT batches</div>
        </div>

        <div className="edi835-kpi-card edi835-success-card">
          <div className="edi835-kpi-header">
            <span className="edi835-kpi-label">Auto-Post Match Rate</span>
            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          </div>
          <div className="edi835-kpi-value-row">
            <span className="edi835-kpi-value" style={{ color: '#34d399' }}>{kpis.autoPostMatchRatePct}%</span>
          </div>
          <div className="edi835-kpi-footnote">Exact Patient Control # reassociation</div>
        </div>

        <div className="edi835-kpi-card edi835-highlight-card">
          <div className="edi835-kpi-header">
            <span className="edi835-kpi-label">Adjudicated Claims</span>
            <FileCheck2 size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="edi835-kpi-value-row">
            <span className="edi835-kpi-value" style={{ color: '#38bdf8' }}>{kpis.totalClaimsAdjudicated}</span>
          </div>
          <div className="edi835-kpi-footnote">CLP Claim-level payments processed</div>
        </div>

        <div className="edi835-kpi-card edi835-warning-card">
          <div className="edi835-kpi-header">
            <span className="edi835-kpi-label">Open Remittance Exceptions</span>
            <AlertTriangle size={16} style={{ color: '#fbbf24' }} />
          </div>
          <div className="edi835-kpi-value-row">
            <span className="edi835-kpi-value" style={{ color: '#fbbf24' }}>{kpis.openExceptionsCount}</span>
          </div>
          <div className="edi835-kpi-footnote">${kpis.unappliedAtRiskAmount.toLocaleString()} unapplied cash</div>
        </div>
      </div>

      {/* Tab Navigation Strip */}
      <div className="edi835-tabs-bar">
        <div className="edi835-tab-navigation">
          <button
            className={`edi835-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
            onClick={() => { setActiveTab('batches'); setStatusFilter('ALL'); }}
          >
            <Layers size={15} />
            <span>Remittance Batches & Checks ({batches.length})</span>
          </button>
          <button
            className={`edi835-tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
            onClick={() => { setActiveTab('claims'); setStatusFilter('ALL'); }}
          >
            <Receipt size={15} />
            <span>Claim Payments & Adjudication ({claimPayments.length})</span>
          </button>
          <button
            className={`edi835-tab-btn ${activeTab === 'lines' ? 'active' : ''}`}
            onClick={() => { setActiveTab('lines'); setStatusFilter('ALL'); }}
          >
            <FileCode size={15} />
            <span>Line-Level Remittance & CARC Splits ({allLines.length})</span>
          </button>
          <button
            className={`edi835-tab-btn ${activeTab === 'exceptions' ? 'active' : ''}`}
            onClick={() => { setActiveTab('exceptions'); setStatusFilter('ALL'); }}
          >
            <AlertCircle size={15} />
            <span>Remittance Exceptions ({exceptions.filter(e => e.resolutionStatus === 'OPEN').length})</span>
          </button>
        </div>
      </div>

      {/* Dedicated Filter & Search Toolbar */}
      <div className="edi835-toolbar">
        <div className="edi835-toolbar-left">
          <div className="edi835-search-box">
            <Search size={15} className="edi835-search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'batches'
                  ? 'Search by check/EFT #, batch, payer...'
                  : activeTab === 'claims'
                  ? 'Search by control #, patient, member ID...'
                  : activeTab === 'lines'
                  ? 'Search by CPT, rev code, CARC, patient...'
                  : 'Search exceptions by patient, trace #...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="edi835-search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="edi835-clear-btn" title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          {activeTab === 'batches' && (
            <div className="edi835-filter-group">
              <label className="edi835-filter-label">Method:</label>
              <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="edi835-select">
                <option value="ALL">All Methods</option>
                <option value="ACH">ACH Direct Deposit</option>
                <option value="CHK">Paper Check</option>
              </select>
            </div>
          )}

          <div className="edi835-filter-group">
            <label className="edi835-filter-label">Status:</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="edi835-select">
              <option value="ALL">All Statuses</option>
              {activeTab === 'batches' && Object.values(REMITTANCE_BATCH_STATUSES).map(s => (
                <option key={s} value={s}>{REMITTANCE_BATCH_CONFIG[s]?.label || s}</option>
              ))}
              {activeTab === 'claims' && Object.values(REMITTANCE_MATCH_STATUSES).map(s => (
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

          {(searchTerm || statusFilter !== 'ALL' || methodFilter !== 'ALL') && (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); setMethodFilter('ALL'); }}
              className="edi835-reset-btn"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="edi835-toolbar-right">
          <span className="edi835-results-badge">
            Showing <strong style={{ color: '#34d399' }}>{
              activeTab === 'batches' ? filteredBatches.length :
              activeTab === 'claims' ? filteredClaims.length :
              activeTab === 'lines' ? filteredLines.length :
              filteredExceptions.length
            }</strong> records
          </span>
        </div>
      </div>

      {/* TAB 1: REMITTANCE BATCHES */}
      {activeTab === 'batches' && (
        <div className="table-responsive">
          <table className="edi835-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Batch Number</th>
                <th style={{ width: '180px' }}>EFT / Check Trace #</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Method</th>
                <th style={{ width: '200px' }}>Payer & Submitter</th>
                <th style={{ width: '130px' }}>Payment Date</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Total Payment</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Claims</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Matched</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Batch Status</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No remittance batches match active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const cfg = REMITTANCE_BATCH_CONFIG[b.status] || {};
                  return (
                    <tr key={b.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{b.batchNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{new Date(b.ingestedAt).toLocaleString()}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{b.checkEftTraceNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>File: {b.fileName}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="edi835-badge edi835-badge-sky">{b.paymentMethodCode}</span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{b.payerName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Payer ID: {b.payerIdentifier || 'N/A'}</div>
                      </td>
                      <td>{b.paymentEffectiveDate}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                        ${b.totalPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{b.totalClaimsCount}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#34d399' }}>{b.matchedClaimsCount}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`edi835-badge ${
                          b.status === REMITTANCE_BATCH_STATUSES.BALANCED_POSTED ? 'edi835-badge-emerald' :
                          b.status === REMITTANCE_BATCH_STATUSES.BALANCED_EXCEPTIONS ? 'edi835-badge-amber' :
                          'edi835-badge-sky'
                        }`}>
                          {cfg.label || b.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => setSelectedBatch(b)} className="edi835-inspect-btn">
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

      {/* TAB 2: CLAIM PAYMENTS & ADJUDICATION */}
      {activeTab === 'claims' && (
        <div className="table-responsive">
          <table className="edi835-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>Patient Control #</th>
                <th style={{ width: '180px' }}>Patient & Member ID</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Claim Status</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Billed Charge</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Paid Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Contractual (CO)</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Patient (PR)</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Match Confidence</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No claim payments match the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredClaims.map(c => {
                  const statusCfg = CLAIM_STATUS_CODES[c.claimStatusCode] || {};
                  const isMatched = c.matchScore >= 90;
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{c.patientControlNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>ICN: {c.payerClaimControlNumber || 'N/A'}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#f8fafc' }}>{c.patientName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>ID: {c.subscriberMemberId}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="edi835-badge edi835-badge-sky">
                          {statusCfg.label || `Status ${c.claimStatusCode}`}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        ${c.totalClaimChargeAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                        ${c.totalClaimPaidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#fbbf24' }}>
                        ${c.contractualAdjustmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        ${c.patientResponsibilityAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`edi835-badge ${isMatched ? 'edi835-badge-emerald' : 'edi835-badge-rose'}`}>
                          {c.matchScore}% {isMatched ? 'Matched' : 'Unmatched'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => setSelectedClaim(c)} className="edi835-inspect-btn">
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

      {/* TAB 3: LINE-LEVEL REMITTANCE & CARC SPLITS */}
      {activeTab === 'lines' && (
        <div className="table-responsive">
          <table className="edi835-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Patient Control #</th>
                <th style={{ width: '170px' }}>Patient</th>
                <th style={{ width: '90px' }}>Rev Code</th>
                <th style={{ width: '130px' }}>CPT / Modifiers</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Line Charge</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Line Paid</th>
                <th style={{ width: '170px' }}>CARC Code & Description</th>
                <th style={{ width: '120px', textAlign: 'right' }}>CARC Amount</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Units</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    No itemized service line remittances found.
                  </td>
                </tr>
              ) : (
                filteredLines.map(l => {
                  const carcMeta = COMMON_CARC_CODES[l.carcCode] || {};
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>
                        {l.claimControlNumber}
                      </td>
                      <td>{l.patientName}</td>
                      <td><span className="edi835-badge edi835-badge-slate">{l.revenueCode || '0490'}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{l.cptCode}</span>
                        {l.modifiers && l.modifiers.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '4px' }}>
                            ({l.modifiers.join(',')})
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        ${l.lineChargeAmount.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                        ${l.linePaidAmount.toFixed(2)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fbbf24' }}>{l.carcCode}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{carcMeta.name || 'Contractual Adjustment'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#fbbf24' }}>
                        ${(l.carcAmount || 0).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center' }}>{l.unitsPaid}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: REMITTANCE EXCEPTIONS QUEUE */}
      {activeTab === 'exceptions' && (
        <div className="table-responsive">
          <table className="edi835-table">
            <thead>
              <tr>
                <th style={{ width: '160px' }}>EFT / Check Trace #</th>
                <th style={{ width: '160px' }}>Control # / Patient</th>
                <th style={{ width: '180px' }}>Payer</th>
                <th style={{ width: '170px' }}>Exception Type</th>
                <th style={{ width: '280px' }}>Reason / Error Details</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Unapplied Paid</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredExceptions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
                    Remittance exceptions queue is clear! All payments balanced and posted.
                  </td>
                </tr>
              ) : (
                filteredExceptions.map(exc => (
                  <tr key={exc.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>{exc.checkEftTraceNumber}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{exc.batchNumber}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{exc.patientControlNumber}</div>
                      <div style={{ fontSize: '12px', color: '#f8fafc' }}>{exc.patientName}</div>
                    </td>
                    <td>{exc.payerName}</td>
                    <td>
                      <span className={`edi835-badge ${exc.severity === 'FATAL' ? 'edi835-badge-rose' : 'edi835-badge-amber'}`}>
                        {exc.exceptionType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12.5px', color: '#cbd5e1' }}>{exc.errorMessage}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                      ${Number(exc.totalClaimPaidAmount || 0).toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`edi835-badge ${exc.resolutionStatus === 'OPEN' ? 'edi835-badge-rose' : 'edi835-badge-emerald'}`}>
                        {exc.resolutionStatus}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {exc.resolutionStatus === 'OPEN' ? (
                        <button onClick={() => setSelectedException(exc)} className="edi835-resolve-btn">
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

      {/* INSPECT MODAL: BATCH DETAILS */}
      {selectedBatch && (
        <div className="edi835-modal-overlay" onClick={() => setSelectedBatch(null)}>
          <div className="edi835-modal" onClick={e => e.stopPropagation()}>
            <div className="edi835-modal-header">
              <h3 className="edi835-modal-title">Remittance Check Envelope: {selectedBatch.checkEftTraceNumber}</h3>
              <button onClick={() => setSelectedBatch(null)} className="edi835-modal-close"><X size={18} /></button>
            </div>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', fontSize: '13px' }}>
                <div><strong>Batch:</strong> {selectedBatch.batchNumber}</div>
                <div><strong>File:</strong> {selectedBatch.fileName}</div>
                <div><strong>Payer:</strong> {selectedBatch.payerName}</div>
                <div><strong>Payee NPI:</strong> {selectedBatch.payeeNpi}</div>
                <div><strong>Method:</strong> {selectedBatch.paymentMethodCode}</div>
                <div><strong>Payment Amount:</strong> ${selectedBatch.totalPaymentAmount.toFixed(2)}</div>
                <div><strong>Effective Date:</strong> {selectedBatch.paymentEffectiveDate}</div>
                <div><strong>Status:</strong> {selectedBatch.status}</div>
              </div>
              <h4 style={{ margin: '18px 0 8px 0', fontSize: '13px', color: '#38bdf8' }}>Raw ANSI X12 835 Envelope Stream:</h4>
              <pre className="edi835-code-block">{selectedBatch.rawPayloadPreview}</pre>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT MODAL: CLAIM PAYMENT DETAILS */}
      {selectedClaim && (
        <div className="edi835-modal-overlay" onClick={() => setSelectedClaim(null)}>
          <div className="edi835-modal" onClick={e => e.stopPropagation()}>
            <div className="edi835-modal-header">
              <h3 className="edi835-modal-title">CLP Claim Adjudication Audit: {selectedClaim.patientControlNumber}</h3>
              <button onClick={() => setSelectedClaim(null)} className="edi835-modal-close"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div><strong>Patient:</strong> {selectedClaim.patientName} | <strong>Member ID:</strong> {selectedClaim.subscriberMemberId}</div>
              <div><strong>Payer ICN / Trace:</strong> {selectedClaim.payerClaimControlNumber || 'N/A'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: '#0b1120', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>TOTAL CHARGE</div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>${selectedClaim.totalClaimChargeAmount.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>PAID AMOUNT</div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#34d399' }}>${selectedClaim.totalClaimPaidAmount.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>CONTRACTUAL (CO)</div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#fbbf24' }}>${selectedClaim.contractualAdjustmentAmount.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>PATIENT SHARE (PR)</div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>${selectedClaim.patientResponsibilityAmount.toFixed(2)}</div>
                </div>
              </div>

              <h4 style={{ margin: '14px 0 6px 0', fontSize: '13px', color: '#38bdf8' }}>Service Line Adjustments:</h4>
              <div className="table-responsive">
                <table className="edi835-table">
                  <thead>
                    <tr>
                      <th>Rev Code</th>
                      <th>CPT</th>
                      <th style={{ textAlign: 'right' }}>Charge</th>
                      <th style={{ textAlign: 'right' }}>Paid</th>
                      <th>CARC Reason</th>
                      <th style={{ textAlign: 'right' }}>Adjustment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedClaim.lines || []).map((l, i) => (
                      <tr key={i}>
                        <td>{l.revenueCode}</td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>{l.cptCode}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${l.lineChargeAmount.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#34d399' }}>${l.linePaidAmount.toFixed(2)}</td>
                        <td>{l.carcCode}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#fbbf24' }}>${(l.carcAmount || 0).toFixed(2)}</td>
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
        <div className="edi835-modal-overlay" onClick={() => setSelectedException(null)}>
          <div className="edi835-modal" onClick={e => e.stopPropagation()}>
            <div className="edi835-modal-header">
              <h3 className="edi835-modal-title">Remittance Remediation: {selectedException.patientControlNumber}</h3>
              <button onClick={() => setSelectedException(null)} className="edi835-modal-close"><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div style={{ background: 'rgba(251, 113, 133, 0.1)', border: '1px solid rgba(251, 113, 133, 0.3)', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#fb7185', fontWeight: 600 }}>{selectedException.exceptionType}</div>
                <div style={{ color: '#cbd5e1', marginTop: '4px' }}>{selectedException.errorMessage}</div>
              </div>

              <div>
                <strong>Candidate Active Submitted Claim to Re-associate:</strong>
                <select id="target-claim-select" className="edi835-select" style={{ width: '100%', marginTop: '6px' }}>
                  {activeClaims.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.patientControlNumber} — {c.patientName} (${c.totalGrossCharge.toFixed(2)}) - DOS: {c.dateOfService}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={() => handleResolveException(selectedException.id, 'MANUAL_LINK_CLAIM')}
                  className="edi835-action-btn edi835-primary-btn"
                >
                  <Link size={14} />
                  <span>Confirm Reassociation & Post</span>
                </button>
                <button
                  onClick={() => handleResolveException(selectedException.id, 'POST_TO_UNAPPLIED_CASH')}
                  className="edi835-action-btn edi835-export-btn"
                >
                  <span>Post to Unapplied Cash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
