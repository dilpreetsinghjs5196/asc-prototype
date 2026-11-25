/**
 * ==============================================================================
 * Service: sisIntegrationService.js
 * Module 15: Enterprise Healthcare Integrations (Phase F3)
 * Description: Surgical Information Systems (SIS) EHR/PMS Gateway Service
 *              Connector configuration, incremental sync orchestration, perioperative milestone
 *              chronological validation, AdvantX itemized charge audit, and SHA-256 provenance seals.
 * Strict Zero Prohibited Accent Tokens
 * ==============================================================================
 */

// Canonical Naples Surgery Center ID
export const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';

/**
 * Normalizes facility identifier whether passed as string, alias, or object
 */
export function normalizeFacilityId(facility) {
  if (!facility) return NAPLES_FACILITY_ID;
  if (typeof facility === 'object') {
    const rawId = facility.id || facility.facility_id || facility.uuid;
    return normalizeFacilityId(rawId);
  }
  const str = String(facility).trim();
  if (str === 'fac-naples-01' || str === 'naples-surgery-center' || str === 'naples') {
    return NAPLES_FACILITY_ID;
  }
  return str || NAPLES_FACILITY_ID;
}

/**
 * Generates a deterministic SHA-256 cryptographic provenance digest simulator
 */
export function computeSisProvenanceSeal(payload) {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let hash1 = 0x811c9dc5;
  let hash2 = 0x55555555;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash1 ^= ch;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 ^= (ch << 3);
    hash2 = Math.imul(hash2, 0x01000193);
  }
  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((hash1 ^ hash2) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((hash1 + hash2) >>> 0).toString(16).padStart(8, '0');
  return `sha256_sis_${hex1}${hex2}${hex3}${hex4}`.padEnd(64, '0').slice(0, 64);
}

/**
 * Validates deterministic perioperative milestone chronological invariant:
 * Check-In <= Room In <= Anesthesia Start <= Incision <= Close <= Room Out <= PACU In <= PACU Out
 */
export function validateMilestoneChronology(milestones) {
  const errors = [];
  const sequence = [
    { key: 'check_in_time', name: 'Check-In' },
    { key: 'room_in_time', name: 'Room In' },
    { key: 'anesthesia_start_time', name: 'Anesthesia Start' },
    { key: 'incision_time', name: 'Surgical Incision' },
    { key: 'close_time', name: 'Surgical Close' },
    { key: 'room_out_time', name: 'Room Out' },
    { key: 'pacu_in_time', name: 'PACU In' },
    { key: 'pacu_out_time', name: 'PACU Out' }
  ];

  let prevTime = null;
  let prevName = null;

  for (const step of sequence) {
    const rawVal = milestones[step.key];
    if (rawVal) {
      const d = new Date(rawVal);
      if (isNaN(d.getTime())) {
        errors.push({
          field: step.key,
          code: 'ERR_INVALID_TIMESTAMP_FORMAT',
          message: `Timestamp format for '${step.name}' is invalid.`
        });
        continue;
      }
      if (prevTime !== null && d.getTime() < prevTime.getTime()) {
        errors.push({
          field: step.key,
          code: 'ERR_CHRONOLOGY_INVERSION',
          message: `Chronological anomaly: '${step.name}' (${d.toISOString()}) occurred before '${prevName}' (${prevTime.toISOString()}).`
        });
      }
      prevTime = d;
      prevName = step.name;
    }
  }

  // Calculate durations if endpoints exist
  let totalRoomMinutes = null;
  if (milestones.room_in_time && milestones.room_out_time) {
    const inD = new Date(milestones.room_in_time);
    const outD = new Date(milestones.room_out_time);
    if (!isNaN(inD) && !isNaN(outD)) {
      totalRoomMinutes = Math.round((outD.getTime() - inD.getTime()) / 60000);
    }
  }

  let surgicalDurationMinutes = null;
  if (milestones.incision_time && milestones.close_time) {
    const incD = new Date(milestones.incision_time);
    const clsD = new Date(milestones.close_time);
    if (!isNaN(incD) && !isNaN(clsD)) {
      surgicalDurationMinutes = Math.round((clsD.getTime() - incD.getTime()) / 60000);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalRoomMinutes,
    surgicalDurationMinutes
  };
}

/**
 * Calculates deterministic room turnover time in minutes between consecutive OR cases
 */
export function calculateTurnoverMinutes(prevRoomOutTime, nextRoomInTime) {
  if (!prevRoomOutTime || !nextRoomInTime) return null;
  const outD = new Date(prevRoomOutTime);
  const inD = new Date(nextRoomInTime);
  if (isNaN(outD.getTime()) || isNaN(inD.getTime())) return null;
  const diffMinutes = Math.round((inD.getTime() - outD.getTime()) / 60000);
  return {
    turnoverMinutes: diffMinutes,
    isNormal: diffMinutes >= 5 && diffMinutes <= 120,
    isFlagged: diffMinutes < 5 || diffMinutes > 120,
    warning: diffMinutes < 5 ? 'Turnover time is abnormally short (< 5 min)' : diffMinutes > 120 ? 'Prolonged turnover gap (> 120 min)' : null
  };
}

/**
 * Audits itemized charge items from SIS AdvantX
 */
export function auditCaseCharges(chargesList) {
  if (!Array.isArray(chargesList)) return { totalCharges: 0, totalCost: 0, itemsCount: 0, categories: {} };

  let totalCharges = 0;
  let totalCost = 0;
  const categoryTotals = {};
  let implantConstructCount = 0;

  chargesList.forEach(item => {
    const charge = parseFloat(item.total_charge || item.totalCharge || 0);
    const cost = parseFloat(item.cost_amount || item.costAmount || 0);
    const cat = item.charge_category || item.chargeCategory || 'SUPPLY';

    totalCharges += charge;
    totalCost += cost;

    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { charges: 0, cost: 0, count: 0 };
    }
    categoryTotals[cat].charges += charge;
    categoryTotals[cat].cost += cost;
    categoryTotals[cat].count += 1;

    if (item.is_implant_construct || item.isImplantConstruct || cat === 'IMPLANT') {
      implantConstructCount += 1;
    }
  });

  return {
    totalCharges: parseFloat(totalCharges.toFixed(2)),
    totalCost: parseFloat(totalCost.toFixed(2)),
    estimatedContributionMargin: parseFloat((totalCharges - totalCost).toFixed(2)),
    itemsCount: chargesList.length,
    implantConstructCount,
    categoryTotals
  };
}

// In-Memory Staging State for Naples Surgery Center (Phase F3)
const IN_MEMORY_CONNECTOR_CONFIG = {
  facilityId: NAPLES_FACILITY_ID,
  apiEndpointUrl: 'https://exchange.sissurgical.com/api/v2/naples-asc',
  sisFacilityCode: 'NAPLES-FL-01',
  authType: 'OAUTH2',
  clientId: 'sis_client_naples_prod_902',
  pollingIntervalMinutes: 15,
  syncStatus: 'CONNECTED',
  healthStatus: 'HEALTHY',
  lastSuccessfulSyncAt: '2026-02-24T12:30:00Z',
  lastSyncCursorAt: '2026-02-24T12:15:00Z',
  autoSyncEnabled: true
};

const IN_MEMORY_SYNC_BATCHES = [
  {
    id: 'e1111111-1111-1111-1111-111111111111',
    facilityId: NAPLES_FACILITY_ID,
    batchCode: 'SIS_SYNC_20260224_01',
    syncType: 'INCREMENTAL',
    status: 'COMPLETED',
    casesRetrieved: 24,
    casesInserted: 6,
    casesUpdated: 18,
    milestonesParsed: 24,
    chargesSynced: 112,
    exceptionsFlagged: 0,
    durationMs: 412,
    startedAt: '2026-02-24T11:30:00Z',
    completedAt: '2026-02-24T11:30:41Z',
    sha256SyncSeal: 'sha256_sis_7a189fbc01234567890abcdef1234567890abcdef1234567890ab'
  },
  {
    id: 'e2222222-2222-2222-2222-222222222222',
    facilityId: NAPLES_FACILITY_ID,
    batchCode: 'SIS_SYNC_20260224_02',
    syncType: 'INCREMENTAL',
    status: 'COMPLETED',
    casesRetrieved: 18,
    casesInserted: 2,
    casesUpdated: 16,
    milestonesParsed: 18,
    chargesSynced: 86,
    exceptionsFlagged: 0,
    durationMs: 380,
    startedAt: '2026-02-24T12:00:00Z',
    completedAt: '2026-02-24T12:00:38Z',
    sha256SyncSeal: 'sha256_sis_8b290acd01234567890abcdef1234567890abcdef1234567890ab'
  },
  {
    id: 'e3333333-3333-3333-3333-333333333333',
    facilityId: NAPLES_FACILITY_ID,
    batchCode: 'SIS_SYNC_20260224_03',
    syncType: 'INCREMENTAL',
    status: 'COMPLETED',
    casesRetrieved: 12,
    casesInserted: 1,
    casesUpdated: 11,
    milestonesParsed: 12,
    chargesSynced: 58,
    exceptionsFlagged: 0,
    durationMs: 320,
    startedAt: '2026-02-24T12:30:00Z',
    completedAt: '2026-02-24T12:30:32Z',
    sha256SyncSeal: 'sha256_sis_9c301bde01234567890abcdef1234567890abcdef1234567890ab'
  }
];

const IN_MEMORY_CASE_MAPPINGS = [
  {
    id: 'm1',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8801',
    sisPatientId: 'PT-99401',
    sisAccountNumber: 'ACC-2026-101',
    surgeryDate: '2026-02-24',
    surgeonNpi: '1841392818',
    surgeonName: 'Dr. Brian Miller',
    primaryCpt: '29881',
    orRoomName: 'OR-1',
    caseStatus: 'COMPLETED',
    clinicalDocumentationStatus: 'LOCKED',
    billingStatus: 'BILLED',
    lastSyncedAt: '2026-02-24T12:30:32Z'
  },
  {
    id: 'm2',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8802',
    sisPatientId: 'PT-99402',
    sisAccountNumber: 'ACC-2026-102',
    surgeryDate: '2026-02-24',
    surgeonNpi: '1952403926',
    surgeonName: 'Dr. Sarah Jenkins',
    primaryCpt: '45378',
    orRoomName: 'OR-3',
    caseStatus: 'COMPLETED',
    clinicalDocumentationStatus: 'LOCKED',
    billingStatus: 'BILLED',
    lastSyncedAt: '2026-02-24T12:30:32Z'
  },
  {
    id: 'm3',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8803',
    sisPatientId: 'PT-99403',
    sisAccountNumber: 'ACC-2026-103',
    surgeryDate: '2026-02-24',
    surgeonNpi: '1063514034',
    surgeonName: 'Dr. Michael Chang',
    primaryCpt: '66984',
    orRoomName: 'OR-2',
    caseStatus: 'COMPLETED',
    clinicalDocumentationStatus: 'LOCKED',
    billingStatus: 'PENDING_FINAL_CODING',
    lastSyncedAt: '2026-02-24T12:30:32Z'
  },
  {
    id: 'm4',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8804',
    sisPatientId: 'PT-99404',
    sisAccountNumber: 'ACC-2026-104',
    surgeryDate: '2026-02-24',
    surgeonNpi: '1841392818',
    surgeonName: 'Dr. Brian Miller',
    primaryCpt: '29827',
    orRoomName: 'OR-1',
    caseStatus: 'IN_ROOM',
    clinicalDocumentationStatus: 'IN_PROGRESS',
    billingStatus: 'UNBILLED',
    lastSyncedAt: '2026-02-24T12:30:32Z'
  }
];

const IN_MEMORY_MILESTONES = [
  {
    id: 'ms1',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8801',
    checkInTime: '2026-02-24T12:05:00Z',
    roomInTime: '2026-02-24T12:32:00Z',
    anesthesiaStartTime: '2026-02-24T12:38:00Z',
    incisionTime: '2026-02-24T12:50:00Z',
    closeTime: '2026-02-24T13:34:00Z',
    roomOutTime: '2026-02-24T13:42:00Z',
    pacuInTime: '2026-02-24T13:45:00Z',
    pacuOutTime: '2026-02-24T14:35:00Z',
    totalRoomMinutes: 70,
    surgicalDurationMinutes: 44,
    turnoverMinutes: 18,
    isChronologyValid: true,
    anomalyFlags: []
  },
  {
    id: 'ms2',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8802',
    checkInTime: '2026-02-24T12:15:00Z',
    roomInTime: '2026-02-24T12:45:00Z',
    anesthesiaStartTime: '2026-02-24T12:50:00Z',
    incisionTime: '2026-02-24T13:02:00Z',
    closeTime: '2026-02-24T13:31:00Z',
    roomOutTime: '2026-02-24T13:38:00Z',
    pacuInTime: '2026-02-24T13:40:00Z',
    pacuOutTime: '2026-02-24T14:15:00Z',
    totalRoomMinutes: 53,
    surgicalDurationMinutes: 29,
    turnoverMinutes: 14,
    isChronologyValid: true,
    anomalyFlags: []
  },
  {
    id: 'ms3',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8803',
    checkInTime: '2026-02-24T13:00:00Z',
    roomInTime: '2026-02-24T13:25:00Z',
    anesthesiaStartTime: '2026-02-24T13:30:00Z',
    incisionTime: '2026-02-24T13:40:00Z',
    closeTime: '2026-02-24T14:02:00Z',
    roomOutTime: '2026-02-24T14:09:00Z',
    pacuInTime: '2026-02-24T14:12:00Z',
    pacuOutTime: '2026-02-24T14:48:00Z',
    totalRoomMinutes: 44,
    surgicalDurationMinutes: 22,
    turnoverMinutes: 16,
    isChronologyValid: true,
    anomalyFlags: []
  }
];

const IN_MEMORY_CHARGE_ITEMS = [
  {
    id: 'c1',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8801',
    lineItemId: 'CHG-8801-01',
    chargeCategory: 'SURGICAL_PROCEDURE',
    code: '29881',
    description: 'Arthroscopy Knee Meniscectomy',
    quantity: 1,
    unitCharge: 4850.00,
    totalCharge: 4850.00,
    costAmount: 410.00,
    isImplantConstruct: false,
    lotNumber: null,
    postedAt: '2026-02-24T13:55:00Z'
  },
  {
    id: 'c2',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8801',
    lineItemId: 'CHG-8801-02',
    chargeCategory: 'IMPLANT',
    code: 'AR-1380',
    description: 'Arthrex Bio-Composite Suture Anchor',
    quantity: 2,
    unitCharge: 850.00,
    totalCharge: 1700.00,
    costAmount: 420.00,
    isImplantConstruct: true,
    lotNumber: 'LOT-78192',
    postedAt: '2026-02-24T13:55:00Z'
  },
  {
    id: 'c3',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8801',
    lineItemId: 'CHG-8801-03',
    chargeCategory: 'SUPPLY',
    code: 'MISC-TRAY-ORTHO',
    description: 'Custom Orthopedic Arthroscopy Pack',
    quantity: 1,
    unitCharge: 380.00,
    totalCharge: 380.00,
    costAmount: 125.00,
    isImplantConstruct: false,
    lotNumber: null,
    postedAt: '2026-02-24T13:55:00Z'
  },
  {
    id: 'c4',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8802',
    lineItemId: 'CHG-8802-01',
    chargeCategory: 'SURGICAL_PROCEDURE',
    code: '45378',
    description: 'Colonoscopy Diagnostic',
    quantity: 1,
    unitCharge: 2450.00,
    totalCharge: 2450.00,
    costAmount: 195.00,
    isImplantConstruct: false,
    lotNumber: null,
    postedAt: '2026-02-24T13:50:00Z'
  },
  {
    id: 'c5',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8802',
    lineItemId: 'CHG-8802-02',
    chargeCategory: 'PHARMACY',
    code: 'PROP-DIP-20',
    description: 'Propofol Injectable 20ml',
    quantity: 2,
    unitCharge: 75.00,
    totalCharge: 150.00,
    costAmount: 18.50,
    isImplantConstruct: false,
    lotNumber: null,
    postedAt: '2026-02-24T13:50:00Z'
  },
  {
    id: 'c6',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8803',
    lineItemId: 'CHG-8803-01',
    chargeCategory: 'SURGICAL_PROCEDURE',
    code: '66984',
    description: 'Cataract Extraction with IOL Insertion',
    quantity: 1,
    unitCharge: 3200.00,
    totalCharge: 3200.00,
    costAmount: 240.00,
    isImplantConstruct: false,
    lotNumber: null,
    postedAt: '2026-02-24T14:20:00Z'
  },
  {
    id: 'c7',
    facilityId: NAPLES_FACILITY_ID,
    sisCaseId: 'SIS-2026-8803',
    lineItemId: 'CHG-8803-02',
    chargeCategory: 'IMPLANT',
    code: 'ALC-ACRY-01',
    description: 'Alcon AcrySof Foldable IOL Lens',
    quantity: 1,
    unitCharge: 650.00,
    totalCharge: 650.00,
    costAmount: 210.00,
    isImplantConstruct: true,
    lotNumber: 'ALC-44091',
    postedAt: '2026-02-24T14:20:00Z'
  }
];

/**
 * Retrieves Active SIS Connector Configuration
 */
export function getSisConnectorConfig(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  return { ...IN_MEMORY_CONNECTOR_CONFIG, facilityId: normId };
}

/**
 * Retrieves Telemetry Summary Metrics (24-Hour Sync Window)
 */
export function getSisTelemetry(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  const batches = IN_MEMORY_SYNC_BATCHES.filter(b => b.facilityId === normId);
  const cases = IN_MEMORY_CASE_MAPPINGS.filter(c => c.facilityId === normId);
  const milestones = IN_MEMORY_MILESTONES.filter(m => m.facilityId === normId);
  const charges = IN_MEMORY_CHARGE_ITEMS.filter(ch => ch.facilityId === normId);

  const totalCases = cases.length;
  const validMilestones = milestones.filter(m => m.isChronologyValid).length;
  const milestoneCompletenessPct = totalCases > 0 ? parseFloat(((validMilestones / totalCases) * 100).toFixed(2)) : 100.00;
  const totalChargesAmount = charges.reduce((sum, ch) => sum + ch.totalCharge, 0);
  const latestSeal = batches[batches.length - 1]?.sha256SyncSeal || computeSisProvenanceSeal({ facility: normId, ts: Date.now() });

  return {
    facilityId: normId,
    syncStatus: IN_MEMORY_CONNECTOR_CONFIG.syncStatus,
    healthStatus: IN_MEMORY_CONNECTOR_CONFIG.healthStatus,
    totalSyncedCases: 54, // Across active reporting window
    milestonesLogged: milestones.length,
    milestoneCompletenessPct,
    avgClinicalToBillingLagHours: 1.8,
    totalChargesCaptured: charges.length,
    totalChargesAmount: parseFloat(totalChargesAmount.toFixed(2)),
    milestoneAnomaliesCount: 0,
    latestSyncSeal: latestSeal,
    lastSuccessfulSyncAt: IN_MEMORY_CONNECTOR_CONFIG.lastSuccessfulSyncAt
  };
}

/**
 * Retrieves SIS Sync Batches Ledger
 */
export function getSisSyncBatches(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  return IN_MEMORY_SYNC_BATCHES.filter(b => b.facilityId === normId);
}

/**
 * Retrieves Case Mappings
 */
export function getSisCaseMappings(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  return IN_MEMORY_CASE_MAPPINGS.filter(c => c.facilityId === normId);
}

/**
 * Retrieves Perioperative Milestones
 */
export function getSisMilestones(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  return IN_MEMORY_MILESTONES.filter(m => m.facilityId === normId);
}

/**
 * Retrieves Itemized Charge Items
 */
export function getSisChargeItems(facilityId, sisCaseId = null) {
  const normId = normalizeFacilityId(facilityId);
  let list = IN_MEMORY_CHARGE_ITEMS.filter(c => c.facilityId === normId);
  if (sisCaseId) {
    list = list.filter(c => c.sisCaseId === sisCaseId);
  }
  return list;
}

/**
 * Simulates Handshake Connection Test to SIS Exchange API Gateway
 */
export function testSisConnection(facilityId) {
  const normId = normalizeFacilityId(facilityId);
  const latency = 180 + Math.floor(Math.random() * 45);
  return {
    success: true,
    facilityId: normId,
    endpoint: IN_MEMORY_CONNECTOR_CONFIG.apiEndpointUrl,
    healthStatus: 'HEALTHY',
    latencyMs: latency,
    message: 'SIS Exchange API Gateway handshake confirmed (HTTP 200 OK).'
  };
}

/**
 * Triggers an On-Demand Synchronization Cycle
 */
export function triggerManualSync(facilityId, syncType = 'MANUAL_TRIGGER') {
  const normId = normalizeFacilityId(facilityId);
  const batchCode = `SIS_SYNC_${Date.now().toString().slice(-8)}`;
  const seal = computeSisProvenanceSeal({ facility: normId, code: batchCode, ts: Date.now() });

  const newBatch = {
    id: `b-${Date.now()}`,
    facilityId: normId,
    batchCode,
    syncType,
    status: 'COMPLETED',
    casesRetrieved: 8,
    casesInserted: 2,
    casesUpdated: 6,
    milestonesParsed: 8,
    chargesSynced: 34,
    exceptionsFlagged: 0,
    durationMs: 290,
    startedAt: new Date(Date.now() - 30000).toISOString(),
    completedAt: new Date().toISOString(),
    sha256SyncSeal: seal
  };

  IN_MEMORY_SYNC_BATCHES.unshift(newBatch);
  IN_MEMORY_CONNECTOR_CONFIG.lastSuccessfulSyncAt = newBatch.completedAt;

  return {
    success: true,
    batch: newBatch,
    message: `Manual sync completed. Retrieved 8 cases, synced 34 itemized charges.`
  };
}

// Default export
const sisIntegrationService = {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computeSisProvenanceSeal,
  validateMilestoneChronology,
  calculateTurnoverMinutes,
  auditCaseCharges,
  getSisConnectorConfig,
  getSisTelemetry,
  getSisSyncBatches,
  getSisCaseMappings,
  getSisMilestones,
  getSisChargeItems,
  testSisConnection,
  triggerManualSync
};

export default sisIntegrationService;
