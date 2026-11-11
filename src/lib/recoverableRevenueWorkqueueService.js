/**
 * ==============================================================================
 * RECOVERABLE REVENUE WORKQUEUE SERVICE (PHASE 99)
 * Authoritative Operational Execution Workbench & SLA Engine
 * ==============================================================================
 */

export const WORKQUEUE_CODES = {
  CRITICAL_SLA_TRIAGE: {
    code: 'CRITICAL_SLA_TRIAGE',
    name: 'Critical SLA Triage',
    targetSlaHours: 48,
    description: 'Tier 1 high-yield opportunities and imminent timely filing deadlines.'
  },
  IMPLANT_DISPUTES: {
    code: 'IMPLANT_DISPUTES',
    name: 'Implant Carveout Disputes',
    targetSlaHours: 72,
    description: 'Unbilled or zero-paid high-cost surgical implants with manufacturer invoice attachments.'
  },
  DENIAL_APPEALS: {
    code: 'DENIAL_APPEALS',
    name: 'Clinical & Technical Denial Appeals',
    targetSlaHours: 120,
    description: 'High overturn probability payer denials requiring statutory written appeals.'
  },
  SECONDARY_COB_BATCH: {
    code: 'SECONDARY_COB_BATCH',
    name: 'Secondary & Medigap COB Recovery',
    targetSlaHours: 168,
    description: 'Missing 20% crossover payments, Medigap coinsurance, and non-duplication coordination.'
  },
  UNDERPAYMENT_RECOVERY: {
    code: 'UNDERPAYMENT_RECOVERY',
    name: 'Payer Contract Underpayments',
    targetSlaHours: 120,
    description: 'Contractual fee schedule variances, unapplied multipliers, and recurring pattern disputes.'
  },
  SUPERVISOR_ESCALATIONS: {
    code: 'SUPERVISOR_ESCALATIONS',
    name: 'Supervisor Escalations',
    targetSlaHours: 24,
    description: 'SLA-breached claims, high-dollar dispute escalations, and unrecoverable write-off reviews.'
  }
};

export const RECOVERY_LIFECYCLE_STATUSES = {
  UNASSIGNED: { code: 'UNASSIGNED', label: 'Unassigned', terminal: false },
  ASSIGNED: { code: 'ASSIGNED', label: 'Assigned to Specialist', terminal: false },
  IN_PROGRESS: { code: 'IN_PROGRESS', label: 'Active in Workbench', terminal: false },
  PENDING_DOCS: { code: 'PENDING_DOCS', label: 'Pending Documentation', terminal: false },
  DISPUTE_SUBMITTED: { code: 'DISPUTE_SUBMITTED', label: 'Dispute / Packet Sent', terminal: false },
  APPEAL_PENDING: { code: 'APPEAL_PENDING', label: 'Formal Appeal Pending', terminal: false },
  RECOVERED_RECONCILED: { code: 'RECOVERED_RECONCILED', label: 'Cash Recovered & Reconciled', terminal: true },
  CLOSED_UNRECOVERABLE: { code: 'CLOSED_UNRECOVERABLE', label: 'Closed (Unrecoverable)', terminal: true }
};

export const SLA_STATUSES = {
  ON_SCHEDULE: { code: 'ON_SCHEDULE', label: 'On Schedule', badgeClass: 'sla-on-schedule' },
  WARNING_AT_RISK: { code: 'WARNING_AT_RISK', label: 'At Risk (< 24h)', badgeClass: 'sla-warning' },
  SLA_BREACHED: { code: 'SLA_BREACHED', label: 'SLA Breached', badgeClass: 'sla-breached' },
  RESOLVED: { code: 'RESOLVED', label: 'Resolved', badgeClass: 'sla-resolved' }
};

export const TIER_SLA_HOURS = {
  TIER_1_CRITICAL_DISPATCH: 48,
  TIER_2_HIGH_YIELD_RECOVERY: 120,
  TIER_3_STANDARD_WORKBENCH: 336,
  TIER_4_LOW_YIELD_BATCH: 720,
  TIER_5_EXPIRED_OR_SUPPRESSED: 0
};

export const MAX_SPECIALIST_CAPACITY = 35;

export const DISMISSAL_REASONS = [
  { code: 'TIMELY_FILING_EXPIRED', label: 'Statutory Timely Filing Expired' },
  { code: 'CONTRACTUAL_WRITE_OFF', label: 'Valid Contractual Adjustment / Non-Disputable' },
  { code: 'NON_COVERED_SERVICE', label: 'Legitimate Non-Covered Procedure' },
  { code: 'SUPERVISOR_AUTHORIZED', label: 'Supervisor Authorized Economic Dismissal' },
  { code: 'DUPLICATE_CLAIM', label: 'Resolved Under Alternate Claim Number' }
];

export const RECOVERY_SPECIALISTS = [
  { id: 'spec-01', name: 'Sarah Jenkins, CPC', role: 'Senior Denial Specialist', capacity: 35, activeCases: 14 },
  { id: 'spec-02', name: 'Marcus Vance, CRCR', role: 'Implant & Surgical Supply Auditor', capacity: 35, activeCases: 18 },
  { id: 'spec-03', name: 'Elena Rostova', role: 'Contract Variance Lead', capacity: 35, activeCases: 22 },
  { id: 'spec-04', name: 'David Cho', role: 'COB & Secondary Crossover Specialist', capacity: 35, activeCases: 11 },
  { id: 'spec-05', name: 'Amanda Price, Lead', role: 'RCM Supervisor & Escalations', capacity: 35, activeCases: 8 }
];

/**
 * Deterministic SLA Deadline Calculation
 * Invariant: min(timelyFilingDeadline, createdAt + tierHours)
 */
export function calculateSlaDeadline(createdAt, tierCode, timelyFilingDeadline = null) {
  const createdDate = new Date(createdAt);
  const slaHours = TIER_SLA_HOURS[tierCode] !== undefined ? TIER_SLA_HOURS[tierCode] : 120;
  
  const tierTargetDate = new Date(createdDate.getTime() + slaHours * 3600 * 1000);
  
  if (timelyFilingDeadline) {
    const filingDate = new Date(timelyFilingDeadline);
    return filingDate < tierTargetDate ? filingDate : tierTargetDate;
  }
  
  return tierTargetDate;
}

/**
 * Deterministic SLA Status Evaluation
 */
export function evaluateSlaStatus(slaDeadline, isResolved = false, currentTime = new Date()) {
  if (isResolved) {
    return SLA_STATUSES.RESOLVED.code;
  }
  
  const now = new Date(currentTime).getTime();
  const deadline = new Date(slaDeadline).getTime();
  const diffHours = (deadline - now) / (1000 * 3600);
  
  if (diffHours < 0) {
    return SLA_STATUSES.SLA_BREACHED.code;
  }
  if (diffHours <= 24) {
    return SLA_STATUSES.WARNING_AT_RISK.code;
  }
  return SLA_STATUSES.ON_SCHEDULE.code;
}

/**
 * Master Queue Deterministic Sorting Invariant:
 * 1. SLA_BREACHED items first
 * 2. Priority Tier Rank ASC (Tier 1 first)
 * 3. Expected Realizable Yield DESC
 * 4. SLA Deadline ASC (earliest first)
 */
export function sortWorkqueueItems(items) {
  const tierRanks = {
    TIER_1_CRITICAL_DISPATCH: 1,
    TIER_2_HIGH_YIELD_RECOVERY: 2,
    TIER_3_STANDARD_WORKBENCH: 3,
    TIER_4_LOW_YIELD_BATCH: 4,
    TIER_5_EXPIRED_OR_SUPPRESSED: 5
  };

  return [...items].sort((a, b) => {
    // 1. Breached items always float to the top of active work
    const aBreached = a.sla_status === SLA_STATUSES.SLA_BREACHED.code && !RECOVERY_LIFECYCLE_STATUSES[a.lifecycle_status]?.terminal;
    const bBreached = b.sla_status === SLA_STATUSES.SLA_BREACHED.code && !RECOVERY_LIFECYCLE_STATUSES[b.lifecycle_status]?.terminal;
    if (aBreached && !bBreached) return -1;
    if (!aBreached && bBreached) return 1;

    // 2. Priority Tier Rank ASC
    const rankA = tierRanks[a.priority_tier] || 99;
    const rankB = tierRanks[b.priority_tier] || 99;
    if (rankA !== rankB) return rankA - rankB;

    // 3. Expected Realizable Yield DESC
    if (b.expected_realizable_yield !== a.expected_realizable_yield) {
      return b.expected_realizable_yield - a.expected_realizable_yield;
    }

    // 4. Earliest SLA Deadline first
    return new Date(a.sla_deadline) - new Date(b.sla_deadline);
  });
}

// ==========================================
// BASELINE WORKQUEUE MOCK DATA STORE
// ==========================================
const BASELINE_WORK_ITEMS = [
  {
    id: 'rrw-item-101',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.IMPLANT_DISPUTES.code,
    source_module: 'IMPLANT_CARVEOUT',
    source_record_id: 'IMP-2026-904',
    claim_number: 'CLM-2026-08802',
    patient_name: 'David Robinson',
    payer_name: 'Blue Cross Blue Shield',
    procedure_name: 'Lumbar Arthrodesis with Interbody Fusion Cage',
    gross_recoverable_amount: 8200.00,
    expected_realizable_yield: 6888.00,
    rops_priority_score: 93.45,
    priority_tier: 'TIER_1_CRITICAL_DISPATCH',
    assigned_specialist_id: 'spec-02',
    assigned_specialist_name: 'Marcus Vance, CRCR',
    assigned_at: '2026-11-09T08:00:00Z',
    lifecycle_status: 'IN_PROGRESS',
    sla_deadline: new Date(Date.now() + 18 * 3600 * 1000).toISOString(), // 18 hrs left (At risk)
    sla_status: 'WARNING_AT_RISK',
    touch_count: 3,
    last_action_type: 'INVOICE_ATTACHED',
    last_action_at: '2026-11-10T14:30:00Z',
    actual_cash_recovered: 0.00,
    recovery_reconciled_at: null,
    notes: 'Stryker cage invoice verified at $6,200. Commercial carveout cost-plus 20% calculation confirmed.',
    created_at: '2026-11-08T10:00:00Z'
  },
  {
    id: 'rrw-item-102',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.DENIAL_APPEALS.code,
    source_module: 'DENIAL_APPEAL',
    source_record_id: 'DEN-2026-0312',
    claim_number: 'CLM-2026-09144',
    patient_name: 'Eleanor Martinez',
    payer_name: 'UnitedHealthcare',
    procedure_name: 'Total Knee Arthroplasty (CPT 27447)',
    gross_recoverable_amount: 11450.00,
    expected_realizable_yield: 8931.00,
    rops_priority_score: 89.20,
    priority_tier: 'TIER_1_CRITICAL_DISPATCH',
    assigned_specialist_id: 'spec-01',
    assigned_specialist_name: 'Sarah Jenkins, CPC',
    assigned_at: '2026-11-08T09:30:00Z',
    lifecycle_status: 'DISPUTE_SUBMITTED',
    sla_deadline: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // Breached by 4 hrs
    sla_status: 'SLA_BREACHED',
    touch_count: 5,
    last_action_type: 'APPEAL_PACKET_DISPATCHED',
    last_action_at: '2026-11-10T16:00:00Z',
    actual_cash_recovered: 0.00,
    recovery_reconciled_at: null,
    notes: 'Prior authorization CO-197 overturn submitted with clinical justification packet.',
    created_at: '2026-11-06T09:00:00Z'
  },
  {
    id: 'rrw-item-103',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.SECONDARY_COB_BATCH.code,
    source_module: 'SECONDARY_COB',
    source_record_id: 'COB-2026-1102',
    claim_number: 'CLM-2026-07719',
    patient_name: 'Harold Green',
    payer_name: 'Aetna Senior Supplemental (Medigap Plan G)',
    procedure_name: 'Cataract Phacoemulsification with IOL (CPT 66984)',
    gross_recoverable_amount: 1640.00,
    expected_realizable_yield: 1607.20,
    rops_priority_score: 78.50,
    priority_tier: 'TIER_2_HIGH_YIELD_RECOVERY',
    assigned_specialist_id: 'spec-04',
    assigned_specialist_name: 'David Cho',
    assigned_at: '2026-11-10T11:00:00Z',
    lifecycle_status: 'ASSIGNED',
    sla_deadline: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    sla_status: 'ON_SCHEDULE',
    touch_count: 1,
    last_action_type: 'SECONDARY_BATCH_STAGED',
    last_action_at: '2026-11-10T11:00:00Z',
    actual_cash_recovered: 0.00,
    recovery_reconciled_at: null,
    notes: 'Medicare Part B crossed over; Medigap 20% coinsurance crossover pending electronic rebill.',
    created_at: '2026-11-09T14:00:00Z'
  },
  {
    id: 'rrw-item-104',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.UNDERPAYMENT_RECOVERY.code,
    source_module: 'RECURRING_PATTERN',
    source_record_id: 'PAT-2026-BCBS-01',
    claim_number: 'CLM-2026-08104',
    patient_name: 'Systemic Payer Group',
    payer_name: 'Cigna Commercial',
    procedure_name: 'Shoulder Arthroscopy Subacromial Decompression (CPT 29826)',
    gross_recoverable_amount: 14280.00,
    expected_realizable_yield: 12138.00,
    rops_priority_score: 91.80,
    priority_tier: 'TIER_1_CRITICAL_DISPATCH',
    assigned_specialist_id: 'spec-03',
    assigned_specialist_name: 'Elena Rostova',
    assigned_at: '2026-11-07T10:00:00Z',
    lifecycle_status: 'DISPUTE_SUBMITTED',
    sla_deadline: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    sla_status: 'ON_SCHEDULE',
    touch_count: 4,
    last_action_type: 'BULK_CONTRACT_DISPUTE',
    last_action_at: '2026-11-09T15:20:00Z',
    actual_cash_recovered: 0.00,
    recovery_reconciled_at: null,
    notes: '17 similar claims short by $840 bundled in error. Payer contract clause 4.2 cited.',
    created_at: '2026-11-07T08:00:00Z'
  },
  {
    id: 'rrw-item-105',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.UNDERPAYMENT_RECOVERY.code,
    source_module: 'PAYER_UNDERPAYMENT',
    source_record_id: 'UND-2026-0441',
    claim_number: 'CLM-2026-06992',
    patient_name: 'Maria Santos',
    payer_name: 'Humana Medicare Advantage',
    procedure_name: 'Laparoscopic Cholecystectomy (CPT 47562)',
    gross_recoverable_amount: 2450.00,
    expected_realizable_yield: 2180.50,
    rops_priority_score: 72.10,
    priority_tier: 'TIER_2_HIGH_YIELD_RECOVERY',
    assigned_specialist_id: 'spec-03',
    assigned_specialist_name: 'Elena Rostova',
    assigned_at: '2026-11-05T13:00:00Z',
    lifecycle_status: 'RECOVERED_RECONCILED',
    sla_deadline: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    sla_status: 'RESOLVED',
    touch_count: 6,
    last_action_type: 'REMITTANCE_POSTED',
    last_action_at: '2026-11-10T16:45:00Z',
    actual_cash_recovered: 2450.00,
    recovery_reconciled_at: '2026-11-10T16:45:00Z',
    notes: 'Remittance ERA-2026-HUM-881 verified. Contractual rate adjustment fully paid.',
    created_at: '2026-11-05T11:00:00Z'
  },
  {
    id: 'rrw-item-106',
    facility_id: 'fac-01',
    queue_id: WORKQUEUE_CODES.CRITICAL_SLA_TRIAGE.code,
    source_module: 'UNBILLED_CASE',
    source_record_id: 'UNB-2026-019',
    claim_number: 'CLM-2026-09551',
    patient_name: 'Thomas Wayne',
    payer_name: 'Aetna Commercial',
    procedure_name: 'Carpal Tunnel Release (CPT 64721)',
    gross_recoverable_amount: 3200.00,
    expected_realizable_yield: 3040.00,
    rops_priority_score: 84.75,
    priority_tier: 'TIER_1_CRITICAL_DISPATCH',
    assigned_specialist_id: null,
    assigned_specialist_name: null,
    assigned_at: null,
    lifecycle_status: 'UNASSIGNED',
    sla_deadline: new Date(Date.now() + 12 * 3600 * 1000).toISOString(), // 12 hrs left
    sla_status: 'WARNING_AT_RISK',
    touch_count: 0,
    last_action_type: null,
    last_action_at: null,
    actual_cash_recovered: 0.00,
    recovery_reconciled_at: null,
    notes: 'Unbilled case past 7-day ASC target threshold. Operative note signed by surgeon.',
    created_at: '2026-11-10T08:00:00Z'
  }
];

const BASELINE_AUDIT_LOG = [
  {
    id: 'aud-001',
    work_item_id: 'rrw-item-101',
    action_type: 'ASSIGN',
    performed_by_name: 'Amanda Price (Supervisor)',
    previous_status: 'UNASSIGNED',
    new_status: 'ASSIGNED',
    previous_specialist: null,
    new_specialist: 'Marcus Vance, CRCR',
    dollar_amount: 8200.00,
    action_notes: 'Routed to surgical implant dispute queue based on device cost-plus carveout.',
    created_at: '2026-11-09T08:00:00Z'
  },
  {
    id: 'aud-002',
    work_item_id: 'rrw-item-101',
    action_type: 'STATUS_CHANGE',
    performed_by_name: 'Marcus Vance, CRCR',
    previous_status: 'ASSIGNED',
    new_status: 'IN_PROGRESS',
    previous_specialist: 'Marcus Vance, CRCR',
    new_specialist: 'Marcus Vance, CRCR',
    dollar_amount: 8200.00,
    action_notes: 'Contacted OR materials manager for manufacturer invoice acquisition.',
    created_at: '2026-11-10T10:15:00Z'
  },
  {
    id: 'aud-003',
    work_item_id: 'rrw-item-102',
    action_type: 'DISPUTE_SENT',
    performed_by_name: 'Sarah Jenkins, CPC',
    previous_status: 'IN_PROGRESS',
    new_status: 'DISPUTE_SUBMITTED',
    previous_specialist: 'Sarah Jenkins, CPC',
    new_specialist: 'Sarah Jenkins, CPC',
    dollar_amount: 11450.00,
    action_notes: 'Dispatched formal prior-auth clinical appeal to UHC appeals portal.',
    created_at: '2026-11-10T16:00:00Z'
  },
  {
    id: 'aud-004',
    work_item_id: 'rrw-item-105',
    action_type: 'CASH_RECOVERED',
    performed_by_name: 'Elena Rostova',
    previous_status: 'DISPUTE_SUBMITTED',
    new_status: 'RECOVERED_RECONCILED',
    previous_specialist: 'Elena Rostova',
    new_specialist: 'Elena Rostova',
    dollar_amount: 2450.00,
    action_notes: 'Reconciled 835 remittance check ERA-2026-HUM-881. Case closed.',
    created_at: '2026-11-10T16:45:00Z'
  }
];

class RecoverableRevenueWorkqueueStore {
  constructor() {
    this.items = [...BASELINE_WORK_ITEMS];
    this.auditLog = [...BASELINE_AUDIT_LOG];
    this.specialists = [...RECOVERY_SPECIALISTS];
  }

  getWorkqueueItems(filters = {}) {
    let result = [...this.items];

    // Refresh SLA statuses deterministically
    result = result.map(item => {
      const isResolved = RECOVERY_LIFECYCLE_STATUSES[item.lifecycle_status]?.terminal;
      const liveSlaStatus = evaluateSlaStatus(item.sla_deadline, isResolved);
      return {
        ...item,
        sla_status: liveSlaStatus
      };
    });

    if (filters.queueId && filters.queueId !== 'ALL') {
      result = result.filter(item => item.queue_id === filters.queueId);
    }

    if (filters.status && filters.status !== 'ALL') {
      result = result.filter(item => item.lifecycle_status === filters.status);
    }

    if (filters.specialistId && filters.specialistId !== 'ALL') {
      if (filters.specialistId === 'UNASSIGNED') {
        result = result.filter(item => !item.assigned_specialist_id);
      } else {
        result = result.filter(item => item.assigned_specialist_id === filters.specialistId);
      }
    }

    if (filters.priorityTier && filters.priorityTier !== 'ALL') {
      result = result.filter(item => item.priority_tier === filters.priorityTier);
    }

    if (filters.slaStatus && filters.slaStatus !== 'ALL') {
      result = result.filter(item => item.sla_status === filters.slaStatus);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(item =>
        item.claim_number.toLowerCase().includes(q) ||
        item.patient_name.toLowerCase().includes(q) ||
        item.payer_name.toLowerCase().includes(q) ||
        item.procedure_name.toLowerCase().includes(q)
      );
    }

    return sortWorkqueueItems(result);
  }

  getQueueMetrics(facilityId = 'fac-01') {
    const active = this.items.filter(i => !RECOVERY_LIFECYCLE_STATUSES[i.lifecycle_status]?.terminal);
    const resolved = this.items.filter(i => i.lifecycle_status === RECOVERY_LIFECYCLE_STATUSES.RECOVERED_RECONCILED.code);

    const totalActiveGross = active.reduce((sum, i) => sum + (Number(i.gross_recoverable_amount) || 0), 0);
    const totalActiveExpected = active.reduce((sum, i) => sum + (Number(i.expected_realizable_yield) || 0), 0);
    const totalCashRecovered = this.items.reduce((sum, i) => sum + (Number(i.actual_cash_recovered) || 0), 0);

    const breachedCount = active.filter(i => evaluateSlaStatus(i.sla_deadline, false) === SLA_STATUSES.SLA_BREACHED.code).length;
    const atRiskCount = active.filter(i => evaluateSlaStatus(i.sla_deadline, false) === SLA_STATUSES.WARNING_AT_RISK.code).length;

    // SLA compliance rate: percentage of resolved cases recovered before deadline
    let complianceRate = 100.0;
    if (resolved.length > 0) {
      const onTimeRecoveries = resolved.filter(i => {
        if (!i.recovery_reconciled_at || !i.sla_deadline) return true;
        return new Date(i.recovery_reconciled_at) <= new Date(i.sla_deadline);
      }).length;
      complianceRate = Math.round((onTimeRecoveries / resolved.length) * 1000) / 10;
    }

    return {
      totalCases: this.items.length,
      activeCases: active.length,
      totalActiveGross: Math.round(totalActiveGross * 100) / 100,
      totalActiveExpected: Math.round(totalActiveExpected * 100) / 100,
      totalCashRecovered: Math.round(totalCashRecovered * 100) / 100,
      breachedCount,
      atRiskCount,
      complianceRate,
      averageCycleDays: 4.8
    };
  }

  getSpecialistWorkload(facilityId = 'fac-01') {
    return this.specialists.map(spec => {
      const assigned = this.items.filter(
        i => i.assigned_specialist_id === spec.id && !RECOVERY_LIFECYCLE_STATUSES[i.lifecycle_status]?.terminal
      );
      const breaches = assigned.filter(i => evaluateSlaStatus(i.sla_deadline, false) === SLA_STATUSES.SLA_BREACHED.code).length;
      const totalExpectedYield = assigned.reduce((sum, i) => sum + (Number(i.expected_realizable_yield) || 0), 0);

      return {
        ...spec,
        activeCases: assigned.length,
        capacityPct: Math.round((assigned.length / spec.capacity) * 100),
        breachesCount: breaches,
        totalExpectedYield: Math.round(totalExpectedYield * 100) / 100
      };
    });
  }

  assignWorkItem(itemId, specialistId, specialistName, currentUser = 'System User', notes = '') {
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error(`Work item not found: ${itemId}`);

    // Capacity guard (Rule 3)
    const specialist = this.specialists.find(s => s.id === specialistId);
    if (specialist) {
      const activeCount = this.items.filter(
        i => i.assigned_specialist_id === specialistId && !RECOVERY_LIFECYCLE_STATUSES[i.lifecycle_status]?.terminal && i.id !== itemId
      ).length;
      if (activeCount >= MAX_SPECIALIST_CAPACITY) {
        throw new Error(`Specialist ${specialistName} has reached maximum capacity of ${MAX_SPECIALIST_CAPACITY} claims. Supervisor override required.`);
      }
    }

    const prevSpecialist = item.assigned_specialist_name;
    const prevStatus = item.lifecycle_status;
    const newStatus = prevStatus === RECOVERY_LIFECYCLE_STATUSES.UNASSIGNED.code ? RECOVERY_LIFECYCLE_STATUSES.ASSIGNED.code : prevStatus;

    item.assigned_specialist_id = specialistId;
    item.assigned_specialist_name = specialistName;
    item.assigned_at = new Date().toISOString();
    item.lifecycle_status = newStatus;
    item.touch_count += 1;
    item.last_action_type = 'ASSIGN';
    item.last_action_at = new Date().toISOString();
    if (notes) item.notes = `${item.notes ? item.notes + ' • ' : ''}${notes}`;

    // Record immutable audit entry
    this.auditLog.push({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      work_item_id: itemId,
      action_type: 'ASSIGN',
      performed_by_name: currentUser,
      previous_status: prevStatus,
      new_status: newStatus,
      previous_specialist: prevSpecialist,
      new_specialist: specialistName,
      dollar_amount: item.gross_recoverable_amount,
      action_notes: notes || `Assigned to ${specialistName}`,
      created_at: new Date().toISOString()
    });

    return item;
  }

  transitionLifecycleStatus(itemId, newStatus, actionNotes = '', currentUser = 'System User', metadata = {}) {
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error(`Work item not found: ${itemId}`);

    const statusDef = RECOVERY_LIFECYCLE_STATUSES[newStatus];
    if (!statusDef) throw new Error(`Invalid lifecycle status: ${newStatus}`);

    const prevStatus = item.lifecycle_status;
    item.lifecycle_status = newStatus;
    item.touch_count += 1;
    item.last_action_type = metadata.actionType || 'STATUS_CHANGE';
    item.last_action_at = new Date().toISOString();
    if (actionNotes) item.notes = `${item.notes ? item.notes + ' • ' : ''}${actionNotes}`;

    if (statusDef.terminal) {
      item.sla_status = SLA_STATUSES.RESOLVED.code;
    }

    this.auditLog.push({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      work_item_id: itemId,
      action_type: metadata.actionType || 'STATUS_CHANGE',
      performed_by_name: currentUser,
      previous_status: prevStatus,
      new_status: newStatus,
      previous_specialist: item.assigned_specialist_name,
      new_specialist: item.assigned_specialist_name,
      dollar_amount: item.gross_recoverable_amount,
      action_notes: actionNotes || `Status transitioned to ${statusDef.label}`,
      event_metadata: metadata,
      created_at: new Date().toISOString()
    });

    return item;
  }

  reconcileRecovery(itemId, cashAmount, remittanceRef = '', currentUser = 'System User') {
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error(`Work item not found: ${itemId}`);

    const recovered = Number(cashAmount);
    if (isNaN(recovered) || recovered <= 0) {
      throw new Error('Cash recovery reconciliation requires a valid positive cash amount.');
    }
    if (!remittanceRef || !remittanceRef.trim()) {
      throw new Error('Cash recovery reconciliation requires an 835 ERA remittance number or check reference.');
    }

    const prevStatus = item.lifecycle_status;
    item.actual_cash_recovered = recovered;
    item.recovery_reconciled_at = new Date().toISOString();
    item.lifecycle_status = RECOVERY_LIFECYCLE_STATUSES.RECOVERED_RECONCILED.code;
    item.sla_status = SLA_STATUSES.RESOLVED.code;
    item.touch_count += 1;
    item.last_action_type = 'CASH_RECOVERED';
    item.last_action_at = new Date().toISOString();
    item.notes = `${item.notes ? item.notes + ' • ' : ''}Reconciled cash: $${recovered.toFixed(2)} (${remittanceRef.trim()})`;

    this.auditLog.push({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      work_item_id: itemId,
      action_type: 'CASH_RECOVERED',
      performed_by_name: currentUser,
      previous_status: prevStatus,
      new_status: RECOVERY_LIFECYCLE_STATUSES.RECOVERED_RECONCILED.code,
      previous_specialist: item.assigned_specialist_name,
      new_specialist: item.assigned_specialist_name,
      dollar_amount: recovered,
      action_notes: `Cash collected: $${recovered.toFixed(2)} with reference ${remittanceRef}`,
      created_at: new Date().toISOString()
    });

    return item;
  }

  dismissWorkItem(itemId, reasonCode, notes = '', currentUser = 'System User') {
    const item = this.items.find(i => i.id === itemId);
    if (!item) throw new Error(`Work item not found: ${itemId}`);

    if (!notes || notes.trim().length < 5) {
      throw new Error('Dismissing a recovery opportunity requires documented justification notes (min 5 characters).');
    }

    const prevStatus = item.lifecycle_status;
    item.lifecycle_status = RECOVERY_LIFECYCLE_STATUSES.CLOSED_UNRECOVERABLE.code;
    item.dismissal_reason_code = reasonCode;
    item.sla_status = SLA_STATUSES.RESOLVED.code;
    item.touch_count += 1;
    item.last_action_type = 'DISMISSED';
    item.last_action_at = new Date().toISOString();
    item.notes = `${item.notes ? item.notes + ' • ' : ''}Dismissed: ${reasonCode} - ${notes.trim()}`;

    this.auditLog.push({
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      work_item_id: itemId,
      action_type: 'DISMISSED',
      performed_by_name: currentUser,
      previous_status: prevStatus,
      new_status: RECOVERY_LIFECYCLE_STATUSES.CLOSED_UNRECOVERABLE.code,
      previous_specialist: item.assigned_specialist_name,
      new_specialist: item.assigned_specialist_name,
      dollar_amount: item.gross_recoverable_amount,
      action_notes: `Dismissed (${reasonCode}): ${notes.trim()}`,
      created_at: new Date().toISOString()
    });

    return item;
  }

  batchAssignItems(itemIds, specialistId, specialistName, currentUser = 'System User', notes = '') {
    const results = [];
    for (const id of itemIds) {
      try {
        const updated = this.assignWorkItem(id, specialistId, specialistName, currentUser, notes);
        results.push(updated);
      } catch (err) {
        console.warn(`Batch assign failed for item ${id}:`, err.message);
      }
    }
    return results;
  }

  getAuditLog(itemId) {
    return this.auditLog
      .filter(entry => entry.work_item_id === itemId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

export const recoverableRevenueWorkqueueService = new RecoverableRevenueWorkqueueStore();
export default recoverableRevenueWorkqueueService;

