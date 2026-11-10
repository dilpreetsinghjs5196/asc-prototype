/**
 * RECURRING PAYER UNDERPAYMENT PATTERNS VIEW
 * Phase 93C — Revenue Cycle Management
 * 
 * Interactive clinical command center for identifying systemic multi-claim underpayment
 * patterns across commercial/Medicare payers, bundling validated claim cohorts into
 * actionable batch recovery opportunities, and projecting annualized revenue leakage.
 * 
 * Maestro Clinical Design System: ZERO PROHIBITED COLOR PALETTES
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  Search,
  RefreshCw,
  Download,
  Sparkles,
  Lock,
  Clock,
  Send,
  X,
  FileSpreadsheet,
  Check,
  Building2,
  BarChart2
} from 'lucide-react';
import payerPatternService, {
  PATTERN_ROOT_CAUSES,
  PATTERN_STATUSES,
  BATCH_STATUSES
} from '../lib/payerPatternService';
import './PayerUnderpaymentPatternsView.css';

export default function PayerUnderpaymentPatternsView() {
  const [patterns, setPatterns] = useState([]);
  const [selectedPatternId, setSelectedPatternId] = useState(null);
  const [activeTab, setActiveTab] = useState('patterns'); // 'patterns' | 'claims' | 'batches' | 'analytics'
  
  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [payerFilter, setPayerFilter] = useState('ALL');
  const [rootCauseFilter, setRootCauseFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [demandLetterModalOpen, setDemandLetterModalOpen] = useState(false);

  // Form states
  const [batchNotes, setBatchNotes] = useState('');
  const [batchAssignee, setBatchAssignee] = useState('usr-supervisor-1');
  const [demandLetterText, setDemandLetterText] = useState('');

  // Notifications
  const [actionNotice, setActionNotice] = useState(null);

  // Load data
  const refreshData = () => {
    const data = payerPatternService.getAllPatterns();
    setPatterns(data);
    if (!selectedPatternId && data.length > 0) {
      setSelectedPatternId(data[0].id);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const metrics = useMemo(() => {
    return payerPatternService.getMetrics();
  }, [patterns]);

  const selectedPattern = useMemo(() => {
    return patterns.find(p => p.id === selectedPatternId) || patterns[0] || null;
  }, [patterns, selectedPatternId]);

  // Statistical impact for selected pattern
  const selectedImpact = useMemo(() => {
    if (!selectedPattern) return null;
    return payerPatternService.calculate_pattern_financial_impact(selectedPattern.id);
  }, [selectedPattern]);

  // Filtered patterns
  const filteredPatterns = useMemo(() => {
    return patterns.filter(item => {
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchPayer = payerFilter === 'ALL' || item.payer_id === payerFilter;
      const matchRootCause = rootCauseFilter === 'ALL' || item.root_cause_code === rootCauseFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q ||
        item.pattern_code.toLowerCase().includes(q) ||
        item.payer_name.toLowerCase().includes(q) ||
        (item.cpt_hcpcs_code && item.cpt_hcpcs_code.toLowerCase().includes(q)) ||
        item.root_cause_code.toLowerCase().includes(q);

      return matchStatus && matchPayer && matchRootCause && matchQuery;
    });
  }, [patterns, statusFilter, payerFilter, rootCauseFilter, searchQuery]);

  // Unique payers
  const uniquePayers = useMemo(() => {
    const map = new Map();
    patterns.forEach(p => map.set(p.payer_id, p.payer_name));
    return Array.from(map.entries());
  }, [patterns]);

  // All batch opportunities
  const batchOpportunities = useMemo(() => {
    return patterns
      .map(p => p.batch_opportunity ? { ...p.batch_opportunity, pattern: p } : null)
      .filter(Boolean);
  }, [patterns]);

  // Quick Action: Create Batch Recovery Opportunity
  const handleCreateBatch = (e) => {
    e.preventDefault();
    if (!selectedPattern) return;

    try {
      payerPatternService.create_batch_recovery_opportunity(selectedPattern.id, {
        owner_user_id: batchAssignee,
        notes: batchNotes || 'Systemic batch dispute opportunity created.'
      });
      refreshData();
      setBatchModalOpen(false);
      setBatchNotes('');
      setActionNotice({
        type: 'success',
        text: `Batch Recovery Opportunity generated for ${selectedPattern.pattern_code} (${selectedPattern.validated_claim_count} claims).`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Open AI Systemic Demand Letter
  const handleOpenDemandLetter = (patternId) => {
    const id = patternId || (selectedPattern ? selectedPattern.id : null);
    if (!id) return;
    const text = payerPatternService.generateBatchDisputePackage(id);
    setDemandLetterText(text);
    setDemandLetterModalOpen(true);
  };

  // Quick Action: Re-evaluate pattern
  const handleRebuildPattern = (patternId) => {
    try {
      payerPatternService.rebuild_underpayment_pattern(patternId);
      refreshData();
      setActionNotice({
        type: 'success',
        text: `Pattern ${patternId} successfully re-evaluated against latest clinical validation status.`
      });
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    }
  };

  // Quick Action: Export Patterns CSV
  const handleExportCsv = () => {
    const headers = [
      'Pattern Code',
      'Payer',
      'Plan',
      'Root Cause',
      'CPT',
      'Total Claims',
      'Validated Claims',
      'Aggregate Variance',
      'Validated Recoverable',
      'Earliest Deadline',
      'Confidence',
      'Status'
    ];
    const rows = patterns.map(p => [
      p.pattern_code,
      p.payer_name,
      p.plan_name,
      p.root_cause_code,
      p.cpt_hcpcs_code || 'N/A',
      p.claim_count,
      p.validated_claim_count,
      p.aggregate_variance.toFixed(2),
      p.validated_recoverable_amount.toFixed(2),
      p.earliest_filing_deadline || 'N/A',
      p.confidence_level,
      p.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `payer_patterns_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="payer-patterns-container">
      {/* 1. Header Bar */}
      <div className="patterns-header-bar">
        <div className="patterns-header-left">
          <div className="patterns-phase-badge">Phase 93C • Recurring Payer Patterns</div>
          <div>
            <h1 className="patterns-header-title">Recurring Payer Underpayment Patterns & Batch Recovery</h1>
            <p className="patterns-header-subtitle">
              Systemic variance detection across payers, health plans, fee schedules, CPT codes & automated batch dispute bundling
            </p>
          </div>
        </div>
        <div className="patterns-header-actions">
          <button className="patterns-btn patterns-btn-secondary" onClick={refreshData}>
            <RefreshCw size={15} /> Sync State
          </button>
          <button className="patterns-btn patterns-btn-secondary" onClick={handleExportCsv}>
            <Download size={15} /> Export CSV
          </button>
          {selectedPattern && (
            <button className="patterns-btn patterns-btn-primary" onClick={() => handleOpenDemandLetter(selectedPattern.id)}>
              <Sparkles size={15} /> Draft Batch Demand Letter
            </button>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {actionNotice && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          backgroundColor: actionNotice.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${actionNotice.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
          color: actionNotice.type === 'error' ? '#fca5a5' : '#86efac',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 2. 5-Card KPI Ribbon */}
      <div className="patterns-kpi-grid">
        <div className="patterns-kpi-card kpi-border-blue">
          <div className="patterns-kpi-header">
            <span>Systemic Patterns</span>
            <Layers size={16} color="#0284c7" />
          </div>
          <p className="patterns-kpi-value">{metrics.totalPatterns}</p>
          <p className="patterns-kpi-subtext">{metrics.activePatterns} active pattern clusters</p>
        </div>

        <div className="patterns-kpi-card kpi-border-amber">
          <div className="patterns-kpi-header">
            <span>Affected Encounters</span>
            <FileSpreadsheet size={16} color="#f59e0b" />
          </div>
          <p className="patterns-kpi-value">{metrics.totalAffectedClaims}</p>
          <p className="patterns-kpi-subtext">{metrics.totalValidatedClaims} contractually validated</p>
        </div>

        <div className="patterns-kpi-card kpi-border-emerald">
          <div className="patterns-kpi-header">
            <span>Validated Exposure</span>
            <DollarSign size={16} color="#10b981" />
          </div>
          <p className="patterns-kpi-value">${metrics.totalValidatedRecoverable.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="patterns-kpi-subtext">Sum of confirmed recoverable $</p>
        </div>

        <div className="patterns-kpi-card kpi-border-cyan">
          <div className="patterns-kpi-header">
            <span>Batch Pipeline</span>
            <Send size={16} color="#06b6d4" />
          </div>
          <p className="patterns-kpi-value">${metrics.batchPipeline.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="patterns-kpi-subtext">Bundled in active dispute packets</p>
        </div>

        <div className="patterns-kpi-card kpi-border-slate">
          <div className="patterns-kpi-header">
            <span>Highest Impact Payer</span>
            <Building2 size={16} color="#94a3b8" />
          </div>
          <p className="patterns-kpi-value" style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {metrics.highestImpactPattern ? metrics.highestImpactPattern.payer_name.split(' ')[0] : 'N/A'}
          </p>
          <p className="patterns-kpi-subtext">
            {metrics.highestImpactPattern ? `$${metrics.highestImpactPattern.amount.toFixed(2)} (${metrics.highestImpactPattern.claim_count} cases)` : 'No active patterns'}
          </p>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="patterns-tabs-bar">
        <button
          className={`patterns-tab-btn ${activeTab === 'patterns' ? 'active' : ''}`}
          onClick={() => setActiveTab('patterns')}
        >
          <Layers size={15} /> Recurring Patterns ({filteredPatterns.length})
        </button>
        <button
          className={`patterns-tab-btn ${activeTab === 'claims' ? 'active' : ''}`}
          onClick={() => setActiveTab('claims')}
        >
          <FileText size={15} /> Pattern Deep-Dive & Claims {selectedPattern ? `(${selectedPattern.pattern_code})` : ''}
        </button>
        <button
          className={`patterns-tab-btn ${activeTab === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveTab('batches')}
        >
          <Send size={15} /> Batch Opportunities ({batchOpportunities.length})
        </button>
        <button
          className={`patterns-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={15} /> Payer Leakage Analytics
        </button>
      </div>

      {/* 4. Tab 1: Recurring Patterns Worklist */}
      {activeTab === 'patterns' && (
        <div className="patterns-panel">
          <div className="patterns-panel-header">
            <h2 className="patterns-panel-title">
              <TrendingUp size={18} color="#0284c7" /> Identified Systemic Payer Patterns
            </h2>
            <div className="patterns-filter-bar">
              <input
                type="text"
                className="patterns-search-input"
                placeholder="Search pattern, payer, CPT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <select
                className="patterns-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses ({patterns.length})</option>
                {Object.keys(PATTERN_STATUSES).map(st => (
                  <option key={st} value={st}>{PATTERN_STATUSES[st].label}</option>
                ))}
              </select>

              <select
                className="patterns-select"
                value={payerFilter}
                onChange={(e) => setPayerFilter(e.target.value)}
              >
                <option value="ALL">All Payers</option>
                {uniquePayers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>

              <select
                className="patterns-select"
                value={rootCauseFilter}
                onChange={(e) => setRootCauseFilter(e.target.value)}
              >
                <option value="ALL">All Root Causes</option>
                {Object.keys(PATTERN_ROOT_CAUSES).map(rc => (
                  <option key={rc} value={rc}>{PATTERN_ROOT_CAUSES[rc].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="patterns-table-container">
            <table className="patterns-table">
              <thead>
                <tr>
                  <th>Pattern Code</th>
                  <th>Payer / Health Plan</th>
                  <th>Root Cause</th>
                  <th>Procedure (CPT)</th>
                  <th>Encounters</th>
                  <th>Validated ($)</th>
                  <th>Earliest Deadline</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatterns.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                      No payer patterns match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredPatterns.map(item => {
                    const statusConfig = PATTERN_STATUSES[item.status] || { label: item.status, badgeColor: '#64748b' };
                    const rootCauseConfig = PATTERN_ROOT_CAUSES[item.root_cause_code] || { label: item.root_cause_code, badgeColor: '#64748b' };
                    const isSelected = selectedPattern && selectedPattern.id === item.id;

                    return (
                      <tr
                        key={item.id}
                        className={isSelected ? 'selected' : ''}
                        onClick={() => setSelectedPatternId(item.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                            {item.pattern_code}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {item.first_detected_date} to {item.last_detected_date}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{item.payer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.plan_name}</div>
                        </td>
                        <td>
                          <span
                            className="patterns-badge"
                            style={{
                              backgroundColor: `${rootCauseConfig.badgeColor}20`,
                              color: rootCauseConfig.badgeColor,
                              border: `1px solid ${rootCauseConfig.badgeColor}40`
                            }}
                          >
                            {rootCauseConfig.label}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#cbd5e1' }}>
                            {item.cpt_hcpcs_code || 'Multiple'}
                          </span>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.procedure_name}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#ffffff' }}>
                            {item.validated_claim_count} / {item.claim_count}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#10b981' }}>validated cases</div>
                        </td>
                        <td style={{ fontWeight: 700, color: '#10b981' }}>
                          ${item.validated_recoverable_amount.toFixed(2)}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: item.earliest_filing_deadline ? '#f59e0b' : '#64748b' }}>
                          {item.earliest_filing_deadline || 'None'}
                        </td>
                        <td>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: item.confidence_level === 'HIGH' ? '#10b981' : item.confidence_level === 'MEDIUM' ? '#f59e0b' : '#64748b'
                          }}>
                            {item.confidence_level}
                          </span>
                        </td>
                        <td>
                          <span
                            className="patterns-badge"
                            style={{
                              backgroundColor: `${statusConfig.badgeColor}20`,
                              color: statusConfig.badgeColor,
                              border: `1px solid ${statusConfig.badgeColor}50`
                            }}
                          >
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              className="patterns-btn patterns-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => { setSelectedPatternId(item.id); setActiveTab('claims'); }}
                              title="Inspect affected claims"
                            >
                              Inspect
                            </button>
                            {!item.batch_opportunity && item.status !== 'EXPIRED' && (
                              <button
                                className="patterns-btn patterns-btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => { setSelectedPatternId(item.id); setBatchModalOpen(true); }}
                                title="Create Batch Recovery Opportunity"
                              >
                                Bundle
                              </button>
                            )}
                          </div>
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

      {/* 5. Tab 2: Pattern Deep-Dive & Affected Claims Trace */}
      {activeTab === 'claims' && selectedPattern && (
        <div className="patterns-panel">
          <div className="patterns-panel-header">
            <div>
              <h2 className="patterns-panel-title">
                <FileText size={18} color="#0284c7" /> Pattern Deep-Dive: {selectedPattern.pattern_code}
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                {selectedPattern.notes}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="patterns-btn patterns-btn-secondary"
                onClick={() => handleRebuildPattern(selectedPattern.id)}
              >
                <RefreshCw size={14} /> Re-evaluate Cohort
              </button>
              {!selectedPattern.batch_opportunity && (
                <button
                  className="patterns-btn patterns-btn-primary"
                  onClick={() => setBatchModalOpen(true)}
                >
                  <Send size={14} /> Create Batch Opportunity
                </button>
              )}
            </div>
          </div>

          {/* Statistical Impact Sub-Ribbon */}
          {selectedImpact && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Avg Variance Per Encounter</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>${selectedImpact.averageShortPayPerCase.toFixed(2)}</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Estimated Monthly Frequency</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>{selectedImpact.monthlyFrequency} cases / mo</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Projected Annual Leakage</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>${selectedImpact.projectedAnnualExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Earliest Filing Deadline</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f59e0b' }}>{selectedPattern.earliest_filing_deadline || 'N/A'}</div>
              </div>
            </div>
          )}

          {/* Constituent Claims Table */}
          <div className="patterns-table-container">
            <table className="patterns-table">
              <thead>
                <tr>
                  <th>Claim Number</th>
                  <th>Date of Service</th>
                  <th>Patient Name</th>
                  <th>Expected Allowed</th>
                  <th>Actual Allowed</th>
                  <th>Variance ($)</th>
                  <th>Validation Status</th>
                  <th>Filing Deadline</th>
                </tr>
              </thead>
              <tbody>
                {selectedPattern.claims.map(c => (
                  <tr key={c.payment_variance_id}>
                    <td style={{ fontWeight: 600, color: '#ffffff' }}>{c.claim_number}</td>
                    <td style={{ color: '#cbd5e1' }}>{c.date_of_service}</td>
                    <td style={{ color: '#f8fafc' }}>{c.patient_name}</td>
                    <td style={{ color: '#cbd5e1' }}>${c.expected_allowed.toFixed(2)}</td>
                    <td style={{ color: '#64748b' }}>${c.actual_allowed.toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>${c.variance_amount.toFixed(2)}</td>
                    <td>
                      <span className="patterns-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        {c.validation_status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#f59e0b' }}>{c.filing_deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Batch Recovery Opportunities */}
      {activeTab === 'batches' && (
        <div className="patterns-panel">
          <div className="patterns-panel-header">
            <h2 className="patterns-panel-title">
              <Send size={18} color="#0284c7" /> Active Batch Recovery Opportunities
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              Multi-claim dispute packages prepared for formal submission to payer contracting leadership
            </p>
          </div>

          <div className="patterns-table-container">
            <table className="patterns-table">
              <thead>
                <tr>
                  <th>Batch Number</th>
                  <th>Pattern Reference</th>
                  <th>Payer</th>
                  <th>Claims</th>
                  <th>Potential ($)</th>
                  <th>Validated ($)</th>
                  <th>Earliest Deadline</th>
                  <th>Priority Score</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batchOpportunities.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                      No batch recovery opportunities generated yet. Go to "Recurring Patterns" to bundle a validated pattern.
                    </td>
                  </tr>
                ) : (
                  batchOpportunities.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>
                        {b.batch_number}
                      </td>
                      <td style={{ color: '#cbd5e1' }}>{b.pattern.pattern_code}</td>
                      <td style={{ fontWeight: 600, color: '#ffffff' }}>{b.pattern.payer_name}</td>
                      <td style={{ fontWeight: 700, color: '#ffffff' }}>{b.claim_count}</td>
                      <td style={{ color: '#94a3b8' }}>${b.potential_recovery.toFixed(2)}</td>
                      <td style={{ fontWeight: 700, color: '#10b981' }}>${b.validated_recovery.toFixed(2)}</td>
                      <td style={{ fontSize: '0.8rem', color: '#f59e0b' }}>{b.filing_deadline_earliest}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: b.priority_score >= 80 ? '#10b981' : '#f59e0b' }}>
                          {b.priority_score} / 100
                        </span>
                      </td>
                      <td>
                        <span className="patterns-badge" style={{ backgroundColor: 'rgba(2, 132, 199, 0.2)', color: '#38bdf8', border: '1px solid rgba(2, 132, 199, 0.4)' }}>
                          {b.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <button
                          className="patterns-btn patterns-btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => handleOpenDemandLetter(b.pattern_id)}
                        >
                          Demand Letter
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

      {/* 7. Tab 4: Payer Leakage Analytics */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="patterns-panel">
            <h3 className="patterns-panel-title">
              <Building2 size={18} color="#0284c7" /> Top Payer Variance Exposure
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {uniquePayers.map(([id, name]) => {
                const payerPatterns = patterns.filter(p => p.payer_id === id);
                const totalExposure = payerPatterns.reduce((sum, p) => sum + p.validated_recoverable_amount, 0);
                const claimSum = payerPatterns.reduce((sum, p) => sum + p.claim_count, 0);

                return (
                  <div key={id} style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: '#ffffff' }}>{name}</span>
                      <span style={{ fontWeight: 700, color: '#10b981' }}>${totalExposure.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {payerPatterns.length} systemic pattern(s) across {claimSum} surgical cases
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="patterns-panel">
            <h3 className="patterns-panel-title">
              <BarChart2 size={18} color="#10b981" /> Root Cause Breakdown
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.keys(PATTERN_ROOT_CAUSES).map(rc => {
                const matching = patterns.filter(p => p.root_cause_code === rc);
                if (matching.length === 0) return null;
                const totalVal = matching.reduce((sum, p) => sum + p.validated_recoverable_amount, 0);

                return (
                  <div key={rc} style={{ padding: '12px 14px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, color: '#ffffff' }}>{PATTERN_ROOT_CAUSES[rc].label}</span>
                      <span style={{ fontWeight: 700, color: '#f59e0b' }}>${totalVal.toFixed(2)}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {matching.length} pattern cohort(s) | {PATTERN_ROOT_CAUSES[rc].description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* 8. MODALS                                                                      */}
      {/* ============================================================================== */}

      {/* Modal 1: Create Batch Recovery Opportunity */}
      {batchModalOpen && selectedPattern && (
        <div className="patterns-modal-overlay">
          <div className="patterns-modal-content">
            <div className="patterns-modal-header">
              <h3 className="patterns-modal-title">Create Batch Recovery Dispute Packet</h3>
              <button
                onClick={() => setBatchModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateBatch}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '12px', background: '#1e293b', borderRadius: '8px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                  <div><strong>Pattern:</strong> {selectedPattern.pattern_code} | <strong>Payer:</strong> {selectedPattern.payer_name}</div>
                  <div><strong>Included Claims:</strong> {selectedPattern.validated_claim_count} validated surgical encounters</div>
                  <div><strong>Aggregate Recovery Target:</strong> ${selectedPattern.validated_recoverable_amount.toFixed(2)}</div>
                  <div><strong>Earliest Filing Deadline:</strong> {selectedPattern.earliest_filing_deadline || 'None'}</div>
                </div>

                <div className="patterns-form-group">
                  <label className="patterns-form-label">Assign Senior Dispute Negotiator</label>
                  <select
                    className="patterns-select"
                    value={batchAssignee}
                    onChange={(e) => setBatchAssignee(e.target.value)}
                  >
                    <option value="usr-supervisor-1">Marcus Vance (RCM Director)</option>
                    <option value="usr-analyst-1">Elena Rostova (Lead Billing Specialist)</option>
                    <option value="usr-finance-1">Sarah Jenkins (Treasury / Finance)</option>
                  </select>
                </div>

                <div className="patterns-form-group">
                  <label className="patterns-form-label">Batch Creation Notes & Justification</label>
                  <textarea
                    className="patterns-form-textarea"
                    placeholder="Enter strategic dispute rationale for payer contracting leadership..."
                    value={batchNotes}
                    onChange={(e) => setBatchNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="patterns-modal-actions">
                <button
                  type="button"
                  className="patterns-btn patterns-btn-secondary"
                  onClick={() => setBatchModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="patterns-btn patterns-btn-primary">
                  <Send size={14} /> Lock & Generate Batch Packet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Systemic Demand Letter Drafter */}
      {demandLetterModalOpen && (
        <div className="patterns-modal-overlay">
          <div className="patterns-modal-content" style={{ maxWidth: '740px' }}>
            <div className="patterns-modal-header">
              <h3 className="patterns-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#0284c7" /> AI Systemic Demand & Contract Audit Notice Drafter
              </h3>
              <button
                onClick={() => setDemandLetterModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '8px 12px', background: '#1e293b', borderRadius: '6px' }}>
                <strong style={{ color: '#38bdf8' }}>Executive Notice:</strong> This demand package bundles all constituent claims into an authoritative consolidated appeal letter for payer contracting departments.
              </div>
              <textarea
                className="patterns-form-textarea"
                style={{ minHeight: '340px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: '1.5' }}
                value={demandLetterText}
                onChange={(e) => setDemandLetterText(e.target.value)}
              />
            </div>
            <div className="patterns-modal-actions">
              <button
                type="button"
                className="patterns-btn patterns-btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(demandLetterText);
                  setActionNotice({ type: 'success', text: 'Demand letter copied to clipboard!' });
                  setDemandLetterModalOpen(false);
                }}
              >
                Copy to Clipboard
              </button>
              <button
                type="button"
                className="patterns-btn patterns-btn-primary"
                onClick={() => setDemandLetterModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

