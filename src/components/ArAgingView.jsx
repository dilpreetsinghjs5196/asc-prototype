import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  Download,
  PhoneCall,
  FileText,
  Layers,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  Calendar,
  X,
  UserCheck
} from 'lucide-react';
import arAgingService, {
  AGING_BUCKETS,
  FINANCIAL_CLASSES,
  WORK_QUEUE_DEFINITIONS,
  TOUCH_ACTION_TYPES,
  calculateAgingDays,
  classifyAgingBucket,
  calculateWorkItemPriority,
  calculateDaysSalesOutstanding,
  calculateArKpis,
  getBaselineArClaims
} from '../lib/arAgingService';
import './ArAgingView.css';

export default function ArAgingView() {
  const [activeTab, setActiveTab] = useState('matrix'); // 'matrix' | 'queues' | 'payer_class' | 'touches'
  const [agingBasis, setAgingBasis] = useState('DOS'); // 'DOS' | 'BILL_DATE'
  const [claimsList, setClaimsList] = useState(() => getBaselineArClaims());
  const [searchQuery, setSearchQuery] = useState('');
  const [financialClassFilter, setFinancialClassFilter] = useState('ALL');
  const [selectedBucketFilter, setSelectedBucketFilter] = useState('ALL');
  const [selectedQueueFilter, setSelectedQueueFilter] = useState('ALL');

  // Touch Logging Modal State
  const [touchModalClaim, setTouchModalClaim] = useState(null);
  const [touchActionType, setTouchActionType] = useState('PAYER_CALL');
  const [touchContactPerson, setTouchContactPerson] = useState('');
  const [touchReferenceNumber, setTouchReferenceNumber] = useState('');
  const [touchPromisedAmount, setTouchPromisedAmount] = useState('');
  const [touchPromisedDate, setTouchPromisedDate] = useState('');
  const [touchFollowUpDate, setTouchFollowUpDate] = useState('');
  const [touchOutcomeNotes, setTouchOutcomeNotes] = useState('');

  // Collector Touch History State
  const [touchHistory, setTouchHistory] = useState([
    {
      id: 'tch-001',
      claimNumber: 'CLM-2026-0088',
      payerName: 'UnitedHealthcare Commercial',
      actionType: 'PAYER_CALL',
      actionBy: 'Collector Sarah Jenkins',
      contactPerson: 'Examiner Mark (ID: UHC-8819)',
      referenceNumber: 'REF-9920144',
      promisedAmount: 0.00,
      promisedDate: null,
      followUpDate: '2026-11-12',
      outcomeNotes: 'Rep confirmed medical review in progress for CPT 49505 unbundling check.',
      timestamp: '2026-10-19T14:20:00Z'
    },
    {
      id: 'tch-002',
      claimNumber: 'CLM-2026-0144',
      payerName: 'Aetna Open Choice PPO',
      actionType: 'APPEAL_PACKET_SENT',
      actionBy: 'Billing Lead David Rossi',
      contactPerson: 'Appeals Intake Dept',
      referenceNumber: 'CERT-MAIL-7020-1192',
      promisedAmount: 7200.00,
      promisedDate: '2026-11-28',
      followUpDate: '2026-11-20',
      outcomeNotes: 'Level 1 Appeal sent via certified mail with operative note & prior auth proof.',
      timestamp: '2026-10-15T11:45:00Z'
    },
    {
      id: 'tch-003',
      claimNumber: 'CLM-2026-0199',
      payerName: 'Travelers Workers Compensation',
      actionType: 'PAYER_CALL',
      actionBy: 'Collector Sarah Jenkins',
      contactPerson: 'Adjuster Karen Mills',
      referenceNumber: 'WC-CLM-55910',
      promisedAmount: 4100.00,
      promisedDate: '2026-11-15',
      followUpDate: '2026-11-16',
      outcomeNotes: 'New adjuster assigned; re-faxed first report of injury & surgical transcript.',
      timestamp: '2026-10-09T09:30:00Z'
    }
  ]);

  // Executive KPI Calculation
  const kpis = useMemo(() => {
    return calculateArKpis(claimsList, 15000.00, agingBasis);
  }, [claimsList, agingBasis]);

  // Filtered Claims for Aging Matrix
  const filteredMatrixClaims = useMemo(() => {
    return claimsList.filter(item => {
      const matchesSearch = searchQuery === '' ||
        item.claimNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.primaryPayerName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesClass = financialClassFilter === 'ALL' || item.financialClass === financialClassFilter;

      const days = agingBasis === 'BILL_DATE' ? item.agingDaysBill : item.agingDaysDos;
      const bucket = classifyAgingBucket(days);
      const matchesBucket = selectedBucketFilter === 'ALL' || bucket.id === selectedBucketFilter;

      return matchesSearch && matchesClass && matchesBucket;
    });
  }, [claimsList, searchQuery, financialClassFilter, selectedBucketFilter, agingBasis]);

  // Filtered Claims for Collector Work Queues
  const filteredQueueClaims = useMemo(() => {
    return claimsList
      .filter(item => {
        if (selectedQueueFilter === 'ALL') return true;
        if (selectedQueueFilter === 'HIGH_DOLLAR') return item.outstandingArBalance >= 5000.00;
        if (selectedQueueFilter === 'AGING_90_PLUS') {
          const days = agingBasis === 'BILL_DATE' ? item.agingDaysBill : item.agingDaysDos;
          return days >= 91;
        }
        if (selectedQueueFilter === 'COMMERCIAL_ESCALATION') {
          return item.financialClass === 'COMMERCIAL' && item.agingDaysDos >= 45;
        }
        if (selectedQueueFilter === 'DENIED_UNRESOLVED') return item.rcmStatus === 'DENIED';
        if (selectedQueueFilter === 'UNTOUCHED_14D') return item.daysUntouched >= 14;
        return true;
      })
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
  }, [claimsList, selectedQueueFilter, agingBasis]);

  // Handle Touch Logging Submission
  const handleTouchSubmit = (e) => {
    e.preventDefault();
    if (!touchModalClaim) return;

    const newTouch = {
      id: `tch-${Date.now()}`,
      claimNumber: touchModalClaim.claimNumber,
      payerName: touchModalClaim.primaryPayerName,
      actionType: touchActionType,
      actionBy: 'Current User',
      contactPerson: touchContactPerson || 'Payer Representative',
      referenceNumber: touchReferenceNumber || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      promisedAmount: parseFloat(touchPromisedAmount) || 0.00,
      promisedDate: touchPromisedDate || null,
      followUpDate: touchFollowUpDate || null,
      outcomeNotes: touchOutcomeNotes || 'Collector touch logged successfully.',
      timestamp: new Date().toISOString()
    };

    // Update touch history
    setTouchHistory(prev => [newTouch, ...prev]);

    // Update claim state (reset untouched days, bump touch count)
    setClaimsList(prev => prev.map(c => {
      if (c.id === touchModalClaim.id) {
        return {
          ...c,
          daysUntouched: 0,
          touchCount: (c.touchCount || 0) + 1,
          lastTouchDate: new Date().toISOString().split('T')[0],
          lastTouchAction: touchActionType,
          lastTouchNotes: touchOutcomeNotes
        };
      }
      return c;
    }));

    // Close modal & reset fields
    setTouchModalClaim(null);
    setTouchContactPerson('');
    setTouchReferenceNumber('');
    setTouchPromisedAmount('');
    setTouchPromisedDate('');
    setTouchFollowUpDate('');
    setTouchOutcomeNotes('');
  };

  return (
    <div
      className="ar-aging-container"
      style={{
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        minHeight: 'calc(100vh - 70px)',
        borderRadius: '12px',
        padding: '16px 24px 40px 24px',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Executive Topbar */}
      <div
        className="ar-aging-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="ar-aging-topbar-left">
          <div className="ar-aging-header-icon-badge">
            <TrendingUp size={22} className="text-sky" />
          </div>
          <div>
            <h1
              className="ar-aging-title"
              style={{
                color: '#ffffff',
                fontSize: '20px',
                fontWeight: 700,
                margin: '0 0 4px 0',
                display: 'block',
                visibility: 'visible',
                opacity: 1
              }}
            >
              Accounts Receivable (AR) Aging & Collector Work Queues
            </h1>
            <p
              className="ar-aging-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              GAAP aging distribution, dual DOS & Bill Date schedules, Days Sales Outstanding (DSO) & priority work queues
            </p>
          </div>
        </div>

        <div className="ar-aging-topbar-right">
          {/* Dual Aging Basis Toggle */}
          <div className="ar-basis-toggle">
            <button
              className={`ar-basis-btn ${agingBasis === 'DOS' ? 'active' : ''}`}
              onClick={() => setAgingBasis('DOS')}
            >
              Date of Service (DOS)
            </button>
            <button
              className={`ar-basis-btn ${agingBasis === 'BILL_DATE' ? 'active' : ''}`}
              onClick={() => setAgingBasis('BILL_DATE')}
            >
              Bill / Submission Date
            </button>
          </div>

          <button
            className="ar-btn ar-btn-secondary"
            onClick={() => alert(`Exporting AR Ledger (${agingBasis} Basis)...`)}
          >
            <Download size={14} />
            Export AR Ledger
          </button>
        </div>
      </div>

      {/* 2. Executive KPI Ribbon */}
      <div className="ar-kpi-ribbon">
        {/* Card 1: Total Outstanding AR */}
        <div className="ar-kpi-card">
          <div className="ar-kpi-card-header">
            <span className="ar-kpi-label">TOTAL OUTSTANDING AR</span>
            <DollarSign size={18} className="text-sky" />
          </div>
          <div className="ar-kpi-number text-sky">
            ${kpis.totalArBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="ar-kpi-subtext">
            <span>{kpis.totalClaimsCount} Active open claims in AR</span>
          </div>
        </div>

        {/* Card 2: % AR > 90 Days */}
        <div className="ar-kpi-card">
          <div className="ar-kpi-card-header">
            <span className="ar-kpi-label">% AR &gt; 90 DAYS (BENCHMARK)</span>
            <AlertTriangle size={18} className={kpis.benchmarkPassed ? 'text-emerald' : 'text-rose'} />
          </div>
          <div className={`ar-kpi-number ${kpis.benchmarkPassed ? 'text-emerald' : 'text-rose'}`}>
            {kpis.pctArOver90Days}%
          </div>
          <div className="ar-kpi-subtext">
            <span className={`ar-badge ${kpis.benchmarkPassed ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' : 'bg-rose-950/40 text-rose-400 border-rose-800'}`}>
              ASC Target: &lt; 15.0% {kpis.benchmarkPassed ? '✓ Passed' : '⚠ Exceeded'}
            </span>
          </div>
        </div>

        {/* Card 3: Days Sales Outstanding (DSO) */}
        <div className="ar-kpi-card">
          <div className="ar-kpi-card-header">
            <span className="ar-kpi-label">DAYS SALES OUTSTANDING (DSO)</span>
            <Clock size={18} className="text-sky" />
          </div>
          <div className="ar-kpi-number text-slate-200">
            {kpis.daysSalesOutstanding} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8' }}>Days</span>
          </div>
          <div className="ar-kpi-subtext">
            <span className="ar-badge bg-sky-950/40 text-sky-400 border-sky-800">
              ASC Normal: 30–42 Days
            </span>
          </div>
        </div>

        {/* Card 4: Actionable High Priority Queue */}
        <div className="ar-kpi-card">
          <div className="ar-kpi-card-header">
            <span className="ar-kpi-label">PRIORITY WORK QUEUE</span>
            <PhoneCall size={18} className="text-amber" />
          </div>
          <div className="ar-kpi-number text-amber">
            {claimsList.filter(c => c.priorityScore >= 70).length}
          </div>
          <div className="ar-kpi-subtext">
            <span>Urgent claims (Priority Score ≥ 70)</span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="ar-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`ar-nav-tab ${activeTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveTab('matrix')}
        >
          <Layers size={15} />
          AR Aging Matrix ({filteredMatrixClaims.length})
        </button>

        <button
          className={`ar-nav-tab ${activeTab === 'queues' ? 'active' : ''}`}
          onClick={() => setActiveTab('queues')}
        >
          <PhoneCall size={15} />
          Collector Work Queues ({filteredQueueClaims.length})
        </button>

        <button
          className={`ar-nav-tab ${activeTab === 'payer_class' ? 'active' : ''}`}
          onClick={() => setActiveTab('payer_class')}
        >
          <DollarSign size={15} />
          Payer Financial Class Rollup
        </button>

        <button
          className={`ar-nav-tab ${activeTab === 'touches' ? 'active' : ''}`}
          onClick={() => setActiveTab('touches')}
        >
          <FileText size={15} />
          Collector Touch History ({touchHistory.length})
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: AR AGING MATRIX                                         */}
      {/* ============================================================== */}
      {activeTab === 'matrix' && (
        <div>
          {/* Bucket Overview Cards */}
          <div className="ar-bucket-grid">
            {Object.values(AGING_BUCKETS).map(bucket => {
              const data = kpis.bucketBreakdown[bucket.id] || { count: 0, dollars: 0 };
              const isSelected = selectedBucketFilter === bucket.id;
              return (
                <div
                  key={bucket.id}
                  className={`ar-bucket-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedBucketFilter(prev => prev === bucket.id ? 'ALL' : bucket.id)}
                >
                  <div className="ar-bucket-title">{bucket.label}</div>
                  <div className={`ar-bucket-dollars text-${bucket.colorToken}`}>
                    ${data.dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="ar-bucket-meta">
                    <span>{data.count} Claims</span>
                    <span>{kpis.totalArBalance > 0 ? ((data.dollars / kpis.totalArBalance) * 100).toFixed(0) : 0}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filter Toolbar */}
          <div className="ar-filter-toolbar">
            <div className="flex items-center gap-3">
              <div className="ar-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search claim, patient, or payer..."
                  className="ar-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="ar-select"
                value={financialClassFilter}
                onChange={(e) => setFinancialClassFilter(e.target.value)}
              >
                <option value="ALL">All Financial Classes</option>
                {Object.values(FINANCIAL_CLASSES).map(fc => (
                  <option key={fc.id} value={fc.id}>{fc.label}</option>
                ))}
              </select>

              {selectedBucketFilter !== 'ALL' && (
                <button
                  className="ar-btn ar-btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                  onClick={() => setSelectedBucketFilter('ALL')}
                >
                  Reset Bucket Filter ({selectedBucketFilter}) ✕
                </button>
              )}
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-sky font-mono font-bold">{filteredMatrixClaims.length}</span> of {claimsList.length} claims
            </div>
          </div>

          {/* Claims Aging Table */}
          <div className="ar-table-responsive">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Claim & DOS</th>
                  <th>Patient & MRN</th>
                  <th>Payer & Class</th>
                  <th>Gross / Outstanding AR</th>
                  <th>Aging Schedule ({agingBasis})</th>
                  <th>Priority Score</th>
                  <th>Last Touch</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatrixClaims.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No open AR claims match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredMatrixClaims.map(claim => {
                    const days = agingBasis === 'BILL_DATE' ? claim.agingDaysBill : claim.agingDaysDos;
                    const bucket = classifyAgingBucket(days);
                    const priorityScore = claim.priorityScore || 50.0;

                    let priorityClass = 'priority-low';
                    if (priorityScore >= 75) priorityClass = 'priority-high';
                    else if (priorityScore >= 50) priorityClass = 'priority-medium';

                    return (
                      <tr key={claim.id}>
                        <td>
                          <div className="font-bold text-sky font-mono">{claim.claimNumber}</div>
                          <div className="text-xs text-slate-400">DOS: {claim.surgeryDate}</div>
                        </td>
                        <td>
                          <div className="font-semibold text-slate-200">{claim.patientName}</div>
                          <div className="text-xs font-mono text-slate-400">{claim.patientMrn}</div>
                        </td>
                        <td>
                          <div className="text-slate-200">{claim.primaryPayerName}</div>
                          <span className={`ar-badge ${FINANCIAL_CLASSES[claim.financialClass]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                            {FINANCIAL_CLASSES[claim.financialClass]?.label || claim.financialClass}
                          </span>
                        </td>
                        <td>
                          <div className="text-emerald font-mono font-bold">
                            ${claim.outstandingArBalance.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            Gross: ${claim.totalGrossCharge.toFixed(2)}
                          </div>
                        </td>
                        <td>
                          <div className="font-mono font-bold text-slate-200">
                            {days} Days
                          </div>
                          <span className={`ar-badge ${bucket.badgeClass}`}>
                            {bucket.label}
                          </span>
                        </td>
                        <td>
                          <span className={`priority-pill ${priorityClass}`}>
                            {priorityScore.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <div className="text-xs text-slate-300">
                            {claim.lastTouchAction ? TOUCH_ACTION_TYPES[claim.lastTouchAction]?.label || claim.lastTouchAction : 'No Touch'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {claim.lastTouchDate || 'Never'} ({claim.daysUntouched}d ago)
                          </div>
                        </td>
                        <td>
                          <button
                            className="ar-btn ar-btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => setTouchModalClaim(claim)}
                          >
                            <PhoneCall size={12} />
                            Log Touch
                          </button>
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

      {/* ============================================================== */}
      {/* TAB 2: COLLECTOR WORK QUEUES                                   */}
      {/* ============================================================== */}
      {activeTab === 'queues' && (
        <div>
          {/* Queue Filter Ribbon */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            <button
              className={`ar-btn ${selectedQueueFilter === 'ALL' ? 'ar-btn-primary' : 'ar-btn-secondary'}`}
              onClick={() => setSelectedQueueFilter('ALL')}
            >
              All Open Claims ({claimsList.length})
            </button>
            {Object.values(WORK_QUEUE_DEFINITIONS).map(q => (
              <button
                key={q.id}
                className={`ar-btn ${selectedQueueFilter === q.id ? 'ar-btn-primary' : 'ar-btn-secondary'}`}
                onClick={() => setSelectedQueueFilter(q.id)}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Work Queue Claims Table */}
          <div className="ar-table-responsive">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Claim & Procedure</th>
                  <th>Payer & Contact</th>
                  <th>Outstanding AR</th>
                  <th>Aging ({agingBasis})</th>
                  <th>Days Untouched</th>
                  <th>Last Outcome</th>
                  <th>Collector Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueueClaims.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No claims currently queued in this category.
                    </td>
                  </tr>
                ) : (
                  filteredQueueClaims.map(claim => {
                    const days = agingBasis === 'BILL_DATE' ? claim.agingDaysBill : claim.agingDaysDos;
                    const bucket = classifyAgingBucket(days);
                    const priorityScore = claim.priorityScore || 50.0;

                    let priorityClass = 'priority-low';
                    if (priorityScore >= 75) priorityClass = 'priority-high';
                    else if (priorityScore >= 50) priorityClass = 'priority-medium';

                    return (
                      <tr key={claim.id}>
                        <td>
                          <span className={`priority-pill ${priorityClass}`}>
                            {priorityScore.toFixed(1)}
                          </span>
                        </td>
                        <td>
                          <div className="font-bold text-sky font-mono">{claim.claimNumber}</div>
                          <div className="text-xs text-slate-300">{claim.procedureDescription}</div>
                          <div className="text-xs text-slate-500">{claim.surgeonName}</div>
                        </td>
                        <td>
                          <div className="font-semibold text-slate-200">{claim.primaryPayerName}</div>
                          <div className="text-xs text-slate-400">Patient: {claim.patientName}</div>
                        </td>
                        <td>
                          <div className="text-emerald font-mono font-bold text-sm">
                            ${claim.outstandingArBalance.toFixed(2)}
                          </div>
                          <span className="ar-badge bg-slate-800 text-slate-400">
                            {claim.rcmStatus}
                          </span>
                        </td>
                        <td>
                          <div className="font-mono font-bold text-slate-200">{days} Days</div>
                          <span className={`ar-badge ${bucket.badgeClass}`}>
                            {bucket.label}
                          </span>
                        </td>
                        <td>
                          <span className={`font-mono font-semibold ${claim.daysUntouched >= 14 ? 'text-rose' : 'text-slate-300'}`}>
                            {claim.daysUntouched} Days
                          </span>
                          <div className="text-xs text-slate-500">
                            Touches: {claim.touchCount || 0}
                          </div>
                        </td>
                        <td>
                          <div className="text-xs text-slate-300 max-w-xs truncate" title={claim.lastTouchNotes}>
                            {claim.lastTouchNotes || 'No notes logged yet.'}
                          </div>
                        </td>
                        <td>
                          <button
                            className="ar-btn ar-btn-emerald"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => setTouchModalClaim(claim)}
                          >
                            <PhoneCall size={13} />
                            Work Claim
                          </button>
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

      {/* ============================================================== */}
      {/* TAB 3: PAYER FINANCIAL CLASS ROLLUP                            */}
      {/* ============================================================== */}
      {activeTab === 'payer_class' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
            {Object.values(FINANCIAL_CLASSES).map(fc => {
              const data = kpis.financialClassBreakdown[fc.id] || { count: 0, dollars: 0 };
              const pct = kpis.totalArBalance > 0 ? ((data.dollars / kpis.totalArBalance) * 100).toFixed(1) : 0;
              return (
                <div key={fc.id} className="ar-kpi-card" style={{ padding: '14px' }}>
                  <div className="ar-kpi-label">{fc.label}</div>
                  <div className="ar-kpi-number text-sky mt-2">
                    ${data.dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                  <div className="ar-kpi-subtext mt-1">
                    <span>{data.count} Claims ({pct}% Share)</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Breakdown Matrix by Financial Class */}
          <div className="ar-table-responsive">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Financial Class</th>
                  <th>Total Claims</th>
                  <th>Total AR Balance</th>
                  <th>% Portfolio Share</th>
                  <th>0–30d</th>
                  <th>31–60d</th>
                  <th>61–90d</th>
                  <th>&gt;90d High Risk</th>
                  <th>Status Assessment</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(FINANCIAL_CLASSES).map(fc => {
                  const data = kpis.financialClassBreakdown[fc.id] || { count: 0, dollars: 0 };
                  const pct = kpis.totalArBalance > 0 ? ((data.dollars / kpis.totalArBalance) * 100).toFixed(1) : 0;

                  // Compute bucket subsets for this class
                  const classClaims = claimsList.filter(c => c.financialClass === fc.id);
                  const b0_30 = classClaims.filter(c => c.agingDaysDos <= 30).reduce((acc, c) => acc + c.outstandingArBalance, 0);
                  const b31_60 = classClaims.filter(c => c.agingDaysDos > 30 && c.agingDaysDos <= 60).reduce((acc, c) => acc + c.outstandingArBalance, 0);
                  const b61_90 = classClaims.filter(c => c.agingDaysDos > 60 && c.agingDaysDos <= 90).reduce((acc, c) => acc + c.outstandingArBalance, 0);
                  const bOver90 = classClaims.filter(c => c.agingDaysDos > 90).reduce((acc, c) => acc + c.outstandingArBalance, 0);

                  return (
                    <tr key={fc.id}>
                      <td>
                        <div className="font-semibold text-slate-200">{fc.label}</div>
                        <div className="text-xs text-slate-400">{fc.description}</div>
                      </td>
                      <td className="font-mono font-bold">{data.count}</td>
                      <td className="font-mono font-bold text-emerald">
                        ${data.dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="font-mono text-sky">{pct}%</td>
                      <td className="font-mono text-slate-300">${b0_30.toFixed(0)}</td>
                      <td className="font-mono text-slate-300">${b31_60.toFixed(0)}</td>
                      <td className="font-mono text-amber">${b61_90.toFixed(0)}</td>
                      <td className="font-mono text-rose font-bold">${bOver90.toFixed(0)}</td>
                      <td>
                        <span className={`ar-badge ${bOver90 > 0 ? 'bg-amber-950/40 text-amber-300 border-amber-800' : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'}`}>
                          {bOver90 > 0 ? 'Action Required' : 'Compliant'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: COLLECTOR TOUCH HISTORY                                 */}
      {/* ============================================================== */}
      {activeTab === 'touches' && (
        <div>
          <div className="ar-table-responsive">
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Claim & Payer</th>
                  <th>Action Type</th>
                  <th>Contact & Ref #</th>
                  <th>Promise to Pay</th>
                  <th>Next Follow-up</th>
                  <th>Resolution Notes</th>
                </tr>
              </thead>
              <tbody>
                {touchHistory.map(tch => (
                  <tr key={tch.id}>
                    <td className="text-xs font-mono text-slate-400">
                      {new Date(tch.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <div className="font-bold text-sky font-mono">{tch.claimNumber}</div>
                      <div className="text-xs text-slate-400">{tch.payerName}</div>
                    </td>
                    <td>
                      <span className="ar-badge bg-sky-950/40 text-sky-400 border-sky-800">
                        {TOUCH_ACTION_TYPES[tch.actionType]?.label || tch.actionType}
                      </span>
                      <div className="text-xs text-slate-500 mt-1">{tch.actionBy}</div>
                    </td>
                    <td>
                      <div className="text-slate-200 text-xs font-semibold">{tch.contactPerson}</div>
                      <div className="text-xs font-mono text-slate-400">{tch.referenceNumber}</div>
                    </td>
                    <td>
                      {tch.promisedAmount > 0 ? (
                        <div>
                          <div className="text-emerald font-mono font-bold text-xs">
                            ${tch.promisedAmount.toFixed(2)}
                          </div>
                          <div className="text-xs text-slate-400">Due: {tch.promisedDate || 'Pending'}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td>
                      {tch.followUpDate ? (
                        <span className="ar-badge bg-amber-950/40 text-amber-300 border-amber-800">
                          {tch.followUpDate}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-300 max-w-sm">
                      {tch.outcomeNotes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: LOG COLLECTOR TOUCH                                     */}
      {/* ============================================================== */}
      {touchModalClaim && (
        <div className="ar-modal-backdrop">
          <div className="ar-modal-card">
            <div className="ar-modal-header">
              <h2 className="ar-modal-title flex items-center gap-2">
                <PhoneCall size={18} className="text-sky" />
                Log Collector Touch: {touchModalClaim.claimNumber}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setTouchModalClaim(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTouchSubmit}>
              <div className="ar-modal-body">
                {/* Claim Summary Strip */}
                <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Payer:</span>
                    <span className="text-slate-200 font-semibold">{touchModalClaim.primaryPayerName}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Patient:</span>
                    <span className="text-slate-200">{touchModalClaim.patientName} ({touchModalClaim.patientMrn})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Outstanding AR:</span>
                    <span className="text-emerald font-mono font-bold">${touchModalClaim.outstandingArBalance.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <label className="ar-form-label">Action Performed</label>
                  <select
                    className="ar-form-select"
                    value={touchActionType}
                    onChange={(e) => setTouchActionType(e.target.value)}
                  >
                    {Object.values(TOUCH_ACTION_TYPES).map(act => (
                      <option key={act.id} value={act.id}>{act.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ar-form-label">Contact / Examiner Name</label>
                    <input
                      type="text"
                      className="ar-form-input"
                      placeholder="e.g. Examiner Jessica (Ext 401)"
                      value={touchContactPerson}
                      onChange={(e) => setTouchContactPerson(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="ar-form-label">Call Reference #</label>
                    <input
                      type="text"
                      className="ar-form-input"
                      placeholder="e.g. REF-881920"
                      value={touchReferenceNumber}
                      onChange={(e) => setTouchReferenceNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="ar-form-label">Promise to Pay Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="ar-form-input"
                      placeholder="0.00"
                      value={touchPromisedAmount}
                      onChange={(e) => setTouchPromisedAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="ar-form-label">Promise Date</label>
                    <input
                      type="date"
                      className="ar-form-input"
                      value={touchPromisedDate}
                      onChange={(e) => setTouchPromisedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="ar-form-label">Next Follow-Up Date</label>
                  <input
                    type="date"
                    className="ar-form-input"
                    value={touchFollowUpDate}
                    onChange={(e) => setTouchFollowUpDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="ar-form-label">Outcome Notes</label>
                  <textarea
                    rows={3}
                    className="ar-form-textarea"
                    placeholder="Enter detailed outcome from carrier contact or portal verification..."
                    value={touchOutcomeNotes}
                    onChange={(e) => setTouchOutcomeNotes(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="ar-modal-footer">
                <button
                  type="button"
                  className="ar-btn ar-btn-secondary"
                  onClick={() => setTouchModalClaim(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="ar-btn ar-btn-primary">
                  Save Activity Touch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

