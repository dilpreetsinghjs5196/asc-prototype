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
  Edit2,
  Trash2,
  RefreshCw,
  Info,
  Calendar,
  Grid,
  List,
  UserCheck,
  Sliders
} from 'lucide-react';
import {
  OWNER_TYPES,
  RECURRENCE_TYPES,
  DAYS_OF_WEEK,
  CLINICAL_SPECIALTIES,
  DEFAULT_AUTO_RELEASE_LEAD_DAYS,
  DEFAULT_TARGET_UTILIZATION_PCT,
  calculateShiftMinutes,
  formatMinutesToHours,
  detectBlockCollisions,
  validateBlockStaffingContainment,
  calculateFacilityBlockKpis,
  filterBlockDefinitions,
  SEED_OR_BLOCKS,
  blockScheduleStore
} from '../services/blockScheduleModelService';
import { SEED_STAFFING_WINDOWS } from '../services/roomStaffingWindowService';
import { SEED_OPERATING_ROOMS } from '../services/operatingRoomModelService';
import './BlockScheduleModelView.css';

export default function BlockScheduleModelView() {
  const [blocks, setBlocks] = useState(SEED_OR_BLOCKS);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [toastMessage, setToastMessage] = useState(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState('ALL');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [dayFilter, setDayFilter] = useState('ALL');
  const [recurrenceFilter, setRecurrenceFilter] = useState('ALL');

  // Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [modalFormData, setModalFormData] = useState({
    block_name: '',
    operating_room_id: SEED_OPERATING_ROOMS[0]?.id || '',
    owner_type: 'INDIVIDUAL_SURGEON',
    owner_name: '',
    specialty_code: 'ORTHOPEDICS',
    day_of_week: 1,
    recurrence_type: 'WEEKLY',
    start_time: '07:00',
    end_time: '15:00',
    auto_release_lead_days: DEFAULT_AUTO_RELEASE_LEAD_DAYS,
    target_utilization_pct: DEFAULT_TARGET_UTILIZATION_PCT,
    notes: ''
  });

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // KPI Metrics Calculation
  const kpis = useMemo(() => {
    return calculateFacilityBlockKpis(blocks, SEED_STAFFING_WINDOWS);
  }, [blocks]);

  // Filtered Blocks
  const filteredBlocks = useMemo(() => {
    return filterBlockDefinitions(blocks, {
      search: searchQuery,
      operatingRoomId: roomFilter,
      ownerType: ownerTypeFilter,
      specialtyCode: specialtyFilter,
      dayOfWeek: dayFilter,
      recurrenceType: recurrenceFilter,
      activeOnly: false
    });
  }, [blocks, searchQuery, roomFilter, ownerTypeFilter, specialtyFilter, dayFilter, recurrenceFilter]);

  // Handle Form Change with Real-Time Collision and Staffing Verification
  const candidateValidation = useMemo(() => {
    if (!showEditModal) return null;
    const candidate = {
      id: editingBlock?.id,
      operating_room_id: modalFormData.operating_room_id,
      day_of_week: Number(modalFormData.day_of_week),
      recurrence_type: modalFormData.recurrence_type,
      start_time: modalFormData.start_time,
      end_time: modalFormData.end_time,
      allocated_minutes: calculateShiftMinutes(modalFormData.start_time, modalFormData.end_time),
      is_active: true
    };

    const collision = detectBlockCollisions(candidate, blocks);
    const staffing = validateBlockStaffingContainment(candidate, SEED_STAFFING_WINDOWS);

    return { collision, staffing };
  }, [showEditModal, editingBlock, modalFormData, blocks]);

  const handleOpenCreateModal = () => {
    setEditingBlock(null);
    setModalFormData({
      block_name: '',
      operating_room_id: SEED_OPERATING_ROOMS[0]?.id || '',
      owner_type: 'INDIVIDUAL_SURGEON',
      owner_name: '',
      specialty_code: 'ORTHOPEDICS',
      day_of_week: 1,
      recurrence_type: 'WEEKLY',
      start_time: '07:00',
      end_time: '15:00',
      auto_release_lead_days: DEFAULT_AUTO_RELEASE_LEAD_DAYS,
      target_utilization_pct: DEFAULT_TARGET_UTILIZATION_PCT,
      notes: ''
    });
    setShowEditModal(true);
  };

  const handleOpenEditModal = (blk) => {
    setEditingBlock(blk);
    setModalFormData({
      block_name: blk.block_name,
      operating_room_id: blk.operating_room_id,
      owner_type: blk.owner_type,
      owner_name: blk.owner_name,
      specialty_code: blk.specialty_code,
      day_of_week: blk.day_of_week,
      recurrence_type: blk.recurrence_type,
      start_time: blk.start_time.slice(0, 5),
      end_time: blk.end_time.slice(0, 5),
      auto_release_lead_days: blk.auto_release_lead_days,
      target_utilization_pct: blk.target_utilization_pct,
      notes: blk.notes || ''
    });
    setShowEditModal(true);
  };

  const handleSaveModal = (e) => {
    e.preventDefault();
    const duration = calculateShiftMinutes(modalFormData.start_time, modalFormData.end_time);
    if (duration <= 0) {
      alert('Error: End time must be after start time.');
      return;
    }

    if (candidateValidation?.collision?.hasCollision) {
      alert(`Cannot save block: ${candidateValidation.collision.reason}`);
      return;
    }

    const selectedRoom = SEED_OPERATING_ROOMS.find(r => r.id === modalFormData.operating_room_id);

    if (editingBlock) {
      setBlocks(prev => prev.map(b => {
        if (b.id !== editingBlock.id) return b;
        return {
          ...b,
          ...modalFormData,
          day_of_week: Number(modalFormData.day_of_week),
          room_number: selectedRoom?.room_number || b.room_number,
          room_name: selectedRoom?.room_name || selectedRoom?.name || b.room_name,
          allocated_minutes: duration,
          auto_release_lead_hours: Number(modalFormData.auto_release_lead_days) * 24
        };
      }));
      showToast('Block allocation updated successfully.');
    } else {
      const newBlock = {
        id: `blk-${Date.now()}`,
        facility_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        ...modalFormData,
        day_of_week: Number(modalFormData.day_of_week),
        room_number: selectedRoom?.room_number || '1',
        room_name: selectedRoom?.room_name || selectedRoom?.name || 'OR 1',
        allocated_minutes: duration,
        auto_release_lead_hours: Number(modalFormData.auto_release_lead_days) * 24,
        is_active: true,
        effective_start_date: new Date().toISOString().slice(0, 10)
      };
      setBlocks(prev => [...prev, newBlock]);
      showToast('New block allocation created successfully.');
    }

    setShowEditModal(false);
  };

  const handleDeleteBlock = (blkId) => {
    if (window.confirm('Are you sure you want to release and delete this block allocation?')) {
      setBlocks(prev => prev.filter(b => b.id !== blkId));
      showToast('Block allocation deleted.');
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all block allocations to facility default baseline?')) {
      setBlocks([...SEED_OR_BLOCKS]);
      showToast('Block schedule reset to facility defaults.');
    }
  };

  // Schedule Days Mon-Sat for Matrix View
  const operatingDays = DAYS_OF_WEEK.filter(d => d.day >= 1 && d.day <= 6);

  return (
    <div className="or-block-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="or-block-toast">
          <CheckCircle2 size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="or-block-header">
        <div className="header-titles">
          <div className="badge-ribbon">
            <span className="clinical-badge badge-teal">MODULE 10: OR SCHEDULING</span>
            <span className="clinical-badge badge-blue">PHASE A2 SPECIFICATION</span>
            <span className="clinical-badge badge-emerald">DETERMINISTIC BLOCK ENGINE</span>
          </div>
          <h1>Operating Room Block Schedule Master</h1>
          <p className="subtitle">
            Authoritative surgical block allocations, multi-tier ownership, recurrence schedules, auto-release lead-time governance, and staffing window containment.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn-secondary" onClick={handleResetDefaults}>
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
          <button type="button" className="btn-primary" onClick={handleOpenCreateModal}>
            <Plus size={16} />
            <span>New Block Allocation</span>
          </button>
        </div>
      </div>

      {/* 5-Card Metrics Ribbon */}
      <div className="metrics-ribbon">
        <div className="metric-card card-accent-blue">
          <div className="metric-header">
            <span className="metric-title">Active Block Allocations</span>
            <CalendarDays size={18} className="text-blue" />
          </div>
          <div className="metric-value">{kpis.totalActiveBlocks}</div>
          <div className="metric-footer">
            Across {kpis.blockedRoomsCount} surgical suites
          </div>
        </div>

        <div className="metric-card card-accent-teal">
          <div className="metric-header">
            <span className="metric-title">Total Blocked Hours</span>
            <Clock size={18} className="text-teal" />
          </div>
          <div className="metric-value">{kpis.totalBlockedHours} hrs</div>
          <div className="metric-footer">
            {kpis.totalBlockedMinutes.toLocaleString()} allocated minutes/wk
          </div>
        </div>

        <div className="metric-card card-accent-emerald">
          <div className="metric-header">
            <span className="metric-title">Block vs Staffed Ratio</span>
            <ShieldCheck size={18} className="text-emerald" />
          </div>
          <div className="metric-value">{kpis.blockAllocationRatioPct}%</div>
          <div className="metric-footer">
            Of {kpis.totalStaffedHours} total staffed room hrs
          </div>
        </div>

        <div className="metric-card card-accent-amber">
          <div className="metric-header">
            <span className="metric-title">Unique Block Owners</span>
            <UserCheck size={18} className="text-amber" />
          </div>
          <div className="metric-value">{kpis.uniqueOwnersCount}</div>
          <div className="metric-footer">
            Surgeons, groups, and service lines
          </div>
        </div>

        <div className="metric-card card-accent-slate">
          <div className="metric-header">
            <span className="metric-title">Avg Release Lead Time</span>
            <Sliders size={18} className="text-slate" />
          </div>
          <div className="metric-value">{kpis.avgReleaseLeadDays} days</div>
          <div className="metric-footer">
            Avg target util: {kpis.avgTargetUtilizationPct}%
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="block-filter-bar">
        <div className="search-box">
          <Search size={16} className="text-slate" />
          <input
            type="text"
            placeholder="Search blocks by name, surgeon, practice, or specialty..."
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

          <select value={ownerTypeFilter} onChange={(e) => setOwnerTypeFilter(e.target.value)}>
            <option value="ALL">All Ownership Types</option>
            {Object.values(OWNER_TYPES).map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>

          <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
            <option value="ALL">All Specialties</option>
            {CLINICAL_SPECIALTIES.map(s => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </select>

          <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            <option value="ALL">All Days of Week</option>
            {DAYS_OF_WEEK.map(d => (
              <option key={d.day} value={d.day}>{d.label}</option>
            ))}
          </select>

          <div className="view-mode-toggle">
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Weekly Matrix Grid View"
            >
              <Grid size={15} />
              <span>Grid Matrix</span>
            </button>
            <button
              type="button"
              className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Block Inventory Table View"
            >
              <List size={15} />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Grid View or Table View */}
      {viewMode === 'grid' ? (
        <div className="matrix-card">
          <div className="matrix-header-info">
            <Calendar size={18} className="text-teal" />
            <h3>Weekly Operating Room Block Allocation Matrix</h3>
            <span className="matrix-hint">Showing scheduled blocks across active operating rooms (Monday - Saturday).</span>
          </div>

          <div className="matrix-table-wrapper">
            <table className="or-block-matrix-table">
              <thead>
                <tr>
                  <th className="room-column-th">Operating Suite</th>
                  {operatingDays.map(d => (
                    <th key={d.day} className="day-column-th">
                      <div className="day-th-title">{d.short}</div>
                      <div className="day-th-subtitle">{d.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEED_OPERATING_ROOMS.map(room => {
                  return (
                    <tr key={room.id}>
                      <td className="room-cell">
                        <div className="room-cell-box">
                          <span className="room-badge">
                            {room.room_number ? (room.room_number.startsWith('OR') ? room.room_number : `OR ${room.room_number}`) : 'OR'}
                          </span>
                          <span className="room-name-label">{room.room_name || room.name || `OR ${room.room_number}`}</span>
                          <span className="room-type-label">{room.suite_designation || room.room_type || 'Surgical Suite'}</span>
                        </div>
                      </td>
                      {operatingDays.map(d => {
                        const cellBlocks = filteredBlocks.filter(
                          b => (b.operating_room_id === room.id || b.room_number === room.room_number || b.room_number === room.room_number?.replace('OR-', '')) && b.day_of_week === d.day
                        );

                        return (
                          <td key={d.day} className="matrix-day-cell">
                            {cellBlocks.length === 0 ? (
                              <div className="cell-empty-slot">Open Scheduling</div>
                            ) : (
                              <div className="cell-blocks-stack">
                                {cellBlocks.map(blk => {
                                  const ownerMeta = OWNER_TYPES[blk.owner_type] || OWNER_TYPES.INDIVIDUAL_SURGEON;
                                  return (
                                    <div key={blk.id} className="block-card">
                                      <div className="block-card-header">
                                        <span className={`block-owner-pill ${ownerMeta.badgeClass}`}>
                                          {ownerMeta.label.split(' ')[0]}
                                        </span>
                                        <div className="block-card-actions">
                                          <button
                                            type="button"
                                            className="btn-card-action"
                                            onClick={() => handleOpenEditModal(blk)}
                                            title="Edit Block"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button
                                            type="button"
                                            className="btn-card-action text-crimson"
                                            onClick={() => handleDeleteBlock(blk.id)}
                                            title="Delete Block"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="block-card-title">{blk.block_name}</div>
                                      <div className="block-card-owner">{blk.owner_name}</div>
                                      <div className="block-card-time">
                                        <Clock size={12} className="inline-icon" />
                                        <span>{blk.start_time.slice(0, 5)} - {blk.end_time.slice(0, 5)}</span>
                                        <span className="block-hours-tag">({(blk.allocated_minutes / 60).toFixed(1)}h)</span>
                                      </div>
                                      <div className="block-card-footer">
                                        <span className="block-target-pill">{blk.target_utilization_pct}% Target</span>
                                        <span className="block-release-pill">{blk.auto_release_lead_days}d Lead</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-header-info">
            <List size={18} className="text-teal" />
            <h3>Master Block Allocation Inventory</h3>
            <span className="table-hint">Detailed inventory of all defined recurring blocks with configuration parameters.</span>
          </div>

          <div className="table-responsive">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Operating Room</th>
                  <th>Block Name & Description</th>
                  <th>Owner & Hierarchy</th>
                  <th>Clinical Specialty</th>
                  <th>Day & Recurrence</th>
                  <th>Time Window</th>
                  <th>Allocated Hours</th>
                  <th>Release Lead</th>
                  <th>Target Util</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocks.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="empty-table-cell">
                      No block allocations match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredBlocks.map(blk => {
                    const ownerMeta = OWNER_TYPES[blk.owner_type] || OWNER_TYPES.INDIVIDUAL_SURGEON;
                    const dayMeta = DAYS_OF_WEEK.find(d => d.day === blk.day_of_week);
                    const recMeta = RECURRENCE_TYPES[blk.recurrence_type];

                    return (
                      <tr key={blk.id}>
                        <td>
                          <div className="room-cell-simple">
                            <span className="badge-room">OR {blk.room_number}</span>
                            <span className="room-subname">{blk.room_name}</span>
                          </div>
                        </td>
                        <td>
                          <div className="block-name-cell">
                            <strong>{blk.block_name}</strong>
                            {blk.notes && <span className="block-notes-hint">{blk.notes}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="owner-cell">
                            <span className={`block-owner-pill ${ownerMeta.badgeClass}`}>{ownerMeta.label}</span>
                            <span className="owner-name-bold">{blk.owner_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className="specialty-badge">{blk.specialty_code}</span>
                        </td>
                        <td>
                          <div className="recurrence-cell">
                            <strong>{dayMeta?.label || 'Monday'}</strong>
                            <span className="rec-subtext">{recMeta?.label || 'Weekly'}</span>
                          </div>
                        </td>
                        <td>
                          <span className="time-badge">
                            {blk.start_time.slice(0, 5)} - {blk.end_time.slice(0, 5)}
                          </span>
                        </td>
                        <td>
                          <strong>{formatMinutesToHours(blk.allocated_minutes)}</strong>
                        </td>
                        <td>
                          <span className="lead-tag">{blk.auto_release_lead_days} days ({blk.auto_release_lead_hours || blk.auto_release_lead_days * 24}h)</span>
                        </td>
                        <td>
                          <span className="util-tag">{blk.target_utilization_pct}%</span>
                        </td>
                        <td>
                          <span className="status-pill active">Active</span>
                        </td>
                        <td className="actions-col">
                          <div className="actions-row">
                            <button
                              type="button"
                              className="btn-action-icon"
                              onClick={() => handleOpenEditModal(blk)}
                              title="Edit Block"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-action-icon text-crimson"
                              onClick={() => handleDeleteBlock(blk.id)}
                              title="Delete Block"
                            >
                              <Trash2 size={14} />
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

      {/* Modal: Create / Edit Block Allocation */}
      {showEditModal && (
        <div className="or-block-modal-backdrop">
          <div className="or-block-modal-container">
            <div className="or-block-modal-header">
              <div className="or-block-modal-title-group">
                <CalendarDays size={18} className="text-teal" />
                <h3 className="or-block-modal-title">
                  {editingBlock ? 'Edit Block Allocation' : 'Create New Block Allocation'}
                </h3>
              </div>
              <button
                type="button"
                className="or-block-modal-close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal}>
              <div className="or-block-modal-body">
                {/* Collision Alert Banner */}
                {candidateValidation?.collision?.hasCollision && (
                  <div className="collision-alert-banner">
                    <AlertTriangle size={18} className="text-crimson" />
                    <div>
                      <strong>Schedule Conflict Detected:</strong>
                      <p>{candidateValidation.collision.reason}</p>
                    </div>
                  </div>
                )}

                {/* Staffing Containment Banner */}
                {candidateValidation?.staffing && !candidateValidation.staffing.fitsWithinStaffing && (
                  <div className="staffing-alert-banner">
                    <Info size={18} className="text-amber" />
                    <div>
                      <strong>Staffing Window Exception:</strong>
                      <p>{candidateValidation.staffing.message}</p>
                    </div>
                  </div>
                )}

                <div className="block-form-group">
                  <label>Block Name / Title <span className="text-crimson">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Vance — Total Hip & Knee Arthroplasty"
                    value={modalFormData.block_name}
                    onChange={(e) => setModalFormData({ ...modalFormData, block_name: e.target.value })}
                    className="block-form-control"
                  />
                </div>

                <div className="form-grid-2">
                  <div className="block-form-group">
                    <label>Operating Room Suite <span className="text-crimson">*</span></label>
                    <select
                      value={modalFormData.operating_room_id}
                      onChange={(e) => setModalFormData({ ...modalFormData, operating_room_id: e.target.value })}
                      className="block-form-control"
                    >
                      {SEED_OPERATING_ROOMS.map(r => (
                        <option key={r.id} value={r.id}>{r.room_name || r.name || r.room_number}</option>
                      ))}
                    </select>
                  </div>

                  <div className="block-form-group">
                    <label>Ownership Tier <span className="text-crimson">*</span></label>
                    <select
                      value={modalFormData.owner_type}
                      onChange={(e) => setModalFormData({ ...modalFormData, owner_type: e.target.value })}
                      className="block-form-control"
                    >
                      {Object.values(OWNER_TYPES).map(t => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="block-form-group">
                    <label>Owner Name / Entity <span className="text-crimson">*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Marcus Vance, MD or Capital Spine"
                      value={modalFormData.owner_name}
                      onChange={(e) => setModalFormData({ ...modalFormData, owner_name: e.target.value })}
                      className="block-form-control"
                    />
                  </div>

                  <div className="block-form-group">
                    <label>Clinical Specialty <span className="text-crimson">*</span></label>
                    <select
                      value={modalFormData.specialty_code}
                      onChange={(e) => setModalFormData({ ...modalFormData, specialty_code: e.target.value })}
                      className="block-form-control"
                    >
                      {CLINICAL_SPECIALTIES.map(s => (
                        <option key={s.code} value={s.code}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="block-form-group">
                    <label>Day of Week <span className="text-crimson">*</span></label>
                    <select
                      value={modalFormData.day_of_week}
                      onChange={(e) => setModalFormData({ ...modalFormData, day_of_week: Number(e.target.value) })}
                      className="block-form-control"
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.day} value={d.day}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="block-form-group">
                    <label>Recurrence Pattern <span className="text-crimson">*</span></label>
                    <select
                      value={modalFormData.recurrence_type}
                      onChange={(e) => setModalFormData({ ...modalFormData, recurrence_type: e.target.value })}
                      className="block-form-control"
                    >
                      {Object.values(RECURRENCE_TYPES).map(r => (
                        <option key={r.code} value={r.code}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="block-form-group">
                    <label>Start Time (HH:MM) <span className="text-crimson">*</span></label>
                    <input
                      type="time"
                      required
                      value={modalFormData.start_time}
                      onChange={(e) => setModalFormData({ ...modalFormData, start_time: e.target.value })}
                      className="block-form-control"
                    />
                  </div>

                  <div className="block-form-group">
                    <label>End Time (HH:MM) <span className="text-crimson">*</span></label>
                    <input
                      type="time"
                      required
                      value={modalFormData.end_time}
                      onChange={(e) => setModalFormData({ ...modalFormData, end_time: e.target.value })}
                      className="block-form-control"
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="block-form-group">
                    <label>Auto-Release Lead Time (Days)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={modalFormData.auto_release_lead_days}
                      onChange={(e) => setModalFormData({ ...modalFormData, auto_release_lead_days: Number(e.target.value) })}
                      className="block-form-control"
                    />
                    <span className="field-hint">Days before surgery date before unbooked time is released to open pool.</span>
                  </div>

                  <div className="block-form-group">
                    <label>Target Utilization Benchmark (%)</label>
                    <input
                      type="number"
                      min="50"
                      max="100"
                      step="1"
                      value={modalFormData.target_utilization_pct}
                      onChange={(e) => setModalFormData({ ...modalFormData, target_utilization_pct: Number(e.target.value) })}
                      className="block-form-control"
                    />
                    <span className="field-hint">Facility target utilization threshold (default: 75.0%).</span>
                  </div>
                </div>

                <div className="block-form-group">
                  <label>Clinical & Equipment Notes</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Requires Mako robotics arm and radiopaque fluoroscopy technician."
                    value={modalFormData.notes}
                    onChange={(e) => setModalFormData({ ...modalFormData, notes: e.target.value })}
                    className="block-form-control"
                  />
                </div>
              </div>

              <div className="or-block-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={candidateValidation?.collision?.hasCollision}
                >
                  {editingBlock ? 'Save Block Changes' : 'Confirm & Allocate Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

