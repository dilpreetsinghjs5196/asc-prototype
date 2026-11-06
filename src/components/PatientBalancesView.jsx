import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  Clock,
  Search,
  Filter,
  Download,
  Plus,
  X,
  ArrowRight,
  ChevronRight,
  Percent,
  Calendar,
  ShieldAlert,
  DollarSign,
  CheckCircle2,
  Layers,
  FileText
} from 'lucide-react';
import patientBalancesService, {
  RESPONSIBILITY_TYPES,
  BALANCE_STATUSES,
  AGING_BUCKETS,
  calculateAgingDays,
  classifyAgingBucket,
  calculateCurrentBalance,
  calculatePromptPayDiscount,
  calculatePatientBalanceKpis,
  getBaselinePatientBalances
} from '../lib/patientBalancesService';
import './PatientBalancesView.css';

export default function PatientBalancesView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'aging' | 'plans' | 'collections'
  const [balancesList, setAppealsList] = useState(() => getBaselinePatientBalances());
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState('ALL');

  // Modal States
  const [paymentModalItem, setPaymentModalItem] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [discountModalItem, setDiscountModalItem] = useState(null);
  const [discountPct, setDiscountPct] = useState('15');

  const [planModalItem, setPlanModalItem] = useState(null);
  const [planTermsMonths, setPlanTermsMonths] = useState('6');

  // Processed balances with calculated aging days and current balances
  const processedBalances = useMemo(() => {
    return balancesList.map(item => {
      const currentBalance = calculateCurrentBalance(
        item.originalBalanceAmount,
        item.adjustmentsAmount,
        item.paidAmount
      );
      const agingDays = calculateAgingDays(item.statementDate);
      const agingBucket = classifyAgingBucket(agingDays);
      return {
        ...item,
        currentBalanceAmount: currentBalance,
        agingDays,
        agingBucket
      };
    });
  }, [balancesList]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return calculatePatientBalanceKpis(processedBalances);
  }, [processedBalances]);

  // Filtered Queue for Tab 1
  const filteredQueue = useMemo(() => {
    return processedBalances.filter(item => {
      const matchesType = typeFilter === 'ALL' || item.responsibilityType === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesBucket = selectedAgingBucket === 'ALL' || item.agingBucket.id === selectedAgingBucket;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        item.balanceControlNumber.toLowerCase().includes(q) ||
        item.claimNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.guarantorName.toLowerCase().includes(q);
      return matchesType && matchesStatus && matchesBucket && matchesSearch;
    });
  }, [processedBalances, typeFilter, statusFilter, selectedAgingBucket, searchQuery]);

  // Aging Grouped Balances
  const agingGrouped = useMemo(() => {
    const buckets = {
      CURRENT_0_30: { ...AGING_BUCKETS.CURRENT_0_30, count: 0, dollars: 0 },
      AGING_31_60: { ...AGING_BUCKETS.AGING_31_60, count: 0, dollars: 0 },
      AGING_61_90: { ...AGING_BUCKETS.AGING_61_90, count: 0, dollars: 0 },
      AGING_91_120: { ...AGING_BUCKETS.AGING_91_120, count: 0, dollars: 0 },
      AGING_120_PLUS: { ...AGING_BUCKETS.AGING_120_PLUS, count: 0, dollars: 0 }
    };

    processedBalances.forEach(item => {
      if (item.currentBalanceAmount > 0) {
        const bId = item.agingBucket.id;
        if (buckets[bId]) {
          buckets[bId].count++;
          buckets[bId].dollars += item.currentBalanceAmount;
        }
      }
    });

    return buckets;
  }, [processedBalances]);

  // Active Payment Plans
  const paymentPlansList = useMemo(() => {
    return processedBalances.filter(b => b.isPaymentPlan);
  }, [processedBalances]);

  // Delinquent & Collections Candidates
  const collectionsWorklist = useMemo(() => {
    return processedBalances.filter(b => 
      b.currentBalanceAmount > 0 && 
      (b.status === 'DELINQUENT_PRE_COLLECTIONS' || b.status === 'EXTERNAL_COLLECTIONS' || b.agingDays > 60)
    );
  }, [processedBalances]);

  // Record Payment Submit
  const handleRecordPaymentSubmit = (e) => {
    e.preventDefault();
    if (!paymentModalItem) return;

    const paymentVal = parseFloat(paymentAmount) || 0.00;
    if (paymentVal <= 0) return;

    setAppealsList(prev => prev.map(b => {
      if (b.id !== paymentModalItem.id) return b;
      const newPaid = b.paidAmount + paymentVal;
      const newCurrent = calculateCurrentBalance(b.originalBalanceAmount, b.adjustmentsAmount, newPaid);
      const newStatus = newCurrent === 0 ? 'PAID_IN_FULL' : 'PARTIALLY_PAID';

      return {
        ...b,
        paidAmount: Number(newPaid.toFixed(2)),
        status: newStatus,
        lastPaymentDate: new Date().toISOString().slice(0, 10),
        notes: `${b.notes ? b.notes + ' ' : ''}Payment of $${paymentVal.toFixed(2)} received via ${paymentMethod}.`
      };
    }));

    setPaymentModalItem(null);
  };

  // Apply Prompt Pay Discount Submit
  const handleApplyDiscountSubmit = (e) => {
    e.preventDefault();
    if (!discountModalItem) return;

    const pct = parseFloat(discountPct) || 15.0;
    const { discountAmount } = calculatePromptPayDiscount(discountModalItem.currentBalanceAmount, pct);

    setAppealsList(prev => prev.map(b => {
      if (b.id !== discountModalItem.id) return b;
      const newAdjustments = b.adjustmentsAmount + discountAmount;
      return {
        ...b,
        adjustmentsAmount: Number(newAdjustments.toFixed(2)),
        notes: `${b.notes ? b.notes + ' ' : ''}Prompt-pay discount of ${pct}% ($${discountAmount.toFixed(2)}) applied.`
      };
    }));

    setDiscountModalItem(null);
  };

  // Setup Payment Plan Submit
  const handleSetupPlanSubmit = (e) => {
    e.preventDefault();
    if (!planModalItem) return;

    const terms = parseInt(planTermsMonths) || 6;
    const monthlyAmt = Number((planModalItem.currentBalanceAmount / terms).toFixed(2));

    setAppealsList(prev => prev.map(b => {
      if (b.id !== planModalItem.id) return b;
      return {
        ...b,
        isPaymentPlan: true,
        paymentPlanTermsMonths: terms,
        paymentPlanMonthlyAmt: monthlyAmt,
        status: 'PAYMENT_PLAN_ACTIVE',
        notes: `${b.notes ? b.notes + ' ' : ''}Payment plan established: ${terms} months at $${monthlyAmt.toFixed(2)}/mo.`
      };
    }));

    setPlanModalItem(null);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Account #',
      'Claim #',
      'Patient Name',
      'MRN',
      'Guarantor',
      'Responsibility Type',
      'Original Amount',
      'Adjustments',
      'Paid Amount',
      'Current Balance',
      'Aging Days',
      'Aging Bucket',
      'Statement Count',
      'Status',
      'Payment Plan'
    ];
    const rows = processedBalances.map(b => [
      `"${b.balanceControlNumber}"`,
      `"${b.claimNumber}"`,
      `"${b.patientName}"`,
      `"${b.patientMrn}"`,
      `"${b.guarantorName}"`,
      `"${b.responsibilityType}"`,
      b.originalBalanceAmount.toFixed(2),
      b.adjustmentsAmount.toFixed(2),
      b.paidAmount.toFixed(2),
      b.currentBalanceAmount.toFixed(2),
      b.agingDays,
      `"${b.agingBucket.label}"`,
      b.statementCount,
      `"${b.status}"`,
      b.isPaymentPlan ? `Yes ($${b.paymentPlanMonthlyAmt}/mo)` : 'No'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ASC_Patient_Balances_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="patient-balances-container"
      style={{
        backgroundColor: '#0b1120',
        color: '#f8fafc',
        minHeight: 'calc(100vh - 70px)',
        borderRadius: '12px',
        padding: '16px 24px 40px 24px',
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        className="patient-balances-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="patient-balances-topbar-left">
          <div className="patient-balances-header-icon-badge">
            <UserCheck size={22} className="text-emerald" />
          </div>
          <div>
            <h1
              className="patient-balances-title"
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
              Patient Responsibility, Balances & Collections Engine
            </h1>
            <p
              className="patient-balances-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              Post-adjudication patient liability, GAAP 5-tier aging schedules, structured installment plans & collection workflows.
            </p>
          </div>
        </div>
        <div className="patient-balances-topbar-right">
          <button className="rcm-btn rcm-btn-secondary" onClick={() => setActiveTab('aging')}>
            <Clock size={14} />
            <span>5-Tier Aging Matrix</span>
          </button>
          <button className="rcm-btn rcm-btn-secondary" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export Balances CSV</span>
          </button>
        </div>
      </div>

      {/* 2. 4-KPI Executive Ribbon */}
      <div className="patient-balances-kpi-ribbon">
        <div className="patient-balances-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Outstanding Patient AR</span>
            <AlertTriangle size={16} className="text-rose" />
          </div>
          <div className="kpi-number text-rose">
            ${kpis.totalOutstandingDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">Active uncollected patient liability</div>
        </div>

        <div className="patient-balances-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Patient Cash Collected</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="kpi-number text-emerald">
            ${kpis.totalCollectedDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">{kpis.collectionYieldPct}% historical collection rate</div>
        </div>

        <div className="patient-balances-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Payment Plans</span>
            <CreditCard size={16} className="text-sky" />
          </div>
          <div className="kpi-number text-sky">
            {kpis.paymentPlanCount} Accounts
          </div>
          <div className="kpi-subtext">Recurring monthly installment schedules</div>
        </div>

        <div className="patient-balances-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Delinquent Collections Risk</span>
            <ShieldAlert size={16} className="text-amber" />
          </div>
          <div className="kpi-number text-amber">
            ${kpis.delinquentDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">{kpis.delinquentCount} accounts &gt;60 days past due</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="patient-balances-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`patient-balances-nav-tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Layers size={15} />
          <span>Patient Balances Queue ({filteredQueue.length})</span>
        </button>
        <button
          className={`patient-balances-nav-tab ${activeTab === 'aging' ? 'active' : ''}`}
          onClick={() => setActiveTab('aging')}
        >
          <Clock size={15} />
          <span>5-Tier Aging Matrix</span>
        </button>
        <button
          className={`patient-balances-nav-tab ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          <CreditCard size={15} />
          <span>Payment Plans Manager ({paymentPlansList.length})</span>
        </button>
        <button
          className={`patient-balances-nav-tab ${activeTab === 'collections' ? 'active' : ''}`}
          onClick={() => setActiveTab('collections')}
        >
          <ShieldAlert size={15} />
          <span>Collections & Write-Off Worklist ({collectionsWorklist.length})</span>
        </button>
      </div>

      {/* TAB 1: PATIENT BALANCES QUEUE */}
      {activeTab === 'queue' && (
        <div className="patient-balances-content-section">
          <div className="patient-balances-toolbar">
            <div className="filter-pills-row">
              <button
                className={`filter-pill ${typeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setTypeFilter('ALL')}
              >
                All Responsibilities
              </button>
              {Object.keys(RESPONSIBILITY_TYPES).map(tk => (
                <button
                  key={tk}
                  className={`filter-pill ${typeFilter === tk ? 'active' : ''}`}
                  onClick={() => setTypeFilter(tk)}
                >
                  {RESPONSIBILITY_TYPES[tk].label}
                </button>
              ))}
            </div>

            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search account #, claim, patient, guarantor..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button className="rcm-btn-secondary" style={{ padding: '2px 6px', background: 'none', border: 'none' }} onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="patient-balances-table">
              <thead>
                <tr>
                  <th style={{ width: '135px' }}>Account & Type</th>
                  <th style={{ width: '140px' }}>Patient & Guarantor</th>
                  <th style={{ width: '120px' }} className="text-right">Original Liability</th>
                  <th style={{ width: '110px' }} className="text-right">Discounts</th>
                  <th style={{ width: '110px' }} className="text-right">Paid to Date</th>
                  <th style={{ width: '125px' }} className="text-right">Outstanding Bal</th>
                  <th style={{ width: '115px' }} className="text-center">Aging & Stmt</th>
                  <th style={{ width: '120px' }} className="text-center">Status</th>
                  <th style={{ width: '125px' }} className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-cell">
                      <CheckCircle2 size={32} className="text-emerald mb-2" />
                      <div>No patient balances match the selected filter criteria.</div>
                      <span className="text-xs text-slate-400">All patient responsibilities settled or clear.</span>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map(item => (
                    <tr key={item.id} className="patient-balances-row">
                      <td style={{ width: '135px' }}>
                        <div className="font-semibold text-sky">{item.balanceControlNumber}</div>
                        <span className={`status-pill ${RESPONSIBILITY_TYPES[item.responsibilityType]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {RESPONSIBILITY_TYPES[item.responsibilityType]?.code || item.responsibilityType}
                        </span>
                      </td>
                      <td style={{ width: '140px' }}>
                        <div className="font-medium text-slate-200">{item.patientName}</div>
                        <div className="text-xs text-slate-400">Guarantor: {item.guarantorName}</div>
                        <div className="text-xs font-mono text-slate-500">{item.patientMrn}</div>
                      </td>
                      <td style={{ width: '120px' }} className="text-right font-mono font-bold text-slate-200">
                        ${item.originalBalanceAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '110px' }} className="text-right font-mono text-emerald">
                        {item.adjustmentsAmount > 0 ? `-$${item.adjustmentsAmount.toFixed(2)}` : '$0.00'}
                      </td>
                      <td style={{ width: '110px' }} className="text-right font-mono text-emerald font-semibold">
                        ${item.paidAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '125px' }} className="text-right">
                        <div className={`font-mono font-bold text-sm ${item.currentBalanceAmount === 0 ? 'text-emerald' : 'text-rose'}`}>
                          ${item.currentBalanceAmount.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ width: '115px' }} className="text-center">
                        <span className={`status-pill ${item.agingBucket.badgeClass}`}>
                          {item.agingDays}d ({item.agingBucket.id.replace('AGING_', '').replace('_', ' ')})
                        </span>
                        <div className="text-xs text-slate-500 mt-0.5">Stmt #{item.statementCount}</div>
                      </td>
                      <td style={{ width: '120px' }} className="text-center">
                        <span className={`status-pill ${BALANCE_STATUSES[item.status]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {BALANCE_STATUSES[item.status]?.label || item.status}
                        </span>
                      </td>
                      <td style={{ width: '125px' }} className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.currentBalanceAmount > 0 ? (
                            <>
                              <button
                                className="table-action-btn"
                                onClick={() => {
                                  setPaymentModalItem(item);
                                  setPaymentAmount(item.currentBalanceAmount.toString());
                                }}
                                title="Record patient payment"
                              >
                                <span>Pay</span>
                                <DollarSign size={11} />
                              </button>
                              <button
                                className="table-action-btn"
                                style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}
                                onClick={() => setDiscountModalItem(item)}
                                title="Offer prompt-pay discount"
                              >
                                <Percent size={11} />
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-emerald font-semibold flex items-center gap-1">
                              <CheckCircle2 size={12} /> Settled
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="patient-balances-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{filteredQueue.length}</strong> of <strong className="text-slate-200">{processedBalances.length}</strong> patient accounts
            </span>
            <span className="text-xs text-sky font-medium">
              ↓ Scroll table vertically or apply responsibility filters above
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: 5-TIER GAAP AGING MATRIX */}
      {activeTab === 'aging' && (
        <div className="patient-balances-content-section">
          <div className="aging-summary-grid">
            {Object.values(agingGrouped).map(b => (
              <div
                key={b.id}
                className={`aging-summary-card ${selectedAgingBucket === b.id ? 'active' : ''}`}
                onClick={() => setSelectedAgingBucket(prev => prev === b.id ? 'ALL' : b.id)}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-300">{b.label}</span>
                  <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${b.badgeClass}`}>
                    {b.count} accts
                  </span>
                </div>
                <div className="text-lg font-bold font-mono text-slate-100">
                  ${b.dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {selectedAgingBucket === b.id ? 'Filtered (click to clear)' : 'Click to filter'}
                </div>
              </div>
            ))}
          </div>

          <div className="table-responsive">
            <table className="patient-balances-table">
              <thead>
                <tr>
                  <th style={{ width: '135px' }}>Account #</th>
                  <th style={{ width: '140px' }}>Patient Name</th>
                  <th style={{ width: '130px' }}>Responsibility Type</th>
                  <th style={{ width: '130px' }}>Statement Date</th>
                  <th style={{ width: '110px' }} className="text-center">Aging Days</th>
                  <th style={{ width: '130px' }}>Aging Bucket</th>
                  <th style={{ width: '130px' }} className="text-right">Outstanding Bal</th>
                  <th style={{ width: '135px' }} className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map(item => (
                  <tr key={item.id} className="patient-balances-row">
                    <td style={{ width: '135px' }}>
                      <span className="font-semibold text-sky">{item.balanceControlNumber}</span>
                    </td>
                    <td style={{ width: '140px' }}>
                      <div className="font-medium text-slate-200">{item.patientName}</div>
                      <div className="text-xs font-mono text-slate-500">{item.patientMrn}</div>
                    </td>
                    <td style={{ width: '130px' }}>
                      <span className={`status-pill ${RESPONSIBILITY_TYPES[item.responsibilityType]?.badgeClass}`}>
                        {RESPONSIBILITY_TYPES[item.responsibilityType]?.label}
                      </span>
                    </td>
                    <td style={{ width: '130px' }}>
                      <span className="text-xs text-slate-300">{item.statementDate || 'Unbilled'}</span>
                    </td>
                    <td style={{ width: '110px' }} className="text-center font-mono font-bold">
                      {item.agingDays} days
                    </td>
                    <td style={{ width: '130px' }}>
                      <span className={`status-pill ${item.agingBucket.badgeClass}`}>
                        {item.agingBucket.label}
                      </span>
                    </td>
                    <td style={{ width: '130px' }} className="text-right font-mono font-bold text-rose">
                      ${item.currentBalanceAmount.toFixed(2)}
                    </td>
                    <td style={{ width: '135px' }} className="text-center">
                      <button
                        className="table-action-btn"
                        onClick={() => setPlanModalItem(item)}
                        title="Setup structured payment plan"
                      >
                        <CreditCard size={11} />
                        <span>Plan Setup</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENT PLANS MANAGER */}
      {activeTab === 'plans' && (
        <div className="patient-balances-content-section">
          <div className="patient-balances-toolbar">
            <div className="text-sm font-semibold text-slate-300">
              Active Patient Installment Payment Plans
            </div>
            <div className="text-xs text-slate-400">
              Structured recurring monthly terms with auto-debit monitoring
            </div>
          </div>

          <div className="table-responsive">
            <table className="patient-balances-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Account & Plan #</th>
                  <th style={{ width: '150px' }}>Patient / Guarantor</th>
                  <th style={{ width: '130px' }} className="text-right">Original Plan Total</th>
                  <th style={{ width: '120px' }} className="text-right">Monthly Installment</th>
                  <th style={{ width: '110px' }} className="text-center">Terms (Months)</th>
                  <th style={{ width: '120px' }} className="text-right">Paid to Date</th>
                  <th style={{ width: '130px' }} className="text-right">Remaining Balance</th>
                  <th style={{ width: '100px' }} className="text-center">Plan Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentPlansList.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-cell">
                      <CreditCard size={32} className="text-sky mb-2" />
                      <div>No active payment plans configured.</div>
                    </td>
                  </tr>
                ) : (
                  paymentPlansList.map(plan => (
                    <tr key={plan.id} className="patient-balances-row">
                      <td style={{ width: '140px' }}>
                        <div className="font-semibold text-sky">{plan.balanceControlNumber}</div>
                        <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
                          Auto-Debit Active
                        </span>
                      </td>
                      <td style={{ width: '150px' }}>
                        <div className="font-medium text-slate-200">{plan.patientName}</div>
                        <div className="text-xs text-slate-400">{plan.guarantorName}</div>
                      </td>
                      <td style={{ width: '130px' }} className="text-right font-mono font-bold text-slate-200">
                        ${plan.originalBalanceAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '120px' }} className="text-right font-mono font-bold text-emerald">
                        ${plan.paymentPlanMonthlyAmt.toFixed(2)}/mo
                      </td>
                      <td style={{ width: '110px' }} className="text-center font-mono">
                        {plan.paymentPlanTermsMonths} months
                      </td>
                      <td style={{ width: '120px' }} className="text-right font-mono text-emerald">
                        ${plan.paidAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '130px' }} className="text-right font-mono font-bold text-rose">
                        ${plan.currentBalanceAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '100px' }} className="text-center">
                        <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
                          COMPLIANT
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COLLECTIONS & WRITE-OFF WORKLIST */}
      {activeTab === 'collections' && (
        <div className="patient-balances-content-section">
          <div className="patient-balances-toolbar">
            <div className="text-sm font-semibold text-slate-300">
              Delinquent Accounts & Third-Party Collections Queue
            </div>
            <div className="text-xs text-slate-400">
              Accounts exceeding 60 days past due or queued for bad debt authorization
            </div>
          </div>

          <div className="table-responsive">
            <table className="patient-balances-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Account #</th>
                  <th style={{ width: '150px' }}>Patient Name</th>
                  <th style={{ width: '120px' }}>Aging Bucket</th>
                  <th style={{ width: '110px' }} className="text-center">Statements Sent</th>
                  <th style={{ width: '130px' }} className="text-right">Delinquent Amount</th>
                  <th style={{ width: '140px' }} className="text-center">Collection Status</th>
                  <th style={{ width: '150px' }}>Collection Notes</th>
                  <th style={{ width: '120px' }} className="text-center">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {collectionsWorklist.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-cell">
                      <CheckCircle2 size={32} className="text-emerald mb-2" />
                      <div>No accounts currently meet collection criteria.</div>
                    </td>
                  </tr>
                ) : (
                  collectionsWorklist.map(c => (
                    <tr key={c.id} className="patient-balances-row">
                      <td style={{ width: '140px' }}>
                        <div className="font-semibold text-sky">{c.balanceControlNumber}</div>
                        <div className="text-xs text-slate-500">{c.claimNumber}</div>
                      </td>
                      <td style={{ width: '150px' }}>
                        <div className="font-medium text-slate-200">{c.patientName}</div>
                        <div className="text-xs font-mono text-slate-500">{c.patientMrn}</div>
                      </td>
                      <td style={{ width: '120px' }}>
                        <span className={`status-pill ${c.agingBucket.badgeClass}`}>
                          {c.agingDays}d Past Due
                        </span>
                      </td>
                      <td style={{ width: '110px' }} className="text-center font-mono font-bold">
                        {c.statementCount} statements
                      </td>
                      <td style={{ width: '130px' }} className="text-right font-mono font-bold text-rose">
                        ${c.currentBalanceAmount.toFixed(2)}
                      </td>
                      <td style={{ width: '140px' }} className="text-center">
                        <span className={`status-pill ${BALANCE_STATUSES[c.status]?.badgeClass}`}>
                          {BALANCE_STATUSES[c.status]?.label || c.status}
                        </span>
                      </td>
                      <td style={{ width: '150px' }}>
                        <div className="text-xs text-slate-300 truncate" title={c.notes}>
                          {c.notes || 'No collection notes recorded.'}
                        </div>
                      </td>
                      <td style={{ width: '120px' }} className="text-center">
                        <button
                          className="table-action-btn"
                          style={{ background: 'rgba(244, 63, 94, 0.12)', borderColor: 'rgba(244, 63, 94, 0.3)', color: '#f43f5e' }}
                          onClick={() => {
                            setPaymentModalItem(c);
                            setPaymentAmount(c.currentBalanceAmount.toString());
                          }}
                        >
                          <span>Demand</span>
                          <ArrowRight size={11} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD PATIENT PAYMENT */}
      {paymentModalItem && (
        <div className="patient-balances-modal-overlay">
          <div className="patient-balances-modal-card">
            <div className="patient-balances-modal-header">
              <h3 className="patient-balances-modal-title">Record Patient Payment: {paymentModalItem.balanceControlNumber}</h3>
              <button className="rcm-btn-secondary" style={{ padding: '4px 6px', background: 'none', border: 'none' }} onClick={() => setPaymentModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRecordPaymentSubmit}>
              <div className="patient-balances-modal-body">
                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">
                    Patient: {paymentModalItem.patientName} | Outstanding: ${paymentModalItem.currentBalanceAmount.toFixed(2)}
                  </label>
                  <label className="patient-balances-form-label">Payment Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    max={paymentModalItem.currentBalanceAmount}
                    className="patient-balances-form-input"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                  />
                </div>

                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Payment Tender / Method</label>
                  <select
                    className="patient-balances-form-select"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                  >
                    <option value="CREDIT_CARD">Credit Card / Debit (Visa, MC, Amex)</option>
                    <option value="ACH_ELECTRONIC">Electronic Check / ACH</option>
                    <option value="CASH">Cash / In-Person Front Desk</option>
                    <option value="CHECK">Physical Bank Check</option>
                    <option value="HSA_FSA">HSA / FSA Healthcare Debit</option>
                  </select>
                </div>

                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Payment Receipt / Authorization Notes</label>
                  <textarea
                    rows={2}
                    className="patient-balances-form-textarea"
                    placeholder="Enter transaction authorization # or cashier receipt ID..."
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="patient-balances-modal-footer">
                <button type="button" className="rcm-btn rcm-btn-secondary" onClick={() => setPaymentModalItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="rcm-btn rcm-btn-primary">
                  Post Payment & Update Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PROMPT-PAY DISCOUNT */}
      {discountModalItem && (
        <div className="patient-balances-modal-overlay">
          <div className="patient-balances-modal-card">
            <div className="patient-balances-modal-header">
              <h3 className="patient-balances-modal-title">Apply Prompt-Pay Settlement Discount</h3>
              <button className="rcm-btn-secondary" style={{ padding: '4px 6px', background: 'none', border: 'none' }} onClick={() => setDiscountModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleApplyDiscountSubmit}>
              <div className="patient-balances-modal-body">
                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Account: {discountModalItem.balanceControlNumber} ({discountModalItem.patientName})</label>
                  <label className="patient-balances-form-label">Current Outstanding Balance: ${discountModalItem.currentBalanceAmount.toFixed(2)}</label>
                </div>

                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Select Discount Incentive (%)</label>
                  <select
                    className="patient-balances-form-select"
                    value={discountPct}
                    onChange={e => setDiscountPct(e.target.value)}
                  >
                    <option value="10">10% Early Settlement Discount</option>
                    <option value="15">15% Standard Prompt-Pay Discount</option>
                    <option value="20">20% High-Balance Settlement Incentive</option>
                  </select>
                </div>

                <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-slate-400">Discount Amount:</span>
                    <span className="text-emerald font-mono font-bold">
                      -${calculatePromptPayDiscount(discountModalItem.currentBalanceAmount, discountPct).discountAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">New Settled Amount to Pay:</span>
                    <span className="text-sky font-mono font-bold">
                      ${calculatePromptPayDiscount(discountModalItem.currentBalanceAmount, discountPct).settledAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="patient-balances-modal-footer">
                <button type="button" className="rcm-btn rcm-btn-secondary" onClick={() => setDiscountModalItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="rcm-btn rcm-btn-primary">
                  Apply Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PAYMENT PLAN SETUP */}
      {planModalItem && (
        <div className="patient-balances-modal-overlay">
          <div className="patient-balances-modal-card">
            <div className="patient-balances-modal-header">
              <h3 className="patient-balances-modal-title">Establish Installment Payment Plan</h3>
              <button className="rcm-btn-secondary" style={{ padding: '4px 6px', background: 'none', border: 'none' }} onClick={() => setPlanModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSetupPlanSubmit}>
              <div className="patient-balances-modal-body">
                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Patient: {planModalItem.patientName} | Balance: ${planModalItem.currentBalanceAmount.toFixed(2)}</label>
                </div>

                <div className="patient-balances-form-group">
                  <label className="patient-balances-form-label">Installment Term Schedule</label>
                  <select
                    className="patient-balances-form-select"
                    value={planTermsMonths}
                    onChange={e => setPlanTermsMonths(e.target.value)}
                  >
                    <option value="3">3 Months Term ($/month)</option>
                    <option value="6">6 Months Term ($/month)</option>
                    <option value="9">9 Months Term ($/month)</option>
                    <option value="12">12 Months Extended Term ($/month)</option>
                  </select>
                </div>

                <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px' }}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Monthly Installment Amount:</span>
                    <span className="text-emerald font-mono font-bold text-sm">
                      ${(planModalItem.currentBalanceAmount / (parseInt(planTermsMonths) || 6)).toFixed(2)} / month
                    </span>
                  </div>
                </div>
              </div>

              <div className="patient-balances-modal-footer">
                <button type="button" className="rcm-btn rcm-btn-secondary" onClick={() => setPlanModalItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="rcm-btn rcm-btn-primary">
                  Activate Payment Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

