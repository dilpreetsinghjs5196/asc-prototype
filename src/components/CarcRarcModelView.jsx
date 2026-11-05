import React, { useState, useMemo } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Search,
  Filter,
  Download,
  Play,
  RotateCcw,
  Shield,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  X,
  Plus
} from 'lucide-react';
import carcRarcService, {
  CARC_GROUP_CODES,
  ROOT_CAUSE_CATEGORIES,
  ACTION_WORKFLOWS,
  CARC_CATALOG,
  RARC_CATALOG,
  COMBINATORIAL_MAPPING_RULES,
  interpretAdjustment,
  calculateCarcKpis,
  getBaselineDenialQueue
} from '../lib/carcRarcService';
import './CarcRarcModelView.css';

export default function CarcRarcModelView() {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'carc_master' | 'rarc_master' | 'simulator'
  const [denialQueue, setDenialQueue] = useState(() => getBaselineDenialQueue());
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [rootCauseFilter, setRootCauseFilter] = useState('ALL');

  // Simulator State
  const [simGroup, setSimGroup] = useState('CO');
  const [simCarc, setSimCarc] = useState('197');
  const [simRarc, setSimRarc] = useState('N517');
  const [simAmount, setSimAmount] = useState('1850.00');

  // Modal State
  const [actionModalItem, setActionModalItem] = useState(null);
  const [selectedActionType, setSelectedActionType] = useState('APPEALABLE');
  const [actionNotes, setActionNotes] = useState('');

  // Processed interpretations for the queue
  const interpretedQueue = useMemo(() => {
    return denialQueue.map(item => {
      const interp = interpretAdjustment(item.groupCode, item.carcCode, item.rarcCode, item.amount);
      return {
        ...item,
        ...interp
      };
    });
  }, [denialQueue]);

  // Executive KPIs
  const kpis = useMemo(() => {
    return calculateCarcKpis(interpretedQueue);
  }, [interpretedQueue]);

  // Filtered Queue
  const filteredQueue = useMemo(() => {
    return interpretedQueue.filter(item => {
      const matchesGroup = groupFilter === 'ALL' || item.groupCode === groupFilter;
      const matchesRoot = rootCauseFilter === 'ALL' || item.rootCauseCategory === rootCauseFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        item.claimNumber.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.payerName.toLowerCase().includes(q) ||
        item.carcCode.toLowerCase().includes(q) ||
        (item.rarcCode && item.rarcCode.toLowerCase().includes(q));
      return matchesGroup && matchesRoot && matchesSearch;
    });
  }, [interpretedQueue, groupFilter, rootCauseFilter, searchQuery]);

  // CARC Master List Filtered
  const carcList = useMemo(() => {
    return Object.values(CARC_CATALOG).filter(c => {
      const matchesGroup = groupFilter === 'ALL' || c.groupCode === groupFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        c.code.toLowerCase().includes(q) ||
        c.shortDescription.toLowerCase().includes(q) ||
        c.formalTitle.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [groupFilter, searchQuery]);

  // RARC Master List Filtered
  const rarcList = useMemo(() => {
    return Object.values(RARC_CATALOG).filter(r => {
      const q = searchQuery.toLowerCase().trim();
      return !q || r.code.toLowerCase().includes(q) || r.shortDescription.toLowerCase().includes(q) || r.fullText.toLowerCase().includes(q);
    });
  }, [searchQuery]);

  // Simulator Result
  const simulationResult = useMemo(() => {
    return interpretAdjustment(simGroup, simCarc, simRarc || null, parseFloat(simAmount) || 0);
  }, [simGroup, simCarc, simRarc, simAmount]);

  // Action Handler
  const handleOpenActionModal = (item, actionType) => {
    setActionModalItem(item);
    setSelectedActionType(actionType);
    setActionNotes(item.guidanceText);
  };

  const handleExecuteAction = () => {
    if (!actionModalItem) return;
    setDenialQueue(prev => prev.map(d => {
      if (d.id === actionModalItem.id) {
        let newStatus = 'APPEAL_INITIATED';
        if (selectedActionType === 'CORRECT_AND_RESUBMIT') newStatus = 'REBILLED';
        if (selectedActionType === 'TRANSFER_TO_PATIENT') newStatus = 'PATIENT_BILLED';
        if (selectedActionType === 'CONTRACTUAL_WRITE_OFF' || selectedActionType === 'ADMIN_WRITE_OFF') newStatus = 'WRITTEN_OFF';
        return {
          ...d,
          status: newStatus
        };
      }
      return d;
    }));
    setActionModalItem(null);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Claim #', 'Patient Name', 'Payer', 'Group', 'CARC', 'RARC', 'Amount', 'Root Cause', 'Recovery %', 'Action', 'Status'];
    const rows = interpretedQueue.map(i => [
      `"${i.claimNumber}"`,
      `"${i.patientName}"`,
      `"${i.payerName}"`,
      i.groupCode,
      i.carcCode,
      i.rarcCode || '',
      i.amount.toFixed(2),
      `"${i.rootCauseDetails.label}"`,
      `${i.recoveryProbabilityPct}%`,
      `"${i.actionDetails.label}"`,
      i.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CARC_RARC_Denial_Analysis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="carc-rarc-container"
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
        className="carc-topbar"
        style={{
          backgroundColor: '#0f172a',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div className="carc-topbar-left">
          <div className="carc-header-icon-badge">
            <Shield size={22} className="text-sky" />
          </div>
          <div>
            <h1
              className="carc-title"
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
              CARC & RARC Denial Intelligence Matrix
            </h1>
            <p
              className="carc-subtitle"
              style={{
                color: '#94a3b8',
                fontSize: '13px',
                margin: 0,
                display: 'block'
              }}
            >
              Deterministic WEDI/X12 combinatorial reason code normalization, root-cause interpretation & recovery scoring.
            </p>
          </div>
        </div>
        <div className="carc-topbar-right">
          <button className="rcm-btn rcm-btn-secondary" onClick={() => setActiveTab('simulator')}>
            <Play size={14} />
            <span>Launch Code Simulator</span>
          </button>
          <button className="rcm-btn rcm-btn-secondary" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export Denial Scorecard</span>
          </button>
        </div>
      </div>

      {/* 2. 4-KPI Executive Ribbon */}
      <div className="carc-kpi-ribbon">
        <div className="carc-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Denial Exposure</span>
            <AlertTriangle size={16} className="text-rose" />
          </div>
          <div className="kpi-number text-rose">${kpis.totalDenialExposure.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">Active unadjudicated denial balances</div>
        </div>

        <div className="carc-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Appealable Opportunity</span>
            <TrendingUp size={16} className="text-emerald" />
          </div>
          <div className="kpi-number text-emerald">${kpis.appealableOpportunity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="kpi-subtext">Recoverable via appeal or rebill</div>
        </div>

        <div className="carc-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Clean Adjustment Share</span>
            <CheckCircle2 size={16} className="text-sky" />
          </div>
          <div className="kpi-number text-sky">{kpis.cleanAdjustmentShare}%</div>
          <div className="kpi-subtext">Contractual fee reductions (CO-45)</div>
        </div>

        <div className="carc-kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Top Root Cause</span>
            <Filter size={16} className="text-amber" />
          </div>
          <div className="kpi-number text-amber text-lg truncate" title={kpis.topRootCause}>{kpis.topRootCause}</div>
          <div className="kpi-subtext">Highest impact denial category</div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div
        className="carc-tabs-header"
        style={{
          backgroundColor: '#0f172a',
          padding: '4px 8px',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          marginBottom: '16px'
        }}
      >
        <button
          className={`carc-nav-tab ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <AlertTriangle size={15} />
          <span>Actionable Denial Queue ({filteredQueue.length})</span>
        </button>
        <button
          className={`carc-nav-tab ${activeTab === 'carc_master' ? 'active' : ''}`}
          onClick={() => setActiveTab('carc_master')}
        >
          <FileText size={15} />
          <span>CARC Reason Codes Master ({carcList.length})</span>
        </button>
        <button
          className={`carc-nav-tab ${activeTab === 'rarc_master' ? 'active' : ''}`}
          onClick={() => setActiveTab('rarc_master')}
        >
          <HelpCircle size={15} />
          <span>RARC Remark Codes Master ({rarcList.length})</span>
        </button>
        <button
          className={`carc-nav-tab ${activeTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveTab('simulator')}
        >
          <Play size={15} />
          <span>Code Combination Simulator</span>
        </button>
      </div>

      {/* TAB 1: ACTIONABLE DENIAL QUEUE */}
      {activeTab === 'queue' && (
        <div className="carc-content-section">
          <div className="carc-toolbar">
            <div className="filter-pills-row">
              <button
                className={`filter-pill ${groupFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setGroupFilter('ALL')}
              >
                All Groups
              </button>
              {Object.keys(CARC_GROUP_CODES).map(gk => (
                <button
                  key={gk}
                  className={`filter-pill ${groupFilter === gk ? 'active' : ''}`}
                  onClick={() => setGroupFilter(gk)}
                >
                  {gk} — {CARC_GROUP_CODES[gk].name}
                </button>
              ))}
            </div>

            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search claim, patient, CARC, RARC..."
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
            <table className="carc-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Claim & Patient</th>
                  <th style={{ width: '130px' }}>Payer & DOS</th>
                  <th style={{ width: '120px' }}>CARC / RARC</th>
                  <th style={{ width: '160px' }}>Root Cause</th>
                  <th style={{ width: '110px' }} className="text-right">Adjustment</th>
                  <th style={{ width: '90px' }} className="text-center">Recovery %</th>
                  <th style={{ width: '170px' }}>Recommended Action</th>
                  <th style={{ width: '110px' }} className="text-center">Status</th>
                  <th style={{ width: '110px' }} className="text-center">Workflow</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-cell">
                      <CheckCircle2 size={32} className="text-emerald mb-2" />
                      <div>No active denials matching the selected filters.</div>
                      <span className="text-xs text-slate-400">All claims are clean or settled.</span>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map(item => (
                    <tr key={item.id} className="carc-row">
                      <td style={{ width: '130px' }}>
                        <div className="font-semibold text-sky">{item.claimNumber}</div>
                        <div className="text-xs text-slate-300">{item.patientName}</div>
                        <div className="text-xs text-slate-500 font-mono">{item.patientMrn}</div>
                      </td>
                      <td style={{ width: '130px' }}>
                        <div className="font-medium text-slate-200">{item.payerName}</div>
                        <div className="text-xs text-slate-400">{item.dateOfService}</div>
                      </td>
                      <td style={{ width: '120px' }}>
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${CARC_GROUP_CODES[item.groupCode]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                            {item.groupCode}
                          </span>
                          <span className="font-mono text-amber font-bold">-{item.carcCode}</span>
                        </div>
                        {item.rarcCode && (
                          <div className="text-xs font-mono text-sky mt-1">RARC: {item.rarcCode}</div>
                        )}
                      </td>
                      <td style={{ width: '160px' }}>
                        <span className={`status-pill ${item.rootCauseDetails.badgeClass}`}>
                          {item.rootCauseDetails.label}
                        </span>
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1" title={item.guidanceText}>
                          {item.guidanceText}
                        </div>
                      </td>
                      <td style={{ width: '110px' }} className="text-right font-mono font-semibold text-rose">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td style={{ width: '90px' }} className="text-center">
                        <span className={`font-mono font-bold text-xs ${item.recoveryProbabilityPct >= 70 ? 'text-emerald' : item.recoveryProbabilityPct >= 40 ? 'text-amber' : 'text-rose'}`}>
                          {item.recoveryProbabilityPct}%
                        </span>
                      </td>
                      <td style={{ width: '170px' }}>
                        <div className="text-xs font-medium text-slate-200">{item.actionDetails.label}</div>
                        <div className="text-xs text-slate-400">{item.actionDetails.description}</div>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <span className={`status-pill ${
                          item.status === 'APPEAL_INITIATED' ? 'bg-amber-950/40 text-amber-400 border-amber-800' :
                          item.status === 'REBILLED' ? 'bg-sky-950/40 text-sky-400 border-sky-800' :
                          item.status === 'PATIENT_BILLED' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800' :
                          item.status === 'WRITTEN_OFF' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                          'bg-rose-950/40 text-rose-400 border-rose-800'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ width: '110px' }} className="text-center">
                        <button
                          className="table-action-btn"
                          onClick={() => handleOpenActionModal(item, item.actionWorkflow)}
                          title="Execute Action Workflow"
                        >
                          <span>Remediate</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="carc-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{filteredQueue.length}</strong> actionable claim denials
            </span>
            <span className="text-xs text-slate-400">
              Scroll table vertically to review full queue
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: CARC MASTER REPOSITORY */}
      {activeTab === 'carc_master' && (
        <div className="carc-content-section">
          <div className="carc-toolbar">
            <div className="filter-pills-row">
              <button
                className={`filter-pill ${groupFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setGroupFilter('ALL')}
              >
                All Group Codes
              </button>
              {Object.keys(CARC_GROUP_CODES).map(gk => (
                <button
                  key={gk}
                  className={`filter-pill ${groupFilter === gk ? 'active' : ''}`}
                  onClick={() => setGroupFilter(gk)}
                >
                  {gk}
                </button>
              ))}
            </div>
            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search CARC code or description..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="carc-table">
              <thead>
                <tr>
                  <th style={{ width: '85px' }}>CARC Code</th>
                  <th style={{ width: '75px' }}>Group</th>
                  <th style={{ width: '200px' }}>Short Description</th>
                  <th style={{ width: '280px' }}>Formal Official Definition</th>
                  <th style={{ width: '130px' }}>Category</th>
                  <th style={{ width: '100px' }} className="text-center">Recovery %</th>
                  <th style={{ width: '160px' }}>Default Action</th>
                </tr>
              </thead>
              <tbody>
                {carcList.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <Search size={32} className="text-sky mb-2" />
                      <div>No CARC reason codes found matching "{searchQuery}".</div>
                      <span className="text-xs text-slate-400">Try selecting "All Group Codes" or clearing the search box.</span>
                    </td>
                  </tr>
                ) : (
                  carcList.map(c => (
                    <tr key={c.code} className="carc-row">
                      <td style={{ width: '85px' }}>
                        <span className="font-mono font-bold text-amber">{c.code}</span>
                      </td>
                      <td style={{ width: '75px' }}>
                        <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${CARC_GROUP_CODES[c.groupCode]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {c.groupCode}
                        </span>
                      </td>
                      <td style={{ width: '200px' }}>
                        <div className="font-medium text-slate-200">{c.shortDescription}</div>
                      </td>
                      <td style={{ width: '280px' }}>
                        <div className="text-xs text-slate-400">{c.formalTitle}</div>
                      </td>
                      <td style={{ width: '130px' }}>
                        <span className="status-pill bg-slate-800 text-slate-300 border-slate-700">
                          {c.category}
                        </span>
                      </td>
                      <td style={{ width: '100px' }} className="text-center">
                        <span className={`font-mono font-bold text-xs ${c.recoveryLikelihoodPct >= 70 ? 'text-emerald' : c.recoveryLikelihoodPct >= 30 ? 'text-amber' : 'text-rose'}`}>
                          {c.recoveryLikelihoodPct}%
                        </span>
                      </td>
                      <td style={{ width: '160px' }}>
                        <span className={`status-pill ${ACTION_WORKFLOWS[c.defaultAction]?.badgeClass || 'bg-slate-800 text-slate-300'}`}>
                          {ACTION_WORKFLOWS[c.defaultAction]?.label || c.defaultAction}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="carc-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{carcList.length}</strong> of <strong className="text-slate-200">{Object.keys(CARC_CATALOG).length}</strong> official ASC CARC reason codes
            </span>
            <span className="text-xs text-sky font-medium">
              ↓ Scroll table vertically or use filters above to review all {carcList.length} codes
            </span>
          </div>
        </div>
      )}

      {/* TAB 3: RARC MASTER REPOSITORY */}
      {activeTab === 'rarc_master' && (
        <div className="carc-content-section">
          <div className="carc-toolbar">
            <div className="text-sm font-semibold text-slate-300">
              Official Remittance Advice Remark Codes (RARC) Master Catalog
            </div>
            <div className="search-box-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search RARC code, text..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="carc-table">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>RARC Code</th>
                  <th style={{ width: '140px' }}>Code Type</th>
                  <th style={{ width: '260px' }}>Short Description</th>
                  <th style={{ width: '450px' }}>Full Remittance Explanation & Policy Text</th>
                </tr>
              </thead>
              <tbody>
                {rarcList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="empty-cell">
                      <Search size={32} className="text-sky mb-2" />
                      <div>No RARC remark codes found matching "{searchQuery}".</div>
                      <span className="text-xs text-slate-400">Try adjusting your search query.</span>
                    </td>
                  </tr>
                ) : (
                  rarcList.map(r => (
                    <tr key={r.code} className="carc-row">
                      <td style={{ width: '90px' }}>
                        <span className="font-mono font-bold text-sky">{r.code}</span>
                      </td>
                      <td style={{ width: '140px' }}>
                        <span className={`status-pill ${r.codeType === 'SUPPLEMENTAL' ? 'bg-sky-950/40 text-sky-400 border-sky-800' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                          {r.codeType}
                        </span>
                      </td>
                      <td style={{ width: '260px' }}>
                        <div className="font-medium text-slate-200">{r.shortDescription}</div>
                      </td>
                      <td style={{ width: '450px' }}>
                        <div className="text-xs text-slate-300">{r.fullText}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="carc-table-footer">
            <span className="text-xs text-slate-400">
              Showing <strong className="text-slate-200">{rarcList.length}</strong> of <strong className="text-slate-200">{Object.keys(RARC_CATALOG).length}</strong> official ASC RARC remark codes
            </span>
            <span className="text-xs text-sky font-medium">
              Scroll table vertically to view all codes ↓
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: CODE COMBINATION SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="carc-content-section">
          <div className="simulator-grid">
            {/* Input Controls */}
            <div className="simulator-card">
              <div className="sim-card-header">
                <Play size={18} className="text-sky" />
                <h3 className="sim-title">CARC + RARC Adjudication Simulator</h3>
              </div>
              <p className="sim-desc">
                Select any Claim Adjustment Group Code, CARC reason code, and optional RARC remark to compute deterministic root causes, appealability, and recovery odds.
              </p>

              <div className="sim-form-group">
                <label className="sim-label">Group Code</label>
                <div className="sim-pill-group">
                  {Object.keys(CARC_GROUP_CODES).map(gk => (
                    <button
                      key={gk}
                      type="button"
                      className={`sim-choice-pill ${simGroup === gk ? 'active' : ''}`}
                      onClick={() => setSimGroup(gk)}
                    >
                      {gk} ({CARC_GROUP_CODES[gk].name})
                    </button>
                  ))}
                </div>
              </div>

              <div className="sim-form-group">
                <label className="sim-label">CARC Reason Code</label>
                <select
                  className="sim-select"
                  value={simCarc}
                  onChange={e => setSimCarc(e.target.value)}
                >
                  {Object.values(CARC_CATALOG).map(c => (
                    <option key={c.code} value={c.code}>
                      CARC {c.code} — {c.shortDescription}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sim-form-group">
                <label className="sim-label">RARC Remark Code (Optional)</label>
                <select
                  className="sim-select"
                  value={simRarc}
                  onChange={e => setSimRarc(e.target.value)}
                >
                  <option value="">(None / No RARC provided)</option>
                  {Object.values(RARC_CATALOG).map(r => (
                    <option key={r.code} value={r.code}>
                      RARC {r.code} — {r.shortDescription}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sim-form-group">
                <label className="sim-label">Adjustment Amount ($)</label>
                <input
                  type="number"
                  className="sim-input"
                  value={simAmount}
                  onChange={e => setSimAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
            </div>

            {/* Live Diagnosis Panel */}
            <div className="simulator-card diagnosis-card">
              <div className="sim-card-header">
                <CheckCircle2 size={18} className="text-emerald" />
                <h3 className="sim-title">Deterministic Adjudication Diagnosis</h3>
              </div>

              <div className="diagnosis-kpis">
                <div className="diag-kpi">
                  <span className="diag-label">Root Cause Category</span>
                  <div className="mt-1">
                    <span className={`status-pill ${simulationResult.rootCauseDetails.badgeClass}`}>
                      {simulationResult.rootCauseDetails.label}
                    </span>
                  </div>
                </div>

                <div className="diag-kpi">
                  <span className="diag-label">Estimated Recovery Likelihood</span>
                  <div className={`text-2xl font-bold font-mono mt-1 ${simulationResult.recoveryProbabilityPct >= 70 ? 'text-emerald' : simulationResult.recoveryProbabilityPct >= 30 ? 'text-amber' : 'text-rose'}`}>
                    {simulationResult.recoveryProbabilityPct}%
                  </div>
                </div>

                <div className="diag-kpi">
                  <span className="diag-label">Recommended Workflow</span>
                  <div className="mt-1">
                    <span className={`status-pill ${simulationResult.actionDetails.badgeClass}`}>
                      {simulationResult.actionDetails.label}
                    </span>
                  </div>
                </div>

                <div className="diag-kpi">
                  <span className="diag-label">Priority Level</span>
                  <div className="mt-1">
                    <span className={`status-pill ${simulationResult.priorityLevel === 'CRITICAL' || simulationResult.priorityLevel === 'HIGH' ? 'bg-rose-950/40 text-rose-400 border-rose-800' : 'bg-slate-800 text-slate-300'}`}>
                      {simulationResult.priorityLevel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="guidance-box">
                <div className="guidance-title">
                  <AlertTriangle size={15} className="text-amber" />
                  <span>Actionable Remediation Protocol</span>
                </div>
                <p className="guidance-body">
                  {simulationResult.guidanceText}
                </p>
              </div>

              <div className="code-metadata-breakdown">
                <div className="meta-row">
                  <span className="meta-lbl">Group Interpretation:</span>
                  <span className="meta-val">{CARC_GROUP_CODES[simGroup]?.description}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-lbl">CARC Description:</span>
                  <span className="meta-val">{simulationResult.carcMeta.formalTitle}</span>
                </div>
                {simulationResult.rarcMeta && (
                  <div className="meta-row">
                    <span className="meta-lbl">RARC Remark:</span>
                    <span className="meta-val">{simulationResult.rarcMeta.fullText}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Remediation Modal */}
      {actionModalItem && (
        <div className="carc-modal-overlay">
          <div className="carc-modal-card">
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-sky" />
                <h3 className="modal-title">Denial Remediation Action</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setActionModalItem(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-claim-banner">
                <div>
                  <span className="text-xs text-slate-400 uppercase">Target Claim</span>
                  <div className="font-semibold text-sky">{actionModalItem.claimNumber}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase">Patient</span>
                  <div className="font-medium text-slate-200">{actionModalItem.patientName}</div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase">Denied Amount</span>
                  <div className="font-bold font-mono text-rose">${actionModalItem.amount.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4">
                <label className="sim-label">Action Workflow</label>
                <div className="sim-pill-group">
                  {Object.keys(ACTION_WORKFLOWS).map(ak => (
                    <button
                      key={ak}
                      type="button"
                      className={`sim-choice-pill ${selectedActionType === ak ? 'active' : ''}`}
                      onClick={() => setSelectedActionType(ak)}
                    >
                      {ACTION_WORKFLOWS[ak].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="sim-label">Remediation Notes / Appeal Justification</label>
                <textarea
                  className="modal-textarea"
                  rows="4"
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder="Enter clinical appeal argument or rebilling modifier details..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="rcm-btn rcm-btn-secondary" onClick={() => setActionModalItem(null)}>
                Cancel
              </button>
              <button className="rcm-btn rcm-btn-primary" onClick={handleExecuteAction}>
                <CheckCircle2 size={14} />
                <span>Confirm & Post Workflow</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

