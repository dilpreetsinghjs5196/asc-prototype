import React, { useState, useMemo } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Search,
  Filter,
  Download,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  X,
  UserCheck,
  FileText,
  DollarSign,
  Calendar,
  Send
} from 'lucide-react';
import denialsService, {
  DENIAL_CATEGORIES,
  DENIAL_STATUSES,
  ASSIGNED_TEAMS,
  URGENCY_TIERS,
  calculateDaysToDeadline,
  getUrgencyTier,
  calculateExpectedRecovery,
  calculateDenialKpis,
  getBaselineDenials
} from '../lib/denialsService';
import './DenialsModelView.css';

export default function DenialsModelView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'deadlines' | 'teams' | 'analytics'
  const [denials, setDenials] = useState(() => getBaselineDenials());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState('ALL');

  // Modal State
  const [appealModalItem, setAppealModalItem] = useState(null);
  const [appealLevel, setAppealLevel] = useState(1);
  const [appealTrackingNum, setAppealTrackingNum] = useState('');
  const [appealRationale, setAppealRationale] = useState('');

  const [reassignModalItem, setReassignModalItem] = useState(null);
  const [reassignTeam, setReassignTeam] = useState('CLINICAL_APPEALS');
  const [reassignSpecialist, setReassignSpecialist] = useState('');

  // Processed denials with real-time deadline math
  const processedDenials = useMemo(() => {
    return denials.map(d => {
      const daysRemaining = calculateDaysToDeadline(d.appealDeadlineDate);
      const urgency = getUrgencyTier(daysRemaining);
      const expectedRecovery = calculateExpectedRecovery(d.deniedAmount, d.recoveryProbabilityPct);
      return {
        ...d,
        daysRemaining,
        urgency,
        expectedRecovery
      };
    });
  }, [denials]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return calculateDenialKpis(processedDenials);
  }, [processedDenials]);

  // Filtered Denials Queue
  const filteredDenials = useMemo(() => {
    return processedDenials.filter(d => {
      const matchesCat = categoryFilter === 'ALL' || d.denialCategory === categoryFilter;
      const matchesTeam = teamFilter === 'ALL' || d.assignedTeam === teamFilter;
      const matchesUrgency = urgencyFilter === 'ALL' || d.urgency.id === urgencyFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        d.denialControlNumber.toLowerCase().includes(q) ||
        d.claimNumber.toLowerCase().includes(q) ||
        d.patientName.toLowerCase().includes(q) ||
        d.patientMrn.toLowerCase().includes(q) ||
        d.payerName.toLowerCase().includes(q) ||
        d.carcCode.toLowerCase().includes(q) ||
        (d.rarcCode && d.rarcCode.toLowerCase().includes(q));

      return matchesCat && matchesTeam && matchesUrgency && matchesSearch;
    });
  }, [processedDenials, categoryFilter, teamFilter, urgencyFilter, searchQuery]);

  // Handle Appeal Submission
  const handleExecuteAppeal = (e) => {
    e.preventDefault();
    if (!appealModalItem) return;

    setDenials(prev => prev.map(d => {
      if (d.id === appealModalItem.id) {
        return {
          ...d,
          status: appealLevel === 1 ? 'APPEALED_LEVEL_1' : 'APPEALED_LEVEL_2',
          currentAppealLevel: appealLevel,
          notes: `${d.notes || ''} [Appeal Level ${appealLevel} Submitted: ${appealTrackingNum || 'N/A'}]`
        };
      }
      return d;
    }));

    setAppealModalItem(null);
    setAppealTrackingNum('');
    setAppealRationale('');
  };

  // Handle Ownership Reassignment
  const handleExecuteReassign = (e) => {
    e.preventDefault();
    if (!reassignModalItem) return;

    setDenials(prev => prev.map(d => {
      if (d.id === reassignModalItem.id) {
        return {
          ...d,
          assignedTeam: reassignTeam,
          assignedUser: reassignSpecialist || d.assignedUser,
          status: d.status === 'IDENTIFIED' ? 'TRIAGED' : d.status
        };
      }
      return d;
    }));

    setReassignModalItem(null);
  };

  // Handle Direct Quick Resolution (Mark Paid or Written Off)
  const handleQuickResolve = (denialId, newStatus) => {
    setDenials(prev => prev.map(d => {
      if (d.id === denialId) {
        return {
          ...d,
          status: newStatus,
          recoveredAmount: newStatus === 'OVERTURNED_PAID' ? d.deniedAmount : 0,
          writtenOffAmount: newStatus === 'WRITTEN_OFF' ? d.deniedAmount : 0
        };
      }
      return d;
    }));
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Denial Control #', 'Claim #', 'Patient Name', 'MRN', 'Payer', 'CARC', 'RARC',
      'Category', 'Type', 'Denied Amount', 'Recovery Prob %', 'Expected Recovery',
      'Denial Date', 'Deadline Date', 'Days Remaining', 'Urgency', 'Team', 'Status'
    ];
    const rows = processedDenials.map(d => [
      `"${d.denialControlNumber}"`,
      `"${d.claimNumber}"`,
      `"${d.patientName}"`,
      `"${d.patientMrn}"`,
      `"${d.payerName}"`,
      d.carcCode,
      d.rarcCode || '',
      `"${DENIAL_CATEGORIES[d.denialCategory]?.label || d.denialCategory}"`,
      d.denialType,
      d.deniedAmount.toFixed(2),
      d.recoveryProbabilityPct.toFixed(2),
      d.expectedRecovery.toFixed(2),
      d.denialDate,
      d.appealDeadlineDate,
      d.daysRemaining,
      d.urgency.label,
      `"${ASSIGNED_TEAMS[d.assignedTeam]?.name || d.assignedTeam}"`,
      d.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ASC_Denials_Scorecard_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="denials-container"
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
        className="denials-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="denials-topbar-left">
          <div className="denials-header-icon-badge">
            <ShieldAlert size={22} className="text-rose" />
          </div>
          <div>
            <h1
              className="denials-title"
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
              Denials Management & Appeals Workflow
            </h1>
            <p
              className="denials-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              Denial categories, financial exposure, recoverability scoring, payer filing deadlines & team ownership
            </p>
          </div>
        </div>
        <div className="denials-topbar-right">
          <button className="rcm-btn rcm-btn-secondary" onClick={() => setActiveTab('deadlines')}>
            <Clock size={14} />
            <span>Deadlines Matrix</span>
          </button>
          <button className="rcm-btn rcm-btn-secondary" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export Denials CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Executive 4-KPI Ribbon */}
      <div className="denials-kpi-ribbon">
        <div className="denials-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Denied Exposure</span>
            <AlertOctagon size={16} className="text-rose" />
          </div>
          <div className="kpi-number text-rose">
            ${kpis.totalDenialExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">Active unadjudicated denial balances</div>
        </div>

        <div className="denials-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Expected Recovery</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="kpi-number text-emerald">
            ${kpis.expectedRecoverableOpportunity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="kpi-subtext">Probability-weighted recoverable dollars</div>
        </div>

        <div className="denials-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Critical Deadlines</span>
            <Clock size={16} className="text-amber" />
          </div>
          <div className="kpi-number text-amber">
            {kpis.criticalDeadlinesCount} claims
          </div>
          <div className="kpi-subtext">&lt; 15 days until payer appeal deadline</div>
        </div>

        <div className="denials-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Net Overturn Rate</span>
            <CheckCircle2 size={16} className="text-sky" />
          </div>
          <div className="kpi-number text-sky">
            {kpis.netOverturnRate}%
          </div>
          <div className="kpi-subtext">Historical appeal overturn success rate</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="denials-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`denials-nav-tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <AlertTriangle size={15} />
          <span>Actionable Denials Queue ({kpis.openCount})</span>
        </button>
        <button
          className={`denials-nav-tab ${activeTab === 'deadlines' ? 'active' : ''}`}
          onClick={() => setActiveTab('deadlines')}
        >
          <Clock size={15} />
          <span>Deadline & Aging Urgency Matrix</span>
        </button>
        <button
          className={`denials-nav-tab ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => setActiveTab('teams')}
        >
          <UserCheck size={15} />
          <span>Functional Team Queues</span>
        </button>
        <button
          className={`denials-nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <FileText size={15} />
          <span>Root Cause & Overturn Analytics</span>
        </button>
      </div>

      {/* TAB 1: ACTIONABLE DENIALS QUEUE */}
      {activeTab === 'queue' && (
        <div className="denials-content-section">
          <div className="denials-toolbar">
            <div className="filter-pills-row">
              <button
                className={`filter-pill ${categoryFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('ALL')}
              >
                All Categories
              </button>
              {Object.keys(DENIAL_CATEGORIES).map(ck => (
                <button
                  key={ck}
                  className={`filter-pill ${categoryFilter === ck ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(ck)}
                >
                  {DENIAL_CATEGORIES[ck].label}
                </button>
              ))}
            </div>

            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search denial #, claim, patient, payer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button className="clear-btn" onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="table-responsive">
            <table className="denials-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Denial & Claim</th>
                  <th style={{ width: '130px' }}>Patient & DOS</th>
                  <th style={{ width: '140px' }}>Payer & CARC</th>
                  <th style={{ width: '170px' }}>Root Cause Category</th>
                  <th style={{ width: '110px' }} className="text-right">Denied Amt</th>
                  <th style={{ width: '120px' }} className="text-center">Expected Recov</th>
                  <th style={{ width: '130px' }} className="text-center">Filing Deadline</th>
                  <th style={{ width: '140px' }}>Assigned Team</th>
                  <th style={{ width: '110px' }} className="text-center">Status</th>
                  <th style={{ width: '110px' }} className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDenials.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="empty-cell">
                      <CheckCircle2 size={32} className="text-emerald mb-2" />
                      <div>No active denials matching the selected filters.</div>
                      <span className="text-xs text-slate-400">All denials are resolved or written off.</span>
                    </td>
                  </tr>
                ) : (
                  filteredDenials.map(d => (
                    <tr key={d.id} className="denial-row">
                      <td style={{ width: '130px' }}>
                        <div className="font-semibold text-rose">{d.denialControlNumber}</div>
                        <div className="text-xs text-sky font-mono">{d.claimNumber}</div>
                      </td>
                      <td style={{ width: '130px' }}>
                        <div className="font-medium text-slate-200">{d.patientName}</div>
                        <div className="text-xs text-slate-400 font-mono">{d.patientMrn}</div>
                      </td>
                      <td style={{ width: '140px' }}>
                        <div className="font-medium text-slate-200">{d.payerName}</div>
                        <div className="text-xs font-mono text-amber mt-0.5">
                          {d.groupCode}-{d.carcCode} {d.rarcCode ? `(${d.rarcCode})` : ''}
                        </div>
                      </td>
                      <td style={{ width: '170px' }}>
                        <span className={`status-pill ${DENIAL_CATEGORIES[d.denialCategory]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {DENIAL_CATEGORIES[d.denialCategory]?.label || d.denialCategory}
                        </span>
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1" title={d.notes}>
                          {d.notes}
                        </div>
                      </td>
                      <td style={{ width: '110px' }} className="text-right">
                        <span className="font-mono font-bold text-rose">
                          ${d.deniedAmount.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ width: '120px' }} className="text-center">
                        <div className="font-mono font-bold text-emerald">
                          ${d.expectedRecovery.toFixed(2)}
                        </div>
                        <span className="text-xs text-slate-400 font-mono">({d.recoveryProbabilityPct}%)</span>
                      </td>
                      <td style={{ width: '130px' }} className="text-center">
                        <span className={`urgency-pill ${d.urgency.badgeClass}`}>
                          {d.daysRemaining < 0
                            ? `${Math.abs(d.daysRemaining)}d OVERDUE`
                            : `${d.daysRemaining}d remaining`}
                        </span>
                        <div className="text-xs text-slate-400 mt-1 font-mono">{d.appealDeadlineDate}</div>
                      </td>
                      <td style={{ width: '140px' }}>
                        <div className="text-xs font-semibold text-slate-200">
                          {ASSIGNED_TEAMS[d.assignedTeam]?.name.split('&')[0] || d.assignedTeam}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={d.assignedUser}>
                          {d.assignedUser}
                        </div>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <span className={`status-pill ${DENIAL_STATUSES[d.status]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {DENIAL_STATUSES[d.status]?.label || d.status}
                        </span>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <button
                          className="table-action-btn"
                          onClick={() => setAppealModalItem(d)}
                          title="Execute Appeal / Workflow Action"
                        >
                          <span>Appeal</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="denials-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{filteredDenials.length}</strong> of <strong className="text-slate-200">{denials.length}</strong> ASC denials
            </span>
            <span className="text-xs text-sky font-medium">
              Scroll table vertically to review full queue ↓
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: DEADLINE & AGING MATRIX */}
      {activeTab === 'deadlines' && (
        <div className="denials-content-section">
          <div className="deadlines-grid">
            {Object.keys(URGENCY_TIERS).map(tierKey => {
              const tier = URGENCY_TIERS[tierKey];
              const tierItems = processedDenials.filter(d => d.urgency.id === tierKey);
              const tierDollars = tierItems.reduce((acc, i) => acc + i.deniedAmount, 0);

              return (
                <div key={tierKey} className="deadline-bucket-card">
                  <div className="bucket-header">
                    <span className={`urgency-pill ${tier.badgeClass}`}>
                      {tier.label}
                    </span>
                    <span className="bucket-count">{tierItems.length} items</span>
                  </div>
                  <div className="bucket-dollars font-mono">
                    ${tierDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="bucket-desc text-xs text-slate-400">
                    {tierKey === 'CRITICAL_OVERDUE' && 'Statutory deadline expired. Requires executive dispute or write-off.'}
                    {tierKey === 'URGENT_UNDER_15_DAYS' && 'Immediate action required. Escalate to clinical or coding lead.'}
                    {tierKey === 'APPROACHING_30_DAYS' && 'Standard appeal window. Evidence gathering in progress.'}
                    {tierKey === 'ON_TRACK' && 'Standard operational timeline. Low filing risk.'}
                  </p>
                  <div className="bucket-items-list">
                    {tierItems.slice(0, 3).map(item => (
                      <div key={item.id} className="bucket-mini-row">
                        <div>
                          <div className="font-semibold text-slate-200">{item.claimNumber}</div>
                          <div className="text-xs text-slate-400">{item.patientName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-rose">${item.deniedAmount.toFixed(2)}</div>
                          <button
                            className="text-xs text-sky hover:underline"
                            onClick={() => setAppealModalItem(item)}
                          >
                            Appeal →
                          </button>
                        </div>
                      </div>
                    ))}
                    {tierItems.length > 3 && (
                      <div className="text-xs text-slate-400 text-center pt-2">
                        + {tierItems.length - 3} more items in this tier
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: FUNCTIONAL TEAM QUEUES */}
      {activeTab === 'teams' && (
        <div className="denials-content-section">
          <div className="teams-grid">
            {Object.keys(ASSIGNED_TEAMS).map(teamKey => {
              const team = ASSIGNED_TEAMS[teamKey];
              const teamItems = processedDenials.filter(d => d.assignedTeam === teamKey);
              const teamDollars = teamItems.reduce((acc, i) => acc + i.deniedAmount, 0);

              return (
                <div key={teamKey} className="team-queue-card">
                  <div className="team-card-header">
                    <div>
                      <h3 className="team-title text-slate-200">{team.name}</h3>
                      <div className="text-xs text-sky mt-0.5">{team.leadRole}</div>
                    </div>
                    <span className="team-count-badge font-mono">{teamItems.length} active</span>
                  </div>
                  <div className="team-exposure font-mono text-emerald mt-2">
                    ${teamDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="team-desc text-xs text-slate-400 mt-1">
                    {team.description}
                  </p>

                  <div className="team-claims-list mt-3">
                    {teamItems.map(item => (
                      <div key={item.id} className="team-claim-row">
                        <div>
                          <div className="font-semibold text-slate-200">{item.claimNumber}</div>
                          <div className="text-xs text-amber font-mono">
                            {DENIAL_CATEGORIES[item.denialCategory]?.label}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-slate-200">${item.deniedAmount.toFixed(2)}</div>
                          <button
                            className="text-xs text-sky hover:underline mt-1"
                            onClick={() => {
                              setReassignModalItem(item);
                              setReassignTeam(item.assignedTeam);
                            }}
                          >
                            Reassign
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: ROOT CAUSE & OVERTURN ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="denials-content-section">
          <div className="denials-toolbar">
            <div className="text-sm font-semibold text-slate-300">
              ASC Denial Root Cause Financial Impact & Recovery Matrix
            </div>
          </div>
          <div className="table-responsive">
            <table className="denials-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Denial Category</th>
                  <th style={{ width: '120px' }}>Type</th>
                  <th style={{ width: '110px' }} className="text-right">Volume</th>
                  <th style={{ width: '140px' }} className="text-right">Total Denied</th>
                  <th style={{ width: '140px' }} className="text-right">Expected Recovery</th>
                  <th style={{ width: '130px' }} className="text-center">Benchmark Prob %</th>
                  <th style={{ width: '140px' }} className="text-center">Filing Window</th>
                  <th style={{ width: '160px' }}>Default Routing</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(DENIAL_CATEGORIES).map(catKey => {
                  const cat = DENIAL_CATEGORIES[catKey];
                  const catItems = processedDenials.filter(d => d.denialCategory === catKey);
                  const totalDenied = catItems.reduce((acc, i) => acc + i.deniedAmount, 0);
                  const expectedRecov = catItems.reduce((acc, i) => acc + i.expectedRecovery, 0);

                  return (
                    <tr key={catKey} className="denial-row">
                      <td style={{ width: '220px' }}>
                        <div className="font-medium text-slate-200">{cat.label}</div>
                      </td>
                      <td style={{ width: '120px' }}>
                        <span className="status-pill bg-slate-800 text-slate-300 border-slate-700">
                          {cat.type}
                        </span>
                      </td>
                      <td style={{ width: '110px' }} className="text-right font-mono font-semibold text-slate-200">
                        {catItems.length}
                      </td>
                      <td style={{ width: '140px' }} className="text-right font-mono text-rose">
                        ${totalDenied.toFixed(2)}
                      </td>
                      <td style={{ width: '140px' }} className="text-right font-mono text-emerald">
                        ${expectedRecov.toFixed(2)}
                      </td>
                      <td style={{ width: '130px' }} className="text-center font-mono font-bold text-sky">
                        {cat.defaultProbability}%
                      </td>
                      <td style={{ width: '140px' }} className="text-center text-xs text-slate-300">
                        {cat.defaultFilingDays} days
                      </td>
                      <td style={{ width: '160px' }}>
                        <div className="text-xs text-slate-300 truncate">
                          {ASSIGNED_TEAMS[cat.defaultTeam]?.name.split('&')[0]}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* APPEAL INITIATION MODAL */}
      {appealModalItem && (
        <div className="denials-modal-backdrop" onClick={() => setAppealModalItem(null)}>
          <div className="denials-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-sky" />
                <h3 className="modal-title">Initiate Payer Appeal</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setAppealModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleExecuteAppeal}>
              <div className="modal-body">
                <div className="modal-meta-grid">
                  <div>
                    <span className="meta-label">Claim Number:</span>
                    <strong className="text-sky font-mono">{appealModalItem.claimNumber}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Patient:</span>
                    <strong className="text-slate-200">{appealModalItem.patientName}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Payer:</span>
                    <strong className="text-slate-200">{appealModalItem.payerName}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Denied Face Amount:</span>
                    <strong className="text-rose font-mono">${appealModalItem.deniedAmount.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="form-group mt-3">
                  <label className="form-label">Appeal Level</label>
                  <select
                    className="form-select"
                    value={appealLevel}
                    onChange={e => setAppealLevel(Number(e.target.value))}
                  >
                    <option value={1}>Level 1: Reconsideration / Informal Claim Review</option>
                    <option value={2}>Level 2: Formal Administrative Payer Appeal</option>
                    <option value={3}>Level 3: External Review / Administrative Law Judge (ALJ)</option>
                  </select>
                </div>

                <div className="form-group mt-3">
                  <label className="form-label">Payer Appeal Tracking # / Certified Mail Trace</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., APL-BCBS-2026-99214"
                    value={appealTrackingNum}
                    onChange={e => setAppealTrackingNum(e.target.value)}
                  />
                </div>

                <div className="form-group mt-3">
                  <label className="form-label">Clinical / Coding Rationale & Supporting Evidence</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Document clinical indications, operative note cross-references, or modifier 59 rationale..."
                    value={appealRationale}
                    onChange={e => setAppealRationale(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="rcm-btn rcm-btn-secondary"
                  onClick={() => setAppealModalItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rcm-btn rcm-btn-primary"
                >
                  Submit Appeal Package
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN OWNERSHIP MODAL */}
      {reassignModalItem && (
        <div className="denials-modal-backdrop" onClick={() => setReassignModalItem(null)}>
          <div className="denials-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <UserCheck size={18} className="text-sky" />
                <h3 className="modal-title">Reassign Denial Ownership</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setReassignModalItem(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleExecuteReassign}>
              <div className="modal-body">
                <p className="text-xs text-slate-400 mb-3">
                  Reassign claim <strong>{reassignModalItem.claimNumber}</strong> to a specialized team queue.
                </p>

                <div className="form-group">
                  <label className="form-label">Target Functional Team</label>
                  <select
                    className="form-select"
                    value={reassignTeam}
                    onChange={e => setReassignTeam(e.target.value)}
                  >
                    {Object.keys(ASSIGNED_TEAMS).map(tk => (
                      <option key={tk} value={tk}>{ASSIGNED_TEAMS[tk].name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group mt-3">
                  <label className="form-label">Assign To Specialist (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter specialist name or email..."
                    value={reassignSpecialist}
                    onChange={e => setReassignSpecialist(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="rcm-btn rcm-btn-secondary"
                  onClick={() => setReassignModalItem(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rcm-btn rcm-btn-primary"
                >
                  Confirm Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

