import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  DollarSign,
  Download,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Eye,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Clock,
  Layers,
  FileText
} from 'lucide-react';
import paymentAdjustmentService, {
  TRANSACTION_TYPES,
  BATCH_STATUSES,
  BATCH_STATUS_CONFIG,
  REFUND_STATUSES,
  REFUND_APPROVAL_THRESHOLD_CFO,
  calculatePostingBalances,
  validateBatchBalancing,
  validateRefundApproval,
  calculatePaymentKpis
} from '../lib/paymentAdjustmentService';
import './PaymentAdjustmentView.css';

export default function PaymentAdjustmentView() {
  const initialData = useMemo(() => paymentAdjustmentService.getBaselineSampleData(), []);

  const [batches, setBatches] = useState(initialData.batches);
  const [transactions, setTransactions] = useState(initialData.transactions);
  const [refunds, setRefunds] = useState(initialData.refunds);

  // Active Tab: 'ledger' | 'batches' | 'refunds' | 'unapplied'
  const [activeTab, setActiveTab] = useState('ledger');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals state
  const [inspectItem, setInspectItem] = useState(null); // { type: 'transaction' | 'batch' | 'refund', data }
  const [showPostModal, setShowPostModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedRefundForApproval, setSelectedRefundForApproval] = useState(null);

  // Post Payment Form State
  const [postForm, setPostForm] = useState({
    batchId: 'batch-rcm-001',
    claimControlNumber: 'CLM-2026-0891',
    patientMrn: 'MRN-88492',
    patientName: 'Eleanor Vance',
    payerName: 'Medicare Part B (Florida First Coast)',
    transactionType: 'PAYER_PAYMENT',
    paymentMethod: 'EFT',
    referenceNumber: '',
    amount: '',
    carcCode: '',
    notes: ''
  });

  // Refund Form State
  const [refundForm, setRefundForm] = useState({
    claimControlNumber: 'CLM-2026-0891',
    type: 'PATIENT_REFUND',
    amount: '',
    reasonCode: 'OVERPAYMENT',
    disbursementReference: '',
    notes: ''
  });

  // KPIs
  const kpis = useMemo(() => {
    return calculatePaymentKpis(batches, transactions, refunds);
  }, [batches, transactions, refunds]);

  // Filtered Transactions for Ledger Tab
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesType = typeFilter === 'ALL' || tx.transactionType === typeFilter;
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term ||
        tx.id.toLowerCase().includes(term) ||
        tx.claimControlNumber.toLowerCase().includes(term) ||
        tx.referenceNumber.toLowerCase().includes(term) ||
        tx.patientName.toLowerCase().includes(term) ||
        tx.patientMrn.toLowerCase().includes(term) ||
        (tx.payerName && tx.payerName.toLowerCase().includes(term)) ||
        (tx.carcCode && tx.carcCode.toLowerCase().includes(term));
      return matchesType && matchesSearch;
    });
  }, [transactions, typeFilter, searchTerm]);

  // Filtered Batches for Batches Tab
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const term = searchTerm.toLowerCase().trim();
      return !term ||
        b.batchNumber.toLowerCase().includes(term) ||
        b.bankAccount.toLowerCase().includes(term) ||
        b.batchType.toLowerCase().includes(term) ||
        b.status.toLowerCase().includes(term);
    });
  }, [batches, searchTerm]);

  // Filtered Refunds
  const filteredRefunds = useMemo(() => {
    return refunds.filter(r => {
      const term = searchTerm.toLowerCase().trim();
      return !term ||
        r.id.toLowerCase().includes(term) ||
        r.claimControlNumber.toLowerCase().includes(term) ||
        r.disbursementReference.toLowerCase().includes(term) ||
        r.reasonCode.toLowerCase().includes(term) ||
        r.approvalStatus.toLowerCase().includes(term);
    });
  }, [refunds, searchTerm]);

  // Batches with Unapplied Cash for Suspense Tab
  const unappliedBatches = useMemo(() => {
    return batches.filter(b => Number(b.unappliedAmount) > 0);
  }, [batches]);

  // CSV Export Handler
  const handleExportCsv = () => {
    const headers = [
      'Transaction ID',
      'Batch ID',
      'Claim Control Number',
      'Transaction Type',
      'Payment Method',
      'Reference / Check #',
      'Amount ($)',
      'CARC Code',
      'Patient MRN',
      'Patient Name',
      'Payer Name',
      'Transaction Date',
      'Posted By'
    ];

    const rows = transactions.map(tx => [
      `"${tx.id}"`,
      `"${tx.batchId}"`,
      `"${tx.claimControlNumber}"`,
      `"${tx.transactionType}"`,
      `"${tx.paymentMethod}"`,
      `"${tx.referenceNumber}"`,
      Number(tx.amount || 0).toFixed(2),
      `"${tx.carcCode || ''}"`,
      `"${tx.patientMrn}"`,
      `"${tx.patientName}"`,
      `"${tx.payerName || ''}"`,
      `"${tx.transactionDate}"`,
      `"${tx.postedBy}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rcm_cash_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit Post Payment Handler
  const handlePostPaymentSubmit = (e) => {
    e.preventDefault();
    if (!postForm.amount || Number(postForm.amount) <= 0) {
      alert('Please enter a valid posting amount.');
      return;
    }

    const newTx = {
      id: `tx-rcm-${Date.now().toString().slice(-4)}`,
      batchId: postForm.batchId,
      facilityId: 'fac-naples-01',
      claimId: `claim-custom-${Date.now().toString().slice(-4)}`,
      claimControlNumber: postForm.claimControlNumber,
      transactionType: postForm.transactionType,
      paymentMethod: postForm.paymentMethod,
      referenceNumber: postForm.referenceNumber || `REF-${Math.floor(1000 + Math.random() * 9000)}`,
      amount: parseFloat(postForm.amount),
      carcCode: postForm.carcCode || null,
      patientMrn: postForm.patientMrn,
      patientName: postForm.patientName,
      payerName: postForm.payerName,
      transactionDate: new Date().toISOString().slice(0, 10),
      postedBy: 'authorized-cfo-user'
    };

    setTransactions(prev => [newTx, ...prev]);

    // Update batch posted & unapplied amounts if applicable
    setBatches(prev => prev.map(b => {
      if (b.id === postForm.batchId) {
        const newPosted = Number(b.postedAmount) + Number(postForm.amount);
        const newUnapplied = Math.max(0, Number(b.batchAmount) - newPosted);
        const newStatus = Math.abs(Number(b.batchAmount) - newPosted) < 0.01 ? BATCH_STATUSES.BALANCED_POSTED : b.status;
        return {
          ...b,
          postedAmount: newPosted,
          unappliedAmount: newUnapplied,
          status: newStatus
        };
      }
      return b;
    }));

    setShowPostModal(false);
    setPostForm({
      batchId: 'batch-rcm-001',
      claimControlNumber: 'CLM-2026-0891',
      patientMrn: 'MRN-88492',
      patientName: 'Eleanor Vance',
      payerName: 'Medicare Part B (Florida First Coast)',
      transactionType: 'PAYER_PAYMENT',
      paymentMethod: 'EFT',
      referenceNumber: '',
      amount: '',
      carcCode: '',
      notes: ''
    });
  };

  // Submit Refund Request
  const handleRefundSubmit = (e) => {
    e.preventDefault();
    if (!refundForm.amount || Number(refundForm.amount) <= 0) {
      alert('Please enter a valid refund amount.');
      return;
    }

    const amt = parseFloat(refundForm.amount);
    const newRefund = {
      id: `ref-rcm-${Date.now().toString().slice(-4)}`,
      facilityId: 'fac-naples-01',
      claimId: `claim-refund-${Date.now().toString().slice(-4)}`,
      claimControlNumber: refundForm.claimControlNumber,
      originalTransactionId: 'tx-rcm-101',
      type: refundForm.type,
      amount: amt,
      reasonCode: refundForm.reasonCode,
      disbursementReference: refundForm.disbursementReference || `DISB-${Math.floor(1000 + Math.random() * 9000)}`,
      approvalStatus: REFUND_STATUSES.PENDING_APPROVAL,
      requestedBy: 'user-biller-01',
      approvedBy: null,
      approvedAt: null,
      notes: refundForm.notes || 'Routine overpayment adjustment request'
    };

    setRefunds(prev => [newRefund, ...prev]);
    setShowRefundModal(false);
    setRefundForm({
      claimControlNumber: 'CLM-2026-0891',
      type: 'PATIENT_REFUND',
      amount: '',
      reasonCode: 'OVERPAYMENT',
      disbursementReference: '',
      notes: ''
    });
  };

  // Approve Refund Handler with Separation of Duties
  const handleApproveRefund = (refund) => {
    const approver = {
      id: 'user-cfo-99',
      role: 'cfo' // CFO role allows approval of any amount
    };

    const validation = validateRefundApproval(refund, approver);
    if (!validation.isValid) {
      alert(`Approval Denied: ${validation.error}`);
      return;
    }

    setRefunds(prev => prev.map(r => {
      if (r.id === refund.id) {
        return {
          ...r,
          approvalStatus: REFUND_STATUSES.APPROVED,
          approvedBy: approver.id,
          approvedAt: new Date().toISOString()
        };
      }
      return r;
    }));

    setSelectedRefundForApproval(null);
  };

  return (
    <div className="rcm-payments-container">
      {/* Top Header Toolbar */}
      <div className="rcm-payments-topbar">
        <div className="rcm-payments-topbar-left">
          <div className="rcm-payments-header-icon-badge">
            <CreditCard size={22} />
          </div>
          <div>
            <h1 className="rcm-payments-title">Payments, Contractual Adjustments & Cash Posting</h1>
            <p className="rcm-payments-subtitle">
              Double-Entry Cash Ledger, Batch Balancing, Refund Separation of Duties & Suspense Management
            </p>
          </div>
        </div>
        <div className="rcm-payments-topbar-right">
          <button
            type="button"
            className="rcm-payments-btn rcm-payments-btn-primary"
            onClick={() => setShowPostModal(true)}
          >
            <PlusCircle size={15} />
            <span>Post Payment / Adj</span>
          </button>
          <button
            type="button"
            className="rcm-payments-btn"
            onClick={() => setShowRefundModal(true)}
          >
            <RotateCcw size={15} />
            <span>Request Refund</span>
          </button>
          <button
            type="button"
            className="rcm-payments-btn"
            onClick={handleExportCsv}
            title="Download CSV"
          >
            <Download size={15} />
            <span>Export Cash Ledger CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Banner Grid (4 Cards) */}
      <div className="rcm-payments-kpi-grid">
        <div className="rcm-payments-kpi-card rcm-payments-kpi-emerald">
          <div className="rcm-payments-kpi-header">
            <span className="rcm-payments-kpi-label">Total Cash Collected</span>
            <DollarSign size={16} className="text-emerald-400" />
          </div>
          <div className="rcm-payments-kpi-value text-emerald-400">
            ${kpis.totalCashCollected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="rcm-payments-kpi-sub">
            Payer: ${kpis.totalPayerPaid.toLocaleString()} • Patient: ${kpis.totalPatientPaid.toLocaleString()}
          </div>
        </div>

        <div className="rcm-payments-kpi-card rcm-payments-kpi-amber">
          <div className="rcm-payments-kpi-header">
            <span className="rcm-payments-kpi-label">Contractual Write-Offs</span>
            <Layers size={16} className="text-amber-400" />
          </div>
          <div className="rcm-payments-kpi-value text-amber-400">
            ${kpis.totalContractualAdjustments.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="rcm-payments-kpi-sub">
            Admin/Bad Debt: ${kpis.totalAdminWriteOffs.toLocaleString()}
          </div>
        </div>

        <div className="rcm-payments-kpi-card rcm-payments-kpi-sky">
          <div className="rcm-payments-kpi-header">
            <span className="rcm-payments-kpi-label">Active Unapplied Cash</span>
            <Clock size={16} className="text-sky-400" />
          </div>
          <div className="rcm-payments-kpi-value text-sky-400">
            ${kpis.totalUnappliedCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="rcm-payments-kpi-sub">
            {unappliedBatches.length} deposit batches requiring claim allocation
          </div>
        </div>

        <div className="rcm-payments-kpi-card rcm-payments-kpi-rose">
          <div className="rcm-payments-kpi-header">
            <span className="rcm-payments-kpi-label">Refunds & Recoupments</span>
            <RotateCcw size={16} className="text-rose-400" />
          </div>
          <div className="rcm-payments-kpi-value text-rose-400">
            ${kpis.totalRefundsRecoupments.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="rcm-payments-kpi-sub">
            {kpis.pendingRefundsCount} pending CFO authorization
          </div>
        </div>
      </div>

      {/* 4 Tabs Bar */}
      <div className="rcm-payments-tabs-bar">
        <div className="rcm-payments-nav-tabs">
          <button
            type="button"
            className={`rcm-payments-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            <FileText size={15} />
            <span>Cash Posting Ledger ({transactions.length})</span>
          </button>
          <button
            type="button"
            className={`rcm-payments-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
            onClick={() => setActiveTab('batches')}
          >
            <CreditCard size={15} />
            <span>Deposit Batches ({batches.length})</span>
          </button>
          <button
            type="button"
            className={`rcm-payments-tab-btn ${activeTab === 'refunds' ? 'active' : ''}`}
            onClick={() => setActiveTab('refunds')}
          >
            <RotateCcw size={15} />
            <span>Refunds & Recoupments ({refunds.length})</span>
          </button>
          <button
            type="button"
            className={`rcm-payments-tab-btn ${activeTab === 'unapplied' ? 'active' : ''}`}
            onClick={() => setActiveTab('unapplied')}
          >
            <Clock size={15} />
            <span>Unapplied Cash Suspense ({unappliedBatches.length})</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="rcm-payments-toolbar">
        <div className="rcm-payments-toolbar-left">
          <div className="rcm-payments-search-box">
            <Search size={15} className="rcm-payments-search-icon" />
            <input
              type="text"
              placeholder={
                activeTab === 'ledger'
                  ? 'Search by Tx ID, Claim #, Patient, Check #, CARC...'
                  : activeTab === 'batches'
                  ? 'Search by Batch #, Bank Account, Type...'
                  : 'Search by ID, Claim #, Ref #, Status...'
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="rcm-payments-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="rcm-payments-clear-btn"
                title="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {activeTab === 'ledger' && (
            <div className="rcm-payments-select-filter">
              <span className="rcm-payments-filter-label">Type:</span>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rcm-payments-select"
              >
                <option value="ALL">All Transaction Types</option>
                {Object.values(TRANSACTION_TYPES).map(t => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: CASH POSTING LEDGER */}
      {activeTab === 'ledger' && (
        <div className="rcm-payments-table-container">
          <table className="rcm-payments-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Tx ID & Date</th>
                <th style={{ width: '150px' }}>Claim Control #</th>
                <th style={{ width: '180px' }}>Patient & MRN</th>
                <th style={{ width: '170px' }}>Transaction Type</th>
                <th style={{ width: '140px' }}>Payment Method</th>
                <th style={{ width: '140px' }}>Reference #</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Amount ($)</th>
                <th style={{ width: '100px', textAlign: 'center' }}>CARC</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    No transactions match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => {
                  const typeCfg = TRANSACTION_TYPES[tx.transactionType] || { label: tx.transactionType, badgeClass: 'badge-slate' };
                  return (
                    <tr key={tx.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>{tx.id}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{tx.transactionDate}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{tx.claimControlNumber}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Batch: {tx.batchId}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#f1f5f9' }}>{tx.patientName}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{tx.patientMrn}</div>
                      </td>
                      <td>
                        <span className={`rcm-payments-badge ${typeCfg.badgeClass}`}>
                          {typeCfg.label}
                        </span>
                      </td>
                      <td style={{ color: '#cbd5e1', fontWeight: 500 }}>
                        {tx.paymentMethod}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>
                        {tx.referenceNumber}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        <span style={{ color: typeCfg.isCredit ? '#34d399' : '#fb7185' }}>
                          {typeCfg.isCredit ? '+' : '-'}${Number(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {tx.carcCode ? (
                          <span className="rcm-payments-badge badge-slate" style={{ fontFamily: 'monospace' }}>
                            {tx.carcCode}
                          </span>
                        ) : (
                          <span style={{ color: '#475569' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="rcm-table-btn"
                          onClick={() => setInspectItem({ type: 'transaction', data: tx })}
                          title="Inspect Details"
                        >
                          <Eye size={13} />
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

      {/* TAB 2: DEPOSIT BATCHES */}
      {activeTab === 'batches' && (
        <div className="rcm-payments-table-container">
          <table className="rcm-payments-table">
            <thead>
              <tr>
                <th style={{ width: '140px' }}>Batch #</th>
                <th style={{ width: '120px' }}>Deposit Date</th>
                <th style={{ width: '160px' }}>Bank Account</th>
                <th style={{ width: '140px' }}>Batch Type</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Batch Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Posted Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Unapplied</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    No deposit batches found.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const statusCfg = BATCH_STATUS_CONFIG[b.status] || { label: b.status, badgeClass: 'badge-slate' };
                  const variance = Math.abs(Number(b.batchAmount) - Number(b.postedAmount));
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>
                        {b.batchNumber}
                      </td>
                      <td style={{ color: '#94a3b8' }}>
                        {b.depositDate}
                      </td>
                      <td style={{ color: '#cbd5e1' }}>
                        {b.bankAccount}
                      </td>
                      <td>
                        <span className="rcm-payments-badge badge-slate">
                          {b.batchType}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#f8fafc' }}>
                        ${Number(b.batchAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                        ${Number(b.postedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>
                        <span style={{ color: Number(b.unappliedAmount) > 0 ? '#38bdf8' : '#64748b' }}>
                          ${Number(b.unappliedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`rcm-payments-badge ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="rcm-table-btn"
                          onClick={() => setInspectItem({ type: 'batch', data: b })}
                        >
                          <Eye size={13} />
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

      {/* TAB 3: REFUNDS & RECOUPMENTS */}
      {activeTab === 'refunds' && (
        <div className="rcm-payments-table-container">
          <table className="rcm-payments-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Refund ID</th>
                <th style={{ width: '150px' }}>Claim Control #</th>
                <th style={{ width: '150px' }}>Disbursement #</th>
                <th style={{ width: '140px' }}>Type</th>
                <th style={{ width: '140px' }}>Reason</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Amount ($)</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Approval Status</th>
                <th style={{ width: '150px' }}>Requested / Approved</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRefunds.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    No refund requests found.
                  </td>
                </tr>
              ) : (
                filteredRefunds.map(r => {
                  const isPending = r.approvalStatus === REFUND_STATUSES.PENDING_APPROVAL;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: '#fb7185', fontFamily: 'monospace' }}>
                        {r.id}
                      </td>
                      <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {r.claimControlNumber}
                      </td>
                      <td style={{ color: '#94a3b8', fontFamily: 'monospace' }}>
                        {r.disbursementReference}
                      </td>
                      <td>
                        <span className="rcm-payments-badge badge-rose">
                          {r.type}
                        </span>
                      </td>
                      <td style={{ color: '#cbd5e1' }}>
                        {r.reasonCode}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#fb7185' }}>
                        ${Number(r.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`rcm-payments-badge ${isPending ? 'badge-amber' : 'badge-emerald'}`}>
                          {r.approvalStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>By: {r.requestedBy}</div>
                        {r.approvedBy && (
                          <div style={{ fontSize: '11px', color: '#34d399' }}>Appr: {r.approvedBy}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isPending ? (
                          <button
                            type="button"
                            className="rcm-table-btn"
                            style={{ borderColor: '#f59e0b', color: '#fbbf24' }}
                            onClick={() => setSelectedRefundForApproval(r)}
                          >
                            <ShieldCheck size={13} />
                            <span>Approve</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rcm-table-btn"
                            onClick={() => setInspectItem({ type: 'refund', data: r })}
                          >
                            <Eye size={13} />
                            <span>Inspect</span>
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
      )}

      {/* TAB 4: UNAPPLIED CASH SUSPENSE */}
      {activeTab === 'unapplied' && (
        <div className="rcm-payments-table-container">
          <table className="rcm-payments-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Deposit Batch #</th>
                <th style={{ width: '130px' }}>Deposit Date</th>
                <th style={{ width: '180px' }}>Bank Account</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Batch Total</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Total Posted</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Unapplied Suspense</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Aging Status</th>
                <th style={{ width: '150px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {unappliedBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#34d399' }}>
                    <CheckCircle2 size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    All deposit batches are 100% balanced and fully posted! Zero suspense balance.
                  </td>
                </tr>
              ) : (
                unappliedBatches.map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>
                      {b.batchNumber}
                    </td>
                    <td style={{ color: '#94a3b8' }}>
                      {b.depositDate}
                    </td>
                    <td style={{ color: '#cbd5e1' }}>
                      {b.bankAccount}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#f8fafc' }}>
                      ${Number(b.batchAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#34d399' }}>
                      ${Number(b.postedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>
                      ${Number(b.unappliedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="rcm-payments-badge badge-amber">
                        Active Aging
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="rcm-payments-btn rcm-payments-btn-primary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => {
                          setPostForm(prev => ({ ...prev, batchId: b.id, amount: b.unappliedAmount }));
                          setShowPostModal(true);
                        }}
                      >
                        <PlusCircle size={12} />
                        <span>Allocate to Claim</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: POST PAYMENT / ADJUSTMENT */}
      {showPostModal && (
        <div className="rcm-payments-modal-overlay" onClick={() => setShowPostModal(false)}>
          <div className="rcm-payments-modal" onClick={e => e.stopPropagation()}>
            <div className="rcm-payments-modal-header">
              <h2 className="rcm-payments-modal-title">Record Payment or Fee Schedule Adjustment</h2>
              <button
                type="button"
                onClick={() => setShowPostModal(false)}
                className="rcm-payments-clear-btn"
                style={{ position: 'static' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handlePostPaymentSubmit}>
              <div className="rcm-payments-modal-body">
                <div className="rcm-alert-box rcm-alert-sky">
                  <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Audit-Controlled Posting</strong>: Authoritative double-entry transaction record will update the claim's outstanding AR balance in real-time.
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Deposit Batch</label>
                    <select
                      className="rcm-form-select"
                      value={postForm.batchId}
                      onChange={e => setPostForm(prev => ({ ...prev, batchId: e.target.value }))}
                      required
                    >
                      {batches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} (${Number(b.unappliedAmount).toFixed(2)} unapplied)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Transaction Type</label>
                    <select
                      className="rcm-form-select"
                      value={postForm.transactionType}
                      onChange={e => setPostForm(prev => ({ ...prev, transactionType: e.target.value }))}
                      required
                    >
                      {Object.values(TRANSACTION_TYPES).map(t => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Patient Control # (Claim ID)</label>
                    <input
                      type="text"
                      className="rcm-form-input"
                      value={postForm.claimControlNumber}
                      onChange={e => setPostForm(prev => ({ ...prev, claimControlNumber: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Posting Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="rcm-form-input"
                      placeholder="0.00"
                      value={postForm.amount}
                      onChange={e => setPostForm(prev => ({ ...prev, amount: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Payment Method</label>
                    <select
                      className="rcm-form-select"
                      value={postForm.paymentMethod}
                      onChange={e => setPostForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    >
                      <option value="EFT">EFT / Electronic Funds</option>
                      <option value="CHECK">Paper Check / Lockbox</option>
                      <option value="CREDIT_CARD">Credit / Debit Card</option>
                      <option value="OFFSET">Contractual Fee Schedule Offset</option>
                    </select>
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Reference / Check #</label>
                    <input
                      type="text"
                      className="rcm-form-input"
                      placeholder="e.g. EFT-99104 or CHK-4412"
                      value={postForm.referenceNumber}
                      onChange={e => setPostForm(prev => ({ ...prev, referenceNumber: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Patient Name & MRN</label>
                    <input
                      type="text"
                      className="rcm-form-input"
                      value={`${postForm.patientName} (${postForm.patientMrn})`}
                      onChange={e => setPostForm(prev => ({ ...prev, patientName: e.target.value }))}
                    />
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">CARC Code (Optional)</label>
                    <input
                      type="text"
                      className="rcm-form-input"
                      placeholder="e.g. CO-45 or PR-1"
                      value={postForm.carcCode}
                      onChange={e => setPostForm(prev => ({ ...prev, carcCode: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="rcm-payments-modal-footer">
                <button
                  type="button"
                  className="rcm-payments-btn"
                  onClick={() => setShowPostModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rcm-payments-btn rcm-payments-btn-primary"
                >
                  <PlusCircle size={15} />
                  <span>Confirm & Post Transaction</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST REFUND / RECOUPMENT */}
      {showRefundModal && (
        <div className="rcm-payments-modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="rcm-payments-modal" onClick={e => e.stopPropagation()}>
            <div className="rcm-payments-modal-header">
              <h2 className="rcm-payments-modal-title">Request Refund or Recoupment Disbursement</h2>
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="rcm-payments-clear-btn"
                style={{ position: 'static' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleRefundSubmit}>
              <div className="rcm-payments-modal-body">
                <div className="rcm-alert-box rcm-alert-amber">
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Separation of Duties</strong>: Refunds of <strong>${REFUND_APPROVAL_THRESHOLD_CFO.toFixed(2)}</strong> or more require designated CFO approval and cannot be authorized by the requester.
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Disbursement Type</label>
                    <select
                      className="rcm-form-select"
                      value={refundForm.type}
                      onChange={e => setRefundForm(prev => ({ ...prev, type: e.target.value }))}
                      required
                    >
                      <option value="PATIENT_REFUND">Patient Refund (Overpayment)</option>
                      <option value="PAYER_RECOUPMENT">Payer Recoupment (Audit Clawback)</option>
                    </select>
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Refund Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="rcm-form-input"
                      placeholder="0.00"
                      value={refundForm.amount}
                      onChange={e => setRefundForm(prev => ({ ...prev, amount: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="rcm-form-grid-2">
                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Claim Control Number</label>
                    <input
                      type="text"
                      className="rcm-form-input"
                      value={refundForm.claimControlNumber}
                      onChange={e => setRefundForm(prev => ({ ...prev, claimControlNumber: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="rcm-form-group">
                    <label className="rcm-form-label">Reason Code</label>
                    <select
                      className="rcm-form-select"
                      value={refundForm.reasonCode}
                      onChange={e => setRefundForm(prev => ({ ...prev, reasonCode: e.target.value }))}
                    >
                      <option value="OVERPAYMENT">Patient Overpayment</option>
                      <option value="MEDICARE_AUDIT">Medicare Post-Payment Audit</option>
                      <option value="COORDINATION_OF_BENEFITS">Coordination of Benefits (COB)</option>
                      <option value="DUPLICATE_PAYMENT">Duplicate Remittance Received</option>
                    </select>
                  </div>
                </div>

                <div className="rcm-form-group">
                  <label className="rcm-form-label">Disbursement Check / Reference #</label>
                  <input
                    type="text"
                    className="rcm-form-input"
                    placeholder="e.g. REF-CHK-9912 or OFFSET-202611"
                    value={refundForm.disbursementReference}
                    onChange={e => setRefundForm(prev => ({ ...prev, disbursementReference: e.target.value }))}
                  />
                </div>

                <div className="rcm-form-group">
                  <label className="rcm-form-label">Justification / Clinical Audit Notes</label>
                  <textarea
                    className="rcm-form-textarea"
                    rows={3}
                    placeholder="Document reason for overpayment return..."
                    value={refundForm.notes}
                    onChange={e => setRefundForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="rcm-payments-modal-footer">
                <button
                  type="button"
                  className="rcm-payments-btn"
                  onClick={() => setShowRefundModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rcm-payments-btn rcm-payments-btn-emerald"
                >
                  <PlusCircle size={15} />
                  <span>Submit for CFO Approval</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: APPROVE REFUND DIALOG */}
      {selectedRefundForApproval && (
        <div className="rcm-payments-modal-overlay" onClick={() => setSelectedRefundForApproval(null)}>
          <div className="rcm-payments-modal" onClick={e => e.stopPropagation()}>
            <div className="rcm-payments-modal-header">
              <h2 className="rcm-payments-modal-title">Authorize Refund Disbursement</h2>
              <button
                type="button"
                onClick={() => setSelectedRefundForApproval(null)}
                className="rcm-payments-clear-btn"
                style={{ position: 'static' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="rcm-payments-modal-body">
              <div className="rcm-alert-box rcm-alert-rose">
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Authorization Check</strong>: You are approving a disbursement of <strong>${Number(selectedRefundForApproval.amount).toFixed(2)}</strong> for claim <strong>{selectedRefundForApproval.claimControlNumber}</strong>.
                </div>
              </div>

              <div style={{ background: '#0b1120', padding: '12px', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>Refund ID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedRefundForApproval.id}</span></div>
                <div><strong>Type:</strong> {selectedRefundForApproval.type}</div>
                <div><strong>Reason:</strong> {selectedRefundForApproval.reasonCode}</div>
                <div><strong>Requested By:</strong> {selectedRefundForApproval.requestedBy}</div>
                <div><strong>Disbursement Ref:</strong> {selectedRefundForApproval.disbursementReference}</div>
                <div><strong>Audit Notes:</strong> {selectedRefundForApproval.notes}</div>
              </div>
            </div>

            <div className="rcm-payments-modal-footer">
              <button
                type="button"
                className="rcm-payments-btn"
                onClick={() => setSelectedRefundForApproval(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rcm-payments-btn rcm-payments-btn-emerald"
                onClick={() => handleApproveRefund(selectedRefundForApproval)}
              >
                <ShieldCheck size={15} />
                <span>Authorize & Disburse</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: INSPECT DETAILS */}
      {inspectItem && (
        <div className="rcm-payments-modal-overlay" onClick={() => setInspectItem(null)}>
          <div className="rcm-payments-modal" onClick={e => e.stopPropagation()}>
            <div className="rcm-payments-modal-header">
              <h2 className="rcm-payments-modal-title">
                Inspect {inspectItem.type.toUpperCase()} Record
              </h2>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="rcm-payments-clear-btn"
                style={{ position: 'static' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="rcm-payments-modal-body">
              <pre style={{
                background: '#0b1120',
                padding: '16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#38bdf8',
                overflowX: 'auto',
                margin: 0
              }}>
                {JSON.stringify(inspectItem.data, null, 2)}
              </pre>
            </div>
            <div className="rcm-payments-modal-footer">
              <button
                type="button"
                className="rcm-payments-btn"
                onClick={() => setInspectItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

