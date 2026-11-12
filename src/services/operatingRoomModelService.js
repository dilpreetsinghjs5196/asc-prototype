/**
 * Operating Room Master Model Service (Phase A0)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic physical constraint evaluation, specialty compatibility verification,
 * bariatric safety bounds, cleanroom HVAC compliance, and operational status transitions.
 */

export const ROOM_TYPES = {
  STANDARD_OR: { code: 'STANDARD_OR', label: 'Standard Surgical OR', defaultSqft: 450 },
  HYBRID_OR: { code: 'HYBRID_OR', label: 'Hybrid Fluoroscopy OR', defaultSqft: 650 },
  PROCEDURE_ROOM: { code: 'PROCEDURE_ROOM', label: 'Minor Procedure Room', defaultSqft: 320 },
  ENDOSCOPY_SUITE: { code: 'ENDOSCOPY_SUITE', label: 'GI / Endoscopy Suite', defaultSqft: 380 },
  MINIMAL_INVASIVE_SUITE: { code: 'MINIMAL_INVASIVE_SUITE', label: 'Minimally Invasive Suite', defaultSqft: 500 },
  ROBOTIC_SUITE: { code: 'ROBOTIC_SUITE', label: 'Robotic Surgical Suite', defaultSqft: 620 }
};

export const OPERATING_STATUSES = {
  OPERATIONAL: { code: 'OPERATIONAL', label: 'Operational', badgeClass: 'operational', isSchedulable: true },
  MAINTENANCE: { code: 'MAINTENANCE', label: 'Maintenance / Inspection', badgeClass: 'maintenance', isSchedulable: false },
  RENOVATION: { code: 'RENOVATION', label: 'Extended Renovation', badgeClass: 'renovation', isSchedulable: false },
  DECOMMISSIONED: { code: 'DECOMMISSIONED', label: 'Decommissioned', badgeClass: 'decommissioned', isSchedulable: false }
};

export const HVAC_CLASSES = {
  ISO_CLASS_5: { code: 'ISO_CLASS_5', label: 'ISO Class 5 (Ultra-Clean)', minAch: 30, meetsJointStandard: true },
  ISO_CLASS_6: { code: 'ISO_CLASS_6', label: 'ISO Class 6 (Critical Sterile)', minAch: 25, meetsJointStandard: true },
  ISO_CLASS_7: { code: 'ISO_CLASS_7', label: 'ISO Class 7 (Standard Surgical Suite)', minAch: 20, meetsJointStandard: true },
  ISO_CLASS_8: { code: 'ISO_CLASS_8', label: 'ISO Class 8 (Procedure Room)', minAch: 15, meetsJointStandard: false },
  STANDARD_VENTILATED: { code: 'STANDARD_VENTILATED', label: 'Standard Ventilated Room', minAch: 12, meetsJointStandard: false }
};

export const SPECIALTIES = [
  { code: 'ORTHOPEDIC', name: 'Orthopedics & Joint Arthroplasty', requiresLaminarForImplants: true },
  { code: 'SPINE', name: 'Spine Surgery', requiresLaminarForImplants: true },
  { code: 'OPHTHALMOLOGY', name: 'Ophthalmology / Cataract', requiresLaminarForImplants: false },
  { code: 'ENT', name: 'Otolaryngology (ENT)', requiresLaminarForImplants: false },
  { code: 'GENERAL_SURGERY', name: 'General Surgery & Laparoscopy', requiresLaminarForImplants: false },
  { code: 'PAIN_MANAGEMENT', name: 'Interventional Pain Management', requiresLaminarForImplants: false },
  { code: 'UROLOGY', name: 'Urology', requiresLaminarForImplants: false },
  { code: 'PLASTICS', name: 'Plastic & Reconstructive Surgery', requiresLaminarForImplants: false },
  { code: 'VASCULAR', name: 'Vascular Surgery', requiresLaminarForImplants: false },
  { code: 'GI_ENDOSCOPY', name: 'Gastroenterology / Endoscopy', requiresLaminarForImplants: false }
];

export const EQUIPMENT_CATALOG = [
  { code: 'C_ARM_FLUORO', name: 'C-Arm Fluoroscopy (Mobile/Boom)', category: 'Imaging' },
  { code: 'ROBOTIC_CONSOLE', name: 'Surgical Robotic System Console', category: 'Robotics' },
  { code: 'ARTHROSCOPY_4K_TOWER', name: '4K UHD Arthroscopy & Laparoscopy Tower', category: 'Endoscopy' },
  { code: 'MICROSCOPE_OPHTHALMIC', name: 'Operating Microscope (Ophthalmic/Neuro)', category: 'Optics' },
  { code: 'JACKSON_SPINE_TABLE', name: 'Jackson Spinal Radiolucent Table', category: 'Patient Positioning' },
  { code: 'LAMINAR_CANOPY', name: 'Ceiling Laminar Airflow Canopy', category: 'HVAC' },
  { code: 'ULTRASOUND_STATION', name: 'High-Resolution Ultrasound Station', category: 'Imaging' },
  { code: 'RADIOFREQUENCY_ABLATION', name: 'Radiofrequency Ablation Generator', category: 'Electrosurgical' },
  { code: 'SMOKE_EVACUATION', name: 'Surgical Smoke Evacuation System', category: 'Environmental' }
];

export const BARIATRIC_SAFETY_MARGIN_LBS = 50;

/**
 * Initial Seed Operating Rooms for Austin Surgery Center (Facility Tenant Baseline)
 */
export const SEED_OPERATING_ROOMS = [
  {
    id: 'room-or-1',
    facility_id: 'default-facility-1',
    room_number: 'OR-1',
    room_name: 'Main Orthopedic & Joint Suite',
    suite_designation: 'Main Surgical Suite',
    room_type: 'STANDARD_OR',
    square_footage: 520.00,
    table_weight_capacity_lbs: 600,
    hvac_cleanroom_class: 'ISO_CLASS_7',
    positive_pressure_pa: 2.80,
    air_changes_per_hour: 24,
    laminar_flow_enabled: true,
    hourly_cost_rate: 1550.00,
    standard_turnover_minutes: 25,
    operating_status: 'OPERATIONAL',
    is_active: true,
    specialties: [
      { specialty_code: 'ORTHOPEDIC', specialty_name: 'Orthopedics & Joint Arthroplasty', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'SPINE', specialty_name: 'Spine Surgery', compatibility_tier: 'SECONDARY', is_preferred: false },
      { specialty_code: 'GENERAL_SURGERY', specialty_name: 'General Surgery & Laparoscopy', compatibility_tier: 'SECONDARY', is_preferred: false }
    ],
    equipment: [
      { equipment_code: 'LAMINAR_CANOPY', equipment_name: 'Ceiling Laminar Airflow Canopy', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'ARTHROSCOPY_4K_TOWER', equipment_name: '4K UHD Arthroscopy & Laparoscopy Tower', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'C_ARM_FLUORO', equipment_name: 'C-Arm Fluoroscopy (Mobile/Boom)', is_fixed: false, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'SMOKE_EVACUATION', equipment_name: 'Surgical Smoke Evacuation System', is_fixed: true, maintenance_status: 'CERTIFIED' }
    ]
  },
  {
    id: 'room-or-2',
    facility_id: 'default-facility-1',
    room_number: 'OR-2',
    room_name: 'Spine & Advanced Neuro Suite',
    suite_designation: 'Main Surgical Suite',
    room_type: 'HYBRID_OR',
    square_footage: 620.00,
    table_weight_capacity_lbs: 650,
    hvac_cleanroom_class: 'ISO_CLASS_7',
    positive_pressure_pa: 3.10,
    air_changes_per_hour: 26,
    laminar_flow_enabled: true,
    hourly_cost_rate: 1750.00,
    standard_turnover_minutes: 30,
    operating_status: 'OPERATIONAL',
    is_active: true,
    specialties: [
      { specialty_code: 'SPINE', specialty_name: 'Spine Surgery', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'ORTHOPEDIC', specialty_name: 'Orthopedics & Joint Arthroplasty', compatibility_tier: 'PRIMARY', is_preferred: false },
      { specialty_code: 'PAIN_MANAGEMENT', specialty_name: 'Interventional Pain Management', compatibility_tier: 'SECONDARY', is_preferred: false }
    ],
    equipment: [
      { equipment_code: 'JACKSON_SPINE_TABLE', equipment_name: 'Jackson Spinal Radiolucent Table', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'C_ARM_FLUORO', equipment_name: 'C-Arm Fluoroscopy (Mobile/Boom)', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'LAMINAR_CANOPY', equipment_name: 'Ceiling Laminar Airflow Canopy', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'MICROSCOPE_OPHTHALMIC', equipment_name: 'Operating Microscope (Ophthalmic/Neuro)', is_fixed: true, maintenance_status: 'CERTIFIED' }
    ]
  },
  {
    id: 'room-or-3',
    facility_id: 'default-facility-1',
    room_number: 'OR-3',
    room_name: 'Robotic & Minimally Invasive Suite',
    suite_designation: 'West Pavilion',
    room_type: 'ROBOTIC_SUITE',
    square_footage: 680.00,
    table_weight_capacity_lbs: 550,
    hvac_cleanroom_class: 'ISO_CLASS_7',
    positive_pressure_pa: 2.70,
    air_changes_per_hour: 22,
    laminar_flow_enabled: true,
    hourly_cost_rate: 1850.00,
    standard_turnover_minutes: 30,
    operating_status: 'OPERATIONAL',
    is_active: true,
    specialties: [
      { specialty_code: 'GENERAL_SURGERY', specialty_name: 'General Surgery & Laparoscopy', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'UROLOGY', specialty_name: 'Urology', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'PLASTICS', specialty_name: 'Plastic & Reconstructive Surgery', compatibility_tier: 'SECONDARY', is_preferred: false }
    ],
    equipment: [
      { equipment_code: 'ROBOTIC_CONSOLE', equipment_name: 'Surgical Robotic System Console', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'ARTHROSCOPY_4K_TOWER', equipment_name: '4K UHD Arthroscopy & Laparoscopy Tower', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'SMOKE_EVACUATION', equipment_name: 'Surgical Smoke Evacuation System', is_fixed: true, maintenance_status: 'CERTIFIED' }
    ]
  },
  {
    id: 'room-or-4',
    facility_id: 'default-facility-1',
    room_number: 'OR-4',
    room_name: 'Ophthalmology & ENT Clean Suite',
    suite_designation: 'West Pavilion',
    room_type: 'STANDARD_OR',
    square_footage: 440.00,
    table_weight_capacity_lbs: 450,
    hvac_cleanroom_class: 'ISO_CLASS_7',
    positive_pressure_pa: 2.50,
    air_changes_per_hour: 20,
    laminar_flow_enabled: true,
    hourly_cost_rate: 1350.00,
    standard_turnover_minutes: 18,
    operating_status: 'OPERATIONAL',
    is_active: true,
    specialties: [
      { specialty_code: 'OPHTHALMOLOGY', specialty_name: 'Ophthalmology / Cataract', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'ENT', specialty_name: 'Otolaryngology (ENT)', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'PLASTICS', specialty_name: 'Plastic & Reconstructive Surgery', compatibility_tier: 'SECONDARY', is_preferred: false }
    ],
    equipment: [
      { equipment_code: 'MICROSCOPE_OPHTHALMIC', equipment_name: 'Operating Microscope (Ophthalmic/Neuro)', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'ULTRASOUND_STATION', equipment_name: 'High-Resolution Ultrasound Station', is_fixed: false, maintenance_status: 'CERTIFIED' }
    ]
  },
  {
    id: 'room-proc-1',
    facility_id: 'default-facility-1',
    room_number: 'PROC-1',
    room_name: 'Fluoroscopy & Interventional Pain Suite',
    suite_designation: 'Main Surgical Suite',
    room_type: 'PROCEDURE_ROOM',
    square_footage: 360.00,
    table_weight_capacity_lbs: 500,
    hvac_cleanroom_class: 'ISO_CLASS_8',
    positive_pressure_pa: 1.80,
    air_changes_per_hour: 16,
    laminar_flow_enabled: false,
    hourly_cost_rate: 950.00,
    standard_turnover_minutes: 15,
    operating_status: 'MAINTENANCE',
    is_active: true,
    specialties: [
      { specialty_code: 'PAIN_MANAGEMENT', specialty_name: 'Interventional Pain Management', compatibility_tier: 'PRIMARY', is_preferred: true },
      { specialty_code: 'VASCULAR', specialty_name: 'Vascular Surgery', compatibility_tier: 'SECONDARY', is_preferred: false }
    ],
    equipment: [
      { equipment_code: 'C_ARM_FLUORO', equipment_name: 'C-Arm Fluoroscopy (Mobile/Boom)', is_fixed: true, maintenance_status: 'PENDING_INSPECTION' },
      { equipment_code: 'RADIOFREQUENCY_ABLATION', equipment_name: 'Radiofrequency Ablation Generator', is_fixed: true, maintenance_status: 'CERTIFIED' }
    ]
  },
  {
    id: 'room-endo-1',
    facility_id: 'default-facility-1',
    room_number: 'ENDO-1',
    room_name: 'Endoscopy & GI Procedure Suite',
    suite_designation: 'Endoscopy Suite',
    room_type: 'ENDOSCOPY_SUITE',
    square_footage: 390.00,
    table_weight_capacity_lbs: 450,
    hvac_cleanroom_class: 'ISO_CLASS_8',
    positive_pressure_pa: 1.90,
    air_changes_per_hour: 16,
    laminar_flow_enabled: false,
    hourly_cost_rate: 850.00,
    standard_turnover_minutes: 12,
    operating_status: 'OPERATIONAL',
    is_active: true,
    specialties: [
      { specialty_code: 'GI_ENDOSCOPY', specialty_name: 'Gastroenterology / Endoscopy', compatibility_tier: 'PRIMARY', is_preferred: true }
    ],
    equipment: [
      { equipment_code: 'ARTHROSCOPY_4K_TOWER', equipment_name: '4K UHD Arthroscopy & Laparoscopy Tower', is_fixed: true, maintenance_status: 'CERTIFIED' },
      { equipment_code: 'ULTRASOUND_STATION', equipment_name: 'High-Resolution Ultrasound Station', is_fixed: true, maintenance_status: 'CERTIFIED' }
    ]
  }
];

/**
 * Deterministically evaluate surgical case compatibility with candidate OR
 * @param {Object} room - Operating room object with specs, specialties, and equipment
 * @param {Object} caseProfile - { specialty_code, required_equipment, patient_weight_lbs, is_joint_or_spine_implant }
 * @returns {Object} Compatibility evaluation report
 */
export function evaluateCaseCompatibility(room, caseProfile) {
  if (!room) {
    return {
      is_compatible: false,
      compatibility_tier: 'INCOMPATIBLE',
      errors: ['Operating room record is missing or invalid'],
      warnings: [],
      weight_margin_lbs: 0,
      hourly_rate: 0,
      standard_turnover_minutes: 0
    };
  }

  const errors = [];
  const warnings = [];
  let tier = 'PRIMARY';

  // 1. Operating Status Gate
  if (room.operating_status !== 'OPERATIONAL' || !room.is_active) {
    errors.push(`Room ${room.room_number} is currently offline (${room.operating_status}). Cannot schedule cases.`);
  }

  // 2. Specialty Compatibility Gate
  const specialtyCode = caseProfile.specialty_code;
  if (specialtyCode) {
    const specMatch = (room.specialties || []).find(s => s.specialty_code === specialtyCode);
    if (!specMatch) {
      errors.push(`Specialty [${specialtyCode}] is not configured or permitted for ${room.room_number}.`);
      tier = 'INCOMPATIBLE';
    } else if (specMatch.compatibility_tier === 'RESTRICTED') {
      errors.push(`Specialty [${specialtyCode}] is RESTRICTED in ${room.room_number}.`);
      tier = 'INCOMPATIBLE';
    } else if (specMatch.compatibility_tier === 'SECONDARY') {
      tier = 'SECONDARY';
      warnings.push(`Specialty [${specialtyCode}] is SECONDARY in ${room.room_number}. Pre-procedure setup adjustments required.`);
    }
  }

  // 3. Equipment Dependencies Gate
  const reqEquip = caseProfile.required_equipment || [];
  const roomEquip = room.equipment || [];
  reqEquip.forEach(code => {
    const equip = roomEquip.find(e => e.equipment_code === code);
    if (!equip) {
      errors.push(`Required equipment [${code}] is not installed or available in ${room.room_number}.`);
    } else if (equip.maintenance_status === 'OUT_OF_SERVICE') {
      errors.push(`Required equipment [${code}] is OUT_OF_SERVICE for maintenance.`);
    } else if (equip.maintenance_status === 'PENDING_INSPECTION') {
      warnings.push(`Equipment [${code}] is PENDING_INSPECTION. Verification required before first case.`);
    }
  });

  // 4. Bariatric Patient Weight Gate (with 50 lb buffer)
  const patientWeight = Number(caseProfile.patient_weight_lbs) || 0;
  const effectiveWeight = patientWeight + BARIATRIC_SAFETY_MARGIN_LBS;
  const weightMargin = (room.table_weight_capacity_lbs || 500) - effectiveWeight;

  if (patientWeight > 0 && effectiveWeight > (room.table_weight_capacity_lbs || 500)) {
    errors.push(
      `Patient weight (${patientWeight} lbs) + ${BARIATRIC_SAFETY_MARGIN_LBS} lbs buffer exceeds table certified capacity (${room.table_weight_capacity_lbs} lbs) by ${Math.abs(weightMargin)} lbs.`
    );
  } else if (patientWeight > 0 && weightMargin <= 30) {
    warnings.push(`Bariatric safety buffer tight: only ${weightMargin} lbs remaining under certified limit.`);
  }

  // 5. Cleanroom / HVAC Infection Prevention Protocol Gate
  if (caseProfile.is_joint_or_spine_implant) {
    const hvacClass = HVAC_CLASSES[room.hvac_cleanroom_class];
    const meetsHvac = hvacClass && hvacClass.meetsJointStandard;
    const meetsAch = (room.air_changes_per_hour || 0) >= 20;
    const meetsLaminar = Boolean(room.laminar_flow_enabled);

    if (!meetsHvac || !meetsAch || !meetsLaminar) {
      errors.push(
        `Infection Prevention Violation: Joint & Spine hardware implants mandate ISO Class 7+ with Laminar Flow and >= 20 ACH. ${room.room_number} does not meet standard.`
      );
    }
  }

  const isCompatible = errors.length === 0;

  return {
    is_compatible: isCompatible,
    compatibility_tier: isCompatible ? tier : 'INCOMPATIBLE',
    errors,
    warnings,
    weight_margin_lbs: weightMargin,
    hourly_rate: Number(room.hourly_cost_rate) || 0,
    standard_turnover_minutes: Number(room.standard_turnover_minutes) || 0
  };
}

/**
 * Validate and execute room status state transitions
 */
export function transitionRoomStatus(currentStatus, targetStatus, reason = '') {
  const allowedTransitions = {
    OPERATIONAL: ['MAINTENANCE', 'RENOVATION', 'DECOMMISSIONED'],
    MAINTENANCE: ['OPERATIONAL', 'RENOVATION', 'DECOMMISSIONED'],
    RENOVATION: ['OPERATIONAL', 'MAINTENANCE', 'DECOMMISSIONED'],
    DECOMMISSIONED: ['OPERATIONAL'] // Requires recertification audit
  };

  const validNext = allowedTransitions[currentStatus] || [];
  if (!validNext.includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid status transition from ${currentStatus} to ${targetStatus}.`
    };
  }

  if (['MAINTENANCE', 'RENOVATION', 'DECOMMISSIONED'].includes(targetStatus) && !reason.trim()) {
    return {
      success: false,
      error: 'A clinical or operational reason is required for status changes away from OPERATIONAL.'
    };
  }

  return {
    success: true,
    previous_status: currentStatus,
    new_status: targetStatus,
    reason: reason.trim(),
    event_timestamp: new Date().toISOString()
  };
}

/**
 * Calculate facility-level aggregated OR capacity KPIs
 */
export function calculateFacilityOrKpis(rooms = []) {
  const activeRooms = rooms.filter(r => r.is_active !== false);
  const total = activeRooms.length;
  if (total === 0) {
    return {
      total_rooms: 0,
      operational_count: 0,
      operational_rate_pct: 0,
      avg_standard_turnover_min: 0,
      avg_hourly_cost_rate: 0,
      total_surgical_sqft: 0,
      unique_suites_count: 0,
      high_tech_rooms_count: 0
    };
  }

  const operationalRooms = activeRooms.filter(r => r.operating_status === 'OPERATIONAL');
  const operationalCount = operationalRooms.length;
  const operationalRate = Math.round((operationalCount / total) * 1000) / 10;

  const totalTurnover = activeRooms.reduce((sum, r) => sum + (Number(r.standard_turnover_minutes) || 0), 0);
  const avgTurnover = Math.round((totalTurnover / total) * 10) / 10;

  const totalCost = activeRooms.reduce((sum, r) => sum + (Number(r.hourly_cost_rate) || 0), 0);
  const avgCost = Math.round((totalCost / total) * 100) / 100;

  const totalSqft = activeRooms.reduce((sum, r) => sum + (Number(r.square_footage) || 0), 0);
  const suitesSet = new Set(activeRooms.map(r => r.suite_designation).filter(Boolean));

  const highTechCount = activeRooms.filter(r => 
    r.laminar_flow_enabled || 
    r.room_type === 'ROBOTIC_SUITE' || 
    r.room_type === 'HYBRID_OR'
  ).length;

  return {
    total_rooms: total,
    operational_count: operationalCount,
    operational_rate_pct: operationalRate,
    avg_standard_turnover_min: avgTurnover,
    avg_hourly_cost_rate: avgCost,
    total_surgical_sqft: totalSqft,
    unique_suites_count: suitesSet.size,
    high_tech_rooms_count: highTechCount
  };
}

/**
 * Filter operating rooms by search criteria
 */
export function filterOperatingRooms(rooms, filters = {}) {
  const {
    searchQuery = '',
    suite = 'ALL',
    status = 'ALL',
    specialty = 'ALL'
  } = filters;

  const query = searchQuery.trim().toLowerCase();

  return rooms.filter(room => {
    // Status filter
    if (status !== 'ALL' && room.operating_status !== status) {
      return false;
    }

    // Suite filter
    if (suite !== 'ALL' && room.suite_designation !== suite) {
      return false;
    }

    // Specialty filter
    if (specialty !== 'ALL') {
      const hasSpec = (room.specialties || []).some(
        s => s.specialty_code === specialty && s.compatibility_tier !== 'RESTRICTED'
      );
      if (!hasSpec) return false;
    }

    // Search query
    if (query) {
      const matchRoomNum = (room.room_number || '').toLowerCase().includes(query);
      const matchRoomName = (room.room_name || '').toLowerCase().includes(query);
      const matchSuite = (room.suite_designation || '').toLowerCase().includes(query);
      const matchEquip = (room.equipment || []).some(e => 
        (e.equipment_name || '').toLowerCase().includes(query) ||
        (e.equipment_code || '').toLowerCase().includes(query)
      );
      if (!matchRoomNum && !matchRoomName && !matchSuite && !matchEquip) {
        return false;
      }
    }

    return true;
  });
}

