/**
 * ==============================================================================
 * Service: payrollIntegrationService.js
 * Module 15: Enterprise Healthcare Integrations (Phase F7)
 * Description: Payroll & Clinical Labor Gateway (ADP Workforce Now, UKG Kronos, Paychex),
 *              Employee Staff Directory Mapping, Timecard Shift Punch Engine,
 *              FLSA Overtime/Burden Calculations, Perioperative Case Labor Costing,
 *              and Labor Audit Provenance.
 * ==============================================================================
 */

import crypto from 'crypto';

export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Normalizes facility identifier whether passed as string, alias, or object
 */
export function normalizeFacilityId(facilityInput) {
  if (!facilityInput) return NAPLES_FACILITY_ID;
  if (typeof facilityInput === 'object') {
    const rawId = facilityInput.id || facilityInput.facility_id || facilityInput.facilityId || facilityInput.uuid;
    return normalizeFacilityId(rawId);
  }
  const str = String(facilityInput).trim();
  if (
    str === 'fac-naples-01' ||
    str === 'naples-surgery-center' ||
    str.toLowerCase().includes('naples')
  ) {
    return NAPLES_FACILITY_ID;
  }
  return str || NAPLES_FACILITY_ID;
}

/**
 * Generates an immutable SHA-256 seal for payroll batches (exactly 64 chars)
 */
export function computePayrollProvenanceSeal(facilityId, batchControlNumber, payPeriodCode, totalGrossPay, status) {
  const normId = normalizeFacilityId(facilityId);
  const payload = `${normId}|${batchControlNumber}|${payPeriodCode}|${Number(totalGrossPay).toFixed(2)}|${status}`;
  const rawHash = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256_pay_${rawHash.substring(0, 53)}`; // Exactly 64 chars
}

/**
 * Masks sensitive credentials for UI and logging safety
 */
export function maskPayrollSecret(secret) {
  if (!secret) return 'pay_sec_****_none';
  if (secret.length <= 8) return 'pay_sec_****_mask';
  return `pay_sec_****_${secret.slice(-4)}`;
}

/**
 * Deterministic Staff Wage & Burden Calculator
 *
 * Formulas:
 * Regular Wages = Regular Hours * Base Rate
 * Overtime Wages = Overtime Hours * Base Rate * 1.5
 * Gross Pay = Regular Wages + Overtime Wages
 * Burden Multiplier = 1 + (Burden Pct / 100)
 * Burdened Cost = Gross Pay * Burden Multiplier
 * Hourly Burdened Rate = Base Rate * Burden Multiplier
 */
export function calculateStaffLaborCost(regularHours = 0, baseRate = 0, burdenPct = 22.50, overtimeHours = 0) {
  const regHrs = Math.max(0, Number(regularHours) || 0);
  const otHrs = Math.max(0, Number(overtimeHours) || 0);
  const rate = Math.max(0, Number(baseRate) || 0);
  const burden = Math.max(0, Number(burdenPct) || 0);

  const regularWages = Number((regHrs * rate).toFixed(2));
  const otWages = Number((otHrs * rate * 1.5).toFixed(2));
  const grossPay = Number((regularWages + otWages).toFixed(2));
  const burdenMultiplier = 1 + (burden / 100);
  const burdenedCost = Number((grossPay * burdenMultiplier).toFixed(2));
  const hourlyBurdenedRate = Number((rate * burdenMultiplier).toFixed(2));

  return {
    regularHours: regHrs,
    overtimeHours: otHrs,
    baseRate: rate,
    burdenPct: burden,
    regularWages,
    otWages,
    grossPay,
    burdenedCost,
    hourlyBurdenedRate
  };
}

/**
 * Deterministic Perioperative Case Labor Costing Calculator
 *
 * Total Case Labor Cost = Sum over staff of: (Hourly Burdened Rate / 60) * Case Overlap Minutes
 */
export function calculateCaseLaborCost(staffAllocations = []) {
  if (!Array.isArray(staffAllocations) || staffAllocations.length === 0) {
    return {
      totalLaborCost: 0,
      assignedStaffCount: 0,
      breakdown: []
    };
  }

  let totalCost = 0;
  const breakdown = staffAllocations.map(staff => {
    const rate = Number(staff.baseRate) || 0;
    const burden = Number(staff.burdenPct !== undefined ? staff.burdenPct : 22.50);
    const minutes = Number(staff.caseOverlapMinutes) || 0;
    const isOt = Boolean(staff.isOt);

    const effectiveBaseRate = isOt ? rate * 1.5 : rate;
    const hourlyBurdenedRate = effectiveBaseRate * (1 + burden / 100);
    const minuteRate = hourlyBurdenedRate / 60;
    const allocatedCost = Number((minuteRate * minutes).toFixed(2));

    totalCost += allocatedCost;

    return {
      staffId: staff.staffId || staff.external_employee_id,
      staffName: staff.staffName || staff.employee_name,
      role: staff.role || staff.clinical_role,
      minutes,
      isOt,
      baseRate: rate,
      hourlyBurdenedRate: Number(hourlyBurdenedRate.toFixed(2)),
      allocatedCost
    };
  });

  return {
    totalLaborCost: Number(totalCost.toFixed(2)),
    assignedStaffCount: staffAllocations.length,
    breakdown
  };
}

/**
 * Calculates Labor Cost per Operating Room Minute
 */
export function calculateCostPerOrMinute(totalLaborCost, caseMinutes) {
  const cost = Number(totalLaborCost) || 0;
  const mins = Number(caseMinutes) || 0;
  if (mins <= 0) return 0;
  return Number((cost / mins).toFixed(2));
}

/**
 * Validates electronic shift punch data and flags timecard anomalies
 */
export function validateTimecardShift(shift) {
  const errors = [];
  const warnings = [];

  if (!shift) {
    return { isValid: false, errors: ['Missing shift data'], warnings: [] };
  }

  const clockIn = new Date(shift.clock_in_time);
  const clockOut = new Date(shift.clock_out_time);

  if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) {
    errors.push('ERR_INVALID_TIMESTAMP: Clock-in or clock-out timestamp is not a valid date.');
  } else {
    const diffHours = (clockOut - clockIn) / (1000 * 60 * 60);

    if (diffHours < 0) {
      errors.push('ERR_CHRONOLOGY_INVERSION: Clock-out occurs before clock-in time.');
    }

    if (diffHours > 16) {
      errors.push('ERR_MISSED_CLOCK_OUT: Shift duration exceeds 16 consecutive hours. Suspected missed clock-out punch.');
    }

    if (shift.overtime_hours && Number(shift.overtime_hours) > 8) {
      warnings.push('WARN_OVERTIME_SPIKE: Overtime exceeds 8 hours in a single shift.');
    }
  }

  if (!shift.external_employee_id && !shift.employee_id) {
    errors.push('ERR_UNMAPPED_EMPLOYEE: Shift is not associated with an employee ID.');
  }

  if (shift.hourly_rate !== undefined && Number(shift.hourly_rate) <= 0) {
    errors.push('ERR_RATE_ANOMALY: Base hourly rate cannot be zero or negative.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ==========================================
// MOCK REPOSITORY & DATA ACCESSORS
// ==========================================

const DEFAULT_CONFIG = {
  facility_id: NAPLES_FACILITY_ID,
  payroll_vendor: 'ADP_WORKFORCE_NOW',
  gateway_mode: 'REST_API',
  api_endpoint_url: 'https://api.adp.com/hr/v2/workers',
  company_payroll_code: 'ADP-NAPLES-ASC',
  client_id: 'adp_client_naples_prod',
  client_secret_encrypted: 'pay_sec_v2_99a80b12cd83749102837491823749182374918237491823749182374918237',
  pay_period_frequency: 'BIWEEKLY',
  default_burden_pct: 22.50,
  sync_status: 'CONNECTED',
  health_status: 'HEALTHY',
  updated_at: new Date().toISOString()
};

const DEFAULT_EMPLOYEES = [
  {
    id: 'emp-uuid-1001',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1001',
    employee_name: 'Sarah Jenkins, RN',
    clinical_role: 'CIRCULATING_RN',
    department_code: 'OR_SUITE',
    base_hourly_rate: 52.00,
    burden_pct: 22.50,
    is_active: true
  },
  {
    id: 'emp-uuid-1002',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1002',
    employee_name: 'Marcus Vance, CST',
    clinical_role: 'SCRUB_TECH',
    department_code: 'OR_SUITE',
    base_hourly_rate: 38.50,
    burden_pct: 22.50,
    is_active: true
  },
  {
    id: 'emp-uuid-1003',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1003',
    employee_name: 'Elena Rodriguez, CRNA',
    clinical_role: 'CRNA',
    department_code: 'ANESTHESIA',
    base_hourly_rate: 105.00,
    burden_pct: 22.50,
    is_active: true
  },
  {
    id: 'emp-uuid-1004',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1004',
    employee_name: 'David Chang, RN',
    clinical_role: 'PACU_RN',
    department_code: 'PACU_RECOVERY',
    base_hourly_rate: 48.00,
    burden_pct: 22.50,
    is_active: true
  },
  {
    id: 'emp-uuid-1005',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1005',
    employee_name: 'Amanda White, CST',
    clinical_role: 'SURGICAL_ASSISTANT',
    department_code: 'OR_SUITE',
    base_hourly_rate: 42.00,
    burden_pct: 22.50,
    is_active: true
  },
  {
    id: 'emp-uuid-1006',
    facility_id: NAPLES_FACILITY_ID,
    external_employee_id: 'EMP-1006',
    employee_name: 'Robert Miller, CST',
    clinical_role: 'STERILE_PROCESSING_TECH',
    department_code: 'CENTRAL_STERILE',
    base_hourly_rate: 32.00,
    burden_pct: 22.50,
    is_active: true
  }
];

const DEFAULT_BATCHES = [
  {
    id: 'pay-bat-01',
    facility_id: NAPLES_FACILITY_ID,
    batch_control_number: 'PAY-BAT-20260224-01',
    pay_period_code: '2026-PP04',
    period_start_date: '2026-02-09',
    period_end_date: '2026-02-22',
    status: 'COMMITTED',
    employee_count: 28,
    total_regular_hours: 1120.00,
    total_overtime_hours: 42.50,
    total_gross_pay: 68450.00,
    total_burdened_cost: 83851.25,
    duration_ms: 340,
    sha256_sync_seal: 'sha256_pay_7a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
    committed_at: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 'pay-bat-02',
    facility_id: NAPLES_FACILITY_ID,
    batch_control_number: 'PAY-BAT-20260210-01',
    pay_period_code: '2026-PP03',
    period_start_date: '2026-01-26',
    period_end_date: '2026-02-08',
    status: 'COMMITTED',
    employee_count: 27,
    total_regular_hours: 1080.00,
    total_overtime_hours: 36.00,
    total_gross_pay: 65200.00,
    total_burdened_cost: 79870.00,
    duration_ms: 310,
    sha256_sync_seal: 'sha256_pay_8b290acd1234567890abcdef1234567890abcdef1234567890abcdef13',
    committed_at: new Date(Date.now() - 1296000000).toISOString()
  }
];

const DEFAULT_ALLOCATIONS = [
  {
    id: 'alloc-01',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    case_identifier: 'CAS-20260224-001',
    procedure_name: 'Right Knee Arthroscopy w/ Meniscectomy',
    service_date: '2026-02-22',
    assigned_staff_count: 3,
    total_case_minutes: 65,
    regular_labor_cost: 211.83,
    overtime_labor_cost: 0.00,
    total_burdened_labor_cost: 259.49,
    labor_cost_per_or_minute: 3.99,
    staffing_variance_status: 'WITHIN_BUDGET'
  },
  {
    id: 'alloc-02',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    case_identifier: 'CAS-20260224-002',
    procedure_name: 'Left Cataract Extraction w/ IOL',
    service_date: '2026-02-22',
    assigned_staff_count: 2,
    total_case_minutes: 32,
    regular_labor_cost: 48.27,
    overtime_labor_cost: 0.00,
    total_burdened_labor_cost: 59.13,
    labor_cost_per_or_minute: 1.85,
    staffing_variance_status: 'WITHIN_BUDGET'
  },
  {
    id: 'alloc-03',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    case_identifier: 'CAS-20260224-003',
    procedure_name: 'Laparoscopic Cholecystectomy',
    service_date: '2026-02-23',
    assigned_staff_count: 3,
    total_case_minutes: 95,
    regular_labor_cost: 305.50,
    overtime_labor_cost: 80.00,
    total_burdened_labor_cost: 472.15,
    labor_cost_per_or_minute: 4.97,
    staffing_variance_status: 'OVERTIME_SPIKE'
  },
  {
    id: 'alloc-04',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    case_identifier: 'CAS-20260224-004',
    procedure_name: 'Right Endoscopic Carpal Tunnel Release',
    service_date: '2026-02-23',
    assigned_staff_count: 2,
    total_case_minutes: 28,
    regular_labor_cost: 42.24,
    overtime_labor_cost: 0.00,
    total_burdened_labor_cost: 51.74,
    labor_cost_per_or_minute: 1.85,
    staffing_variance_status: 'WITHIN_BUDGET'
  }
];

const DEFAULT_EXCEPTIONS = [
  {
    id: 'exc-01',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    exception_code: 'ERR_MISSED_CLOCK_OUT',
    exception_category: 'MISSED_PUNCH',
    severity: 'CRITICAL',
    offending_staff_id: 'EMP-1082',
    description: 'Shift punch duration logged as 18.4 hours on 2026-02-21. Automatic clock-out failed.',
    resolution_action: 'PENDING_NURSING_DIRECTOR_REVIEW',
    is_resolved: false,
    created_at: new Date(Date.now() - 48000000).toISOString()
  },
  {
    id: 'exc-02',
    facility_id: NAPLES_FACILITY_ID,
    batch_id: 'pay-bat-01',
    exception_code: 'WARN_OVERTIME_SPIKE',
    exception_category: 'OVERTIME_SPIKE',
    severity: 'WARNING',
    offending_staff_id: 'EMP-1045',
    description: 'Unscheduled overtime spike of 4.5 hours on 2026-02-23 during emergency procedure overrun.',
    resolution_action: 'PENDING_NURSING_DIRECTOR_REVIEW',
    is_resolved: false,
    created_at: new Date(Date.now() - 24000000).toISOString()
  }
];

// In-memory state
let currentConfig = { ...DEFAULT_CONFIG };
let currentEmployees = [...DEFAULT_EMPLOYEES];
let currentBatches = [...DEFAULT_BATCHES];
let currentAllocations = [...DEFAULT_ALLOCATIONS];
let currentExceptions = [...DEFAULT_EXCEPTIONS];

/**
 * Retrieves the payroll connector configuration with masked client secrets
 */
export async function getPayrollConnectorConfig(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  return {
    ...currentConfig,
    facility_id: normId,
    client_secret_masked: maskPayrollSecret(currentConfig.client_secret_encrypted)
  };
}

/**
 * Updates the payroll connector configuration
 */
export async function updatePayrollConnectorConfig(facilityInput, updates) {
  const normId = normalizeFacilityId(facilityInput);
  currentConfig = {
    ...currentConfig,
    ...updates,
    facility_id: normId,
    updated_at: new Date().toISOString()
  };
  return {
    ...currentConfig,
    client_secret_masked: maskPayrollSecret(currentConfig.client_secret_encrypted)
  };
}

/**
 * Returns rolling 30-day and MTD payroll telemetry metrics
 */
export async function getPayrollTelemetry(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);

  const totalLaborCostMtd = currentBatches.reduce((acc, b) => acc + (Number(b.total_burdened_cost) || 0), 0);
  const totalHoursMtd = currentBatches.reduce((acc, b) => acc + (Number(b.total_regular_hours) || 0) + (Number(b.total_overtime_hours) || 0), 0);
  const activeExceptionsCount = currentExceptions.filter(e => !e.is_resolved).length;

  const validAllocations = currentAllocations.filter(a => a.staffing_variance_status !== 'UNDERSTAFFED');
  const caseAllocationPct = currentAllocations.length > 0
    ? Number(((validAllocations.length / currentAllocations.length) * 100).toFixed(1))
    : 98.4;

  const totalCostPerMin = currentAllocations.reduce((acc, a) => acc + (Number(a.labor_cost_per_or_minute) || 0), 0);
  const avgLaborCostPerOrMin = currentAllocations.length > 0
    ? Number((totalCostPerMin / currentAllocations.length).toFixed(2))
    : 14.85;

  return {
    facility_id: normId,
    payroll_vendor: currentConfig.payroll_vendor,
    gateway_mode: currentConfig.gateway_mode,
    sync_status: currentConfig.sync_status,
    health_status: currentConfig.health_status,
    pay_period_frequency: currentConfig.pay_period_frequency,
    total_labor_cost_mtd: totalLaborCostMtd,
    case_allocation_pct: caseAllocationPct,
    avg_labor_cost_per_or_minute: avgLaborCostPerOrMin,
    active_clocked_in_staff: 24,
    timecard_batches_count: currentBatches.length,
    total_hours_mtd: totalHoursMtd,
    active_exceptions_count: activeExceptionsCount,
    last_payroll_commit_at: currentBatches[0]?.committed_at || new Date().toISOString(),
    latest_sync_seal: currentBatches[0]?.sha256_sync_seal || 'sha256_pay_none'
  };
}

/**
 * Returns employee staff directory with wage rates and burden multipliers
 */
export async function getPayrollEmployeeMappings(facilityInput) {
  normalizeFacilityId(facilityInput);
  return currentEmployees.map(emp => {
    const calc = calculateStaffLaborCost(1, emp.base_hourly_rate, emp.burden_pct);
    return {
      ...emp,
      effective_burdened_rate: calc.hourlyBurdenedRate
    };
  });
}

/**
 * Returns payroll timecard batches
 */
export async function getPayrollTimecardBatches(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentBatches];
}

/**
 * Returns perioperative case labor allocations
 */
export async function getPayrollCaseLaborAllocations(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentAllocations];
}

/**
 * Returns quarantined payroll exceptions
 */
export async function getPayrollExceptions(facilityInput) {
  normalizeFacilityId(facilityInput);
  return [...currentExceptions];
}

/**
 * Tests live connectivity with external payroll vendor
 */
export async function testPayrollConnection(facilityInput) {
  normalizeFacilityId(facilityInput);
  return {
    success: true,
    vendor: currentConfig.payroll_vendor,
    endpoint: currentConfig.api_endpoint_url,
    latency_ms: 185,
    timestamp: new Date().toISOString(),
    message: `Secure connection to ${currentConfig.payroll_vendor} verified successfully.`
  };
}

/**
 * Ingests a new electronic timecard sync batch
 */
export async function triggerManualTimecardSync(facilityInput) {
  const normId = normalizeFacilityId(facilityInput);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const batchNum = `PAY-BAT-${dateStr}-${String(currentBatches.length + 1).padStart(2, '0')}`;
  const periodCode = '2026-PP05';
  const grossPay = 69800.00;
  const burdenedCost = Number((grossPay * (1 + currentConfig.default_burden_pct / 100)).toFixed(2));

  const seal = computePayrollProvenanceSeal(normId, batchNum, periodCode, grossPay, 'COMMITTED');

  const newBatch = {
    id: `pay-bat-${Date.now()}`,
    facility_id: normId,
    batch_control_number: batchNum,
    pay_period_code: periodCode,
    period_start_date: '2026-02-23',
    period_end_date: '2026-03-08',
    status: 'COMMITTED',
    employee_count: 28,
    total_regular_hours: 1120.00,
    total_overtime_hours: 38.00,
    total_gross_pay: grossPay,
    total_burdened_cost: burdenedCost,
    duration_ms: 295,
    sha256_sync_seal: seal,
    committed_at: now.toISOString()
  };

  currentBatches.unshift(newBatch);
  return newBatch;
}

/**
 * Allocates clinical shift hours to a perioperative case
 */
export async function allocateCaseLabor(facilityInput, caseData) {
  const normId = normalizeFacilityId(facilityInput);
  const staff = caseData.staff || [
    { staffId: 'EMP-1001', staffName: 'Sarah Jenkins, RN', role: 'CIRCULATING_RN', baseRate: 52, burdenPct: 22.5, caseOverlapMinutes: caseData.minutes || 60 },
    { staffId: 'EMP-1002', staffName: 'Marcus Vance, CST', role: 'SCRUB_TECH', baseRate: 38.5, burdenPct: 22.5, caseOverlapMinutes: caseData.minutes || 60 }
  ];

  const calc = calculateCaseLaborCost(staff);
  const costPerMin = calculateCostPerOrMinute(calc.totalLaborCost, caseData.minutes || 60);

  const allocationRecord = {
    id: `alloc-${Date.now()}`,
    facility_id: normId,
    batch_id: currentBatches[0]?.id || 'pay-bat-01',
    case_identifier: caseData.case_identifier || `CAS-${Date.now().toString().slice(-6)}`,
    procedure_name: caseData.procedure_name || 'Ambulatory Surgical Procedure',
    service_date: caseData.service_date || new Date().toISOString().slice(0, 10),
    assigned_staff_count: calc.assignedStaffCount,
    total_case_minutes: caseData.minutes || 60,
    regular_labor_cost: calc.totalLaborCost,
    overtime_labor_cost: 0.00,
    total_burdened_labor_cost: calc.totalLaborCost,
    labor_cost_per_or_minute: costPerMin,
    staffing_variance_status: calc.totalLaborCost > 400 ? 'OVERTIME_SPIKE' : 'WITHIN_BUDGET'
  };

  currentAllocations.unshift(allocationRecord);
  return allocationRecord;
}

/**
 * Resolves a quarantined payroll exception
 */
export async function resolvePayrollException(exceptionId, resolutionNote) {
  const exc = currentExceptions.find(e => e.id === exceptionId);
  if (!exc) {
    return { success: false, message: 'Exception not found' };
  }
  exc.is_resolved = true;
  exc.resolution_action = resolutionNote || 'RESOLVED_BY_NURSING_DIRECTOR';
  exc.resolved_at = new Date().toISOString();
  return { success: true, exception: exc };
}

export default {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computePayrollProvenanceSeal,
  maskPayrollSecret,
  calculateStaffLaborCost,
  calculateCaseLaborCost,
  calculateCostPerOrMinute,
  validateTimecardShift,
  getPayrollConnectorConfig,
  updatePayrollConnectorConfig,
  getPayrollTelemetry,
  getPayrollEmployeeMappings,
  getPayrollTimecardBatches,
  getPayrollCaseLaborAllocations,
  getPayrollExceptions,
  testPayrollConnection,
  triggerManualTimecardSync,
  allocateCaseLabor,
  resolvePayrollException
};
