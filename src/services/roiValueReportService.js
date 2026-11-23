/**
 * ==============================================================================
 * Phase E7: ASC Analyst ROI & Validated Value Reporting Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Authoritative Software ROI Calculation, 4-Pillar Validated Economic
 *              Value (Recovered Revenue, Direct Savings, Capacity Value, Avoided Costs),
 *              Staff Labor Offsets, Net ROI Multipliers, Payback Period Velocity,
 *              Cost of Inaction (COI) Pipeline, and Cryptographic SHA-256 Seals.
 * Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser environment fallback
  }
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(recordFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  const targetId = typeof requestedFacilityId === 'object' && requestedFacilityId !== null
    ? (requestedFacilityId.id || requestedFacilityId.facilityId || requestedFacilityId.facilityUuid || '')
    : String(requestedFacilityId);

  if (!targetId || targetId === 'ALL') return true;
  if (String(recordFacilityId).toLowerCase() === String(targetId).toLowerCase()) return true;
  if (
    NAPLES_FACILITY_ALIASES.includes(String(recordFacilityId).toLowerCase()) &&
    NAPLES_FACILITY_ALIASES.includes(String(targetId).toLowerCase())
  ) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic audit hash for ROI reports
 */
export function computeRoiReportHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `roi_seal_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const ROI_REPORT_STATUSES = {
  DRAFT: 'DRAFT',
  UNDER_AUDIT: 'UNDER_AUDIT',
  PUBLISHED_AUDITED: 'PUBLISHED_AUDITED',
  SUPERSEDED: 'SUPERSEDED',
  ARCHIVED: 'ARCHIVED'
};

export const VALUE_PILLARS = {
  RECOVERED_REVENUE: 'RECOVERED_REVENUE',
  DIRECT_SAVINGS: 'DIRECT_SAVINGS',
  CAPACITY_VALUE: 'CAPACITY_VALUE',
  AVOIDED_COST: 'AVOIDED_COST'
};

export const DEFAULT_HOURLY_LABOR_RATE = 65.00;

/**
 * Authoritative Deterministic ROI Calculations
 */
export function calculateRoiMetrics(inputs = {}) {
  const recoveredRevenue = Number(inputs.recoveredRevenue) || 0;
  const directSavings = Number(inputs.directSavings) || 0;
  const capacityValue = Number(inputs.capacityValue) || 0;
  const avoidedCosts = Number(inputs.avoidedCosts) || 0;

  const grossValidatedValue = Number((recoveredRevenue + directSavings + capacityValue + avoidedCosts).toFixed(2));

  const staffHours = Number(inputs.staffInterventionHours) || 0;
  const hourlyRate = Number(inputs.hourlyLaborRate) || DEFAULT_HOURLY_LABOR_RATE;
  const staffLaborCost = Number((staffHours * hourlyRate).toFixed(2));

  const netValidatedValue = Number((grossValidatedValue - staffLaborCost).toFixed(2));

  const platformInvestment = Number(inputs.totalPlatformInvestment) || 42000.00;

  // Net ROI % = ((Net Value - Investment) / Investment) * 100
  let netRoiPercent = 0;
  if (platformInvestment > 0) {
    netRoiPercent = Number((((netValidatedValue - platformInvestment) / platformInvestment) * 100).toFixed(2));
  }

  // ROI Multiplier = Net Value / Investment
  let roiMultiplier = 0;
  if (platformInvestment > 0) {
    roiMultiplier = Number((netValidatedValue / platformInvestment).toFixed(2));
  }

  // Payback Period (Months) = Investment / (Net Value / Active Months)
  const activeMonths = Number(inputs.activeMonths) || 10;
  let paybackPeriodMonths = 0;
  if (netValidatedValue > 0 && activeMonths > 0) {
    const monthlyNetRate = netValidatedValue / activeMonths;
    paybackPeriodMonths = Number((platformInvestment / monthlyNetRate).toFixed(2));
  }

  const costOfInaction = Number(inputs.costOfInaction) || 164500.00;

  return {
    recoveredRevenue,
    directSavings,
    capacityValue,
    avoidedCosts,
    grossValidatedValue,
    staffInterventionHours: staffHours,
    hourlyLaborRate: hourlyRate,
    staffLaborCost,
    netValidatedValue,
    totalPlatformInvestment: platformInvestment,
    netRoiPercent,
    roiMultiplier,
    paybackPeriodMonths,
    costOfInaction
  };
}

export const INITIAL_FACILITY_ROI_REPORTS = [
  {
    id: '00000000-0000-0000-0000-000000000080',
    facilityId: 'fac-naples-01',
    facilityUuid: '00000000-0000-0000-0000-000000000002',
    reportCode: 'VAL_ROI_2026_YTD',
    reportTitle: 'ASC Analyst 2026 YTD Software ROI & Validated Value Audit',
    periodType: 'YTD',
    periodCode: '2026-YTD-M10',
    activeMonths: 10,
    evaluationDate: '2026-11-20',
    status: ROI_REPORT_STATUSES.PUBLISHED_AUDITED,
    versionNumber: 1,
    annualSoftwareFee: 36000.00,
    implementationFee: 12000.00,
    totalPlatformInvestment: 42000.00,
    recoveredRevenue: 148500.00,
    directSavings: 96400.00,
    capacityValue: 132325.00,
    avoidedCosts: 45000.00,
    grossValidatedValue: 422225.00,
    staffInterventionHours: 280.00,
    hourlyLaborRate: 65.00,
    staffLaborCost: 18200.00,
    netValidatedValue: 404025.00,
    netRoiPercent: 861.96,
    roiMultiplier: 9.62,
    paybackPeriodMonths: 1.04,
    costOfInaction: 164500.00,
    executiveNarrative: 'Through the 10-month evaluation period ending October 31, 2026, the ASC Analyst platform delivered $422,225.00 in gross validated economic value across Naples Surgery Center. Deducting $18,200.00 in documented staff intervention labor (280 hours @ $65/hr), the platform yielded $404,025.00 in net realized value. Against a total software investment of $42,000.00 ($30,000 YTD license + $12,000 onboarding amortization), ASC Analyst generated an 861.96% net ROI (9.62x cash multiplier) with a capital payback period of 1.04 months (31 days).',
    isActive: true,
    isPublished: true,
    publishedAt: '2026-11-20T17:30:00Z',
    publishedBy: '00000000-0000-0000-0000-000000000001',
    frozenHash: 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
    metadata: {
      author: 'Chief Financial Officer',
      distribution: 'Board of Managers',
      confidentiality: 'Strictly Confidential',
      activeUsers: 8,
      workflowsAudited: 412
    }
  }
];

export const INITIAL_ROI_LINE_ITEMS = [
  {
    id: '00000000-0000-0000-0000-000000000081',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.RECOVERED_REVENUE,
    categoryName: 'Payer Underpayment',
    itemDescription: 'Commercial fee schedule underpayments overturned across BlueCross and Aetna joint cases',
    sourceReferenceId: 'ACT_2026_0881',
    grossAmount: 82300.00,
    laborOffset: 3900.00,
    netAmount: 78400.00,
    validationSource: '835 ERA Electronic Remittance',
    verifiedAt: '2026-10-18T14:30:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000082',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.RECOVERED_REVENUE,
    categoryName: 'Missing Secondary',
    itemDescription: 'Unbilled secondary coordination-of-benefits claims automatically detected and recouped',
    sourceReferenceId: 'ACT_2026_0914',
    grossAmount: 34200.00,
    laborOffset: 1950.00,
    netAmount: 32250.00,
    validationSource: 'Clearinghouse 837 Adjudication',
    verifiedAt: '2026-10-24T11:15:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000083',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.RECOVERED_REVENUE,
    categoryName: 'Implant Carve-Out',
    itemDescription: 'Unattached surgical invoice carve-outs recouped for spine construct implants',
    sourceReferenceId: 'ACT_2026_0952',
    grossAmount: 32000.00,
    laborOffset: 1300.00,
    netAmount: 30700.00,
    validationSource: 'UB-04 Claim Audit Trail',
    verifiedAt: '2026-10-29T16:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000084',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.DIRECT_SAVINGS,
    categoryName: 'Implant Tiering',
    itemDescription: 'Vendor construct renegotiation shifting orthopedic surgeons to standardized Tier 1 pricing',
    sourceReferenceId: 'ACT_2026_1012',
    grossAmount: 64800.00,
    laborOffset: 2600.00,
    netAmount: 62200.00,
    validationSource: 'Vendor Master Purchase Agreement',
    verifiedAt: '2026-10-12T09:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000085',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.DIRECT_SAVINGS,
    categoryName: 'Pack Standardization',
    itemDescription: 'Consolidation of general surgery & arthroscopy sterile pack configurations eliminating waste',
    sourceReferenceId: 'ACT_2026_1045',
    grossAmount: 31600.00,
    laborOffset: 1950.00,
    netAmount: 29650.00,
    validationSource: 'Materials Management Ledger',
    verifiedAt: '2026-10-15T15:45:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000086',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.CAPACITY_VALUE,
    categoryName: 'Block Release Recovery',
    itemDescription: '67.0 unused block hours released >=7 days early and backfilled at $1,975/hr CM',
    sourceReferenceId: 'ACT_2026_1102',
    grossAmount: 132325.00,
    laborOffset: 4550.00,
    netAmount: 127775.00,
    validationSource: 'OR Block Utilization Model',
    verifiedAt: '2026-10-31T18:00:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000087',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.AVOIDED_COST,
    categoryName: 'Timely Filing Safeguard',
    itemDescription: 'Pre-clearinghouse SNIP 1-4 validation preventing fatal timely filing appeal expirations',
    sourceReferenceId: 'ACT_2026_1180',
    grossAmount: 28000.00,
    laborOffset: 1300.00,
    netAmount: 26700.00,
    validationSource: 'WEDI SNIP Rules Engine',
    verifiedAt: '2026-10-21T13:20:00Z'
  },
  {
    id: '00000000-0000-0000-0000-000000000088',
    reportId: '00000000-0000-0000-0000-000000000080',
    reportCode: 'VAL_ROI_2026_YTD',
    facilityId: 'fac-naples-01',
    pillarCode: VALUE_PILLARS.AVOIDED_COST,
    categoryName: 'Overtime Mitigation',
    itemDescription: 'Predictive duration smoothing reducing Friday clinical nursing overtime hours',
    sourceReferenceId: 'ACT_2026_1220',
    grossAmount: 17000.00,
    laborOffset: 650.00,
    netAmount: 16350.00,
    validationSource: 'Payroll Time & Attendance',
    verifiedAt: '2026-10-28T17:10:00Z'
  }
];

let liveRoiReports = JSON.parse(JSON.stringify(INITIAL_FACILITY_ROI_REPORTS));
let liveRoiLineItems = JSON.parse(JSON.stringify(INITIAL_ROI_LINE_ITEMS));

/**
 * Resets memory state back to initial seed data for test reproducibility
 */
export function resetLiveRoiReportState() {
  liveRoiReports = JSON.parse(JSON.stringify(INITIAL_FACILITY_ROI_REPORTS));
  liveRoiLineItems = JSON.parse(JSON.stringify(INITIAL_ROI_LINE_ITEMS));
}

/**
 * Retrieves all ROI reports for a facility
 */
export function getFacilityRoiReports(facilityId) {
  const filtered = liveRoiReports.filter(r =>
    matchesFacilityId(r.facilityId, facilityId) || matchesFacilityId(r.facilityUuid, facilityId)
  );
  return filtered.length > 0 ? filtered : liveRoiReports;
}

/**
 * Retrieves a single ROI report by ID or code
 */
export function getRoiReportByIdOrCode(identifier, facilityId) {
  return liveRoiReports.find(r =>
    (r.id === identifier || r.reportCode === identifier) &&
    (!facilityId || matchesFacilityId(r.facilityId, facilityId) || matchesFacilityId(r.facilityUuid, facilityId))
  ) || liveRoiReports.find(r => r.id === identifier || r.reportCode === identifier) || liveRoiReports[0];
}

/**
 * Retrieves granular line items for an ROI report
 */
export function getRoiValueLineItems(reportIdentifier) {
  const report = getRoiReportByIdOrCode(reportIdentifier);
  return liveRoiLineItems.filter(item =>
    item.reportId === report.id || item.reportCode === report.reportCode
  );
}

/**
 * Retrieves executive ribbon telemetry and KPIs
 */
export function getRoiReportTelemetry(facilityId, reportCode = 'VAL_ROI_2026_YTD') {
  const report = getRoiReportByIdOrCode(reportCode, facilityId);
  const items = getRoiValueLineItems(report.id);

  return {
    facilityId: report.facilityId,
    reportId: report.id,
    reportCode: report.reportCode,
    reportTitle: report.reportTitle,
    periodType: report.periodType,
    periodCode: report.periodCode,
    evaluationDate: report.evaluationDate,
    status: report.status,
    versionNumber: report.versionNumber,
    isActive: report.isActive,
    isPublished: report.isPublished,
    totalPlatformInvestment: report.totalPlatformInvestment,
    annualSoftwareFee: report.annualSoftwareFee,
    implementationFee: report.implementationFee,
    recoveredRevenue: report.recoveredRevenue,
    directSavings: report.directSavings,
    capacityValue: report.capacityValue,
    avoidedCosts: report.avoidedCosts,
    grossValidatedValue: report.grossValidatedValue,
    staffInterventionHours: report.staffInterventionHours,
    hourlyLaborRate: report.hourlyLaborRate,
    staffLaborCost: report.staffLaborCost,
    netValidatedValue: report.netValidatedValue,
    netRoiPercent: report.netRoiPercent,
    roiMultiplier: report.roiMultiplier,
    paybackPeriodMonths: report.paybackPeriodMonths,
    costOfInaction: report.costOfInaction,
    executiveNarrative: report.executiveNarrative,
    frozenHash: report.frozenHash,
    publishedAt: report.publishedAt,
    lineItemCount: items.length,
    metadata: report.metadata
  };
}

/**
 * Publishes and hard-freezes an ROI report with a cryptographic SHA-256 seal
 */
export function publishAndFreezeRoiReport(reportCode, publishedBy = '00000000-0000-0000-0000-000000000001') {
  const report = liveRoiReports.find(r => r.reportCode === reportCode || r.id === reportCode);
  if (!report) {
    throw new Error(`ROI Report ${reportCode} not found`);
  }

  const items = getRoiValueLineItems(report.id);

  const sealPayload = {
    reportId: report.id,
    facilityId: report.facilityId,
    reportCode: report.reportCode,
    periodCode: report.periodCode,
    evaluationDate: report.evaluationDate,
    totalPlatformInvestment: report.totalPlatformInvestment,
    grossValidatedValue: report.grossValidatedValue,
    netValidatedValue: report.netValidatedValue,
    netRoiPercent: report.netRoiPercent,
    roiMultiplier: report.roiMultiplier,
    paybackPeriodMonths: report.paybackPeriodMonths,
    lineItemCount: items.length,
    publishedBy,
    publishedAt: new Date().toISOString()
  };

  const seal = computeRoiReportHash(sealPayload);

  report.status = ROI_REPORT_STATUSES.PUBLISHED_AUDITED;
  report.isPublished = true;
  report.publishedBy = publishedBy;
  report.publishedAt = sealPayload.publishedAt;
  report.frozenHash = seal;

  return {
    success: true,
    reportId: report.id,
    reportCode: report.reportCode,
    status: report.status,
    frozenHash: seal,
    publishedAt: report.publishedAt
  };
}

/**
 * Compiles boardroom presentation dossier
 */
export function generateRoiDossier(reportCode, facilityId) {
  const telemetry = getRoiReportTelemetry(facilityId, reportCode);
  const items = getRoiValueLineItems(reportCode);

  return {
    report: telemetry,
    lineItems: items,
    printedAt: new Date().toISOString(),
    governanceSeal: telemetry.frozenHash
  };
}
