import React, { useState, useMemo } from 'react';
import {
  Scale,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Filter,
  Download,
  Plus,
  X,
  ChevronRight,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  FileCheck,
  Send,
  Calendar,
  Layers,
  HelpCircle,
  AlertCircle
} from 'lucide-react';
import appealsService, {
  APPEAL_LEVELS,
  APPEAL_STATUSES,
  EVIDENCE_EXHIBIT_TYPES,
  SUBMISSION_CHANNELS,
  calculatePayerDueDate,
  calculateTurnaroundDaysRemaining,
  classifyTurnaroundUrgency,
  calculateSettlementVariance,
  calculateAppealKpis,
  getBaselineAppeals
} from '../lib/appealsService';
import './AppealsWorkflowView.css';

export default function AppealsWorkflowView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'evidence' | 'turnaround' | 'analytics'
  const [appealsList, setAppealsList] = useState(() => getBaselineAppeals());
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected Appeal for Evidence Packet Builder tab
  const [selectedAppealId, setSelectedAppealId] = useState(() => {
    const list = getBaselineAppeals();
    return list.length > 0 ? list[0].id : null;
  });

  // Modal States
  const [outcomeModalItem, setOutcomeModalItem] = useState(null);
  const [outcomeStatus, setOutcomeStatus] = useState('OVERTURNED_FULL');
  const [outcomeRecoveredAmount, setOutcomeRecoveredAmount] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');

  const [newAppealModalOpen, setNewAppealModalOpen] = useState(false);
  const [newAppealForm, setNewAppealForm] = useState({
    claimNumber: '',
    patientName: '',
    patientMrn: '',
    payerName: 'UnitedHealthcare',
    procedureName: '',
    appealLevel: 'LEVEL_1_RECONSIDERATION',
    appealedAmount: '',
    submissionChannel: 'PAYER_PORTAL_API',
    statutoryDays: 45,
    clinicalRationale: ''
  });

  // Processed appeals with computed turnaround days and urgency
  const processedAppeals = useMemo(() => {
    return appealsList.map(item => {
      const daysRemaining = calculateTurnaroundDaysRemaining(item.payerResponseDueDate);
      const urgency = classifyTurnaroundUrgency(daysRemaining, item.status);
      const variance = calculateSettlementVariance(item.appealedAmount, item.recoveredAmount);
      return {
        ...item,
        daysRemaining,
        urgency,
        settlementVariance: variance
      };
    });
  }, [appealsList]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return calculateAppealKpis(processedAppeals);
  }, [processedAppeals]);

  // Filtered Queue for Tab 1
  const filteredQueue = useMemo(() => {
    return processedAppeals.filter(item => {
      const matchesLevel = levelFilter === 'ALL' || item.appealLevel === levelFilter;
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        item.appealControlNumber.toLowerCase().includes(q) ||
        item.claimNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.payerName.toLowerCase().includes(q) ||
        (item.carrierTrackingNumber && item.carrierTrackingNumber.toLowerCase().includes(q));
      return matchesLevel && matchesStatus && matchesSearch;
    });
  }, [processedAppeals, levelFilter, statusFilter, searchQuery]);

  // Currently selected appeal for the Evidence Builder
  const selectedAppeal = useMemo(() => {
    return processedAppeals.find(a => a.id === selectedAppealId) || processedAppeals[0];
  }, [processedAppeals, selectedAppealId]);

  // Toggle Exhibit Verification
  const handleToggleExhibitVerification = (appealId, exhibitId) => {
    setAppealsList(prev => prev.map(a => {
      if (a.id !== appealId) return a;
      const updatedExhibits = a.evidenceExhibits.map(ex => {
        if (ex.id !== exhibitId) return ex;
        const newVerified = !ex.isVerified;
        return {
          ...ex,
          isVerified: newVerified,
          verifiedAt: newVerified ? new Date().toISOString().slice(0, 10) : null
        };
      });
      return {
        ...a,
        evidenceExhibits: updatedExhibits
      };
    }));
  };

  // Open Outcome Settlement Modal
  const handleOpenOutcomeModal = (item) => {
    setOutcomeModalItem(item);
    setOutcomeStatus('OVERTURNED_FULL');
    setOutcomeRecoveredAmount(item.appealedAmount.toString());
    setOutcomeNotes(`Full overturn negotiated with ${item.payerName}. Settlement approved.`);
  };

  // Submit Outcome Settlement
  const handleSaveOutcome = (e) => {
    e.preventDefault();
    if (!outcomeModalItem) return;

    const recAmount = outcomeStatus === 'OVERTURNED_FULL'
      ? outcomeModalItem.appealedAmount
      : outcomeStatus === 'UPHELD_DENIED' || outcomeStatus === 'WITHDRAWN'
        ? 0.00
        : parseFloat(outcomeRecoveredAmount) || 0.00;

    setAppealsList(prev => prev.map(a => {
      if (a.id !== outcomeModalItem.id) return a;
      return {
        ...a,
        status: outcomeStatus,
        recoveredAmount: recAmount,
        actualResponseDate: new Date().toISOString().slice(0, 10),
        outcomeNotes
      };
    }));

    setOutcomeModalItem(null);
  };

  // Escalate to next level
  const handleEscalateLevel = (item) => {
    const nextLevel = APPEAL_LEVELS[item.appealLevel]?.escalationTarget;
    if (!nextLevel) return;

    setAppealsList(prev => prev.map(a => {
      if (a.id !== item.id) return a;
      return {
        ...a,
        appealLevel: nextLevel,
        status: 'EVIDENCE_GATHERING',
        submissionDate: null,
        payerResponseDueDate: null,
        carrierTrackingNumber: null
      };
    }));
  };

  // Create New Appeal Form Submit
  const handleCreateNewAppeal = (e) => {
    e.preventDefault();
    const newId = `apl-${Date.now()}`;
    const newControl = `APL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const appealedAmt = parseFloat(newAppealForm.appealedAmount) || 1200.00;
    const subDate = new Date().toISOString().slice(0, 10);
    const dueDate = calculatePayerDueDate(subDate, parseInt(newAppealForm.statutoryDays) || 45);

    const newObj = {
      id: newId,
      appealControlNumber: newControl,
      denialId: `den-new-${Date.now()}`,
      claimNumber: newAppealForm.claimNumber || `CLM-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientName: newAppealForm.patientName || 'New Patient Encounter',
      patientMrn: newAppealForm.patientMrn || 'MRN-NEW',
      payerName: newAppealForm.payerName,
      procedureName: newAppealForm.procedureName || 'Ambulatory Surgical Procedure',
      appealLevel: newAppealForm.appealLevel,
      status: 'SUBMITTED',
      appealedAmount: appealedAmt,
      recoveredAmount: 0.00,
      submissionChannel: newAppealForm.submissionChannel,
      carrierTrackingNumber: `TRK-${Math.floor(100000 + Math.random() * 900000)}`,
      submissionDate: subDate,
      statutoryTurnaroundDays: parseInt(newAppealForm.statutoryDays) || 45,
      payerResponseDueDate: dueDate,
      assignedSpecialist: 'Elena Rostova, CPC',
      clinicalRationale: newAppealForm.clinicalRationale || 'Clinical rationale documentation attached.',
      evidenceExhibits: [
        { id: `ex-${Date.now()}-1`, type: 'OPERATIVE_NOTE', title: 'Complete Operative Narrative', isVerified: true, verifiedAt: subDate },
        { id: `ex-${Date.now()}-2`, type: 'LETTER_OF_MEDICAL_NECESSITY', title: 'Physician LOMN Rationale', isVerified: true, verifiedAt: subDate }
      ]
    };

    setAppealsList([newObj, ...appealsList]);
    setNewAppealModalOpen(false);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Appeal #',
      'Level',
      'Claim #',
      'Patient Name',
      'MRN',
      'Payer',
      'Procedure',
      'Disputed Amount',
      'Recovered Amount',
      'Variance',
      'Status',
      'Submission Channel',
      'Tracking #',
      'Submission Date',
      'Due Date',
      'Days Remaining',
      'Specialist'
    ];
    const rows = processedAppeals.map(a => [
      `"${a.appealControlNumber}"`,
      `"${APPEAL_LEVELS[a.appealLevel]?.shortLabel || a.appealLevel}"`,
      `"${a.claimNumber}"`,
      `"${a.patientName}"`,
      `"${a.patientMrn}"`,
      `"${a.payerName}"`,
      `"${a.procedureName}"`,
      a.appealedAmount.toFixed(2),
      a.recoveredAmount.toFixed(2),
      a.settlementVariance.toFixed(2),
      `"${a.status}"`,
      `"${a.submissionChannel}"`,
      `"${a.carrierTrackingNumber || ''}"`,
      `"${a.submissionDate || ''}"`,
      `"${a.payerResponseDueDate || ''}"`,
      a.daysRemaining !== null ? a.daysRemaining : '',
      `"${a.assignedSpecialist || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ASC_Appeals_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Grouped Analytics by Payer & Level
  const analyticsByPayer = useMemo(() => {
    const payerMap = {};
    processedAppeals.forEach(a => {
      if (!payerMap[a.payerName]) {
        payerMap[a.payerName] = {
          payerName: a.payerName,
          totalAppeals: 0,
          disputedDollars: 0,
          recoveredDollars: 0,
          fullOverturns: 0,
          partialOverturns: 0,
          upheldCount: 0,
          inFlightCount: 0
        };
      }
      payerMap[a.payerName].totalAppeals++;
      payerMap[a.payerName].disputedDollars += a.appealedAmount;
      payerMap[a.payerName].recoveredDollars += a.recoveredAmount;
      if (a.status === 'OVERTURNED_FULL') payerMap[a.payerName].fullOverturns++;
      else if (a.status === 'OVERTURNED_PARTIAL') payerMap[a.payerName].partialOverturns++;
      else if (a.status === 'UPHELD_DENIED') payerMap[a.payerName].upheldCount++;
      else payerMap[a.payerName].inFlightCount++;
    });

    return Object.values(payerMap).map(p => ({
      ...p,
      yieldPct: p.disputedDollars > 0 ? Number(((p.recoveredDollars / p.disputedDollars) * 100).toFixed(1)) : 0
    }));
  }, [processedAppeals]);

  return (
    <div
      className="appeals-container"
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
        className="appeals-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="appeals-topbar-left">
          <div className="appeals-header-icon-badge">
            <Scale size={22} className="text-sky" />
          </div>
          <div>
            <h1
              className="appeals-title"
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
              Appeals Workflow & Dispute Management Engine
            </h1>
            <p
              className="appeals-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              Multi-tier payer dispute orchestration, clinical evidence compilation, statutory turnaround countdown & settlement reconciliation.
            </p>
          </div>
        </div>
        <div className="appeals-topbar-right">
          <button className="rcm-btn rcm-btn-secondary" onClick={() => setNewAppealModalOpen(true)}>
            <Plus size={14} />
            <span>Create New Appeal</span>
          </button>
          <button className="rcm-btn rcm-btn-secondary" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export Appeals CSV</span>
          </button>
        </div>
      </div>

      {/* 2. 4-KPI Executive Ribbon */}
      <div className="appeals-kpi-ribbon">
        <div className="appeals-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Disputed Exposure</span>
            <AlertTriangle size={16} className="text-rose" />
          </div>
          <div className="kpi-number text-rose">
            ${kpis.totalDisputedDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">Active dispute face value</div>
        </div>

        <div className="appeals-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Overturned Dollars Recovered</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="kpi-number text-emerald">
            ${kpis.totalOverturnedDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">Overturned settlements collected</div>
        </div>

        <div className="appeals-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">In-Flight Appeal Cases</span>
            <Clock size={16} className="text-sky" />
          </div>
          <div className="kpi-number text-sky">
            {kpis.inFlightCount}
          </div>
          <div className="kpi-subtext">
            {kpis.overdueCount > 0 ? (
              <span className="text-rose font-bold">{kpis.overdueCount} Carrier Overdue</span>
            ) : (
              'All carriers within statutory window'
            )}
          </div>
        </div>

        <div className="appeals-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Financial Overturn Yield</span>
            <Scale size={16} className="text-amber" />
          </div>
          <div className="kpi-number text-amber">
            {kpis.aggregateRecoveryYieldPct}%
          </div>
          <div className="kpi-subtext">{kpis.caseSuccessRatePct}% case win rate on resolved</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="appeals-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`appeals-nav-tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <Layers size={15} />
          <span>Active Appeals Queue ({filteredQueue.length})</span>
        </button>
        <button
          className={`appeals-nav-tab ${activeTab === 'evidence' ? 'active' : ''}`}
          onClick={() => setActiveTab('evidence')}
        >
          <FileCheck size={15} />
          <span>Evidence Packet Builder</span>
        </button>
        <button
          className={`appeals-nav-tab ${activeTab === 'turnaround' ? 'active' : ''}`}
          onClick={() => setActiveTab('turnaround')}
        >
          <Clock size={15} />
          <span>Payer Turnaround & Aging Tracker</span>
        </button>
        <button
          className={`appeals-nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <TrendingUp size={15} />
          <span>Overturn & Settlement Matrix</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE APPEALS QUEUE */}
      {activeTab === 'queue' && (
        <div className="appeals-content-section">
          <div className="appeals-toolbar">
            <div className="filter-pills-row">
              <button
                className={`filter-pill ${levelFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setLevelFilter('ALL')}
              >
                All Levels
              </button>
              {Object.keys(APPEAL_LEVELS).map(lk => (
                <button
                  key={lk}
                  className={`filter-pill ${levelFilter === lk ? 'active' : ''}`}
                  onClick={() => setLevelFilter(lk)}
                >
                  {APPEAL_LEVELS[lk].shortLabel}
                </button>
              ))}
            </div>

            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search appeal #, claim, patient, payer..."
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
            <table className="appeals-table">
              <thead>
                <tr>
                  <th style={{ width: '135px' }}>Appeal # & Level</th>
                  <th style={{ width: '130px' }}>Claim & Patient</th>
                  <th style={{ width: '160px' }}>Payer & Procedure</th>
                  <th style={{ width: '120px' }} className="text-right">Disputed / Won</th>
                  <th style={{ width: '130px' }}>Carrier Tracking</th>
                  <th style={{ width: '120px' }} className="text-center">Turnaround Due</th>
                  <th style={{ width: '110px' }} className="text-center">Evidence Exhibits</th>
                  <th style={{ width: '110px' }} className="text-center">Status</th>
                  <th style={{ width: '120px' }} className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-cell">
                      <CheckCircle2 size={32} className="text-emerald mb-2" />
                      <div>No appeals match the selected filters.</div>
                      <span className="text-xs text-slate-400">All dispute cases are processed or cleared.</span>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map(item => (
                    <tr key={item.id} className="appeals-row">
                      <td style={{ width: '135px' }}>
                        <div className="font-semibold text-sky">{item.appealControlNumber}</div>
                        <span className={`status-pill ${APPEAL_LEVELS[item.appealLevel]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {APPEAL_LEVELS[item.appealLevel]?.shortLabel}
                        </span>
                      </td>
                      <td style={{ width: '130px' }}>
                        <div className="font-medium text-slate-200">{item.claimNumber}</div>
                        <div className="text-xs text-slate-300">{item.patientName}</div>
                        <div className="text-xs text-slate-500 font-mono">{item.patientMrn}</div>
                      </td>
                      <td style={{ width: '160px' }}>
                        <div className="font-semibold text-slate-200">{item.payerName}</div>
                        <div className="text-xs text-slate-400 line-clamp-1" title={item.procedureName}>
                          {item.procedureName}
                        </div>
                      </td>
                      <td style={{ width: '120px' }} className="text-right">
                        <div className="font-mono font-bold text-rose">${item.appealedAmount.toFixed(2)}</div>
                        <div className="text-xs font-mono text-emerald font-semibold">
                          Won: ${item.recoveredAmount.toFixed(2)}
                        </div>
                      </td>
                      <td style={{ width: '130px' }}>
                        <div className="text-xs font-medium text-slate-300">{SUBMISSION_CHANNELS[item.submissionChannel]?.label || item.submissionChannel}</div>
                        <div className="text-xs font-mono text-sky truncate" title={item.carrierTrackingNumber || 'Pending submission'}>
                          {item.carrierTrackingNumber || 'No tracking ID'}
                        </div>
                      </td>
                      <td style={{ width: '120px' }} className="text-center">
                        <span className={`status-pill ${item.urgency.badgeClass}`}>
                          {item.urgency.label}
                        </span>
                        <div className="text-xs text-slate-500 mt-0.5">{item.payerResponseDueDate || 'Due date pending'}</div>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <button
                          className="table-action-btn"
                          onClick={() => {
                            setSelectedAppealId(item.id);
                            setActiveTab('evidence');
                          }}
                          title="View and verify evidence exhibits"
                        >
                          <FileCheck size={12} />
                          <span>{item.evidenceExhibits.filter(e => e.isVerified).length}/{item.evidenceExhibits.length} Exhibits</span>
                        </button>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <span className={`status-pill ${APPEAL_STATUSES[item.status]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {APPEAL_STATUSES[item.status]?.label || item.status}
                        </span>
                      </td>
                      <td style={{ width: '120px' }} className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!['OVERTURNED_FULL', 'OVERTURNED_PARTIAL', 'UPHELD_DENIED', 'WITHDRAWN'].includes(item.status) ? (
                            <button
                              className="table-action-btn"
                              onClick={() => handleOpenOutcomeModal(item)}
                              title="Record final carrier outcome"
                            >
                              <span>Settle</span>
                              <ArrowRight size={11} />
                            </button>
                          ) : item.status === 'UPHELD_DENIED' && APPEAL_LEVELS[item.appealLevel]?.escalationTarget ? (
                            <button
                              className="table-action-btn"
                              style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}
                              onClick={() => handleEscalateLevel(item)}
                              title="Escalate to next statutory appeal level"
                            >
                              <span>Escalate</span>
                              <ChevronRight size={11} />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">Settled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="appeals-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{filteredQueue.length}</strong> active appeal cases
            </span>
            <span className="text-xs text-sky font-medium">
              ↓ Scroll table vertically or use filters above to review all cases
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: EVIDENCE PACKET BUILDER */}
      {activeTab === 'evidence' && selectedAppeal && (
        <div className="appeals-content-section">
          <div className="evidence-packet-layout">
            {/* Left: Appeal Selector List */}
            <div className="appeal-picker-card">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select Case for Evidence Review
              </div>
              {processedAppeals.map(a => (
                <div
                  key={a.id}
                  className={`appeal-picker-item ${a.id === selectedAppeal.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAppealId(a.id)}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sky text-xs">{a.appealControlNumber}</span>
                    <span className="text-xs font-mono font-bold text-rose">${a.appealedAmount.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-slate-200 font-medium mt-1">{a.patientName}</div>
                  <div className="text-xs text-slate-400">{a.payerName}</div>
                </div>
              ))}
            </div>

            {/* Right: Evidence Exhibits Checklist */}
            <div className="evidence-checklist-card">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 m-0">
                    Evidence Packet: {selectedAppeal.appealControlNumber}
                  </h3>
                  <p className="text-xs text-slate-400 m-0 mt-0.5">
                    {selectedAppeal.patientName} ({selectedAppeal.patientMrn}) — {selectedAppeal.procedureName}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`status-pill ${APPEAL_LEVELS[selectedAppeal.appealLevel]?.badgeClass}`}>
                    {APPEAL_LEVELS[selectedAppeal.appealLevel]?.label}
                  </span>
                  <span className="text-xs font-mono text-emerald bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded">
                    {selectedAppeal.evidenceExhibits.filter(e => e.isVerified).length} of {selectedAppeal.evidenceExhibits.length} Verified
                  </span>
                </div>
              </div>

              {/* Clinical Rationale Brief */}
              <div style={{ background: '#111c30', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <div className="text-xs font-bold text-sky uppercase tracking-wider mb-1 flex items-center gap-1">
                  <FileText size={13} />
                  <span>Clinical Appeal Rationale & Defense Statement</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed m-0">
                  {selectedAppeal.clinicalRationale}
                </p>
              </div>

              {/* Exhibits Checklist */}
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Attached Clinical & Technical Exhibits
              </div>

              {selectedAppeal.evidenceExhibits.map((ex, idx) => (
                <div key={ex.id} className="evidence-exhibit-row">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold font-mono text-slate-500 mt-0.5">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{ex.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {EVIDENCE_EXHIBIT_TYPES[ex.type]?.label || ex.type}
                      </div>
                      {ex.verifiedAt && (
                        <div className="text-xs text-emerald mt-0.5">
                          Verified on {ex.verifiedAt}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="table-action-btn"
                      onClick={() => handleToggleExhibitVerification(selectedAppeal.id, ex.id)}
                      style={{
                        background: ex.isVerified ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                        borderColor: ex.isVerified ? '#10b981' : 'rgba(56, 189, 248, 0.3)',
                        color: ex.isVerified ? '#10b981' : '#38bdf8'
                      }}
                    >
                      {ex.isVerified ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      <span>{ex.isVerified ? 'Verified' : 'Click to Verify'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAYER TURNAROUND & AGING TRACKER */}
      {activeTab === 'turnaround' && (
        <div className="appeals-content-section">
          <div className="aging-buckets-grid">
            <div className="aging-bucket-card">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-emerald uppercase">0–15 Days Remaining</span>
                <span className="text-xs font-mono font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded">
                  {processedAppeals.filter(a => a.daysRemaining !== null && a.daysRemaining >= 0 && a.daysRemaining <= 15).length} Cases
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">Early carrier adjudication stage; prompt follow-up recommended.</p>
            </div>

            <div className="aging-bucket-card">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-sky uppercase">16–30 Days Remaining</span>
                <span className="text-xs font-mono font-bold bg-sky-950/40 text-sky-400 border border-sky-800 px-1.5 py-0.5 rounded">
                  {processedAppeals.filter(a => a.daysRemaining !== null && a.daysRemaining > 15 && a.daysRemaining <= 30).length} Cases
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">In-review by carrier medical director or peer clinician.</p>
            </div>

            <div className="aging-bucket-card">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-amber uppercase">31–45 Days Remaining</span>
                <span className="text-xs font-mono font-bold bg-amber-950/40 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded">
                  {processedAppeals.filter(a => a.daysRemaining !== null && a.daysRemaining > 30 && a.daysRemaining <= 45).length} Cases
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">Standard statutory response review period in effect.</p>
            </div>

            <div className="aging-bucket-card">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-rose uppercase">Carrier Overdue (&lt;0 Days)</span>
                <span className="text-xs font-mono font-bold bg-rose-950/40 text-rose-400 border border-rose-800 px-1.5 py-0.5 rounded">
                  {processedAppeals.filter(a => a.daysRemaining !== null && a.daysRemaining < 0).length} Cases
                </span>
              </div>
              <p className="text-xs text-slate-400 m-0">Exceeded statutory response deadline; immediate escalation trigger.</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="appeals-table">
              <thead>
                <tr>
                  <th style={{ width: '135px' }}>Appeal #</th>
                  <th style={{ width: '130px' }}>Payer</th>
                  <th style={{ width: '140px' }}>Submission Date</th>
                  <th style={{ width: '140px' }}>Statutory Due Date</th>
                  <th style={{ width: '120px' }} className="text-center">Days Remaining</th>
                  <th style={{ width: '120px' }}>Carrier Tracking</th>
                  <th style={{ width: '120px' }} className="text-right">Disputed Value</th>
                  <th style={{ width: '120px' }} className="text-center">Turnaround Tier</th>
                </tr>
              </thead>
              <tbody>
                {processedAppeals.map(a => (
                  <tr key={a.id} className="appeals-row">
                    <td style={{ width: '135px' }}>
                      <div className="font-semibold text-sky">{a.appealControlNumber}</div>
                      <div className="text-xs text-slate-400">{a.claimNumber}</div>
                    </td>
                    <td style={{ width: '130px' }}>
                      <div className="font-medium text-slate-200">{a.payerName}</div>
                    </td>
                    <td style={{ width: '140px' }}>
                      <div className="text-xs text-slate-300">{a.submissionDate || 'Not Submitted'}</div>
                    </td>
                    <td style={{ width: '140px' }}>
                      <div className="text-xs font-mono text-slate-200">{a.payerResponseDueDate || 'Pending Submission'}</div>
                    </td>
                    <td style={{ width: '120px' }} className="text-center">
                      <span className="font-mono font-bold text-xs">
                        {a.daysRemaining !== null ? `${a.daysRemaining} days` : '—'}
                      </span>
                    </td>
                    <td style={{ width: '120px' }}>
                      <span className="text-xs font-mono text-sky truncate block" title={a.carrierTrackingNumber || 'None'}>
                        {a.carrierTrackingNumber || 'Pending'}
                      </span>
                    </td>
                    <td style={{ width: '120px' }} className="text-right font-mono font-bold text-rose">
                      ${a.appealedAmount.toFixed(2)}
                    </td>
                    <td style={{ width: '120px' }} className="text-center">
                      <span className={`status-pill ${a.urgency.badgeClass}`}>
                        {a.urgency.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: OVERTURN & SETTLEMENT MATRIX */}
      {activeTab === 'analytics' && (
        <div className="appeals-content-section">
          <div className="appeals-toolbar">
            <div className="text-sm font-semibold text-slate-300">
              Payer Settlement Performance & Overturn Yield Matrix
            </div>
            <div className="text-xs text-slate-400">
              Deterministic financial recovery by health plan
            </div>
          </div>

          <div className="table-responsive">
            <table className="appeals-table">
              <thead>
                <tr>
                  <th style={{ width: '200px' }}>Carrier / Payer</th>
                  <th style={{ width: '100px' }} className="text-center">Appeals</th>
                  <th style={{ width: '140px' }} className="text-right">Total Disputed</th>
                  <th style={{ width: '140px' }} className="text-right">Recovered Dollars</th>
                  <th style={{ width: '110px' }} className="text-center">Recovery Yield %</th>
                  <th style={{ width: '110px' }} className="text-center">Full Overturns</th>
                  <th style={{ width: '110px' }} className="text-center">Partial Settle</th>
                  <th style={{ width: '100px' }} className="text-center">In-Flight</th>
                </tr>
              </thead>
              <tbody>
                {analyticsByPayer.map(p => (
                  <tr key={p.payerName} className="appeals-row">
                    <td style={{ width: '200px' }}>
                      <div className="font-semibold text-slate-200">{p.payerName}</div>
                    </td>
                    <td style={{ width: '100px' }} className="text-center font-mono font-bold">
                      {p.totalAppeals}
                    </td>
                    <td style={{ width: '140px' }} className="text-right font-mono font-bold text-rose">
                      ${p.disputedDollars.toFixed(2)}
                    </td>
                    <td style={{ width: '140px' }} className="text-right font-mono font-bold text-emerald">
                      ${p.recoveredDollars.toFixed(2)}
                    </td>
                    <td style={{ width: '110px' }} className="text-center">
                      <span className={`font-mono font-bold text-xs ${p.yieldPct >= 70 ? 'text-emerald' : p.yieldPct >= 40 ? 'text-amber' : 'text-rose'}`}>
                        {p.yieldPct}%
                      </span>
                    </td>
                    <td style={{ width: '110px' }} className="text-center font-mono text-emerald">
                      {p.fullOverturns}
                    </td>
                    <td style={{ width: '110px' }} className="text-center font-mono text-sky">
                      {p.partialOverturns}
                    </td>
                    <td style={{ width: '100px' }} className="text-center font-mono text-amber">
                      {p.inFlightCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD OUTCOME & SETTLEMENT */}
      {outcomeModalItem && (
        <div className="appeals-modal-overlay">
          <div className="appeals-modal-card">
            <div className="appeals-modal-header">
              <h3 className="appeals-modal-title">Record Payer Outcome: {outcomeModalItem.appealControlNumber}</h3>
              <button className="rcm-btn-secondary" style={{ padding: '4px 6px', background: 'none', border: 'none' }} onClick={() => setOutcomeModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveOutcome}>
              <div className="appeals-modal-body">
                <div className="appeals-form-group">
                  <label className="appeals-form-label">Carrier Final Determination</label>
                  <select
                    className="appeals-form-select"
                    value={outcomeStatus}
                    onChange={e => setOutcomeStatus(e.target.value)}
                  >
                    <option value="OVERTURNED_FULL">OVERTURNED_FULL (100% Disputed Dollars Paid)</option>
                    <option value="OVERTURNED_PARTIAL">OVERTURNED_PARTIAL (Partial Settlement Negotiated)</option>
                    <option value="UPHELD_DENIED">UPHELD_DENIED (Denial Sustained by Carrier)</option>
                    <option value="WITHDRAWN">WITHDRAWN (Withdrawn by ASC Biller)</option>
                  </select>
                </div>

                <div className="appeals-form-group">
                  <label className="appeals-form-label">Disputed Dollars: ${outcomeModalItem.appealedAmount.toFixed(2)}</label>
                  <label className="appeals-form-label">Settlement Recovered Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="appeals-form-input"
                    value={outcomeRecoveredAmount}
                    onChange={e => setOutcomeRecoveredAmount(e.target.value)}
                    disabled={outcomeStatus === 'UPHELD_DENIED' || outcomeStatus === 'WITHDRAWN'}
                  />
                </div>

                <div className="appeals-form-group">
                  <label className="appeals-form-label">Outcome Documentation & Notes</label>
                  <textarea
                    rows={3}
                    className="appeals-form-textarea"
                    value={outcomeNotes}
                    onChange={e => setOutcomeNotes(e.target.value)}
                    placeholder="Enter carrier check #, EFT trace, or denial upholding explanation..."
                  />
                </div>
              </div>

              <div className="appeals-modal-footer">
                <button type="button" className="rcm-btn rcm-btn-secondary" onClick={() => setOutcomeModalItem(null)}>
                  Cancel
                </button>
                <button type="submit" className="rcm-btn rcm-btn-primary">
                  Save Settlement & Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW APPEAL */}
      {newAppealModalOpen && (
        <div className="appeals-modal-overlay">
          <div className="appeals-modal-card">
            <div className="appeals-modal-header">
              <h3 className="appeals-modal-title">Initiate New Payer Appeal Packet</h3>
              <button className="rcm-btn-secondary" style={{ padding: '4px 6px', background: 'none', border: 'none' }} onClick={() => setNewAppealModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateNewAppeal}>
              <div className="appeals-modal-body">
                <div className="appeals-form-group">
                  <label className="appeals-form-label">Claim Number</label>
                  <input
                    type="text"
                    required
                    className="appeals-form-input"
                    placeholder="e.g. CLM-2026-0312"
                    value={newAppealForm.claimNumber}
                    onChange={e => setNewAppealForm({ ...newAppealForm, claimNumber: e.target.value })}
                  />
                </div>

                <div className="appeals-form-group">
                  <label className="appeals-form-label">Patient Name & MRN</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      className="appeals-form-input flex-1"
                      placeholder="Patient full name"
                      value={newAppealForm.patientName}
                      onChange={e => setNewAppealForm({ ...newAppealForm, patientName: e.target.value })}
                    />
                    <input
                      type="text"
                      className="appeals-form-input"
                      style={{ width: '130px' }}
                      placeholder="MRN-XXXXX"
                      value={newAppealForm.patientMrn}
                      onChange={e => setNewAppealForm({ ...newAppealForm, patientMrn: e.target.value })}
                    />
                  </div>
                </div>

                <div className="appeals-form-group">
                  <label className="appeals-form-label">Target Carrier / Health Plan</label>
                  <input
                    type="text"
                    required
                    className="appeals-form-input"
                    value={newAppealForm.payerName}
                    onChange={e => setNewAppealForm({ ...newAppealForm, payerName: e.target.value })}
                  />
                </div>

                <div className="flex gap-2">
                  <div className="appeals-form-group flex-1">
                    <label className="appeals-form-label">Appeal Level</label>
                    <select
                      className="appeals-form-select"
                      value={newAppealForm.appealLevel}
                      onChange={e => setNewAppealForm({ ...newAppealForm, appealLevel: e.target.value })}
                    >
                      <option value="LEVEL_1_RECONSIDERATION">Level 1: Reconsideration</option>
                      <option value="LEVEL_2_FORMAL_APPEAL">Level 2: Formal Appeal</option>
                      <option value="LEVEL_3_EXTERNAL_ALJ">Level 3: External / ALJ</option>
                    </select>
                  </div>

                  <div className="appeals-form-group flex-1">
                    <label className="appeals-form-label">Disputed Dollars ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="appeals-form-input"
                      placeholder="0.00"
                      value={newAppealForm.appealedAmount}
                      onChange={e => setNewAppealForm({ ...newAppealForm, appealedAmount: e.target.value })}
                    />
                  </div>
                </div>

                <div className="appeals-form-group">
                  <label className="appeals-form-label">Clinical Defense Rationale</label>
                  <textarea
                    rows={3}
                    required
                    className="appeals-form-textarea"
                    placeholder="Summarize conservative therapy history, clinical indications, and surgical medical necessity..."
                    value={newAppealForm.clinicalRationale}
                    onChange={e => setNewAppealForm({ ...newAppealForm, clinicalRationale: e.target.value })}
                  />
                </div>
              </div>

              <div className="appeals-modal-footer">
                <button type="button" className="rcm-btn rcm-btn-secondary" onClick={() => setNewAppealModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="rcm-btn rcm-btn-primary">
                  Create & Launch Appeal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
