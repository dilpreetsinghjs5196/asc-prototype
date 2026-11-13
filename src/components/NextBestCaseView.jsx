import React, { useState, useMemo } from 'react';
import {
  Award,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  Clock,
  Layers,
  ChevronRight,
  X,
  FileCheck,
  Activity,
  Zap,
  ArrowRight,
  ShieldCheck,
  Sliders,
  DollarSign,
  TrendingUp,
  UserCheck,
  UserX,
  Send,
  PhoneCall,
  Check,
  CalendarCheck
} from 'lucide-react';
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_BENCHMARK_MARGIN,
  PRIOR_AUTH_STATUSES,
  DISQUALIFICATION_REASONS,
  RECOMMENDATION_STATUSES,
  calculateReadinessScore,
  calculateProbabilityScore,
  calculateFinancialScore,
  calculateTimeFitScore,
  calculateCompositeFitScore,
  rankCandidatesForSlot,
  calculateFacilityNbcKpis,
  filterNbcRecommendations,
  SEED_OPEN_SLOTS,
  SEED_BACKLOG_CASES
} from '../services/nextBestCaseService';
import './NextBestCaseView.css';

export default function NextBestCaseView() {
  const [activeTab, setActiveTab] = useState('ranked'); // 'ranked', 'radar', 'backlog'
  const [slots] = useState(SEED_OPEN_SLOTS);
  const [selectedSlotId, setSelectedSlotId] = useState(SEED_OPEN_SLOTS[0].id);
  const [backlogCases, setBacklogCases] = useState(SEED_BACKLOG_CASES);
  const [weights, setWeights] = useState(DEFAULT_SCORING_WEIGHTS);
  const [benchmarkMargin, setBenchmarkMargin] = useState(DEFAULT_BENCHMARK_MARGIN);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [qualificationFilter, setQualificationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals: 'OFFER', 'BOOK', 'AUDIT'
  const [modalType, setModalType] = useState(null);
  const [activeRecommendation, setActiveRecommendation] = useState(null);

  // Form States for Modals
  const [offerContactName, setOfferContactName] = useState('Sarah Miller, Lead Surgical Coordinator');
  const [offerNotes, setOfferNotes] = useState('Priority 240m morning orthopedic slot available; patient pre-op cleared.');
  const [bookingConfirmationId, setBookingConfirmationId] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Currently Selected Target Open Slot
  const currentSlot = useMemo(() => {
    return slots.find(s => s.id === selectedSlotId) || slots[0];
  }, [slots, selectedSlotId]);

  // Dynamically compute rankings for currentSlot with active weights
  const recommendations = useMemo(() => {
    return rankCandidatesForSlot(backlogCases, currentSlot, weights, benchmarkMargin);
  }, [backlogCases, currentSlot, weights, benchmarkMargin]);

  // Filtered recommendations
  const filteredRecs = useMemo(() => {
    return filterNbcRecommendations(recommendations, {
      specialty: specialtyFilter,
      qualification: qualificationFilter,
      status: statusFilter,
      searchQuery: searchTerm
    });
  }, [recommendations, specialtyFilter, qualificationFilter, statusFilter, searchTerm]);

  // Aggregate KPIs
  const kpis = useMemo(() => {
    return calculateFacilityNbcKpis(recommendations, backlogCases);
  }, [recommendations, backlogCases]);

  // Modal Handlers
  const handleOpenOffer = (rec) => {
    setActiveRecommendation(rec);
    setOfferContactName(`Clinic Sched for ${rec.surgeonName}`);
    setOfferNotes(`Offering ${currentSlot.slotDurationMinutes}m slot on ${currentSlot.slotDate} (${currentSlot.startTime}–${currentSlot.endTime}) for ${rec.patientName}.`);
    setModalType('OFFER');
  };

  const handleOpenBook = (rec) => {
    setActiveRecommendation(rec);
    setBookingConfirmationId(`OR-CONF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setModalType('BOOK');
  };

  const handleOpenAudit = (rec) => {
    setActiveRecommendation(rec);
    setModalType('AUDIT');
  };

  const handleCloseModal = () => {
    setModalType(null);
    setActiveRecommendation(null);
  };

  const handleConfirmOffer = (e) => {
    e.preventDefault();
    if (!activeRecommendation) return;

    // Update case status
    setBacklogCases(prev => prev.map(c => {
      if (c.id === activeRecommendation.backlogCaseId) {
        return { ...c, backlogStatus: 'OFFER_PENDING' };
      }
      return c;
    }));

    showToast(`Slot offer dispatched to clinic for ${activeRecommendation.patientName} (${activeRecommendation.surgeonName})`);
    handleCloseModal();
  };

  const handleConfirmBook = (e) => {
    e.preventDefault();
    if (!activeRecommendation) return;

    setBacklogCases(prev => prev.map(c => {
      if (c.id === activeRecommendation.backlogCaseId) {
        return { ...c, backlogStatus: 'SCHEDULED' };
      }
      return c;
    }));

    showToast(`Case successfully booked! Confirmation: ${bookingConfirmationId}`);
    handleCloseModal();
  };

  const handleResetData = () => {
    setBacklogCases(SEED_BACKLOG_CASES);
    setWeights(DEFAULT_SCORING_WEIGHTS);
    setBenchmarkMargin(DEFAULT_BENCHMARK_MARGIN);
    showToast('Simulation waitlist and scoring weights reset to baseline.');
  };

  return (
    <div className="nbc-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="nbc-toast">
          <CheckCircle2 className="nbc-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="nbc-header-banner">
        <div className="nbc-header-main">
          <div className="nbc-header-title-row">
            <h1 className="nbc-title">Next Best Case Matching &amp; Capacity Allocation Engine</h1>
            <span className="nbc-badge-pill nbc-badge-blue">Phase AA / A10</span>
            <span className="nbc-badge-pill nbc-badge-emerald">Module 10</span>
          </div>
          <p className="nbc-subtitle">
            Deterministic multi-pillar ranking of surgical waitlist backlogs for open capacity slots using
            pre-op readiness, booking probability, contribution margin yield, and physical duration constraints.
          </p>
        </div>
        <div className="nbc-header-actions">
          <button className="nbc-btn nbc-btn-secondary" onClick={handleResetData}>
            <RefreshCw size={15} />
            <span>Reset Demo State</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="nbc-ribbon-grid">
        {/* Card 1: Backlog Candidates */}
        <div className="nbc-kpi-card nbc-border-blue">
          <div className="nbc-kpi-header">
            <span className="nbc-kpi-label">Active Waitlist Backlog</span>
            <span className="nbc-kpi-icon nbc-icon-blue">
              <Layers size={18} />
            </span>
          </div>
          <div className="nbc-kpi-value-row">
            <span className="nbc-kpi-value">{kpis.totalBacklogCount}</span>
            <span className="nbc-kpi-unit">cases</span>
          </div>
          <div className="nbc-kpi-subtext">
            <span>{kpis.qualifiedCandidatesCount} qualified for current slot</span>
          </div>
        </div>

        {/* Card 2: Top Match Fit Score */}
        <div className="nbc-kpi-card nbc-border-emerald">
          <div className="nbc-kpi-header">
            <span className="nbc-kpi-label">Top Recommendation Score</span>
            <span className="nbc-kpi-icon nbc-icon-emerald">
              <Award size={18} />
            </span>
          </div>
          <div className="nbc-kpi-value-row">
            <span className="nbc-kpi-value">{kpis.topRankedFitScore}</span>
            <span className="nbc-kpi-unit">/ 100</span>
          </div>
          <div className="nbc-kpi-subtext">
            <span>{kpis.topRankedCandidate ? `Rank #1: ${kpis.topRankedCandidate.patientName}` : 'No candidate qualified'}</span>
          </div>
        </div>

        {/* Card 3: Potential Margin */}
        <div className="nbc-kpi-card nbc-border-emerald">
          <div className="nbc-kpi-header">
            <span className="nbc-kpi-label">Potential Realized Margin</span>
            <span className="nbc-kpi-icon nbc-icon-emerald">
              <DollarSign size={18} />
            </span>
          </div>
          <div className="nbc-kpi-value-row">
            <span className="nbc-kpi-value">${kpis.totalPotentialMargin.toLocaleString()}</span>
          </div>
          <div className="nbc-kpi-subtext">
            <span>Aggregated across {kpis.qualifiedCandidatesCount} qualified backfill cases</span>
          </div>
        </div>

        {/* Card 4: Clinical Readiness */}
        <div className="nbc-kpi-card nbc-border-blue">
          <div className="nbc-kpi-header">
            <span className="nbc-kpi-label">Average Clinical Readiness</span>
            <span className="nbc-kpi-icon nbc-icon-blue">
              <ShieldCheck size={18} />
            </span>
          </div>
          <div className="nbc-kpi-value-row">
            <span className="nbc-kpi-value">{kpis.avgReadinessPct}%</span>
          </div>
          <div className="nbc-kpi-subtext">
            <span>Prior auth, H&amp;P, labs &amp; consents evaluated</span>
          </div>
        </div>

        {/* Card 5: Duration Fit Match */}
        <div className="nbc-kpi-card nbc-border-amber">
          <div className="nbc-kpi-header">
            <span className="nbc-kpi-label">Slot Duration Fit Ratio</span>
            <span className="nbc-kpi-icon nbc-icon-amber">
              <Clock size={18} />
            </span>
          </div>
          <div className="nbc-kpi-value-row">
            <span className="nbc-kpi-value">{kpis.avgDurationUtilizationPct}%</span>
          </div>
          <div className="nbc-kpi-subtext">
            <span>Target: 75% to 95% of contiguous slot</span>
          </div>
        </div>
      </div>

      {/* Target Open Slot Selector Bar */}
      <div className="nbc-slot-selector-card">
        <div className="nbc-selector-header">
          <div className="nbc-selector-label-group">
            <span className="nbc-selector-tag">Active Target Slot</span>
            <h3 className="nbc-selector-title">{currentSlot.roomName} &bull; {currentSlot.slotDate} ({currentSlot.dayOfWeek})</h3>
          </div>
          <div className="nbc-slot-picker-wrap">
            <label className="nbc-picker-label">Switch Open Slot:</label>
            <select
              className="nbc-picker-select"
              value={selectedSlotId}
              onChange={(e) => setSelectedSlotId(e.target.value)}
            >
              {slots.map(s => (
                <option key={s.id} value={s.id}>
                  {s.roomName} &ndash; {s.slotDate} ({(s.slotDurationMinutes / 60).toFixed(1)}h / {s.slotDurationMinutes}m)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="nbc-slot-meta-row">
          <div className="nbc-slot-meta-item">
            <span className="nbc-slot-meta-key">Time Window:</span>
            <span className="nbc-slot-meta-val">{currentSlot.startTime} &ndash; {currentSlot.endTime}</span>
          </div>
          <div className="nbc-slot-meta-item">
            <span className="nbc-slot-meta-key">Contiguous Duration:</span>
            <span className="nbc-slot-meta-val">{(currentSlot.slotDurationMinutes / 60).toFixed(1)} hrs ({currentSlot.slotDurationMinutes} mins)</span>
          </div>
          <div className="nbc-slot-meta-item">
            <span className="nbc-slot-meta-key">Lead Time Notice:</span>
            <span className="nbc-slot-meta-val">{currentSlot.leadTimeHours} hours ({(currentSlot.leadTimeHours / 24).toFixed(1)} days)</span>
          </div>
          <div className="nbc-slot-meta-item">
            <span className="nbc-slot-meta-key">Suite Focus:</span>
            <span className="nbc-slot-meta-val">{currentSlot.assignedSpecialtyCode}</span>
          </div>
          <div className="nbc-slot-desc-text">
            <span>{currentSlot.slotDescription}</span>
          </div>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="nbc-nav-tabs">
        <button
          className={`nbc-nav-tab ${activeTab === 'ranked' ? 'nbc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('ranked')}
        >
          <Award size={16} />
          <span>Ranked Candidate Cases Ledger</span>
          <span className="nbc-tab-count">{recommendations.length}</span>
        </button>

        <button
          className={`nbc-nav-tab ${activeTab === 'radar' ? 'nbc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          <Sliders size={16} />
          <span>Multi-Pillar Scoring Weights &amp; Radar</span>
        </button>

        <button
          className={`nbc-nav-tab ${activeTab === 'backlog' ? 'nbc-nav-tab-active' : ''}`}
          onClick={() => setActiveTab('backlog')}
        >
          <FileCheck size={16} />
          <span>Backlog Clinical Readiness Queue</span>
          <span className="nbc-tab-count">{backlogCases.length}</span>
        </button>
      </div>

      {/* TAB 1: RANKED CANDIDATE CASES LEDGER */}
      {activeTab === 'ranked' && (
        <div className="nbc-tab-content">
          {/* Filter Bar */}
          <div className="nbc-filter-bar">
            <div className="nbc-search-wrapper">
              <Search className="nbc-search-icon" size={16} />
              <input
                type="text"
                className="nbc-search-input"
                placeholder="Search patient, surgeon, procedure, or CPT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="nbc-search-clear" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="nbc-filter-controls">
              <div className="nbc-filter-group">
                <label className="nbc-filter-label">Specialty:</label>
                <select
                  className="nbc-select"
                  value={specialtyFilter}
                  onChange={(e) => setSpecialtyFilter(e.target.value)}
                >
                  <option value="ALL">All Specialties</option>
                  <option value="ORTHOPEDICS">Orthopedic</option>
                  <option value="GENERAL_SURGERY">General Surgery</option>
                  <option value="OPHTHALMOLOGY">Ophthalmology</option>
                  <option value="SPINE_SURGERY">Spine Surgery</option>
                </select>
              </div>

              <div className="nbc-filter-group">
                <label className="nbc-filter-label">Gate Status:</label>
                <select
                  className="nbc-select"
                  value={qualificationFilter}
                  onChange={(e) => setQualificationFilter(e.target.value)}
                >
                  <option value="ALL">All Candidates</option>
                  <option value="QUALIFIED">Qualified Cases Only</option>
                  <option value="DISQUALIFIED">Disqualified Only</option>
                </select>
              </div>

              <div className="nbc-filter-group">
                <label className="nbc-filter-label">Status:</label>
                <select
                  className="nbc-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="RANKED">Ranked</option>
                  <option value="OFFERED_TO_SURGEON">Offered</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="BOOKED_IN_OR">Booked</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="nbc-table-wrapper">
            <table className="nbc-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Patient &amp; Procedure</th>
                  <th>Surgeon &amp; Specialty</th>
                  <th>Duration / Slot Fit</th>
                  <th>Pillar Score Breakdown</th>
                  <th>NBC Fit Score</th>
                  <th>Gate / Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="nbc-empty-row">
                      <div className="nbc-empty-state">
                        <AlertCircle size={32} className="nbc-empty-icon" />
                        <p className="nbc-empty-title">No candidate cases match criteria</p>
                        <p className="nbc-empty-sub">Adjust your filter options or select another target open slot.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredRecs.map((rec) => {
                    const isTop = rec.rankPosition === 1 && !rec.isDisqualified;

                    return (
                      <tr key={rec.backlogCaseId} className={`nbc-table-row ${isTop ? 'nbc-row-top-match' : ''} ${rec.isDisqualified ? 'nbc-row-disqualified' : ''}`}>
                        <td>
                          <div className={`nbc-rank-circle ${isTop ? 'nbc-rank-top' : ''} ${rec.isDisqualified ? 'nbc-rank-disq' : ''}`}>
                            {rec.isDisqualified ? <X size={12} /> : `#${rec.rankPosition}`}
                          </div>
                        </td>
                        <td>
                          <div className="nbc-patient-col">
                            <span className="nbc-patient-name">{rec.patientName}</span>
                            <span className="nbc-patient-proc">{rec.procedureName}</span>
                            <span className="nbc-cpt-tag">CPT {rec.primaryCptCode} &bull; {rec.patientMrn}</span>
                          </div>
                        </td>
                        <td>
                          <div className="nbc-surgeon-col">
                            <span className="nbc-surgeon-name">{rec.surgeonName}</span>
                            <span className="nbc-specialty-badge">{rec.specialtyCode}</span>
                          </div>
                        </td>
                        <td>
                          <div className="nbc-duration-fit-col">
                            <div className="nbc-dur-line">
                              <Clock size={12} />
                              <span>{rec.predictedDurationMinutes}m Case</span>
                            </div>
                            <div className="nbc-util-bar-track">
                              <div
                                className={`nbc-util-bar-fill ${rec.durationUtilizationPct > 100 ? 'nbc-fill-crimson' : rec.durationUtilizationPct >= 75 ? 'nbc-fill-emerald' : 'nbc-fill-amber'}`}
                                style={{ width: `${Math.min(100, rec.durationUtilizationPct)}%` }}
                              />
                            </div>
                            <span className="nbc-util-label">{rec.durationUtilizationPct}% of {currentSlot.slotDurationMinutes}m slot</span>
                          </div>
                        </td>
                        <td>
                          <div className="nbc-pillars-col">
                            <div className="nbc-pillar-mini" title="Readiness Score (30%)">
                              <span className="nbc-p-label">Ready:</span>
                              <span className="nbc-p-val">{rec.readinessScore.toFixed(0)}</span>
                            </div>
                            <div className="nbc-pillar-mini" title="Probability Score (25%)">
                              <span className="nbc-p-label">Prob:</span>
                              <span className="nbc-p-val">{rec.probabilityScore.toFixed(0)}</span>
                            </div>
                            <div className="nbc-pillar-mini" title="Financial Score (25%)">
                              <span className="nbc-p-label">Margin:</span>
                              <span className="nbc-p-val">{rec.financialScore.toFixed(0)}</span>
                            </div>
                            <div className="nbc-pillar-mini" title="Time & Physical Slot Fit (20%)">
                              <span className="nbc-p-label">Fit:</span>
                              <span className="nbc-p-val">{rec.timeFitScore.toFixed(0)}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="nbc-score-col">
                            {rec.isDisqualified ? (
                              <span className="nbc-score-disq">0.0</span>
                            ) : (
                              <div className="nbc-score-wrap">
                                <span className={`nbc-score-num ${rec.compositeFitScore >= 80 ? 'nbc-score-high' : 'nbc-score-mid'}`}>
                                  {rec.compositeFitScore.toFixed(1)}
                                </span>
                                <span className="nbc-margin-sub">${rec.projectedContributionMargin.toLocaleString()} margin</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {rec.isDisqualified ? (
                            <span className="nbc-badge-pill nbc-badge-crimson" title={DISQUALIFICATION_REASONS[rec.disqualificationReason]?.description || rec.disqualificationReason}>
                              {DISQUALIFICATION_REASONS[rec.disqualificationReason]?.label || rec.disqualificationReason}
                            </span>
                          ) : (
                            <span className={`nbc-badge-pill ${rec.backlogStatus === 'OFFER_PENDING' ? 'nbc-badge-amber' : rec.backlogStatus === 'SCHEDULED' ? 'nbc-badge-emerald' : 'nbc-badge-blue'}`}>
                              {rec.backlogStatus === 'OFFER_PENDING' ? 'Offer Pending' : rec.backlogStatus === 'SCHEDULED' ? 'Booked' : 'Ranked & Ready'}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="nbc-row-actions">
                            {!rec.isDisqualified && rec.backlogStatus !== 'SCHEDULED' && (
                              <>
                                <button
                                  className="nbc-action-btn nbc-action-amber"
                                  title="Dispatch Slot Offer to Clinic"
                                  onClick={() => handleOpenOffer(rec)}
                                >
                                  <Send size={13} />
                                  <span>Offer</span>
                                </button>
                                <button
                                  className="nbc-action-btn nbc-action-emerald"
                                  title="Direct Book into OR Schedule"
                                  onClick={() => handleOpenBook(rec)}
                                >
                                  <Check size={13} />
                                  <span>Book</span>
                                </button>
                              </>
                            )}
                            <button
                              className="nbc-action-btn nbc-action-neutral"
                              title="Audit Score Breakdown"
                              onClick={() => handleOpenAudit(rec)}
                            >
                              <Info size={13} />
                            </button>
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

      {/* TAB 2: MULTI-PILLAR SCORING RADAR & WEIGHTS */}
      {activeTab === 'radar' && (
        <div className="nbc-tab-content">
          <div className="nbc-section-card">
            <h2 className="nbc-section-title">Deterministic Multi-Pillar Scoring Architecture</h2>
            <p className="nbc-section-desc">
              Next Best Case evaluates every candidate through 4 objective pillars and enforces hard clinical safety gates.
              Adjust weights below to simulate facility priority shifts.
            </p>

            {/* 4 Pillars Grid */}
            <div className="nbc-pillars-grid">
              <div className="nbc-pillar-card nbc-border-blue">
                <div className="nbc-pillar-header">
                  <span className="nbc-pillar-title">Pillar 1: Clinical Readiness</span>
                  <span className="nbc-badge-pill nbc-badge-blue">{weights.readiness * 100}% Weight</span>
                </div>
                <p className="nbc-pillar-desc">
                  Prior Authorization approval (30 pts), active H&amp;P within 30 days (25 pts), pre-op labs/EKG (20 pts), consents (15 pts), and patient availability (10 pts).
                </p>
                <div className="nbc-pillar-gate-note">
                  <AlertTriangle size={13} className="nbc-icon-amber" />
                  <span>Hard Gate: Denied or expired Prior Auth immediately disqualifies case.</span>
                </div>
              </div>

              <div className="nbc-pillar-card nbc-border-emerald">
                <div className="nbc-pillar-header">
                  <span className="nbc-pillar-title">Pillar 2: Booking Probability</span>
                  <span className="nbc-badge-pill nbc-badge-emerald">{weights.probability * 100}% Weight</span>
                </div>
                <p className="nbc-pillar-desc">
                  Surgeon historical response rate for open slot offers (40 pts), advance lead-time notice feasibility (35 pts), and surgeon day-of-week affinity (25 pts).
                </p>
                <div className="nbc-pillar-gate-note">
                  <Clock size={13} className="nbc-icon-emerald" />
                  <span>Lead-time &gt;72h yields maximum booking acceptance probability.</span>
                </div>
              </div>

              <div className="nbc-pillar-card nbc-border-emerald">
                <div className="nbc-pillar-header">
                  <span className="nbc-pillar-title">Pillar 3: Financial Contribution</span>
                  <span className="nbc-badge-pill nbc-badge-emerald">{weights.financial * 100}% Weight</span>
                </div>
                <p className="nbc-pillar-desc">
                  Normalized surgical contribution margin against facility target benchmark ($2,500.00). Rewards high-margin commercial and cash procedures while preserving access.
                </p>
                <div className="nbc-pillar-gate-note">
                  <DollarSign size={13} className="nbc-icon-emerald" />
                  <span>Ratio: Math.min(100, Margin / Benchmark &times; 100).</span>
                </div>
              </div>

              <div className="nbc-pillar-card nbc-border-amber">
                <div className="nbc-pillar-header">
                  <span className="nbc-pillar-title">Pillar 4: Time &amp; Physical Fit</span>
                  <span className="nbc-badge-pill nbc-badge-amber">{weights.timeFit * 100}% Weight</span>
                </div>
                <p className="nbc-pillar-desc">
                  Evaluates P80 case duration fit into contiguous open room window (75% to 95% = 70 pts), suite specialty alignment (20 pts), and sterile instrument turnaround (10 pts).
                </p>
                <div className="nbc-pillar-gate-note">
                  <AlertTriangle size={13} className="nbc-icon-crimson" />
                  <span>Hard Gate: Overfilling available slot duration triggers immediate disqualification.</span>
                </div>
              </div>
            </div>

            {/* Dynamic Weight Adjustment Controls */}
            <div className="nbc-weight-controls-card">
              <h3 className="nbc-sim-title">Scoring Weight Simulator</h3>
              <p className="nbc-sim-desc">
                Fine-tune facility ranking weights. Weights must sum to 1.00 (100%).
              </p>

              <div className="nbc-weights-sliders-grid">
                <div className="nbc-weight-item">
                  <div className="nbc-slider-label-row">
                    <span>Clinical Readiness Weight:</span>
                    <strong>{(weights.readiness * 100).toFixed(0)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.05"
                    value={weights.readiness}
                    onChange={(e) => setWeights({ ...weights, readiness: parseFloat(e.target.value) })}
                    className="nbc-slider"
                  />
                </div>

                <div className="nbc-weight-item">
                  <div className="nbc-slider-label-row">
                    <span>Booking Probability Weight:</span>
                    <strong>{(weights.probability * 100).toFixed(0)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.05"
                    value={weights.probability}
                    onChange={(e) => setWeights({ ...weights, probability: parseFloat(e.target.value) })}
                    className="nbc-slider"
                  />
                </div>

                <div className="nbc-weight-item">
                  <div className="nbc-slider-label-row">
                    <span>Financial Margin Weight:</span>
                    <strong>{(weights.financial * 100).toFixed(0)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.05"
                    value={weights.financial}
                    onChange={(e) => setWeights({ ...weights, financial: parseFloat(e.target.value) })}
                    className="nbc-slider"
                  />
                </div>

                <div className="nbc-weight-item">
                  <div className="nbc-slider-label-row">
                    <span>Time &amp; Slot Fit Weight:</span>
                    <strong>{(weights.timeFit * 100).toFixed(0)}%</strong>
                  </div>
                  <input
                    type="range"
                    min="0.10"
                    max="0.50"
                    step="0.05"
                    value={weights.timeFit}
                    onChange={(e) => setWeights({ ...weights, timeFit: parseFloat(e.target.value) })}
                    className="nbc-slider"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BACKLOG CLINICAL READINESS QUEUE */}
      {activeTab === 'backlog' && (
        <div className="nbc-tab-content">
          <div className="nbc-section-card">
            <h2 className="nbc-section-title">Facility Surgical Backlog Clinical Readiness Registry</h2>
            <p className="nbc-section-desc">
              Comprehensive clinical readiness checklist for all pending cases on the facility surgical waitlist.
              Patients must clear insurance prior auth, active H&amp;P, and pre-op labs to achieve high rankability.
            </p>

            <div className="nbc-table-wrapper" style={{ marginTop: '16px' }}>
              <table className="nbc-table">
                <thead>
                  <tr>
                    <th>Patient Name &amp; MRN</th>
                    <th>Procedure &amp; CPT</th>
                    <th>Surgeon</th>
                    <th>Prior Auth</th>
                    <th>H&amp;P Cleared</th>
                    <th>Pre-Op Labs</th>
                    <th>Consents</th>
                    <th>Implant Status</th>
                    <th>Waitlist Status</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogCases.map((c) => {
                    const authMeta = PRIOR_AUTH_STATUSES[c.priorAuthStatus] || PRIOR_AUTH_STATUSES.PENDING;

                    return (
                      <tr key={c.id} className="nbc-table-row">
                        <td>
                          <div className="nbc-patient-col">
                            <span className="nbc-patient-name">{c.patientName}</span>
                            <span className="nbc-cpt-tag">{c.patientMrn}</span>
                          </div>
                        </td>
                        <td>
                          <div className="nbc-patient-col">
                            <span className="nbc-patient-name">{c.procedureName}</span>
                            <span className="nbc-cpt-tag">CPT {c.primaryCptCode} &bull; {c.predictedDurationMinutes} mins</span>
                          </div>
                        </td>
                        <td>
                          <span className="nbc-surgeon-name">{c.surgeonName}</span>
                        </td>
                        <td>
                          <span className={`nbc-badge-pill nbc-${authMeta.badgeClass}`}>
                            {authMeta.label}
                          </span>
                        </td>
                        <td>
                          {c.hpCleared ? (
                            <span className="nbc-check-text nbc-icon-emerald"><CheckCircle2 size={15} /> Yes</span>
                          ) : (
                            <span className="nbc-check-text nbc-icon-crimson"><AlertCircle size={15} /> Missing</span>
                          )}
                        </td>
                        <td>
                          {c.labsCleared ? (
                            <span className="nbc-check-text nbc-icon-emerald"><CheckCircle2 size={15} /> Cleared</span>
                          ) : (
                            <span className="nbc-check-text nbc-icon-amber"><Clock size={15} /> Pending</span>
                          )}
                        </td>
                        <td>
                          {c.consentSigned ? (
                            <span className="nbc-check-text nbc-icon-emerald"><CheckCircle2 size={15} /> Signed</span>
                          ) : (
                            <span className="nbc-check-text nbc-icon-amber"><Clock size={15} /> Pending</span>
                          )}
                        </td>
                        <td>
                          {c.requiresImplant ? (
                            c.implantDeliveryConfirmed ? (
                              <span className="nbc-badge-pill nbc-badge-emerald">Sterilized in Central</span>
                            ) : (
                              <span className="nbc-badge-pill nbc-badge-amber">Awaiting Courier</span>
                            )
                          ) : (
                            <span className="nbc-badge-pill nbc-badge-neutral">N/A</span>
                          )}
                        </td>
                        <td>
                          <span className={`nbc-badge-pill ${c.backlogStatus === 'SCHEDULED' ? 'nbc-badge-emerald' : c.backlogStatus === 'OFFER_PENDING' ? 'nbc-badge-amber' : 'nbc-badge-blue'}`}>
                            {c.backlogStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL: OFFER TO SURGEON / INSTANT BOOKING / SCORE AUDIT
          Strict Pinned Layout: Header & Footer Pinned, Body Scrollable
          ============================================================================== */}
      {modalType && activeRecommendation && (
        <div className="nbc-modal-backdrop" onClick={handleCloseModal}>
          <div className="nbc-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header (Pinned) */}
            <div className="nbc-modal-header">
              <div className="nbc-modal-title-row">
                <span className="nbc-modal-icon">
                  {modalType === 'OFFER' && <Send size={20} className="nbc-icon-amber" />}
                  {modalType === 'BOOK' && <CalendarCheck size={20} className="nbc-icon-emerald" />}
                  {modalType === 'AUDIT' && <Info size={20} className="nbc-icon-blue" />}
                </span>
                <div>
                  <h3 className="nbc-modal-title">
                    {modalType === 'OFFER' && 'Dispatch Open Slot Offer to Surgeon Clinic'}
                    {modalType === 'BOOK' && 'Authorize OR Booking & Consume Open Slot'}
                    {modalType === 'AUDIT' && 'Deterministic Score Provenance & Audit'}
                  </h3>
                  <span className="nbc-modal-subtitle">
                    {activeRecommendation.patientName} &bull; {activeRecommendation.procedureName} ({activeRecommendation.surgeonName})
                  </span>
                </div>
              </div>
              <button className="nbc-modal-close" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            {modalType === 'OFFER' && (
              <form onSubmit={handleConfirmOffer} className="nbc-modal-form">
                <div className="nbc-modal-body">
                  <div className="nbc-summary-box nbc-box-amber">
                    <span className="nbc-box-label">Target Open Slot Parameters</span>
                    <div className="nbc-box-row">
                      <span><strong>Suite:</strong> {currentSlot.roomName}</span>
                      <span><strong>Date:</strong> {currentSlot.slotDate} ({currentSlot.startTime}&ndash;{currentSlot.endTime})</span>
                      <span><strong>Slot Duration:</strong> {currentSlot.slotDurationMinutes} mins</span>
                      <span><strong>Fit Score:</strong> {activeRecommendation.compositeFitScore.toFixed(1)}/100</span>
                    </div>
                  </div>

                  <div className="nbc-form-group">
                    <label className="nbc-label">Clinic Contact / Coordinator *</label>
                    <input
                      type="text"
                      className="nbc-input"
                      value={offerContactName}
                      onChange={(e) => setOfferContactName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="nbc-form-group">
                    <label className="nbc-label">Offer Dispatch Notes &amp; Clinical Instructions *</label>
                    <textarea
                      className="nbc-textarea"
                      rows={3}
                      value={offerNotes}
                      onChange={(e) => setOfferNotes(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="nbc-modal-footer">
                  <button type="button" className="nbc-btn nbc-btn-secondary" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="submit" className="nbc-btn nbc-btn-warning">
                    <Send size={15} />
                    <span>Dispatch Offer Notice</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'BOOK' && (
              <form onSubmit={handleConfirmBook} className="nbc-modal-form">
                <div className="nbc-modal-body">
                  <div className="nbc-summary-box nbc-box-emerald">
                    <span className="nbc-box-label">Confirmed Surgical Booking Allocation</span>
                    <div className="nbc-box-row">
                      <span><strong>Suite:</strong> {currentSlot.roomName}</span>
                      <span><strong>Procedure:</strong> {activeRecommendation.procedureName}</span>
                      <span><strong>Duration:</strong> {activeRecommendation.predictedDurationMinutes} mins ({activeRecommendation.durationUtilizationPct}% of slot)</span>
                      <span><strong>Estimated Margin:</strong> ${activeRecommendation.projectedContributionMargin.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="nbc-form-group">
                    <label className="nbc-label">Generated OR Case Confirmation ID *</label>
                    <input
                      type="text"
                      className="nbc-input"
                      value={bookingConfirmationId}
                      onChange={(e) => setBookingConfirmationId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="nbc-form-group">
                    <label className="nbc-label">Surgeon Office Authorization Status</label>
                    <input
                      type="text"
                      className="nbc-input"
                      value={`Confirmed verbally with ${activeRecommendation.surgeonName}'s clinic.`}
                      disabled
                    />
                  </div>
                </div>

                <div className="nbc-modal-footer">
                  <button type="button" className="nbc-btn nbc-btn-secondary" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="submit" className="nbc-btn nbc-btn-primary">
                    <CheckCircle2 size={15} />
                    <span>Confirm &amp; Consume Slot</span>
                  </button>
                </div>
              </form>
            )}

            {modalType === 'AUDIT' && (
              <div className="nbc-modal-form">
                <div className="nbc-modal-body">
                  <div className="nbc-audit-grid">
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Rank Position:</span>
                      <span className="nbc-audit-val">{activeRecommendation.isDisqualified ? 'Disqualified' : `#${activeRecommendation.rankPosition}`}</span>
                    </div>
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Composite Fit Score:</span>
                      <span className="nbc-audit-val">{activeRecommendation.compositeFitScore.toFixed(2)} / 100</span>
                    </div>
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Readiness Score (30%):</span>
                      <span className="nbc-audit-val">{activeRecommendation.readinessScore.toFixed(1)} pts</span>
                    </div>
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Booking Probability (25%):</span>
                      <span className="nbc-audit-val">{activeRecommendation.probabilityScore.toFixed(1)} pts</span>
                    </div>
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Financial Margin (25%):</span>
                      <span className="nbc-audit-val">{activeRecommendation.financialScore.toFixed(1)} pts (${activeRecommendation.projectedContributionMargin.toLocaleString()})</span>
                    </div>
                    <div className="nbc-audit-item">
                      <span className="nbc-audit-label">Time &amp; Slot Fit (20%):</span>
                      <span className="nbc-audit-val">{activeRecommendation.timeFitScore.toFixed(1)} pts ({activeRecommendation.durationUtilizationPct}% util)</span>
                    </div>
                    <div className="nbc-audit-item" style={{ gridColumn: 'span 2' }}>
                      <span className="nbc-audit-label">Gate Verification / Status:</span>
                      <span className="nbc-audit-val">
                        {activeRecommendation.isDisqualified
                          ? `HARD DISQUALIFIED: ${DISQUALIFICATION_REASONS[activeRecommendation.disqualificationReason]?.label || activeRecommendation.disqualificationReason}`
                          : 'ALL CLINICAL & PHYSICAL GATES PASSED (Prior Auth Approved, Duration Within Window, Equipment Compatible)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="nbc-modal-footer">
                  <button type="button" className="nbc-btn nbc-btn-secondary" onClick={handleCloseModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
