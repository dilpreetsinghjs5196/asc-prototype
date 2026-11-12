import React, { useState, useMemo } from 'react';
import {
  Building2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Search,
  Filter,
  Plus,
  Wrench,
  Activity,
  Layers,
  Sparkles,
  Info,
  DollarSign,
  Maximize2,
  Scale,
  Wind,
  Check,
  X,
  FileText,
  RefreshCw
} from 'lucide-react';
import {
  ROOM_TYPES,
  OPERATING_STATUSES,
  HVAC_CLASSES,
  SPECIALTIES,
  EQUIPMENT_CATALOG,
  BARIATRIC_SAFETY_MARGIN_LBS,
  SEED_OPERATING_ROOMS,
  evaluateCaseCompatibility,
  transitionRoomStatus,
  calculateFacilityOrKpis,
  filterOperatingRooms
} from '../services/operatingRoomModelService';
import './OperatingRoomModelView.css';

export default function OperatingRoomModelView() {
  const [rooms, setRooms] = useState(SEED_OPERATING_ROOMS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSuite, setSelectedSuite] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [isSimModalOpen, setIsSimModalOpen] = useState(false);
  const [statusChangeRoom, setStatusChangeRoom] = useState(null);
  const [statusReason, setStatusReason] = useState('');
  const [targetStatus, setTargetStatus] = useState('MAINTENANCE');

  // Compatibility Simulator Form State
  const [simForm, setSimForm] = useState({
    specialty_code: 'ORTHOPEDIC',
    required_equipment: ['ARTHROSCOPY_4K_TOWER', 'LAMINAR_CANOPY'],
    patient_weight_lbs: 260,
    is_joint_or_spine_implant: true
  });

  // Unique suites for filter dropdown
  const uniqueSuites = useMemo(() => {
    const set = new Set(rooms.map(r => r.suite_designation).filter(Boolean));
    return Array.from(set);
  }, [rooms]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return filterOperatingRooms(rooms, {
      searchQuery,
      suite: selectedSuite,
      status: selectedStatus,
      specialty: selectedSpecialty
    });
  }, [rooms, searchQuery, selectedSuite, selectedStatus, selectedSpecialty]);

  // Overall KPIs
  const kpis = useMemo(() => {
    return calculateFacilityOrKpis(rooms);
  }, [rooms]);

  // Handle open Add/Edit Room Modal
  const handleOpenAddRoom = () => {
    setEditingRoom({
      id: `room-custom-${Date.now()}`,
      facility_id: 'default-facility-1',
      room_number: `OR-${rooms.length + 1}`,
      room_name: 'New Surgical Suite',
      suite_designation: 'Main Surgical Suite',
      room_type: 'STANDARD_OR',
      square_footage: 480,
      table_weight_capacity_lbs: 550,
      hvac_cleanroom_class: 'ISO_CLASS_7',
      positive_pressure_pa: 2.6,
      air_changes_per_hour: 22,
      laminar_flow_enabled: true,
      hourly_cost_rate: 1500,
      standard_turnover_minutes: 25,
      operating_status: 'OPERATIONAL',
      is_active: true,
      specialties: [
        { specialty_code: 'GENERAL_SURGERY', specialty_name: 'General Surgery & Laparoscopy', compatibility_tier: 'PRIMARY', is_preferred: true }
      ],
      equipment: [
        { equipment_code: 'ARTHROSCOPY_4K_TOWER', equipment_name: '4K UHD Arthroscopy & Laparoscopy Tower', is_fixed: true, maintenance_status: 'CERTIFIED' }
      ]
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEditRoom = (room) => {
    setEditingRoom(JSON.parse(JSON.stringify(room)));
    setIsEditModalOpen(true);
  };

  const handleSaveRoom = (e) => {
    e.preventDefault();
    if (!editingRoom) return;

    setRooms(prev => {
      const exists = prev.find(r => r.id === editingRoom.id);
      if (exists) {
        return prev.map(r => r.id === editingRoom.id ? editingRoom : r);
      }
      return [...prev, editingRoom];
    });
    setIsEditModalOpen(false);
    setEditingRoom(null);
  };

  // Status transition handler
  const handleOpenStatusModal = (room) => {
    setStatusChangeRoom(room);
    setTargetStatus(room.operating_status === 'OPERATIONAL' ? 'MAINTENANCE' : 'OPERATIONAL');
    setStatusReason('');
  };

  const handleConfirmStatusChange = () => {
    if (!statusChangeRoom) return;
    const res = transitionRoomStatus(statusChangeRoom.operating_status, targetStatus, statusReason);
    if (!res.success) {
      alert(res.error);
      return;
    }

    setRooms(prev => prev.map(r => {
      if (r.id === statusChangeRoom.id) {
        return {
          ...r,
          operating_status: targetStatus,
          notes: statusReason ? `Status changed to ${targetStatus}: ${statusReason}` : r.notes
        };
      }
      return r;
    }));

    setStatusChangeRoom(null);
    setStatusReason('');
  };

  // Compatibility simulation calculations across all rooms
  const simulationResults = useMemo(() => {
    return rooms.map(room => {
      const evalRes = evaluateCaseCompatibility(room, simForm);
      return {
        room,
        ...evalRes
      };
    });
  }, [rooms, simForm]);

  const toggleSimEquipment = (code) => {
    setSimForm(prev => {
      const exists = prev.required_equipment.includes(code);
      return {
        ...prev,
        required_equipment: exists
          ? prev.required_equipment.filter(c => c !== code)
          : [...prev.required_equipment, code]
      };
    });
  };

  return (
    <div className="or-model-container">
      {/* 1. Header Bar */}
      <div className="or-model-header">
        <div className="or-model-header-title">
          <div className="or-header-icon-box">
            <Building2 size={24} className="or-header-icon" />
          </div>
          <div>
            <h1>Operating Room Master Model</h1>
            <p>
              Authoritative physical asset configuration, HVAC cleanroom ratings, bariatric safety bounds, and specialty compatibility.
            </p>
          </div>
        </div>

        <div className="or-header-actions">
          <button
            type="button"
            className="or-btn or-btn-secondary"
            onClick={() => setIsSimModalOpen(true)}
          >
            <Sparkles size={16} />
            <span>Case Fit Simulator</span>
          </button>
          <button
            type="button"
            className="or-btn or-btn-primary"
            onClick={handleOpenAddRoom}
          >
            <Plus size={16} />
            <span>Add Operating Room</span>
          </button>
        </div>
      </div>

      {/* 2. Operational Metric Ribbon (5 Cards) */}
      <div className="or-kpi-grid">
        <div className="or-kpi-card">
          <div className="or-kpi-label">TOTAL OPERATING ROOMS</div>
          <div className="or-kpi-value">{kpis.total_rooms}</div>
          <div className="or-kpi-subtext">{kpis.unique_suites_count} Active Surgical Suites</div>
        </div>

        <div className="or-kpi-card">
          <div className="or-kpi-label">OPERATIONAL AVAILABILITY</div>
          <div className="or-kpi-value or-text-emerald">
            {kpis.operational_rate_pct}%
          </div>
          <div className="or-kpi-subtext">
            {kpis.operational_count} of {kpis.total_rooms} Rooms Schedulable
          </div>
        </div>

        <div className="or-kpi-card">
          <div className="or-kpi-label">AVG TURNOVER TARGET</div>
          <div className="or-kpi-value">{kpis.avg_standard_turnover_min} <span className="or-kpi-unit">min</span></div>
          <div className="or-kpi-subtext">Standard Target Benchmark</div>
        </div>

        <div className="or-kpi-card">
          <div className="or-kpi-label">AVG OR HOURLY OVERHEAD</div>
          <div className="or-kpi-value">${kpis.avg_hourly_cost_rate.toLocaleString()} <span className="or-kpi-unit">/hr</span></div>
          <div className="or-kpi-subtext">${Math.round(kpis.avg_hourly_cost_rate / 60)}/minute facility baseline</div>
        </div>

        <div className="or-kpi-card">
          <div className="or-kpi-label">HIGH-TECH & LAMINAR ROOMS</div>
          <div className="or-kpi-value or-text-sky">{kpis.high_tech_rooms_count}</div>
          <div className="or-kpi-subtext">Laminar Flow / Robotic / Hybrid</div>
        </div>
      </div>

      {/* 3. Controls & Filter Bar */}
      <div className="or-filter-bar">
        <div className="or-search-box">
          <Search size={16} className="or-search-icon" />
          <input
            type="text"
            className="or-form-control or-search-input"
            placeholder="Search by room #, name, suite, or equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="or-search-clear-btn"
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="or-filter-select-group">
          {/* Suite Filter */}
          <select
            className="or-form-control or-select"
            value={selectedSuite}
            onChange={(e) => setSelectedSuite(e.target.value)}
          >
            <option value="ALL">All Surgical Suites</option>
            {uniqueSuites.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Specialty Filter */}
          <select
            className="or-form-control or-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
          >
            <option value="ALL">All Clinical Specialties</option>
            {SPECIALTIES.map(sp => (
              <option key={sp.code} value={sp.code}>{sp.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            className="or-form-control or-select"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            {Object.values(OPERATING_STATUSES).map(st => (
              <option key={st.code} value={st.code}>{st.label}</option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="or-view-toggle">
            <button
              type="button"
              className={`or-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Layers size={15} />
            </button>
            <button
              type="button"
              className={`or-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <FileText size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main Rooms Display (Grid or Table) */}
      {filteredRooms.length === 0 ? (
        <div className="or-empty-state">
          <Building2 size={44} className="or-empty-icon" />
          <h3>No Operating Rooms Match Criteria</h3>
          <p>Try resetting the search keywords or filters to see configured operating suites.</p>
          <button
            type="button"
            className="or-btn or-btn-secondary"
            onClick={() => {
              setSearchQuery('');
              setSelectedSuite('ALL');
              setSelectedStatus('ALL');
              setSelectedSpecialty('ALL');
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="or-room-card-grid">
          {filteredRooms.map(room => {
            const statusConfig = OPERATING_STATUSES[room.operating_status] || OPERATING_STATUSES.OPERATIONAL;
            const hvacConfig = HVAC_CLASSES[room.hvac_cleanroom_class] || HVAC_CLASSES.ISO_CLASS_7;

            return (
              <div key={room.id} className="or-room-card">
                {/* Card Header */}
                <div className="or-card-header">
                  <div>
                    <div className="or-room-identifier">
                      <span className="or-room-num">{room.room_number}</span>
                      <span className="or-suite-tag">{room.suite_designation}</span>
                    </div>
                    <div className="or-room-fullname">{room.room_name}</div>
                  </div>

                  <button
                    type="button"
                    className={`or-status-badge or-status-${statusConfig.badgeClass}`}
                    onClick={() => handleOpenStatusModal(room)}
                    title="Click to toggle status"
                  >
                    <span className="or-status-dot"></span>
                    {statusConfig.label}
                  </button>
                </div>

                {/* Specs Metric Row */}
                <div className="or-card-specs-row">
                  <div className="or-spec-item" title="Room Size">
                    <Maximize2 size={13} className="or-spec-icon" />
                    <span>{room.square_footage} sq ft</span>
                  </div>
                  <div className="or-spec-item" title="Table Weight Limit">
                    <Scale size={13} className="or-spec-icon" />
                    <span>{room.table_weight_capacity_lbs} lbs max</span>
                  </div>
                  <div className="or-spec-item" title="HVAC Cleanroom Class & Air Changes">
                    <Wind size={13} className="or-spec-icon" />
                    <span>{hvacConfig.label.split(' ')[0]} ({room.air_changes_per_hour} ACH)</span>
                  </div>
                  <div className="or-spec-item" title="Turnover Target Standard">
                    <Clock size={13} className="or-spec-icon" />
                    <span>{room.standard_turnover_minutes}m turnover</span>
                  </div>
                </div>

                {/* Technical Flags */}
                <div className="or-card-flags">
                  {room.laminar_flow_enabled && (
                    <span className="or-flag-pill or-flag-laminar">
                      <ShieldCheck size={11} /> Laminar Flow Canopy
                    </span>
                  )}
                  {room.room_type === 'ROBOTIC_SUITE' && (
                    <span className="or-flag-pill or-flag-robotic">
                      <Sparkles size={11} /> Robotic Outfitted
                    </span>
                  )}
                  {room.room_type === 'HYBRID_OR' && (
                    <span className="or-flag-pill or-flag-hybrid">
                      <Activity size={11} /> Hybrid Imaging
                    </span>
                  )}
                  <span className="or-flag-cost">
                    ${room.hourly_cost_rate}/hr
                  </span>
                </div>

                {/* Specialties Tag Cloud */}
                <div className="or-card-section">
                  <div className="or-section-label">CONFIGURED SPECIALTIES</div>
                  <div className="or-tags-cloud">
                    {(room.specialties || []).map(sp => (
                      <span
                        key={sp.specialty_code}
                        className={`or-specialty-tag or-tier-${(sp.compatibility_tier || 'primary').toLowerCase()}`}
                      >
                        {sp.specialty_name}
                        {sp.compatibility_tier === 'SECONDARY' && <span className="or-tier-sub">2nd</span>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Equipment Tags */}
                <div className="or-card-section">
                  <div className="or-section-label">FIXED & BOOM EQUIPMENT ({room.equipment?.length || 0})</div>
                  <div className="or-equipment-list">
                    {(room.equipment || []).map(eq => (
                      <span
                        key={eq.equipment_code}
                        className={`or-equip-chip ${eq.maintenance_status === 'CERTIFIED' ? 'certified' : 'pending'}`}
                        title={`Status: ${eq.maintenance_status}`}
                      >
                        <Check size={10} />
                        {eq.equipment_name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="or-card-footer">
                  <button
                    type="button"
                    className="or-btn or-btn-outline"
                    onClick={() => handleOpenStatusModal(room)}
                  >
                    <Wrench size={14} /> Status
                  </button>
                  <button
                    type="button"
                    className="or-btn or-btn-secondary"
                    onClick={() => handleOpenEditRoom(room)}
                  >
                    Edit Room
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="or-table-container">
          <table className="or-table">
            <thead>
              <tr>
                <th>Room #</th>
                <th>Room Name & Suite</th>
                <th>Type</th>
                <th>Size (sq ft)</th>
                <th>Table Limit</th>
                <th>HVAC / ACH</th>
                <th>Turnover</th>
                <th>Cost Rate</th>
                <th>Status</th>
                <th>Specialties</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map(room => {
                const statusConfig = OPERATING_STATUSES[room.operating_status] || OPERATING_STATUSES.OPERATIONAL;
                return (
                  <tr key={room.id}>
                    <td>
                      <span className="or-table-room-code">{room.room_number}</span>
                    </td>
                    <td>
                      <div className="or-table-room-name">{room.room_name}</div>
                      <div className="or-table-room-suite">{room.suite_designation}</div>
                    </td>
                    <td>
                      <span className="or-type-badge">{room.room_type}</span>
                    </td>
                    <td>{room.square_footage}</td>
                    <td>{room.table_weight_capacity_lbs} lbs</td>
                    <td>
                      <div>{room.hvac_cleanroom_class}</div>
                      <div className="or-text-muted">{room.air_changes_per_hour} ACH</div>
                    </td>
                    <td>{room.standard_turnover_minutes} min</td>
                    <td>${room.hourly_cost_rate}/hr</td>
                    <td>
                      <span className={`or-status-badge or-status-${statusConfig.badgeClass}`}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td>
                      <div className="or-table-specialties-cell">
                        {(room.specialties || []).slice(0, 2).map(s => (
                          <span key={s.specialty_code} className="or-specialty-tag or-tier-primary">
                            {s.specialty_name.split(' ')[0]}
                          </span>
                        ))}
                        {(room.specialties?.length || 0) > 2 && (
                          <span className="or-text-muted">+{room.specialties.length - 2} more</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="or-table-action-group">
                        <button
                          type="button"
                          className="or-table-btn"
                          onClick={() => handleOpenEditRoom(room)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="or-table-btn"
                          onClick={() => handleOpenStatusModal(room)}
                        >
                          Status
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Add / Edit Operating Room Modal */}
      {isEditModalOpen && editingRoom && (
        <div className="or-model-modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div
            className="or-model-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-model-modal-header">
              <div className="or-model-modal-title">
                <Building2 size={20} className="or-modal-header-icon" />
                <span>{editingRoom.id.includes('custom') ? 'Add Operating Room' : `Edit ${editingRoom.room_number}`}</span>
              </div>
              <button
                type="button"
                className="or-modal-close-btn"
                onClick={() => setIsEditModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRoom}>
              <div className="or-model-modal-body">
                <div className="or-form-grid">
                  <div className="or-form-group">
                    <label className="or-form-label">Room Number / Identifier *</label>
                    <input
                      type="text"
                      required
                      className="or-form-control or-input"
                      value={editingRoom.room_number}
                      onChange={(e) => setEditingRoom({ ...editingRoom, room_number: e.target.value })}
                    />
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Suite Designation *</label>
                    <input
                      type="text"
                      required
                      className="or-form-control or-input"
                      value={editingRoom.suite_designation}
                      onChange={(e) => setEditingRoom({ ...editingRoom, suite_designation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="or-form-group">
                  <label className="or-form-label">Full Clinical Room Name *</label>
                  <input
                    type="text"
                    required
                    className="or-form-control or-input"
                    value={editingRoom.room_name}
                    onChange={(e) => setEditingRoom({ ...editingRoom, room_name: e.target.value })}
                  />
                </div>

                <div className="or-form-grid">
                  <div className="or-form-group">
                    <label className="or-form-label">Room Type *</label>
                    <select
                      className="or-form-control or-select"
                      value={editingRoom.room_type}
                      onChange={(e) => setEditingRoom({ ...editingRoom, room_type: e.target.value })}
                    >
                      {Object.values(ROOM_TYPES).map(t => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Operating Status *</label>
                    <select
                      className="or-form-control or-select"
                      value={editingRoom.operating_status}
                      onChange={(e) => setEditingRoom({ ...editingRoom, operating_status: e.target.value })}
                    >
                      {Object.values(OPERATING_STATUSES).map(s => (
                        <option key={s.code} value={s.code}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="or-form-grid-3">
                  <div className="or-form-group">
                    <label className="or-form-label">Size (Square Feet)</label>
                    <input
                      type="number"
                      min="100"
                      className="or-form-control or-input"
                      value={editingRoom.square_footage}
                      onChange={(e) => setEditingRoom({ ...editingRoom, square_footage: Number(e.target.value) })}
                    />
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Table Weight Limit (lbs)</label>
                    <input
                      type="number"
                      min="300"
                      className="or-form-control or-input"
                      value={editingRoom.table_weight_capacity_lbs}
                      onChange={(e) => setEditingRoom({ ...editingRoom, table_weight_capacity_lbs: Number(e.target.value) })}
                    />
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Standard Turnover (min)</label>
                    <input
                      type="number"
                      min="5"
                      className="or-form-control or-input"
                      value={editingRoom.standard_turnover_minutes}
                      onChange={(e) => setEditingRoom({ ...editingRoom, standard_turnover_minutes: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="or-form-grid-3">
                  <div className="or-form-group">
                    <label className="or-form-label">HVAC Cleanroom Class</label>
                    <select
                      className="or-form-control or-select"
                      value={editingRoom.hvac_cleanroom_class}
                      onChange={(e) => setEditingRoom({ ...editingRoom, hvac_cleanroom_class: e.target.value })}
                    >
                      {Object.values(HVAC_CLASSES).map(h => (
                        <option key={h.code} value={h.code}>{h.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Air Changes / Hr (ACH)</label>
                    <input
                      type="number"
                      min="10"
                      className="or-form-control or-input"
                      value={editingRoom.air_changes_per_hour}
                      onChange={(e) => setEditingRoom({ ...editingRoom, air_changes_per_hour: Number(e.target.value) })}
                    />
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Cost Rate ($ / OR Hour)</label>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      className="or-form-control or-input"
                      value={editingRoom.hourly_cost_rate}
                      onChange={(e) => setEditingRoom({ ...editingRoom, hourly_cost_rate: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="or-form-checkbox-row">
                  <label className="or-checkbox-label">
                    <input
                      type="checkbox"
                      checked={editingRoom.laminar_flow_enabled}
                      onChange={(e) => setEditingRoom({ ...editingRoom, laminar_flow_enabled: e.target.checked })}
                    />
                    <span>Laminar Flow Canopy Installed (Required for Joint & Spine Implants)</span>
                  </label>
                </div>
              </div>

              <div className="or-model-modal-footer">
                <button
                  type="button"
                  className="or-btn or-btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="or-btn or-btn-primary"
                >
                  Save Operating Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Status Transition Modal */}
      {statusChangeRoom && (
        <div className="or-model-modal-overlay" onClick={() => setStatusChangeRoom(null)}>
          <div
            className="or-model-modal-content or-modal-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-model-modal-header">
              <div className="or-model-modal-title">
                <Wrench size={18} className="or-modal-header-icon" />
                <span>Transition Status: {statusChangeRoom.room_number}</span>
              </div>
              <button
                type="button"
                className="or-modal-close-btn"
                onClick={() => setStatusChangeRoom(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="or-model-modal-body">
              <p className="or-modal-description">
                Current status is <strong>{statusChangeRoom.operating_status}</strong>. Select target status and provide an operational reason for the audit ledger.
              </p>

              <div className="or-form-group">
                <label className="or-form-label">Target Status *</label>
                <select
                  className="or-form-control or-select"
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                >
                  {Object.values(OPERATING_STATUSES).map(st => (
                    <option key={st.code} value={st.code}>{st.label}</option>
                  ))}
                </select>
              </div>

              <div className="or-form-group">
                <label className="or-form-label">Operational Reason / Downtime Scope *</label>
                <textarea
                  className="or-form-control or-textarea"
                  rows="3"
                  placeholder="e.g. Scheduled bio-cleaning, HVAC filter certification, or C-arm boom calibration"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
            </div>

            <div className="or-model-modal-footer">
              <button
                type="button"
                className="or-btn or-btn-secondary"
                onClick={() => setStatusChangeRoom(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="or-btn or-btn-primary"
                onClick={handleConfirmStatusChange}
              >
                Confirm Status Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Case Compatibility Simulator Modal / Drawer */}
      {isSimModalOpen && (
        <div className="or-model-modal-overlay" onClick={() => setIsSimModalOpen(false)}>
          <div
            className="or-model-modal-content or-modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="or-model-modal-header">
              <div className="or-model-modal-title">
                <Sparkles size={20} className="or-modal-header-icon" />
                <span>Deterministic Surgical Case Fit Simulator</span>
              </div>
              <button
                type="button"
                className="or-modal-close-btn"
                onClick={() => setIsSimModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="or-model-modal-body">
              <p className="or-modal-description">
                Simulate prospective case parameters against the physical constraints, equipment inventory, and HVAC standards of every operating room in the facility.
              </p>

              {/* Simulator Input Controls */}
              <div className="or-sim-controls-card">
                <div className="or-form-grid">
                  <div className="or-form-group">
                    <label className="or-form-label">Surgical Specialty</label>
                    <select
                      className="or-form-control or-select"
                      value={simForm.specialty_code}
                      onChange={(e) => setSimForm({ ...simForm, specialty_code: e.target.value })}
                    >
                      {SPECIALTIES.map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="or-form-group">
                    <label className="or-form-label">Patient Body Weight (lbs)</label>
                    <input
                      type="number"
                      min="50"
                      max="800"
                      className="or-form-control or-input"
                      value={simForm.patient_weight_lbs}
                      onChange={(e) => setSimForm({ ...simForm, patient_weight_lbs: Number(e.target.value) })}
                    />
                    <span className="or-field-help">
                      Includes automatic {BARIATRIC_SAFETY_MARGIN_LBS} lb surgical drape/positioner margin
                    </span>
                  </div>
                </div>

                <div className="or-form-group">
                  <label className="or-form-label">Required Room Equipment</label>
                  <div className="or-sim-equip-grid">
                    {EQUIPMENT_CATALOG.map(eq => {
                      const isSelected = simForm.required_equipment.includes(eq.code);
                      return (
                        <button
                          key={eq.code}
                          type="button"
                          className={`or-sim-equip-btn ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleSimEquipment(eq.code)}
                        >
                          {isSelected ? <Check size={12} /> : <Plus size={12} />}
                          <span>{eq.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="or-form-checkbox-row">
                  <label className="or-checkbox-label">
                    <input
                      type="checkbox"
                      checked={simForm.is_joint_or_spine_implant}
                      onChange={(e) => setSimForm({ ...simForm, is_joint_or_spine_implant: e.target.checked })}
                    />
                    <span>Procedure Involves Joint Arthroplasty or Spine Hardware (Enforce ISO Class 7 + Laminar Flow)</span>
                  </label>
                </div>
              </div>

              {/* Simulation Scorecards */}
              <div className="or-sim-results-title">
                SIMULATION RESULTS: COMPATIBILITY ACROSS {rooms.length} ROOMS
              </div>

              <div className="or-sim-results-grid">
                {simulationResults.map(({ room, is_compatible, compatibility_tier, errors, warnings, weight_margin_lbs, hourly_rate }) => {
                  const cardStatusClass = !is_compatible ? 'incompatible' : (compatibility_tier === 'SECONDARY' || warnings.length > 0 ? 'warning' : 'primary');

                  return (
                    <div key={room.id} className={`or-sim-result-card ${cardStatusClass}`}>
                      <div className="or-sim-card-top">
                        <div>
                          <div className="or-sim-room-title">{room.room_number}: {room.room_name}</div>
                          <div className="or-sim-suite-label">{room.suite_designation}</div>
                        </div>

                        <div className={`or-sim-status-chip ${cardStatusClass}`}>
                          {is_compatible ? (compatibility_tier === 'PRIMARY' ? '100% Primary Fit' : 'Secondary Match') : 'Incompatible'}
                        </div>
                      </div>

                      <div className="or-sim-metrics-row">
                        <span>Weight Buffer: <strong>{weight_margin_lbs} lbs</strong></span>
                        <span>Overhead: <strong>${hourly_rate}/hr</strong></span>
                        <span>Turnover: <strong>{room.standard_turnover_minutes}m</strong></span>
                      </div>

                      {/* Errors or Warnings */}
                      {errors.length > 0 && (
                        <div className="or-sim-error-box">
                          {errors.map((err, i) => (
                            <div key={i} className="or-sim-error-line">
                              <AlertTriangle size={13} className="or-err-icon" />
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {warnings.length > 0 && errors.length === 0 && (
                        <div className="or-sim-warning-box">
                          {warnings.map((warn, i) => (
                            <div key={i} className="or-sim-warning-line">
                              <Info size={13} className="or-warn-icon" />
                              <span>{warn}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="or-model-modal-footer">
              <button
                type="button"
                className="or-btn or-btn-primary"
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
