/**
 * Block Schedule Model & Allocation Architecture (Phase A2)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic calculations for operating room block allocations,
 * ownership hierarchy, recurrence patterns, collision detection, auto-release lead times,
 * and staffing window containment validation.
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

export const OWNER_TYPES = {
  INDIVIDUAL_SURGEON: {
    code: 'INDIVIDUAL_SURGEON',
    label: 'Individual Surgeon',
    description: 'Direct block allocation to a single credentialed attending surgeon.',
    badgeClass: 'badge-blue'
  },
  SURGICAL_GROUP: {
    code: 'SURGICAL_GROUP',
    label: 'Surgical Group / Practice',
    description: 'Shared block allocation for multi-provider surgical practices.',
    badgeClass: 'badge-teal'
  },
  SERVICE_LINE: {
    code: 'SERVICE_LINE',
    label: 'Clinical Service Line',
    description: 'Specialty-wide block reserved for cases within a specific service line.',
    badgeClass: 'badge-emerald'
  },
  OPEN_TIME: {
    code: 'OPEN_TIME',
    label: 'Open Scheduling / Released Pool',
    description: 'Unallocated or released block time available to all credentialed surgeons.',
    badgeClass: 'badge-slate'
  }
};

export const RECURRENCE_TYPES = {
  WEEKLY: {
    code: 'WEEKLY',
    label: 'Weekly (Every Week)',
    description: 'Repeats on the designated day every calendar week.'
  },
  EVERY_OTHER_WEEK_A: {
    code: 'EVERY_OTHER_WEEK_A',
    label: 'Every Other Week (Cycle A / Odd)',
    description: 'Repeats bi-weekly on odd ISO calendar weeks.'
  },
  EVERY_OTHER_WEEK_B: {
    code: 'EVERY_OTHER_WEEK_B',
    label: 'Every Other Week (Cycle B / Even)',
    description: 'Repeats bi-weekly on even ISO calendar weeks.'
  },
  MONTHLY_1ST: {
    code: 'MONTHLY_1ST',
    label: '1st Week of Month',
    description: 'Occurs on the 1st designated day-of-week each calendar month.'
  },
  MONTHLY_2ND: {
    code: 'MONTHLY_2ND',
    label: '2nd Week of Month',
    description: 'Occurs on the 2nd designated day-of-week each calendar month.'
  },
  MONTHLY_3RD: {
    code: 'MONTHLY_3RD',
    label: '3rd Week of Month',
    description: 'Occurs on the 3rd designated day-of-week each calendar month.'
  },
  MONTHLY_4TH: {
    code: 'MONTHLY_4TH',
    label: '4th Week of Month',
    description: 'Occurs on the 4th designated day-of-week each calendar month.'
  },
  ONE_TIME: {
    code: 'ONE_TIME',
    label: 'One-Time Allocation',
    description: 'Single-instance block reservation for a specific surgery date.'
  }
};

export const DAYS_OF_WEEK = [
  { day: 0, code: 'SUN', label: 'Sunday', short: 'Sun', isWeekend: true },
  { day: 1, code: 'MON', label: 'Monday', short: 'Mon', isWeekend: false },
  { day: 2, code: 'TUE', label: 'Tuesday', short: 'Tue', isWeekend: false },
  { day: 3, code: 'WED', label: 'Wednesday', short: 'Wed', isWeekend: false },
  { day: 4, code: 'THU', label: 'Thursday', short: 'Thu', isWeekend: false },
  { day: 5, code: 'FRI', label: 'Friday', short: 'Fri', isWeekend: false },
  { day: 6, code: 'SAT', label: 'Saturday', short: 'Sat', isWeekend: true }
];

export const CLINICAL_SPECIALTIES = [
  { code: 'ORTHOPEDICS', label: 'Orthopedic Surgery' },
  { code: 'SPINE', label: 'Spine Surgery' },
  { code: 'OPHTHALMOLOGY', label: 'Ophthalmology' },
  { code: 'PAIN_MANAGEMENT', label: 'Interventional Pain' },
  { code: 'GENERAL_SURGERY', label: 'General / Laparoscopic Surgery' },
  { code: 'PODIATRY', label: 'Podiatric Foot & Ankle' },
  { code: 'ENT', label: 'Otolaryngology (ENT)' },
  { code: 'UROLOGY', label: 'Urology' },
  { code: 'ENDOSCOPY', label: 'GI / Endoscopy' }
];

export const DEFAULT_AUTO_RELEASE_LEAD_DAYS = 5;
export const DEFAULT_AUTO_RELEASE_LEAD_HOURS = 120;
export const DEFAULT_TARGET_UTILIZATION_PCT = 75.00;

/**
 * Calculates duration in minutes between two 'HH:MM:SS' or 'HH:MM' time strings
 */
export function calculateShiftMinutes(startTimeStr, endTimeStr) {
  if (!startTimeStr || !endTimeStr) return 0;
  const [sh, sm] = startTimeStr.split(':').map(Number);
  const [eh, em] = endTimeStr.split(':').map(Number);
  const startMin = (sh * 60) + (sm || 0);
  const endMin = (eh * 60) + (em || 0);
  return Math.max(0, endMin - startMin);
}

/**
 * Formats duration in minutes to fractional hours formatted as 'X.X hrs'
 */
export function formatMinutesToHours(minutes) {
  if (typeof minutes !== 'number' || isNaN(minutes) || minutes < 0) return '0.0 hrs';
  return `${(minutes / 60).toFixed(1)} hrs`;
}

/**
 * Checks whether two recurrence schedules conflict on the calendar
 */
export function recurrencePatternsConflict(recA, recB) {
  if (!recA || !recB) return true;
  if (recA === 'WEEKLY' || recB === 'WEEKLY') return true;
  if (recA === recB) return true;
  
  // Alternating bi-weekly: A and B do not conflict
  if (
    (recA === 'EVERY_OTHER_WEEK_A' && recB === 'EVERY_OTHER_WEEK_B') ||
    (recA === 'EVERY_OTHER_WEEK_B' && recB === 'EVERY_OTHER_WEEK_A')
  ) {
    return false;
  }
  
  // Monthly occurrences on different weeks do not conflict
  const monthlyTypes = ['MONTHLY_1ST', 'MONTHLY_2ND', 'MONTHLY_3RD', 'MONTHLY_4TH'];
  if (monthlyTypes.includes(recA) && monthlyTypes.includes(recB) && recA !== recB) {
    return false;
  }
  
  return true;
}

/**
 * Detects time and recurrence collisions for a block candidate against existing blocks
 */
export function detectBlockCollisions(candidate, existingBlocks = []) {
  if (!candidate || !candidate.operating_room_id || candidate.day_of_week === undefined) {
    return { hasCollision: false, collidingBlock: null, reason: null };
  }

  const candStart = (candidate.start_time || '07:00:00').slice(0, 5);
  const candEnd = (candidate.end_time || '15:00:00').slice(0, 5);
  const candStartMin = calculateShiftMinutes('00:00', candStart);
  const candEndMin = calculateShiftMinutes('00:00', candEnd);

  for (const blk of existingBlocks) {
    // Ignore self if editing
    if (candidate.id && blk.id === candidate.id) continue;
    if (!blk.is_active) continue;

    // Must match same operating room and same day of week
    if (blk.operating_room_id !== candidate.operating_room_id) continue;
    if (blk.day_of_week !== candidate.day_of_week) continue;

    // Check recurrence cycle overlap
    if (!recurrencePatternsConflict(candidate.recurrence_type, blk.recurrence_type)) {
      continue;
    }

    // Check time interval overlap
    const blkStart = (blk.start_time || '07:00:00').slice(0, 5);
    const blkEnd = (blk.end_time || '15:00:00').slice(0, 5);
    const blkStartMin = calculateShiftMinutes('00:00', blkStart);
    const blkEndMin = calculateShiftMinutes('00:00', blkEnd);

    const hasOverlap = candStartMin < blkEndMin && candEndMin > blkStartMin;

    if (hasOverlap) {
      return {
        hasCollision: true,
        collidingBlock: blk,
        reason: `Overlaps with existing block "${blk.block_name}" (${blk.owner_name}, ${blkStart}-${blkEnd}, ${blk.recurrence_type}).`
      };
    }
  }

  return { hasCollision: false, collidingBlock: null, reason: null };
}

/**
 * Validates whether a candidate block fits cleanly within the active staffed room window (Phase A1)
 */
export function validateBlockStaffingContainment(candidate, staffingWindows = []) {
  if (!candidate || !candidate.operating_room_id || candidate.day_of_week === undefined) {
    return {
      fitsWithinStaffing: true,
      status: 'UNVERIFIED',
      message: 'Staffing window verification skipped: missing room or day parameters.'
    };
  }

  // Find active staffing window for this room and day-of-week
  const window = staffingWindows.find(
    w => w.operating_room_id === candidate.operating_room_id &&
         w.day_of_week === candidate.day_of_week &&
         w.is_active
  );

  if (!window) {
    return {
      fitsWithinStaffing: false,
      status: 'NO_STAFFED_WINDOW',
      unstaffedMinutes: candidate.allocated_minutes || 0,
      message: `No active staffed window exists for this operating room on ${DAYS_OF_WEEK[candidate.day_of_week]?.label || 'this day'}. Running this block requires unstaffed overtime authorization.`
    };
  }

  const candStart = (candidate.start_time || '07:00:00').slice(0, 5);
  const candEnd = (candidate.end_time || '15:00:00').slice(0, 5);
  const winStart = (window.start_time || '07:00:00').slice(0, 5);
  const winEnd = (window.end_time || '17:00:00').slice(0, 5);

  const candStartMin = calculateShiftMinutes('00:00', candStart);
  const candEndMin = calculateShiftMinutes('00:00', candEnd);
  const winStartMin = calculateShiftMinutes('00:00', winStart);
  const winEndMin = calculateShiftMinutes('00:00', winEnd);

  let unstaffedMinutes = 0;
  if (candStartMin < winStartMin) {
    unstaffedMinutes += (winStartMin - candStartMin);
  }
  if (candEndMin > winEndMin) {
    unstaffedMinutes += (candEndMin - winEndMin);
  }

  if (unstaffedMinutes > 0) {
    return {
      fitsWithinStaffing: false,
      status: 'EXCEEDS_STAFFED_WINDOW',
      unstaffedMinutes,
      staffingWindow: window,
      message: `Block exceeds staffed operating window (${winStart}-${winEnd}) by ${unstaffedMinutes} minutes (${formatMinutesToHours(unstaffedMinutes)}). Requires unbudgeted staffing extension.`
    };
  }

  return {
    fitsWithinStaffing: true,
    status: 'CONTAINED',
    unstaffedMinutes: 0,
    staffingWindow: window,
    message: `Block is fully contained within staffed operating hours (${winStart}-${winEnd}).`
  };
}

/**
 * Calculates high-level facility KPI metrics for block allocations
 */
export function calculateFacilityBlockKpis(blocks = [], staffingWindows = []) {
  const activeBlocks = blocks.filter(b => b.is_active);

  const totalBlockedMinutes = activeBlocks.reduce((acc, b) => acc + (b.allocated_minutes || 0), 0);
  const totalBlockedHours = Number((totalBlockedMinutes / 60).toFixed(1));

  const uniqueRooms = new Set(activeBlocks.map(b => b.operating_room_id)).size;
  const uniqueOwners = new Set(activeBlocks.map(b => b.owner_name)).size;

  const avgReleaseLeadDays = activeBlocks.length > 0
    ? Number((activeBlocks.reduce((acc, b) => acc + (b.auto_release_lead_days || 0), 0) / activeBlocks.length).toFixed(1))
    : 0;

  const avgTargetUtilizationPct = activeBlocks.length > 0
    ? Number((activeBlocks.reduce((acc, b) => acc + Number(b.target_utilization_pct || 75), 0) / activeBlocks.length).toFixed(1))
    : 0;

  // Calculate total staffed minutes across rooms if staffingWindows provided
  const activeStaffingWindows = staffingWindows.filter(w => w.is_active);
  const totalStaffedMinutes = activeStaffingWindows.reduce(
    (acc, w) => acc + (w.gross_staffed_minutes || w.planned_minutes || (w.start_time && w.end_time ? calculateShiftMinutes(w.start_time, w.end_time) : 0)),
    0
  );
  const totalStaffedHours = Number((totalStaffedMinutes / 60).toFixed(1));

  const blockAllocationRatioPct = totalStaffedMinutes > 0
    ? Number(((totalBlockedMinutes / totalStaffedMinutes) * 100).toFixed(1))
    : 0;

  return {
    totalActiveBlocks: activeBlocks.length,
    blockedRoomsCount: uniqueRooms,
    uniqueOwnersCount: uniqueOwners,
    totalBlockedMinutes,
    totalBlockedHours,
    totalStaffedHours,
    blockAllocationRatioPct,
    avgReleaseLeadDays,
    avgTargetUtilizationPct
  };
}

/**
 * Filters block definitions by search keyword, room, owner type, specialty, and day
 */
export function filterBlockDefinitions(blocks = [], filters = {}) {
  const {
    search = '',
    operatingRoomId = 'ALL',
    ownerType = 'ALL',
    specialtyCode = 'ALL',
    dayOfWeek = 'ALL',
    recurrenceType = 'ALL',
    activeOnly = true
  } = filters;

  const query = search.trim().toLowerCase();

  return blocks.filter(b => {
    if (activeOnly && !b.is_active) return false;
    if (operatingRoomId !== 'ALL' && b.operating_room_id !== operatingRoomId) return false;
    if (ownerType !== 'ALL' && b.owner_type !== ownerType) return false;
    if (specialtyCode !== 'ALL' && b.specialty_code !== specialtyCode) return false;
    if (dayOfWeek !== 'ALL' && String(b.day_of_week) !== String(dayOfWeek)) return false;
    if (recurrenceType !== 'ALL' && b.recurrence_type !== recurrenceType) return false;

    if (query) {
      const matchName = (b.block_name || '').toLowerCase().includes(query);
      const matchOwner = (b.owner_name || '').toLowerCase().includes(query);
      const matchRoom = (b.room_name || '').toLowerCase().includes(query);
      const matchSpec = (b.specialty_code || '').toLowerCase().includes(query);
      if (!matchName && !matchOwner && !matchRoom && !matchSpec) return false;
    }

    return true;
  });
}

/**
 * Realistic seed block definitions for Austin Surgery Center (Facility OR-1 through OR-6)
 */
export const SEED_OR_BLOCKS = [
  {
    id: 'b1010000-0000-4000-8000-000000000001',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-1', // OR-1: Main Orthopedic & Joint Suite
    room_number: 'OR-1',
    room_name: 'Main Orthopedic & Joint Suite',
    block_name: 'Dr. Marcus Vance — Total Joints & Robotics',
    owner_type: 'INDIVIDUAL_SURGEON',
    surgeon_id: 101,
    owner_name: 'Dr. Marcus Vance, MD',
    specialty_code: 'ORTHOPEDICS',
    day_of_week: 1, // Monday
    recurrence_type: 'WEEKLY',
    start_time: '07:00:00',
    end_time: '15:00:00',
    allocated_minutes: 480,
    auto_release_lead_days: 5,
    auto_release_lead_hours: 120,
    target_utilization_pct: 78.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Primary arthroplasty block with Mako robotic arm priority.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000002',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-1', // OR-1: Main Orthopedic & Joint Suite
    room_number: 'OR-1',
    room_name: 'Main Orthopedic & Joint Suite',
    block_name: 'Austin Sports Medicine — Arthroscopy Block',
    owner_type: 'SURGICAL_GROUP',
    surgeon_id: null,
    owner_name: 'Austin Sports Medicine Partners',
    specialty_code: 'ORTHOPEDICS',
    day_of_week: 3, // Wednesday
    recurrence_type: 'WEEKLY',
    start_time: '07:00:00',
    end_time: '15:00:00',
    allocated_minutes: 480,
    auto_release_lead_days: 5,
    auto_release_lead_hours: 120,
    target_utilization_pct: 80.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Knee and shoulder reconstructive sports medicine procedures.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000003',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-2', // OR-2: Spine & Advanced Neuro Suite
    room_number: 'OR-2',
    room_name: 'Spine & Advanced Neuro Suite',
    block_name: 'Capital Spine Institute — Decompressions & Fusions',
    owner_type: 'SURGICAL_GROUP',
    surgeon_id: null,
    owner_name: 'Capital Spine Institute',
    specialty_code: 'SPINE',
    day_of_week: 2, // Tuesday
    recurrence_type: 'WEEKLY',
    start_time: '07:00:00',
    end_time: '15:00:00',
    allocated_minutes: 480,
    auto_release_lead_days: 7,
    auto_release_lead_hours: 168,
    target_utilization_pct: 82.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Requires 7-day auto-release lead due to neuromonitoring and implant coordination.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000004',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-2', // OR-2: Spine & Advanced Neuro Suite
    room_number: 'OR-2',
    room_name: 'Spine & Advanced Neuro Suite',
    block_name: 'Dr. Kevin Zhao — Cervical & Lumbar Discectomies',
    owner_type: 'INDIVIDUAL_SURGEON',
    surgeon_id: 105,
    owner_name: 'Dr. Kevin Zhao, MD',
    specialty_code: 'SPINE',
    day_of_week: 4, // Thursday
    recurrence_type: 'WEEKLY',
    start_time: '07:30:00',
    end_time: '15:30:00',
    allocated_minutes: 480,
    auto_release_lead_days: 5,
    auto_release_lead_hours: 120,
    target_utilization_pct: 76.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Outpatient ACDF and microdiscectomy schedule.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000005',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-4', // OR-4: Ophthalmology & ENT Clean Suite
    room_number: 'OR-4',
    room_name: 'Ophthalmology & ENT Clean Suite',
    block_name: 'Dr. Elena Rostova — Cataract & Vitreoretinal',
    owner_type: 'INDIVIDUAL_SURGEON',
    surgeon_id: 103,
    owner_name: 'Dr. Elena Rostova, MD',
    specialty_code: 'OPHTHALMOLOGY',
    day_of_week: 2, // Tuesday
    recurrence_type: 'WEEKLY',
    start_time: '07:00:00',
    end_time: '14:00:00',
    allocated_minutes: 420,
    auto_release_lead_days: 3,
    auto_release_lead_hours: 72,
    target_utilization_pct: 85.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'High-turnover cataract and premium IOL surgical days.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000006',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-proc-1', // PROC-1: Fluoroscopy & Interventional Pain Suite
    room_number: 'PROC-1',
    room_name: 'Fluoroscopy & Interventional Pain Suite',
    block_name: 'Austin Interventional Pain Service Line',
    owner_type: 'SERVICE_LINE',
    surgeon_id: null,
    owner_name: 'Interventional Pain Medicine Service Line',
    specialty_code: 'PAIN_MANAGEMENT',
    day_of_week: 1, // Monday
    recurrence_type: 'WEEKLY',
    start_time: '07:30:00',
    end_time: '14:30:00',
    allocated_minutes: 420,
    auto_release_lead_days: 3,
    auto_release_lead_hours: 72,
    target_utilization_pct: 82.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Epidural steroid injections, RFA, and spinal cord stimulator trials.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000007',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-or-3', // OR-3: Robotic & Minimally Invasive Suite
    room_number: 'OR-3',
    room_name: 'Robotic & Minimally Invasive Suite',
    block_name: 'Dr. Sarah Jenkins — Advanced Laparoscopy & Hernia',
    owner_type: 'INDIVIDUAL_SURGEON',
    surgeon_id: 102,
    owner_name: 'Dr. Sarah Jenkins, MD',
    specialty_code: 'GENERAL_SURGERY',
    day_of_week: 3, // Wednesday
    recurrence_type: 'WEEKLY',
    start_time: '07:00:00',
    end_time: '15:00:00',
    allocated_minutes: 480,
    auto_release_lead_days: 4,
    auto_release_lead_hours: 96,
    target_utilization_pct: 75.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Complex ventral hernia and cholecystectomy schedule.'
  },
  {
    id: 'b1010000-0000-4000-8000-000000000008',
    facility_id: DEFAULT_FACILITY_ID,
    operating_room_id: 'room-endo-1', // ENDO-1: Endoscopy & GI Procedure Suite
    room_number: 'ENDO-1',
    room_name: 'Endoscopy & GI Procedure Suite',
    block_name: 'Open Urgent Scheduling & Released Block Pool',
    owner_type: 'OPEN_TIME',
    surgeon_id: null,
    owner_name: 'Open Allocation Pool',
    specialty_code: 'GENERAL_SURGERY',
    day_of_week: 5, // Friday
    recurrence_type: 'WEEKLY',
    start_time: '08:00:00',
    end_time: '16:00:00',
    allocated_minutes: 480,
    auto_release_lead_days: 0,
    auto_release_lead_hours: 0,
    target_utilization_pct: 70.00,
    is_active: true,
    effective_start_date: '2026-01-01',
    notes: 'Unassigned surgical time open to all credentialed surgeons for add-on cases.'
  }
];

/**
 * In-memory Store for Block Schedule Model
 */
class BlockScheduleStore {
  constructor() {
    this.blocks = [...SEED_OR_BLOCKS];
  }

  getBlocks() {
    return [...this.blocks];
  }

  getBlockById(id) {
    return this.blocks.find(b => b.id === id) || null;
  }

  addBlock(blockData, staffingWindows = []) {
    const allocatedMinutes = calculateShiftMinutes(blockData.start_time, blockData.end_time);
    if (allocatedMinutes <= 0) {
      throw new Error('Invalid block time window: End time must be after start time.');
    }

    const candidate = {
      id: `b1010000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`,
      facility_id: blockData.facility_id || DEFAULT_FACILITY_ID,
      operating_room_id: blockData.operating_room_id,
      room_number: blockData.room_number || '1',
      room_name: blockData.room_name || `OR ${blockData.room_number || '1'}`,
      block_name: blockData.block_name,
      owner_type: blockData.owner_type || 'INDIVIDUAL_SURGEON',
      surgeon_id: blockData.surgeon_id || null,
      owner_name: blockData.owner_name,
      specialty_code: blockData.specialty_code || 'ORTHOPEDICS',
      day_of_week: Number(blockData.day_of_week),
      recurrence_type: blockData.recurrence_type || 'WEEKLY',
      start_time: blockData.start_time,
      end_time: blockData.end_time,
      allocated_minutes: allocatedMinutes,
      auto_release_lead_days: Number(blockData.auto_release_lead_days ?? DEFAULT_AUTO_RELEASE_LEAD_DAYS),
      auto_release_lead_hours: Number((blockData.auto_release_lead_days ?? DEFAULT_AUTO_RELEASE_LEAD_DAYS) * 24),
      target_utilization_pct: Number(blockData.target_utilization_pct ?? DEFAULT_TARGET_UTILIZATION_PCT),
      is_active: blockData.is_active ?? true,
      effective_start_date: blockData.effective_start_date || new Date().toISOString().slice(0, 10),
      effective_end_date: blockData.effective_end_date || null,
      notes: blockData.notes || ''
    };

    // Collision Check
    const collision = detectBlockCollisions(candidate, this.blocks);
    if (collision.hasCollision) {
      throw new Error(`Schedule Collision Error: ${collision.reason}`);
    }

    this.blocks.push(candidate);
    return candidate;
  }

  updateBlock(id, updates, staffingWindows = []) {
    const index = this.blocks.findIndex(b => b.id === id);
    if (index === -1) {
      throw new Error(`Block definition with id ${id} not found.`);
    }

    const current = this.blocks[index];
    const updated = {
      ...current,
      ...updates,
      allocated_minutes: calculateShiftMinutes(
        updates.start_time || current.start_time,
        updates.end_time || current.end_time
      )
    };

    if (updates.auto_release_lead_days !== undefined) {
      updated.auto_release_lead_hours = Number(updates.auto_release_lead_days) * 24;
    }

    const collision = detectBlockCollisions(updated, this.blocks);
    if (collision.hasCollision) {
      throw new Error(`Schedule Collision Error: ${collision.reason}`);
    }

    this.blocks[index] = updated;
    return updated;
  }

  deleteBlock(id) {
    const initialLen = this.blocks.length;
    this.blocks = this.blocks.filter(b => b.id !== id);
    return this.blocks.length < initialLen;
  }

  resetToDefaults() {
    this.blocks = [...SEED_OR_BLOCKS];
  }
}

export const blockScheduleStore = new BlockScheduleStore();

export default {
  DEFAULT_FACILITY_ID,
  OWNER_TYPES,
  RECURRENCE_TYPES,
  DAYS_OF_WEEK,
  CLINICAL_SPECIALTIES,
  DEFAULT_AUTO_RELEASE_LEAD_DAYS,
  DEFAULT_AUTO_RELEASE_LEAD_HOURS,
  DEFAULT_TARGET_UTILIZATION_PCT,
  calculateShiftMinutes,
  formatMinutesToHours,
  recurrencePatternsConflict,
  detectBlockCollisions,
  validateBlockStaffingContainment,
  calculateFacilityBlockKpis,
  filterBlockDefinitions,
  SEED_OR_BLOCKS,
  blockScheduleStore
};
