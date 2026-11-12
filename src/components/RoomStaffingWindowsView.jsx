import React, { useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Building2,
  Plus,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Info,
  CalendarDays,
  Filter,
  Layers,
  Sparkles,
  FileText,
  UserCheck,
  Check,
  X,
  Trash2,
  Edit2
} from 'lucide-react';
import {
  DAYS_OF_WEEK,
  CLOSURE_TYPES,
  EXCEPTION_TYPES,
  SEED_STAFFING_WINDOWS,
  SEED_ROOM_CLOSURES,
  SEED_ROOM_EXCEPTIONS,
  calculateShiftMinutes,
  calculateNetStaffedMinutes,
  calculateFacilityStaffingKpis,
  validateStaffingWindow
} from '../services/roomStaffingWindowService';
import { SEED_OPERATING_ROOMS } from '../services/operatingRoomModelService';
import './RoomStaffingWindowsView.css';

export default function RoomStaffingWindowsView() {
  const [windows, setWindows] = useState(SEED_STAFFING_WINDOWS);
  const [closures, setClosures] = useState(SEED_ROOM_CLOSURES);
  const [exceptions, setExceptions] = useState(SEED_ROOM_EXCEPTIONS);
  const [activeSubTab, setActiveSubTab] = useState('matrix'); // 'matrix' | 'closures' | 'exceptions'

  // Modals state
  const [isWindowModalOpen, setIsWindowModalOpen] = useState(false);
  const [editingWindow, setEditingWindow] = useState(null);
  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [newClosure, setNewClosure] = useState({
    operating_room_id: '',
    closure_date: new Date().toISOString().split('T')[0],
    closure_type: 'FACILITY_HOLIDAY',
    reason: '',
    deducted_denominator_minutes: 480,
    is_all_day: true
  });
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);

  // Denominator simulation state
  const [simStartDate, setSimStartDate] = useState('2026-11-01');
  const [simEndDate, setSimEndDate] = useState('2026-11-30');
  const [simRoomFilter, setSimRoomFilter] = useState('ALL');

  // Facility-wide KPIs
  const kpis = useMemo(() => {
    return calculateFacilityStaffingKpis(SEED_OPERATING_ROOMS, windows, closures);
  }, [windows, closures]);

  // Denominator simulation calculation
  const simResult = useMemo(() => {
    return calculateNetStaffedMinutes(
      simRoomFilter,
      simStartDate,
      simEndDate,
      windows,
      closures,
      exceptions
    );
  }, [simRoomFilter, simStartDate, simEndDate, windows, closures, exceptions]);

  // Room by room denominator breakdown for simulator
  const roomBreakdowns = useMemo(() => {
    return SEED_OPERATING_ROOMS.map(room => {
      const res = calculateNetStaffedMinutes(
        room.id,
        simStartDate,
        simEndDate,
        windows,
        closures,
        exceptions
      );
      return {
        room,
        ...res
      };
    });
  }, [simStartDate, simEndDate, windows, closures, exceptions]);

  // Handle open Add/Edit Window Modal
  const handleOpenAddWindow = (roomId = 'room-or-1', dayOfWeek = 1) => {
    setEditingWindow({
      id: `w-${Date.now()}`,
      operating_room_id: roomId,
      day_of_week: dayOfWeek,
      shift_name: 'Standard Surgical Day',
      start_time: '07:00',
      end_time: '17:00',
      gross_staffed_minutes: 600,
      circulator_rn_count: 1,
      scrub_tech_count: 1,
      anesthesia_provider_count: 1,
      is_active: true,
      notes: ''
    });
    setIsWindowModalOpen(true);
  };

  const handleOpenEditWindow = (win) => {
    setEditingWindow(JSON.parse(JSON.stringify(win)));
    setIsWindowModalOpen(true);
  };

  const handleSaveWindow = (e) => {
    e.preventDefault();
    if (!editingWindow) return;

    const validation = validateStaffingWindow(editingWindow);
    if (!validation.valid) {
      alert(validation.errors.join('\n'));
      return;
    }

    const calculatedMinutes = calculateShiftMinutes(editingWindow.start_time, editingWindow.end_time);
    const updated = {
      ...editingWindow,
      gross_staffed_minutes: calculatedMinutes
    };

    setWindows(prev => {
      const idx = prev.findIndex(w => w.id === updated.id);
      if (idx >= 0) {
        return prev.map(w => w.id === updated.id ? updated : w);
      }
      return [...prev, updated];
    });

    setIsWindowModalOpen(false);
    setEditingWindow(null);
  };

  const handleDeleteWindow = (id) => {
    if (window.confirm('Are you sure you want to remove this recurring shift window?')) {
      setWindows(prev => prev.filter(w => w.id !== id));
    }
  };

  // Handle Save Closure
  const handleSaveClosure = (e) => {
    e.preventDefault();
    if (!newClosure.reason.trim()) {
      alert('A clinical or operational reason is required for closures.');
      return;
    }

    const closureRecord = {
      id: `c-${Date.now()}`,
      operating_room_id: newClosure.operating_room_id ? newClosure.operating_room_id : null,
      closure_date: newClosure.closure_date,
      closure_type: newClosure.closure_type,
      reason: newClosure.reason.trim(),
      deducted_denominator_minutes: Number(newClosure.deducted_denominator_minutes) || 480,
      is_all_day: Boolean(newClosure.is_all_day)
    };

    setClosures(prev => [closureRecord, ...prev]);
    setIsClosureModalOpen(false);
    setNewClosure({
      operating_room_id: '',
      closure_date: new Date().toISOString().split('T')[0],
      closure_type: 'FACILITY_HOLIDAY',
      reason: '',
      deducted_denominator_minutes: 480,
      is_all_day: true
    });
  };

  const handleDeleteClosure = (id) => {
    setClosures(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="staffing-view-container">
      {/* 1. Header Bar */}
      <div className="staffing-header">
        <div className="staffing-header-title">
          <div className="staffing-icon-box">
            <Clock size={24} className="staffing-icon-primary" />
          </div>
          <div>
            <h1>Room Staffing Windows & Utilization Denominators</h1>
            <p>
              Recurring operational shift schedules, planned closures, overtime exceptions, and authoritative net denominator hours.
            </p>
          </div>
        </div>

        <div className="staffing-header-actions">
          <button
            type="button"
            className="staffing-btn staffing-btn-secondary"
            onClick={() => setIsSimModalOpen(true)}
          >
            <Sparkles size={16} />
            <span>Denominator Simulator</span>
          </button>
          <button
            type="button"
            className="staffing-btn staffing-btn-secondary"
            onClick={() => setIsClosureModalOpen(true)}
          >
            <AlertTriangle size={16} />
            <span>Log Closure Event</span>
          </button>
          <button
            type="button"
            className="staffing-btn staffing-btn-primary"
            onClick={() => handleOpenAddWindow()}
          >
            <Plus size={16} />
            <span>Add Staffing Window</span>
          </button>
        </div>
      </div>

      {/* 2. Operational Metric Ribbon (5 Cards) */}
      <div className="staffing-kpi-grid">
        <div className="staffing-kpi-card">
          <div className="staffing-kpi-label">WEEKLY STAFFED CAPACITY</div>
          <div className="staffing-kpi-value">{kpis.weekly_staffed_hours} <span className="staffing-kpi-unit">hrs/wk</span></div>
          <div className="staffing-kpi-subtext">Total Gross Operating Minutes: {kpis.weekly_staffed_minutes.toLocaleString()}m</div>
        </div>

        <div className="staffing-kpi-card">
          <div className="staffing-kpi-label">ACTIVE STAFFED ROOMS</div>
          <div className="staffing-kpi-value staffing-text-emerald">{kpis.staffed_rooms_count} of {SEED_OPERATING_ROOMS.length}</div>
          <div className="staffing-kpi-subtext">Operating Suites with Assigned Teams</div>
        </div>

        <div className="staffing-kpi-card">
          <div className="staffing-kpi-label">AVG DAILY SHIFT LENGTH</div>
          <div className="staffing-kpi-value">{kpis.avg_daily_shift_hours} <span className="staffing-kpi-unit">hrs/day</span></div>
          <div className="staffing-kpi-subtext">Across {kpis.total_weekly_shifts} Weekly Surgical Shifts</div>
        </div>

        <div className="staffing-kpi-card">
          <div className="staffing-kpi-label">SCHEDULED DOWNTIME (MONTH)</div>
          <div className="staffing-kpi-value staffing-text-amber">{kpis.scheduled_closure_hours} <span className="staffing-kpi-unit">hrs</span></div>
          <div className="staffing-kpi-subtext">{closures.length} Planned Holidays & Maintenance Cycles</div>
        </div>

        <div className="staffing-kpi-card">
          <div className="staffing-kpi-label">PEAK OPERATING DAY</div>
          <div className="staffing-kpi-value staffing-text-sky">{kpis.peak_day_name}</div>
          <div className="staffing-kpi-subtext">{kpis.peak_day_hours} Total Staffed Operating Hours</div>
        </div>
      </div>

      {/* 3. Sub-Tab Navigation Bar */}
      <div className="staffing-nav-tabs">
        <button
          type="button"
          className={`staffing-tab-btn ${activeSubTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('matrix')}
        >
          <CalendarDays size={16} />
          <span>Weekly Staffing Matrix</span>
        </button>
        <button
          type="button"
          className={`staffing-tab-btn ${activeSubTab === 'closures' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('closures')}
        >
          <AlertTriangle size={16} />
          <span>Planned Closures & Downtime ({closures.length})</span>
        </button>
        <button
          type="button"
          className={`staffing-tab-btn ${activeSubTab === 'exceptions' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('exceptions')}
        >
          <Clock size={16} />
          <span>Staffing Exceptions & Overtime ({exceptions.length})</span>
        </button>
      </div>

      {/* 4. Tab 1: Weekly Staffing Matrix */}
      {activeSubTab === 'matrix' && (
        <div className="staffing-matrix-card">
          <div className="staffing-matrix-header">
            <div>
              <h3>Weekly Operating Room Staffing Matrix</h3>
              <p>Baseline recurring shifts and required clinical team complements (Monday – Saturday).</p>
            </div>
          </div>

          <div className="staffing-table-wrapper">
            <table className="staffing-matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Operating Room</th>
                  {DAYS_OF_WEEK.slice(1, 7).map(d => (
                    <th key={d.day}>{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SEED_OPERATING_ROOMS.map(room => {
                  return (
                    <tr key={room.id}>
                      <td className="staffing-room-cell">
                        <div className="staffing-room-num">{room.room_number}</div>
                        <div className="staffing-room-name">{room.room_name}</div>
                        <div className="staffing-suite-badge">{room.suite_designation}</div>
                      </td>

                      {/* Days Mon (1) to Sat (6) */}
                      {DAYS_OF_WEEK.slice(1, 7).map(d => {
                        const shift = windows.find(w => w.operating_room_id === room.id && w.day_of_week === d.day && w.is_active);

                        return (
                          <td key={d.day} className="staffing-shift-cell">
                            {shift ? (
                              <div className="staffing-shift-card">
                                <div className="staffing-shift-top">
                                  <span className="staffing-shift-hours">
                                    {shift.start_time} - {shift.end_time}
                                  </span>
                                  <span className="staffing-shift-duration">
                                    {Math.round(shift.gross_staffed_minutes / 60 * 10) / 10}h
                                  </span>
                                </div>

                                <div className="staffing-shift-name">{shift.shift_name}</div>

                                <div className="staffing-crew-row">
                                  <span className="staffing-crew-chip" title="Circulating RN">
                                    {shift.circulator_rn_count} RN
                                  </span>
                                  <span className="staffing-crew-chip" title="Surgical Technologist">
                                    {shift.scrub_tech_count} Tech
                                  </span>
                                  {shift.anesthesia_provider_count > 0 && (
                                    <span className="staffing-crew-chip" title="Anesthesia Provider">
                                      {shift.anesthesia_provider_count} Anesth
                                    </span>
                                  )}
                                </div>

                                <div className="staffing-shift-actions">
                                  <button
                                    type="button"
                                    className="staffing-icon-btn"
                                    onClick={() => handleOpenEditWindow(shift)}
                                    title="Edit shift"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    className="staffing-icon-btn delete"
                                    onClick={() => handleDeleteWindow(shift.id)}
                                    title="Delete shift"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="staffing-unstaffed-btn"
                                onClick={() => handleOpenAddWindow(room.id, d.day)}
                              >
                                <Plus size={13} />
                                <span>Unstaffed</span>
                              </button>
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
      )}

      {/* 5. Tab 2: Closures & Downtime Log */}
      {activeSubTab === 'closures' && (
        <div className="staffing-matrix-card">
          <div className="staffing-matrix-header">
            <div>
              <h3>Planned Operating Room Closures & Downtime</h3>
              <p>Holidays, preventive bio-cleaning, HVAC certifications, and training events deducted from the utilization denominator.</p>
            </div>
            <button
              type="button"
              className="staffing-btn staffing-btn-primary"
              onClick={() => setIsClosureModalOpen(true)}
            >
              <Plus size={15} />
              <span>Log Closure</span>
            </button>
          </div>

          <table className="staffing-data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Affected Room</th>
                <th>Closure Type</th>
                <th>Reason / Justification</th>
                <th>Denominator Deduction</th>
                <th>All-Day?</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {closures.map(c => {
                const typeObj = CLOSURE_TYPES[c.closure_type] || CLOSURE_TYPES.FACILITY_HOLIDAY;
                const roomObj = SEED_OPERATING_ROOMS.find(r => r.id === c.operating_room_id);

                return (
                  <tr key={c.id}>
                    <td>
                      <span className="staffing-date-pill">{c.closure_date}</span>
                    </td>
                    <td>
                      {roomObj ? (
                        <strong>{roomObj.room_number}: {roomObj.room_name}</strong>
                      ) : (
                        <span className="staffing-badge-all">All Facility Rooms</span>
                      )}
                    </td>
                    <td>
                      <span className="staffing-closure-type-badge">
                        {typeObj.label}
                      </span>
                    </td>
                    <td>{c.reason}</td>
                    <td>
                      <strong>-{c.deducted_denominator_minutes}m</strong> ({Math.round(c.deducted_denominator_minutes / 60 * 10) / 10}h)
                    </td>
                    <td>{c.is_all_day ? 'Yes' : 'Partial'}</td>
                    <td>
                      <button
                        type="button"
                        className="staffing-icon-btn delete"
                        onClick={() => handleDeleteClosure(c.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. Tab 3: Staffing Exceptions & Overtime */}
      {activeSubTab === 'exceptions' && (
        <div className="staffing-matrix-card">
          <div className="staffing-matrix-header">
            <div>
              <h3>Authorized Staffing Exceptions & Overtime Extensions</h3>
              <p>Ad-hoc early starts and scheduled overtime extensions augmenting baseline operating capacity.</p>
            </div>
          </div>

          <table className="staffing-data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Operating Room</th>
                <th>Exception Type</th>
                <th>Adjustment</th>
                <th>Reason</th>
                <th>Overtime Burden?</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map(e => {
                const roomObj = SEED_OPERATING_ROOMS.find(r => r.id === e.operating_room_id);
                return (
                  <tr key={e.id}>
                    <td><span className="staffing-date-pill">{e.exception_date}</span></td>
                    <td><strong>{roomObj ? roomObj.room_number : 'OR'}</strong></td>
                    <td>{EXCEPTION_TYPES[e.exception_type]?.label || e.exception_type}</td>
                    <td>
                      <strong className="staffing-text-emerald">+{e.adjustment_minutes}m</strong> ({e.adjustment_minutes / 60}h)
                    </td>
                    <td>{e.reason}</td>
                    <td>
                      {e.is_overtime_burden ? (
                        <span className="staffing-badge-warning">1.5x Overtime</span>
                      ) : (
                        'Standard'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 7. Modal: Add / Edit Staffing Window */}
      {isWindowModalOpen && editingWindow && (
        <div className="or-staffing-modal-overlay" onClick={() => setIsWindowModalOpen(false)}>
          <div
            className="or-staffing-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-staffing-modal-header">
              <div className="or-staffing-modal-title">
                <Clock size={18} className="staffing-modal-icon" />
                <span>Configure Recurring Staffing Window</span>
              </div>
              <button
                type="button"
                className="staffing-modal-close"
                onClick={() => setIsWindowModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveWindow}>
              <div className="or-staffing-modal-body">
                <div className="staffing-form-grid">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Operating Room *</label>
                    <select
                      className="staffing-form-control staffing-select"
                      value={editingWindow.operating_room_id}
                      onChange={(e) => setEditingWindow({ ...editingWindow, operating_room_id: e.target.value })}
                    >
                      {SEED_OPERATING_ROOMS.map(r => (
                        <option key={r.id} value={r.id}>{r.room_number}: {r.room_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Day of Week *</label>
                    <select
                      className="staffing-form-control staffing-select"
                      value={editingWindow.day_of_week}
                      onChange={(e) => setEditingWindow({ ...editingWindow, day_of_week: Number(e.target.value) })}
                    >
                      {DAYS_OF_WEEK.map(d => (
                        <option key={d.day} value={d.day}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="staffing-form-group">
                  <label className="staffing-form-label">Shift Name / Description *</label>
                  <input
                    type="text"
                    required
                    className="staffing-form-control staffing-input"
                    value={editingWindow.shift_name}
                    onChange={(e) => setEditingWindow({ ...editingWindow, shift_name: e.target.value })}
                  />
                </div>

                <div className="staffing-form-grid">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Start Time *</label>
                    <input
                      type="time"
                      required
                      className="staffing-form-control staffing-input"
                      value={editingWindow.start_time}
                      onChange={(e) => setEditingWindow({ ...editingWindow, start_time: e.target.value })}
                    />
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">End Time *</label>
                    <input
                      type="time"
                      required
                      className="staffing-form-control staffing-input"
                      value={editingWindow.end_time}
                      onChange={(e) => setEditingWindow({ ...editingWindow, end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="staffing-form-grid-3">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Circulator RNs</label>
                    <input
                      type="number"
                      min="1"
                      className="staffing-form-control staffing-input"
                      value={editingWindow.circulator_rn_count}
                      onChange={(e) => setEditingWindow({ ...editingWindow, circulator_rn_count: Number(e.target.value) })}
                    />
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Scrub Techs</label>
                    <input
                      type="number"
                      min="1"
                      className="staffing-form-control staffing-input"
                      value={editingWindow.scrub_tech_count}
                      onChange={(e) => setEditingWindow({ ...editingWindow, scrub_tech_count: Number(e.target.value) })}
                    />
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Anesthesia</label>
                    <input
                      type="number"
                      min="0"
                      className="staffing-form-control staffing-input"
                      value={editingWindow.anesthesia_provider_count}
                      onChange={(e) => setEditingWindow({ ...editingWindow, anesthesia_provider_count: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="or-staffing-modal-footer">
                <button
                  type="button"
                  className="staffing-btn staffing-btn-secondary"
                  onClick={() => setIsWindowModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="staffing-btn staffing-btn-primary"
                >
                  Save Staffing Window
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Modal: Log Room Closure */}
      {isClosureModalOpen && (
        <div className="or-staffing-modal-overlay" onClick={() => setIsClosureModalOpen(false)}>
          <div
            className="or-staffing-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-staffing-modal-header">
              <div className="or-staffing-modal-title">
                <AlertTriangle size={18} className="staffing-modal-icon-amber" />
                <span>Log Room Closure / Planned Downtime</span>
              </div>
              <button
                type="button"
                className="staffing-modal-close"
                onClick={() => setIsClosureModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveClosure}>
              <div className="or-staffing-modal-body">
                <div className="staffing-form-grid">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Operating Room Affected</label>
                    <select
                      className="staffing-form-control staffing-select"
                      value={newClosure.operating_room_id}
                      onChange={(e) => setNewClosure({ ...newClosure, operating_room_id: e.target.value })}
                    >
                      <option value="">Facility-Wide Closure (All Rooms)</option>
                      {SEED_OPERATING_ROOMS.map(r => (
                        <option key={r.id} value={r.id}>{r.room_number}: {r.room_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Closure Date *</label>
                    <input
                      type="date"
                      required
                      className="staffing-form-control staffing-input"
                      value={newClosure.closure_date}
                      onChange={(e) => setNewClosure({ ...newClosure, closure_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="staffing-form-grid">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Closure Category *</label>
                    <select
                      className="staffing-form-control staffing-select"
                      value={newClosure.closure_type}
                      onChange={(e) => setNewClosure({ ...newClosure, closure_type: e.target.value })}
                    >
                      {Object.values(CLOSURE_TYPES).map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Deducted Denominator Minutes *</label>
                    <input
                      type="number"
                      min="30"
                      step="30"
                      required
                      className="staffing-form-control staffing-input"
                      value={newClosure.deducted_denominator_minutes}
                      onChange={(e) => setNewClosure({ ...newClosure, deducted_denominator_minutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="staffing-form-group">
                  <label className="staffing-form-label">Clinical / Operational Reason *</label>
                  <textarea
                    rows="3"
                    required
                    className="staffing-form-control staffing-textarea"
                    placeholder="e.g. Scheduled HVAC HEPA filter replacement, Thanksgiving Day holiday, or nursing staff symposium."
                    value={newClosure.reason}
                    onChange={(e) => setNewClosure({ ...newClosure, reason: e.target.value })}
                  />
                </div>
              </div>

              <div className="or-staffing-modal-footer">
                <button
                  type="button"
                  className="staffing-btn staffing-btn-secondary"
                  onClick={() => setIsClosureModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="staffing-btn staffing-btn-primary"
                >
                  Log Closure Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. Modal: Denominator Simulator */}
      {isSimModalOpen && (
        <div className="or-staffing-modal-overlay" onClick={() => setIsSimModalOpen(false)}>
          <div
            className="or-staffing-modal-content staffing-modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-staffing-modal-header">
              <div className="or-staffing-modal-title">
                <Sparkles size={20} className="staffing-modal-icon-sky" />
                <span>Deterministic Denominator Simulation Workbench</span>
              </div>
              <button
                type="button"
                className="staffing-modal-close"
                onClick={() => setIsSimModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="or-staffing-modal-body">
              <p className="staffing-modal-desc">
                Compute the authoritative surgical utilization denominator across any calendar range. This resolves all recurring shifts, approved closures, and authorized overtime extensions.
              </p>

              {/* Controls */}
              <div className="staffing-sim-controls">
                <div className="staffing-form-grid-3">
                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Start Date</label>
                    <input
                      type="date"
                      className="staffing-form-control staffing-input"
                      value={simStartDate}
                      onChange={(e) => setSimStartDate(e.target.value)}
                    />
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">End Date</label>
                    <input
                      type="date"
                      className="staffing-form-control staffing-input"
                      value={simEndDate}
                      onChange={(e) => setSimEndDate(e.target.value)}
                    />
                  </div>

                  <div className="staffing-form-group">
                    <label className="staffing-form-label">Room Scope</label>
                    <select
                      className="staffing-form-control staffing-select"
                      value={simRoomFilter}
                      onChange={(e) => setSimRoomFilter(e.target.value)}
                    >
                      <option value="ALL">All Operating Rooms (Facility Baseline)</option>
                      {SEED_OPERATING_ROOMS.map(r => (
                        <option key={r.id} value={r.id}>{r.room_number}: {r.room_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Result Summary Banner */}
              <div className="staffing-sim-summary-box">
                <div className="staffing-sim-sum-item">
                  <div className="staffing-sum-label">TOTAL CALENDAR DAYS</div>
                  <div className="staffing-sum-val">{simResult.days_count} Days</div>
                </div>
                <div className="staffing-sim-sum-item">
                  <div className="staffing-sum-label">GROSS SCHEDULED</div>
                  <div className="staffing-sum-val">{Math.round(simResult.gross_minutes / 60)}h ({simResult.gross_minutes}m)</div>
                </div>
                <div className="staffing-sim-sum-item">
                  <div className="staffing-sum-label">PLANNED CLOSURES</div>
                  <div className="staffing-sum-val staffing-text-amber">-{Math.round(simResult.closure_deductions_minutes / 60)}h</div>
                </div>
                <div className="staffing-sim-sum-item">
                  <div className="staffing-sum-label">AUTHORIZED OVERTIME</div>
                  <div className="staffing-sum-val staffing-text-emerald">+{simResult.exception_minutes}m</div>
                </div>
                <div className="staffing-sim-sum-item primary">
                  <div className="staffing-sum-label">NET DENOMINATOR</div>
                  <div className="staffing-sum-val staffing-text-primary">{simResult.net_hours} Hours</div>
                  <div className="staffing-sum-sub">({simResult.net_minutes.toLocaleString()} Available Minutes)</div>
                </div>
              </div>

              {/* Room Breakdown Table */}
              <h4 style={{ fontSize: '13px', fontWeight: '700', margin: '16px 0 8px 0', color: '#0f172a' }}>
                ROOM-BY-ROOM DENOMINATOR BREAKDOWN
              </h4>

              <table className="staffing-data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Gross Staffed Hours</th>
                    <th>Closure Deductions</th>
                    <th>Overtime Extensions</th>
                    <th>Net Denominator (Hours)</th>
                    <th>Net Denominator (Minutes)</th>
                  </tr>
                </thead>
                <tbody>
                  {roomBreakdowns.map(({ room, net_minutes, gross_minutes, closure_deductions_minutes, exception_minutes, net_hours }) => (
                    <tr key={room.id}>
                      <td>
                        <strong>{room.room_number}</strong>: {room.room_name}
                      </td>
                      <td>{Math.round(gross_minutes / 60 * 10) / 10}h</td>
                      <td>
                        {closure_deductions_minutes > 0 ? (
                          <span className="staffing-text-amber">-{Math.round(closure_deductions_minutes / 60 * 10) / 10}h</span>
                        ) : '0h'}
                      </td>
                      <td>
                        {exception_minutes > 0 ? (
                          <span className="staffing-text-emerald">+{exception_minutes}m</span>
                        ) : '0m'}
                      </td>
                      <td>
                        <strong>{net_hours}h</strong>
                      </td>
                      <td>
                        <strong>{net_minutes.toLocaleString()}m</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="or-staffing-modal-footer">
              <button
                type="button"
                className="staffing-btn staffing-btn-primary"
                onClick={() => setIsSimModalOpen(false)}
              >
                Close Simulator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

