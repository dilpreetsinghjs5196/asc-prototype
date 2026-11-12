import React, { useState, useMemo } from 'react';
import {
  CalendarDays,
  Clock,
  Building2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Search,
  Filter,
  Layers,
  ArrowRightLeft,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Info,
  Calendar,
  UserCheck,
  Sliders,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import {
  RELEASE_TRIGGERS,
  RELEASE_REASONS,
  TIMELINESS_STATUSES,
  REALLOCATION_STATUSES,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  calculateLeadTimeHours,
  determineTimelinessStatus,
  calculateDownstaffingSavings,
  calculateReleaseKpis,
  filterReleaseEvents,
  SEED_BLOCK_RELEASES,
  SEED_BLOCK_REALLOCATIONS,
  blockReleaseStore
} from '../services/blockReleaseEventsService';
import { SEED_OR_BLOCKS } from '../services/blockScheduleModelService';
import { SEED_OPERATING_ROOMS } from '../services/operatingRoomModelService';
import './BlockReleaseEventsView.css';

export default function BlockReleaseEventsView() {
  const [releases, setReleases] = useState(SEED_BLOCK_RELEASES);
  const [reallocations, setReallocations] = useState(SEED_BLOCK_REALLOCATIONS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [triggerFilter, setTriggerFilter] = useState('ALL');
  const [timelinessFilter, setTimelinessFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal States
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showReallocateModal, setShowReallocateModal] = useState(false);
  const [showDownstaffModal, setShowDownstaffModal] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);

  // Form: Create Release
  const [releaseFormData, setReleaseFormData] = useState({
    block_definition_id: SEED_OR_BLOCKS[0]?.id || '',
    surgery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    release_trigger: 'VOLUNTARY_SURGEON',
    release_reason_code: 'PHYSICIAN_VACATION',
    notes: ''
  });

  // Form: Reallocate
  const [reallocFormData, setReallocFormData] = useState({
    recipient_surgeon_name: '',
    specialty_code: 'ORTHOPEDICS',
    case_id: '',
    patient_name: '',
    procedure_name: '',
    reallocated_hours: 4.0,
    notes: ''
  });

  // Form: Downstaff
  const [downstaffHourlyRate, setDownstaffHourlyRate] = useState(DEFAULT_DOWNSTAFFING_HOURLY_RATE);

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    return calculateReleaseKpis(releases);
  }, [releases]);

  // Filtered List
  const filteredReleases = useMemo(() => {
    return filterReleaseEvents(releases, {
      search: searchQuery,
      operatingRoomId: roomFilter,
      releaseTrigger: triggerFilter,
      timelinessStatus: timelinessFilter,
      reallocationStatus: statusFilter
    });
  }, [releases, searchQuery, roomFilter, triggerFilter, timelinessFilter, statusFilter]);

  // Lead-Time Preview for Release Modal
  const releaseLeadPreview = useMemo(() => {
    if (!showReleaseModal) return null;
    const selectedBlock = SEED_OR_BLOCKS.find(b => b.id === releaseFormData.block_definition_id) || SEED_OR_BLOCKS[0];
    const startTime = selectedBlock?.start_time || '07:00:00';
    const hours = calculateLeadTimeHours(releaseFormData.surgery_date, startTime, new Date().toISOString());
    const timeliness = determineTimelinessStatus(hours, selectedBlock?.auto_release_lead_hours || 120);

    return {
      hours,
      timeliness,
      requiredHours: selectedBlock?.auto_release_lead_hours || 120
    };
  }, [showReleaseModal, releaseFormData]);

  // Handlers
  const handleOpenReleaseModal = () => {
    setReleaseFormData({
      block_definition_id: SEED_OR_BLOCKS[0]?.id || '',
      surgery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      release_trigger: 'VOLUNTARY_SURGEON',
      release_reason_code: 'PHYSICIAN_VACATION',
      notes: ''
    });
    setShowReleaseModal(true);
  };

  const handleSaveRelease = (e) => {
    e.preventDefault();
    const selectedBlock = SEED_OR_BLOCKS.find(b => b.id === releaseFormData.block_definition_id);
    if (!selectedBlock) return;

    const leadHours = calculateLeadTimeHours(
      releaseFormData.surgery_date,
      selectedBlock.start_time,
      new Date().toISOString()
    );

    const timeliness = determineTimelinessStatus(
      leadHours,
      selectedBlock.auto_release_lead_hours || 120
    );

    const newRelease = {
      id: `rel-${Date.now()}`,
      facility_id: selectedBlock.facility_id,
      block_definition_id: selectedBlock.id,
      block_name: selectedBlock.block_name,
      original_owner_name: selectedBlock.owner_name,
      original_owner_type: selectedBlock.owner_type,
      original_specialty: selectedBlock.specialty_code,
      operating_room_id: selectedBlock.operating_room_id,
      room_number: selectedBlock.room_number,
      room_name: selectedBlock.room_name,
      surgery_date: releaseFormData.surgery_date,
      start_time: selectedBlock.start_time,
      end_time: selectedBlock.end_time,
      released_minutes: selectedBlock.allocated_minutes,
      required_lead_hours: selectedBlock.auto_release_lead_hours || 120,
      release_trigger: releaseFormData.release_trigger,
      release_reason_code: releaseFormData.release_reason_code,
      release_timestamp: new Date().toISOString(),
      lead_time_hours: leadHours,
      timeliness_status: timeliness,
      reallocation_status: 'OPEN_POOL',
      reallocated_minutes: 0,
      downstaffed_savings_amount: 0.00,
      released_by_name: selectedBlock.owner_name,
      notes: releaseFormData.notes
    };

    setReleases(prev => [newRelease, ...prev]);
    setShowReleaseModal(false);
    showToast(`Block surrender registered successfully (${timeliness}).`);
  };

  const handleOpenReallocateModal = (rel) => {
    setSelectedRelease(rel);
    const unallocatedHours = Math.max(1, (rel.released_minutes - rel.reallocated_minutes) / 60);
    setReallocFormData({
      recipient_surgeon_name: '',
      specialty_code: rel.original_specialty || 'ORTHOPEDICS',
      case_id: '',
      patient_name: '',
      procedure_name: '',
      reallocated_hours: unallocatedHours,
      notes: ''
    });
    setShowReallocateModal(true);
  };

  const handleSaveReallocation = (e) => {
    e.preventDefault();
    if (!selectedRelease) return;

    const availableMinutes = selectedRelease.released_minutes - selectedRelease.reallocated_minutes;
    const requestedMinutes = Math.round(Number(reallocFormData.reallocated_hours) * 60);

    if (requestedMinutes > availableMinutes) {
      alert(`Requested ${requestedMinutes} minutes exceeds available ${availableMinutes} open-pool minutes.`);
      return;
    }

    const newRealloc = {
      id: `realloc-${Date.now()}`,
      release_event_id: selectedRelease.id,
      recipient_surgeon_id: null,
      recipient_surgeon_name: reallocFormData.recipient_surgeon_name,
      specialty_code: reallocFormData.specialty_code,
      case_id: reallocFormData.case_id || Math.floor(Math.random() * 9000) + 1000,
      patient_name: reallocFormData.patient_name || 'Add-on Case',
      procedure_name: reallocFormData.procedure_name || 'Scheduled Surgery',
      start_time: selectedRelease.start_time,
      end_time: selectedRelease.end_time,
      reallocated_minutes: requestedMinutes,
      reallocation_timestamp: new Date().toISOString(),
      notes: reallocFormData.notes
    };

    setReallocations(prev => [...prev, newRealloc]);

    // Update release event in state
    setReleases(prev => prev.map(r => {
      if (r.id !== selectedRelease.id) return r;
      const newTotal = r.reallocated_minutes + requestedMinutes;
      const newStatus = newTotal >= r.released_minutes ? 'FULLY_REALLOCATED' : 'PARTIALLY_REALLOCATED';
      return {
        ...r,
        reallocated_minutes: newTotal,
        reallocation_status: newStatus
      };
    }));

    setShowReallocateModal(false);
    showToast(`Successfully reallocated ${reallocFormData.reallocated_hours} hrs to ${reallocFormData.recipient_surgeon_name}.`);
  };

  const handleOpenDownstaffModal = (rel) => {
    setSelectedRelease(rel);
    setDownstaffHourlyRate(DEFAULT_DOWNSTAFFING_HOURLY_RATE);
    setShowDownstaffModal(true);
  };

  const handleConfirmDownstaff = () => {
    if (!selectedRelease) return;
    const unallocatedMinutes = selectedRelease.released_minutes - selectedRelease.reallocated_minutes;
    const savings = calculateDownstaffingSavings(unallocatedMinutes, downstaffHourlyRate);

    setReleases(prev => prev.map(r => {
      if (r.id !== selectedRelease.id) return r;
      return {
        ...r,
        reallocation_status: 'ROOM_DOWNSTAFFED',
        downstaffed_savings_amount: savings,
        notes: `${r.notes || ''} [Downstaffed ${(unallocatedMinutes / 60).toFixed(1)}h. Saved $${savings.toFixed(2)}]`.trim()
      };
    }));

    setShowDownstaffModal(false);
    showToast(`Room downstaffed. $${savings.toLocaleString()} in clinical labor costs avoided.`);
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all release events and open-pool reallocations to facility baseline?')) {
      setReleases([...SEED_BLOCK_RELEASES]);
      setReallocations([...SEED_BLOCK_REALLOCATIONS]);
      showToast('Block releases reset to default baseline.');
    }
  };

  return (
    <div className="or-release-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="or-release-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="or-release-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge badge-teal">MODULE 10: OR SCHEDULING</span>
            <span className="clinical-badge badge-blue">PHASE A3 SPECIFICATION</span>
            <span className="clinical-badge badge-emerald">OPEN POOL & DOWNSTAFFING ENGINE</span>
          </div>
          <h1>Operating Room Block Release & Open Pool Engine</h1>
          <p className="subtitle">
            Deterministic block surrender tracking, statutory lead-time calculation, open-pool reallocation, and downstaffing labor cost recovery.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={handleResetDefaults}>
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
          <button type="button" className="btn-primary" onClick={handleOpenReleaseModal}>
            <Plus size={16} />
            <span>Surrender / Release Block</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-card card-accent-blue">
          <div className="metric-header">
            <span className="metric-title">Total Released Hours</span>
            <Clock size={18} className="text-blue" />
          </div>
          <div className="metric-value">{kpis.totalReleasedHours} hrs</div>
          <div className="metric-footer">
            Across {kpis.totalReleasesCount} block release events
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">On-Time Release Rate</span>
            <ShieldCheck size={18} className="text-emerald" />
          </div>
          <div className="metric-value">{kpis.onTimeReleaseRatePct}%</div>
          <div className="metric-footer">
            {kpis.onTimeReleasesCount} of {kpis.totalReleasesCount} met statutory lead cutoff
          </div>
        </div>

        <div className="metric-card card-accent-teal">
          <div className="metric-header">
            <span className="metric-title">Open Pool Reallocation</span>
            <ArrowRightLeft size={18} className="text-teal" />
          </div>
          <div className="metric-value">{kpis.reallocationRatePct}%</div>
          <div className="metric-footer">
            {kpis.totalReallocatedHours} hrs successfully re-booked
          </div>
        </div>

        <div className="metric-card card-accent-amber">
          <div className="metric-header">
            <span className="metric-title">Downstaffed Savings</span>
            <DollarSign size={18} className="text-amber" />
          </div>
          <div className="metric-value">${kpis.totalDownstaffedSavingsAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="metric-footer">
            Avoided clinical labor overhead
          </div>
        </div>

        <div className="metric-card card-accent-slate">
          <div className="metric-header">
            <span className="metric-title">Pending Open Pool</span>
            <CalendarDays size={18} className="text-slate" />
          </div>
          <div className="metric-value">{kpis.pendingOpenPoolCount} slots</div>
          <div className="metric-footer">
            Available for immediate booking
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="release-filter-bar">
        <div className="search-box">
          <Search size={16} className="text-slate" />
          <input
            type="text"
            placeholder="Search releases by surgeon, room, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
            <option value="ALL">All Operating Rooms</option>
            {SEED_OPERATING_ROOMS.map(r => (
              <option key={r.id} value={r.id}>{r.room_name || r.name || r.room_number}</option>
            ))}
          </select>

          <select value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)}>
            <option value="ALL">All Release Triggers</option>
            {Object.values(RELEASE_TRIGGERS).map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>

          <select value={timelinessFilter} onChange={(e) => setTimelinessFilter(e.target.value)}>
            <option value="ALL">All Timeliness Ratings</option>
            {Object.values(TIMELINESS_STATUSES).map(s => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Reallocation Statuses</option>
            {Object.values(REALLOCATION_STATUSES).map(s => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Release Ledger Table */}
      <div className="table-card">
        <div className="table-header-info">
          <Calendar size={18} className="text-teal" />
          <h3>Chronological Block Surrender & Open Pool Ledger</h3>
          <span className="table-hint">Audit-compliant log of all block release events with lead-time timeliness and open pool tracking.</span>
        </div>

        <div className="table-responsive">
          <table className="or-release-table">
            <thead>
              <tr>
                <th>Surgery Date</th>
                <th>Operating Suite</th>
                <th>Block & Surrendering Owner</th>
                <th>Release Trigger & Reason</th>
                <th>Notice Lead Time</th>
                <th>Timeliness Rating</th>
                <th>Open Pool Reallocation</th>
                <th>Financial / Savings</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReleases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-table-cell">
                    No block release events match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredReleases.map(rel => {
                  const triggerMeta = RELEASE_TRIGGERS[rel.release_trigger] || RELEASE_TRIGGERS.VOLUNTARY_SURGEON;
                  const timelinessMeta = TIMELINESS_STATUSES[rel.timeliness_status] || TIMELINESS_STATUSES.ON_TIME;
                  const statusMeta = REALLOCATION_STATUSES[rel.reallocation_status] || REALLOCATION_STATUSES.OPEN_POOL;

                  const releasedHours = (rel.released_minutes / 60).toFixed(1);
                  const reallocatedHours = (rel.reallocated_minutes / 60).toFixed(1);
                  const remainingHours = Math.max(0, (rel.released_minutes - rel.reallocated_minutes) / 60).toFixed(1);
                  const hasRemaining = (rel.released_minutes - rel.reallocated_minutes) > 0;
                  const isDownstaffed = rel.reallocation_status === 'ROOM_DOWNSTAFFED';

                  return (
                    <tr key={rel.id}>
                      <td>
                        <div className="date-cell">
                          <strong>{rel.surgery_date}</strong>
                          <span className="time-subtext">{rel.start_time.slice(0, 5)} - {rel.end_time.slice(0, 5)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="room-cell-box">
                          <span className="badge-room">{rel.room_number}</span>
                          <span className="room-subname">{rel.room_name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="block-owner-cell">
                          <strong>{rel.block_name}</strong>
                          <span className="owner-subname">{rel.original_owner_name} ({rel.original_specialty})</span>
                        </div>
                      </td>
                      <td>
                        <div className="trigger-reason-cell">
                          <span className={`trigger-badge ${triggerMeta.badgeClass}`}>{triggerMeta.label.split(' ')[0]}</span>
                          <span className="reason-text">{RELEASE_REASONS[rel.release_reason_code]?.label || rel.release_reason_code}</span>
                        </div>
                      </td>
                      <td>
                        <div className="lead-time-cell">
                          <strong>{rel.lead_time_hours} hrs</strong>
                          <span className="lead-subtext">Req: {rel.required_lead_hours}h</span>
                        </div>
                      </td>
                      <td>
                        <span className={`timeliness-pill ${timelinessMeta.badgeClass}`}>
                          {timelinessMeta.label.split(' ')[0]}
                        </span>
                      </td>
                      <td>
                        <div className="reallocation-cell">
                          <div className="realloc-top-row">
                            <span className={`realloc-status-pill ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                            <span className="realloc-hours">{reallocatedHours} / {releasedHours}h</span>
                          </div>
                          <div className="realloc-progress-bar">
                            <div
                              className="realloc-progress-fill"
                              style={{ width: `${Math.min(100, (rel.reallocated_minutes / rel.released_minutes) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        {rel.downstaffed_savings_amount > 0 ? (
                          <span className="savings-badge">+${Number(rel.downstaffed_savings_amount).toFixed(2)} Saved</span>
                        ) : (
                          <span className="text-slate font-small">{remainingHours}h Open Pool</span>
                        )}
                      </td>
                      <td className="actions-col">
                        <div className="actions-row">
                          {hasRemaining && !isDownstaffed && (
                            <>
                              <button
                                type="button"
                                className="btn-action-primary"
                                onClick={() => handleOpenReallocateModal(rel)}
                                title="Reallocate hours to add-on case"
                              >
                                <ArrowRightLeft size={13} />
                                <span>Reallocate</span>
                              </button>
                              <button
                                type="button"
                                className="btn-action-secondary"
                                onClick={() => handleOpenDownstaffModal(rel)}
                                title="Authorize room downstaffing to save labor overhead"
                              >
                                <TrendingDown size={13} />
                                <span>Downstaff</span>
                              </button>
                            </>
                          )}
                          {isDownstaffed && (
                            <span className="downstaffed-indicator">Downstaffed</span>
                          )}
                          {!hasRemaining && (
                            <span className="fulfilled-indicator">100% Booked</span>
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

      {/* Modal 1: Surrender / Release Block Allocation */}
      {showReleaseModal && (
        <div className="or-release-modal-backdrop">
          <div className="or-release-modal-container">
            <div className="or-release-modal-header">
              <div className="or-release-modal-title-group">
                <CalendarDays size={18} className="text-teal" />
                <h3 className="or-release-modal-title">Surrender & Release Block Allocation</h3>
              </div>
              <button
                type="button"
                className="or-release-modal-close-btn"
                onClick={() => setShowReleaseModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRelease}>
              <div className="or-release-modal-body">
                {/* Live Lead-Time Calculation Preview */}
                {releaseLeadPreview && (
                  <div className={`lead-preview-banner ${releaseLeadPreview.timeliness === 'ON_TIME' ? 'banner-emerald' : releaseLeadPreview.timeliness === 'LATE_RELEASE' ? 'banner-amber' : 'banner-crimson'}`}>
                    <Info size={18} className="inline-icon" />
                    <div>
                      <strong>Calculated Notice Lead Time: {releaseLeadPreview.hours} hours</strong>
                      <p>
                        Required notice cutoff is {releaseLeadPreview.requiredHours} hours.
                        Rating: <strong>{TIMELINESS_STATUSES[releaseLeadPreview.timeliness]?.label}</strong>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="release-form-group">
                  <label>Select Master Block Allocation <span className="text-crimson">*</span></label>
                  <select
                    value={releaseFormData.block_definition_id}
                    onChange={(e) => setReleaseFormData({ ...releaseFormData, block_definition_id: e.target.value })}
                    className="release-form-control"
                  >
                    {SEED_OR_BLOCKS.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.block_name} ({b.owner_name} — {b.room_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="release-form-group">
                    <label>Surgery Date <span className="text-crimson">*</span></label>
                    <input
                      type="date"
                      required
                      value={releaseFormData.surgery_date}
                      onChange={(e) => setReleaseFormData({ ...releaseFormData, surgery_date: e.target.value })}
                      className="release-form-control"
                    />
                  </div>

                  <div className="release-form-group">
                    <label>Release Trigger Type <span className="text-crimson">*</span></label>
                    <select
                      value={releaseFormData.release_trigger}
                      onChange={(e) => setReleaseFormData({ ...releaseFormData, release_trigger: e.target.value })}
                      className="release-form-control"
                    >
                      {Object.values(RELEASE_TRIGGERS).map(t => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="release-form-group">
                  <label>Clinical Release Reason <span className="text-crimson">*</span></label>
                  <select
                    value={releaseFormData.release_reason_code}
                    onChange={(e) => setReleaseFormData({ ...releaseFormData, release_reason_code: e.target.value })}
                    className="release-form-control"
                  >
                    {Object.values(RELEASE_REASONS).map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="release-form-group">
                  <label>Surrender Notes & Documentation</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Attending physician attending specialty CME symposium; block surrender authorized by clinic coordinator."
                    value={releaseFormData.notes}
                    onChange={(e) => setReleaseFormData({ ...releaseFormData, notes: e.target.value })}
                    className="release-form-control"
                  />
                </div>
              </div>

              <div className="or-release-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowReleaseModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm & Surrender to Open Pool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Reallocate to Add-on Case */}
      {showReallocateModal && selectedRelease && (
        <div className="or-release-modal-backdrop">
          <div className="or-release-modal-container">
            <div className="or-release-modal-header">
              <div className="or-release-modal-title-group">
                <ArrowRightLeft size={18} className="text-teal" />
                <h3 className="or-release-modal-title">Reallocate Open-Pool Time</h3>
              </div>
              <button
                type="button"
                className="or-release-modal-close-btn"
                onClick={() => setShowReallocateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReallocation}>
              <div className="or-release-modal-body">
                <div className="summary-spec-box">
                  <div><strong>Surgery Date:</strong> {selectedRelease.surgery_date} in {selectedRelease.room_name}</div>
                  <div><strong>Surrendered by:</strong> {selectedRelease.original_owner_name} ({selectedRelease.block_name})</div>
                  <div>
                    <strong>Available Capacity:</strong>{' '}
                    <span className="text-emerald font-bold">
                      {((selectedRelease.released_minutes - selectedRelease.reallocated_minutes) / 60).toFixed(1)} hrs
                    </span>{' '}
                    remaining
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="release-form-group">
                    <label>Recipient Surgeon Name <span className="text-crimson">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Kevin Zhao, MD"
                      value={reallocFormData.recipient_surgeon_name}
                      onChange={(e) => setReallocFormData({ ...reallocFormData, recipient_surgeon_name: e.target.value })}
                      className="release-form-control"
                    />
                  </div>

                  <div className="release-form-group">
                    <label>Surgical Specialty <span className="text-crimson">*</span></label>
                    <select
                      value={reallocFormData.specialty_code}
                      onChange={(e) => setReallocFormData({ ...reallocFormData, specialty_code: e.target.value })}
                      className="release-form-control"
                    >
                      <option value="ORTHOPEDICS">Orthopedic Surgery</option>
                      <option value="SPINE">Spine Surgery</option>
                      <option value="OPHTHALMOLOGY">Ophthalmology</option>
                      <option value="GENERAL_SURGERY">General / Laparoscopy</option>
                      <option value="PAIN_MANAGEMENT">Interventional Pain</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="release-form-group">
                    <label>Patient Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Michael Thompson"
                      value={reallocFormData.patient_name}
                      onChange={(e) => setReallocFormData({ ...reallocFormData, patient_name: e.target.value })}
                      className="release-form-control"
                    />
                  </div>

                  <div className="release-form-group">
                    <label>Case Log / Booking ID</label>
                    <input
                      type="text"
                      placeholder="e.g. 9812"
                      value={reallocFormData.case_id}
                      onChange={(e) => setReallocFormData({ ...reallocFormData, case_id: e.target.value })}
                      className="release-form-control"
                    />
                  </div>
                </div>

                <div className="release-form-group">
                  <label>Procedure Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Arthroscopic Meniscectomy and Chondroplasty"
                    value={reallocFormData.procedure_name}
                    onChange={(e) => setReallocFormData({ ...reallocFormData, procedure_name: e.target.value })}
                    className="release-form-control"
                  />
                </div>

                <div className="release-form-group">
                  <label>Reallocated Duration (Hours) <span className="text-crimson">*</span></label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max={(selectedRelease.released_minutes - selectedRelease.reallocated_minutes) / 60}
                    required
                    value={reallocFormData.reallocated_hours}
                    onChange={(e) => setReallocFormData({ ...reallocFormData, reallocated_hours: Number(e.target.value) })}
                    className="release-form-control"
                  />
                  <span className="field-hint">
                    Maximum bookable duration: {((selectedRelease.released_minutes - selectedRelease.reallocated_minutes) / 60).toFixed(1)} hrs.
                  </span>
                </div>
              </div>

              <div className="or-release-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowReallocateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Booking & Reallocate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Authorize Room Downstaffing */}
      {showDownstaffModal && selectedRelease && (
        <div className="or-release-modal-backdrop">
          <div className="or-release-modal-container">
            <div className="or-release-modal-header">
              <div className="or-release-modal-title-group">
                <TrendingDown size={18} className="text-amber" />
                <h3 className="or-release-modal-title">Authorize Operating Room Downstaffing</h3>
              </div>
              <button
                type="button"
                className="or-release-modal-close-btn"
                onClick={() => setShowDownstaffModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="or-release-modal-body">
              <div className="downstaff-warning-box">
                <AlertTriangle size={20} className="text-amber" />
                <div>
                  <strong>Close Operating Suite to Capture Labor Savings:</strong>
                  <p>
                    Closing {selectedRelease.room_name} on {selectedRelease.surgery_date} removes{' '}
                    <strong>{((selectedRelease.released_minutes - selectedRelease.reallocated_minutes) / 60).toFixed(1)} hours</strong> of
                    unutilized clinical crew overhead.
                  </p>
                </div>
              </div>

              <div className="release-form-group">
                <label>ASC Clinical Crew Hourly Overhead Rate ($/hr)</label>
                <input
                  type="number"
                  step="25"
                  value={downstaffHourlyRate}
                  onChange={(e) => setDownstaffHourlyRate(Number(e.target.value))}
                  className="release-form-control"
                />
                <span className="field-hint">Default: $450.00/hr (RN Circulator + Scrub Tech + Variable Anesthesia).</span>
              </div>

              <div className="calculated-savings-card">
                <span className="calc-label">Total Realized Labor Cost Avoidance:</span>
                <span className="calc-amount">
                  ${calculateDownstaffingSavings(selectedRelease.released_minutes - selectedRelease.reallocated_minutes, downstaffHourlyRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="calc-subtext">Will be recorded in utilization governance and denominator deductions.</span>
              </div>
            </div>

            <div className="or-release-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDownstaffModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary btn-downstaff"
                onClick={handleConfirmDownstaff}
              >
                Confirm & Downstaff Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
