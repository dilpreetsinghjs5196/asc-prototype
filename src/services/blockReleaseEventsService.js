/**
 * Block Release Events & Open-Pool Reallocation Engine (Phase A3)
 * Module 10: OR Scheduling & Utilization Optimization
 * 
 * Provides deterministic calculations for single-date block surrenders,
 * lead-time timeliness classification, auto-release expiration,
 * open-pool reallocation tracking, and labor downstaffing cost recovery.
 */

export const DEFAULT_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const DEFAULT_DOWNSTAFFING_HOURLY_RATE = 450.00; // Average ASC nursing + tech crew hourly rate

export const RELEASE_TRIGGERS = {
  VOLUNTARY_SURGEON: {
    code: 'VOLUNTARY_SURGEON',
    label: 'Voluntary Surgeon Surrender',
    description: 'Surgeon voluntarily surrenders block time due to scheduled absence or low case volume.',
    badgeClass: 'badge-blue'
  },
  AUTO_RELEASE_EXPIRATION: {
    code: 'AUTO_RELEASE_EXPIRATION',
    label: 'Automated Cutoff Expiration',
    description: 'System automatically returned unbooked block time to open pool at statutory cutoff deadline.',
    badgeClass: 'badge-amber'
  },
  ADMINISTRATIVE_OVERRIDE: {
    code: 'ADMINISTRATIVE_OVERRIDE',
    label: 'Administrative Executive Override',
    description: 'OR Director or Medical Executive Committee reclaimed block for urgent facility needs or forfeiture.',
    badgeClass: 'badge-crimson'
  },
  FACILITY_CLOSURE: {
    code: 'FACILITY_CLOSURE',
    label: 'Facility Closure / Maintenance',
    description: 'Facility-wide holiday, sterile bio-cleaning, or preventive HVAC maintenance closure.',
    badgeClass: 'badge-slate'
  }
};

export const RELEASE_REASONS = {
  PHYSICIAN_VACATION: {
    code: 'PHYSICIAN_VACATION',
    label: 'Physician Vacation / Personal Leave',
    category: 'PLANNED_ABSENCE'
  },
  CME_CONFERENCE: {
    code: 'CME_CONFERENCE',
    label: 'CME / Clinical Academic Conference',
    category: 'PLANNED_ABSENCE'
  },
  LOW_CASE_VOLUME: {
    code: 'LOW_CASE_VOLUME',
    label: 'Insufficient Case Volume / Patient Census',
    category: 'CLINICAL_DEMAND'
  },
  EMERGENCY_MEDICAL_LEAVE: {
    code: 'EMERGENCY_MEDICAL_LEAVE',
    label: 'Acute Emergency Medical / Family Leave',
    category: 'UNPLANNED_ABSENCE'
  },
  AUTO_EXPIRATION_UNBOOKED: {
    code: 'AUTO_EXPIRATION_UNBOOKED',
    label: 'Auto-Release: Zero Scheduled Cases at Deadline',
    category: 'SYSTEM_AUTOMATION'
  },
  FACILITY_MAINTENANCE_CLOSURE: {
    code: 'FACILITY_MAINTENANCE_CLOSURE',
    label: 'Preventive Facility Maintenance / Cleanroom Certification',
    category: 'FACILITY_OPERATION'
  },
  CHRONIC_UNDERUTILIZATION_OVERRIDE: {
    code: 'CHRONIC_UNDERUTILIZATION_OVERRIDE',
    label: 'Administrative Reclamation: Underutilization Threshold Breached',
    category: 'GOVERNANCE'
  },
  OTHER_ADMINISTRATIVE: {
    code: 'OTHER_ADMINISTRATIVE',
    label: 'Other Documented Administrative Reason',
    category: 'ADMINISTRATIVE'
  }
};

export const TIMELINESS_STATUSES = {
  ON_TIME: {
    code: 'ON_TIME',
    label: 'On-Time Compliant Release',
    description: 'Released with notice equal to or exceeding the statutory lead requirement (no penalty).',
    badgeClass: 'badge-emerald'
  },
  LATE_RELEASE: {
    code: 'LATE_RELEASE',
    label: 'Late Notice Release',
    description: 'Released inside the lead cutoff but >= 24h prior to surgery date (minor penalty flag).',
    badgeClass: 'badge-amber'
  },
  SAME_DAY_RELEASE: {
    code: 'SAME_DAY_RELEASE',
    label: 'Same-Day / Critical Late Release',
    description: 'Released < 24h prior to surgery date (severe utilization disruption penalty).',
    badgeClass: 'badge-crimson'
  }
};

export const REALLOCATION_STATUSES = {
  OPEN_POOL: {
    code: 'OPEN_POOL',
    label: 'Available in Open Pool',
    description: '100% of surrendered block hours remain unclaimed and open for scheduling.',
    badgeClass: 'badge-blue'
  },
  PARTIALLY_REALLOCATED: {
    code: 'PARTIALLY_REALLOCATED',
    label: 'Partially Reallocated',
    description: 'A portion of surrendered time has been booked by an add-on surgical case.',
    badgeClass: 'badge-teal'
  },
  FULLY_REALLOCATED: {
    code: 'FULLY_REALLOCATED',
    label: 'Fully Reallocated (100%)',
    description: 'Entire released time window was successfully rebooked by other surgeons.',
    badgeClass: 'badge-emerald'
  },
  ROOM_DOWNSTAFFED: {
    code: 'ROOM_DOWNSTAFFED',
    label: 'Room Downstaffed (Cost Saved)',
    description: 'Unclaimed hours were officially downstaffed to save nursing and anesthesia labor costs.',
    badgeClass: 'badge-slate'
  },
  EXPIRED_UNUTILIZED: {
    code: 'EXPIRED_UNUTILIZED',
    label: 'Expired Unutilized',
    description: 'Surgery date elapsed with hours unbooked and room staffed (lost capacity).',
    badgeClass: 'badge-crimson'
  }
};

/**
 * Calculates lead time in hours between the release timestamp and scheduled surgery start time
 */
export function calculateLeadTimeHours(surgeryDateStr, startTimeStr, releaseTimestampStr) {
  if (!surgeryDateStr || !startTimeStr) return 0;
  
  const surgeryTime = new Date(`${surgeryDateStr}T${startTimeStr.slice(0, 5)}:00Z`).getTime();
  const releaseTime = releaseTimestampStr 
    ? new Date(releaseTimestampStr).getTime() 
    : Date.now();

  if (isNaN(surgeryTime) || isNaN(releaseTime)) return 0;

  const diffMs = surgeryTime - releaseTime;
  const hours = Math.max(0, diffMs / (1000 * 60 * 60));
  return Math.round(hours * 10) / 10;
}

/**
 * Deterministically classifies timeliness status against required lead hours
 */
export function determineTimelinessStatus(leadTimeHours, requiredLeadHours = 120) {
  if (leadTimeHours >= requiredLeadHours) {
    return TIMELINESS_STATUSES.ON_TIME.code;
  }
  if (leadTimeHours >= 24) {
    return TIMELINESS_STATUSES.LATE_RELEASE.code;
  }
  return TIMELINESS_STATUSES.SAME_DAY_RELEASE.code;
}

/**
 * Calculates realized labor savings from downstaffing unclaimed operating room hours
 */
export function calculateDownstaffingSavings(unallocatedMinutes, hourlyRate = DEFAULT_DOWNSTAFFING_HOURLY_RATE) {
  if (typeof unallocatedMinutes !== 'number' || unallocatedMinutes <= 0) return 0.00;
  const hours = unallocatedMinutes / 60;
  return Math.round(hours * hourlyRate * 100) / 100;
}

/**
 * Calculates summary KPI metrics across a collection of release events
 */
export function calculateReleaseKpis(releaseEvents = []) {
  const totalReleases = releaseEvents.length;
  if (totalReleases === 0) {
    return {
      totalReleasesCount: 0,
      totalReleasedMinutes: 0,
      totalReleasedHours: 0.0,
      onTimeReleasesCount: 0,
      onTimeReleaseRatePct: 0.0,
      totalReallocatedMinutes: 0,
      totalReallocatedHours: 0.0,
      reallocationRatePct: 0.0,
      totalDownstaffedSavingsAmount: 0.00,
      pendingOpenPoolCount: 0
    };
  }

  const totalReleasedMinutes = releaseEvents.reduce((acc, r) => acc + (r.released_minutes || 0), 0);
  const totalReleasedHours = Number((totalReleasedMinutes / 60).toFixed(1));

  const onTimeCount = releaseEvents.filter(r => r.timeliness_status === 'ON_TIME').length;
  const onTimeReleaseRatePct = Number(((onTimeCount / totalReleases) * 100).toFixed(1));

  const totalReallocatedMinutes = releaseEvents.reduce((acc, r) => acc + (r.reallocated_minutes || 0), 0);
  const totalReallocatedHours = Number((totalReallocatedMinutes / 60).toFixed(1));

  const reallocationRatePct = totalReleasedMinutes > 0
    ? Number(((totalReallocatedMinutes / totalReleasedMinutes) * 100).toFixed(1))
    : 0.0;

  const totalDownstaffedSavings = releaseEvents.reduce(
    (acc, r) => acc + Number(r.downstaffed_savings_amount || 0), 
    0
  );

  const pendingOpenPoolCount = releaseEvents.filter(
    r => r.reallocation_status === 'OPEN_POOL' || r.reallocation_status === 'PARTIALLY_REALLOCATED'
  ).length;

  return {
    totalReleasesCount: totalReleases,
    totalReleasedMinutes,
    totalReleasedHours,
    onTimeReleasesCount: onTimeCount,
    onTimeReleaseRatePct,
    totalReallocatedMinutes,
    totalReallocatedHours,
    reallocationRatePct,
    totalDownstaffedSavingsAmount: Math.round(totalDownstaffedSavings * 100) / 100,
    pendingOpenPoolCount
  };
}

/**
 * Filters release events by search query, trigger, timeliness, reallocation status, and room
 */
export function filterReleaseEvents(events = [], filters = {}) {
  const {
    search = '',
    operatingRoomId = 'ALL',
    releaseTrigger = 'ALL',
    timelinessStatus = 'ALL',
    reallocationStatus = 'ALL',
    startDate = null,
    endDate = null
  } = filters;

  const query = search.trim().toLowerCase();

  return events.filter(e => {
    if (operatingRoomId !== 'ALL' && e.operating_room_id !== operatingRoomId) return false;
    if (releaseTrigger !== 'ALL' && e.release_trigger !== releaseTrigger) return false;
    if (timelinessStatus !== 'ALL' && e.timeliness_status !== timelinessStatus) return false;
    if (reallocationStatus !== 'ALL' && e.reallocation_status !== reallocationStatus) return false;

    if (startDate && e.surgery_date < startDate) return false;
    if (endDate && e.surgery_date > endDate) return false;

    if (query) {
      const matchOwner = (e.original_owner_name || '').toLowerCase().includes(query);
      const matchBlock = (e.block_name || '').toLowerCase().includes(query);
      const matchRoom = (e.room_name || e.room_number || '').toLowerCase().includes(query);
      const matchUser = (e.released_by_name || '').toLowerCase().includes(query);
      if (!matchOwner && !matchBlock && !matchRoom && !matchUser) return false;
    }

    return true;
  });
}

/**
 * Realistic seed block release events for Austin Surgery Center
 */
export const SEED_BLOCK_RELEASES = [
  {
    id: 'rel-2026-001',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'b1010000-0000-4000-8000-000000000001',
    block_name: 'Dr. Marcus Vance — Total Joints & Robotics',
    original_owner_name: 'Dr. Marcus Vance, MD',
    original_owner_type: 'INDIVIDUAL_SURGEON',
    original_specialty: 'ORTHOPEDICS',
    operating_room_id: 'room-or-1',
    room_number: 'OR-1',
    room_name: 'Main Orthopedic & Joint Suite',
    surgery_date: '2026-11-23',
    start_time: '07:00:00',
    end_time: '15:00:00',
    released_minutes: 480,
    required_lead_hours: 120,
    release_trigger: 'VOLUNTARY_SURGEON',
    release_reason_code: 'CME_CONFERENCE',
    release_timestamp: '2026-11-10T14:30:00Z',
    lead_time_hours: 304.5,
    timeliness_status: 'ON_TIME',
    reallocation_status: 'PARTIALLY_REALLOCATED',
    reallocated_minutes: 240,
    downstaffed_savings_amount: 0.00,
    released_by_name: 'Dr. Marcus Vance, MD',
    notes: 'Surrendered for Annual Hip & Knee Arthroplasty Congress in Chicago.'
  },
  {
    id: 'rel-2026-002',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'b1010000-0000-4000-8000-000000000003',
    block_name: 'Capital Spine Institute — Decompressions & Fusions',
    original_owner_name: 'Capital Spine Institute',
    original_owner_type: 'SURGICAL_GROUP',
    original_specialty: 'SPINE',
    operating_room_id: 'room-or-2',
    room_number: 'OR-2',
    room_name: 'Spine & Advanced Neuro Suite',
    surgery_date: '2026-11-24',
    start_time: '07:00:00',
    end_time: '15:00:00',
    released_minutes: 480,
    required_lead_hours: 168,
    release_trigger: 'VOLUNTARY_SURGEON',
    release_reason_code: 'PHYSICIAN_VACATION',
    release_timestamp: '2026-11-12T09:00:00Z',
    lead_time_hours: 286.0,
    timeliness_status: 'ON_TIME',
    reallocation_status: 'FULLY_REALLOCATED',
    reallocated_minutes: 480,
    downstaffed_savings_amount: 0.00,
    released_by_name: 'Practice Administrator (Sarah Connor)',
    notes: 'Surgeons attending Thanksgiving break; released full 8-hour block.'
  },
  {
    id: 'rel-2026-003',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'b1010000-0000-4000-8000-000000000006',
    block_name: 'Austin Interventional Pain Service Line',
    original_owner_name: 'Interventional Pain Medicine Service Line',
    original_owner_type: 'SERVICE_LINE',
    original_specialty: 'PAIN_MANAGEMENT',
    operating_room_id: 'room-proc-1',
    room_number: 'PROC-1',
    room_name: 'Fluoroscopy & Interventional Pain Suite',
    surgery_date: '2026-11-16',
    start_time: '07:30:00',
    end_time: '14:30:00',
    released_minutes: 420,
    required_lead_hours: 72,
    release_trigger: 'AUTO_RELEASE_EXPIRATION',
    release_reason_code: 'AUTO_EXPIRATION_UNBOOKED',
    release_timestamp: '2026-11-13T07:30:00Z',
    lead_time_hours: 72.0,
    timeliness_status: 'ON_TIME',
    reallocation_status: 'ROOM_DOWNSTAFFED',
    reallocated_minutes: 0,
    downstaffed_savings_amount: 3150.00, // 7.0 hrs * $450/hr
    released_by_name: 'System Auto-Release Scheduler Daemon',
    notes: 'Zero scheduled injection cases at 72h notice limit. Room closed and clinical crew downstaffed.'
  },
  {
    id: 'rel-2026-004',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'b1010000-0000-4000-8000-000000000007',
    block_name: 'Dr. Sarah Jenkins — Advanced Laparoscopy & Hernia',
    original_owner_name: 'Dr. Sarah Jenkins, MD',
    original_owner_type: 'INDIVIDUAL_SURGEON',
    original_specialty: 'GENERAL_SURGERY',
    operating_room_id: 'room-or-3',
    room_number: 'OR-3',
    room_name: 'Robotic & Minimally Invasive Suite',
    surgery_date: '2026-11-18',
    start_time: '07:00:00',
    end_time: '15:00:00',
    released_minutes: 480,
    required_lead_hours: 96,
    release_trigger: 'VOLUNTARY_SURGEON',
    release_reason_code: 'LOW_CASE_VOLUME',
    release_timestamp: '2026-11-16T18:00:00Z',
    lead_time_hours: 37.0, // < 96h but >= 24h
    timeliness_status: 'LATE_RELEASE',
    reallocation_status: 'OPEN_POOL',
    reallocated_minutes: 0,
    downstaffed_savings_amount: 0.00,
    released_by_name: 'Dr. Sarah Jenkins, MD',
    notes: 'Late release surrendered 37h prior to surgery due to pre-op lab clearance delay.'
  },
  {
    id: 'rel-2026-005',
    facility_id: DEFAULT_FACILITY_ID,
    block_definition_id: 'b1010000-0000-4000-8000-000000000005',
    block_name: 'Dr. Elena Rostova — Cataract & Vitreoretinal',
    original_owner_name: 'Dr. Elena Rostova, MD',
    original_owner_type: 'INDIVIDUAL_SURGEON',
    original_specialty: 'OPHTHALMOLOGY',
    operating_room_id: 'room-or-4',
    room_number: 'OR-4',
    room_name: 'Ophthalmology & ENT Clean Suite',
    surgery_date: '2026-11-17',
    start_time: '07:00:00',
    end_time: '14:00:00',
    released_minutes: 420,
    required_lead_hours: 72,
    release_trigger: 'VOLUNTARY_SURGEON',
    release_reason_code: 'EMERGENCY_MEDICAL_LEAVE',
    release_timestamp: '2026-11-16T21:00:00Z',
    lead_time_hours: 10.0, // < 24h
    timeliness_status: 'SAME_DAY_RELEASE',
    reallocation_status: 'EXPIRED_UNUTILIZED',
    reallocated_minutes: 0,
    downstaffed_savings_amount: 0.00,
    released_by_name: 'OR Clinical Director',
    notes: 'Unplanned acute family emergency; surrendered evening before surgery.'
  }
];

/**
 * Realistic seed reallocations booked into released open-pool time
 */
export const SEED_BLOCK_REALLOCATIONS = [
  {
    id: 'realloc-001',
    release_event_id: 'rel-2026-001',
    recipient_surgeon_id: 103,
    recipient_surgeon_name: 'Dr. Elena Rostova, MD',
    specialty_code: 'OPHTHALMOLOGY',
    case_id: 9201,
    patient_name: 'Dorothy Miller',
    procedure_name: 'Complex Cataract Extraction with Toric IOL',
    start_time: '07:00:00',
    end_time: '11:00:00',
    reallocated_minutes: 240,
    reallocation_timestamp: '2026-11-11T10:15:00Z',
    reallocated_by_user_id: null,
    notes: 'Add-on case allocated from Dr. Vance surrendered block.'
  },
  {
    id: 'realloc-002',
    release_event_id: 'rel-2026-002',
    recipient_surgeon_id: 105,
    recipient_surgeon_name: 'Dr. Kevin Zhao, MD',
    specialty_code: 'SPINE',
    case_id: 9202,
    patient_name: 'Robert Hastings',
    procedure_name: 'Lumbar Microdiscectomy (L4-L5)',
    start_time: '07:00:00',
    end_time: '15:00:00',
    reallocated_minutes: 480,
    reallocation_timestamp: '2026-11-12T11:45:00Z',
    reallocated_by_user_id: null,
    notes: 'Full 8h block booked for 2 urgent outpatient spine cases.'
  }
];

/**
 * In-memory Store for Phase A3 Block Releases & Reallocations
 */
class BlockReleaseStore {
  constructor() {
    this.releases = [...SEED_BLOCK_RELEASES];
    this.reallocations = [...SEED_BLOCK_REALLOCATIONS];
  }

  getReleases() {
    return [...this.releases];
  }

  getReallocations() {
    return [...this.reallocations];
  }

  getReleaseById(id) {
    return this.releases.find(r => r.id === id) || null;
  }

  createRelease(releaseData) {
    const leadHours = calculateLeadTimeHours(
      releaseData.surgery_date,
      releaseData.start_time,
      releaseData.release_timestamp || new Date().toISOString()
    );

    const timeliness = determineTimelinessStatus(
      leadHours,
      releaseData.required_lead_hours || 120
    );

    const newRelease = {
      id: `rel-${Date.now()}`,
      facility_id: releaseData.facility_id || DEFAULT_FACILITY_ID,
      block_definition_id: releaseData.block_definition_id,
      block_name: releaseData.block_name || 'Standard Surgical Block',
      original_owner_name: releaseData.original_owner_name || 'Attending Surgeon',
      original_owner_type: releaseData.original_owner_type || 'INDIVIDUAL_SURGEON',
      original_specialty: releaseData.original_specialty || 'GENERAL_SURGERY',
      operating_room_id: releaseData.operating_room_id,
      room_number: releaseData.room_number || 'OR-1',
      room_name: releaseData.room_name || 'Operating Suite',
      surgery_date: releaseData.surgery_date,
      start_time: releaseData.start_time,
      end_time: releaseData.end_time,
      released_minutes: releaseData.released_minutes || 480,
      required_lead_hours: releaseData.required_lead_hours || 120,
      release_trigger: releaseData.release_trigger || 'VOLUNTARY_SURGEON',
      release_reason_code: releaseData.release_reason_code || 'PHYSICIAN_VACATION',
      release_timestamp: releaseData.release_timestamp || new Date().toISOString(),
      lead_time_hours: leadHours,
      timeliness_status: timeliness,
      reallocation_status: 'OPEN_POOL',
      reallocated_minutes: 0,
      downstaffed_savings_amount: 0.00,
      released_by_name: releaseData.released_by_name || 'Clinical Administrator',
      notes: releaseData.notes || ''
    };

    this.releases.unshift(newRelease);
    return newRelease;
  }

  reallocateRelease(releaseId, reallocData) {
    const release = this.releases.find(r => r.id === releaseId);
    if (!release) {
      throw new Error(`Release event with id ${releaseId} not found.`);
    }

    const availableMinutes = release.released_minutes - release.reallocated_minutes;
    const requestedMinutes = Number(reallocData.reallocated_minutes);

    if (requestedMinutes > availableMinutes) {
      throw new Error(`Reallocation Error: Requested ${requestedMinutes} minutes exceeds available ${availableMinutes} minutes in open pool.`);
    }

    const newRealloc = {
      id: `realloc-${Date.now()}`,
      release_event_id: releaseId,
      recipient_surgeon_id: reallocData.recipient_surgeon_id || null,
      recipient_surgeon_name: reallocData.recipient_surgeon_name,
      specialty_code: reallocData.specialty_code,
      case_id: reallocData.case_id || Math.floor(Math.random() * 9000) + 1000,
      patient_name: reallocData.patient_name || 'Add-on Outpatient',
      procedure_name: reallocData.procedure_name || 'Scheduled Surgical Procedure',
      start_time: reallocData.start_time,
      end_time: reallocData.end_time,
      reallocated_minutes: requestedMinutes,
      reallocation_timestamp: new Date().toISOString(),
      reallocated_by_user_id: null,
      notes: reallocData.notes || ''
    };

    this.reallocations.push(newRealloc);

    // Update parent release status
    release.reallocated_minutes += requestedMinutes;
    if (release.reallocated_minutes >= release.released_minutes) {
      release.reallocation_status = 'FULLY_REALLOCATED';
    } else {
      release.reallocation_status = 'PARTIALLY_REALLOCATED';
    }

    return newRealloc;
  }

  downstaffRelease(releaseId, hourlyRate = DEFAULT_DOWNSTAFFING_HOURLY_RATE) {
    const release = this.releases.find(r => r.id === releaseId);
    if (!release) {
      throw new Error(`Release event with id ${releaseId} not found.`);
    }

    const unallocatedMinutes = release.released_minutes - release.reallocated_minutes;
    if (unallocatedMinutes <= 0) {
      throw new Error('Downstaffing Error: No unclaimed minutes available to downstaff.');
    }

    const savings = calculateDownstaffingSavings(unallocatedMinutes, hourlyRate);
    release.reallocation_status = 'ROOM_DOWNSTAFFED';
    release.downstaffed_savings_amount = savings;
    release.notes = `${release.notes || ''} [Downstaffed ${unallocatedMinutes}m at $${hourlyRate}/h. Realized labor savings: $${savings.toFixed(2)}]`.trim();

    return release;
  }

  resetToDefaults() {
    this.releases = [...SEED_BLOCK_RELEASES];
    this.reallocations = [...SEED_BLOCK_REALLOCATIONS];
  }
}

export const blockReleaseStore = new BlockReleaseStore();

export default {
  DEFAULT_FACILITY_ID,
  DEFAULT_DOWNSTAFFING_HOURLY_RATE,
  RELEASE_TRIGGERS,
  RELEASE_REASONS,
  TIMELINESS_STATUSES,
  REALLOCATION_STATUSES,
  calculateLeadTimeHours,
  determineTimelinessStatus,
  calculateDownstaffingSavings,
  calculateReleaseKpis,
  filterReleaseEvents,
  SEED_BLOCK_RELEASES,
  SEED_BLOCK_REALLOCATIONS,
  blockReleaseStore
};
