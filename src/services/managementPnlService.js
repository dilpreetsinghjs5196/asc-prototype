/**
 * ==============================================================================
 * Phase E0: Management P&L & Reconciliation Boundaries Service
 * Module 14: CFO Dashboard & Financial Accounting
 * Description: Authoritative GAAP & Managerial P&L Engine for ASCs.
 *              Computes Gross-to-Net Patient Revenue, Direct Clinical Margins,
 *              Operating EBITDA, and Multi-Boundary Reconciliation Checks.
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Zero Prohibited Accent Tokens
 * ==============================================================================
 */

let nodeCrypto = null;
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    nodeCrypto = await import('node:crypto');
  } catch {
    // browser fallback
  }
}

const NAPLES_FACILITY_ALIASES = ['fac-naples-01', '00000000-0000-0000-0000-000000000002'];

export function matchesFacilityId(recordFacilityId, requestedFacilityId) {
  if (!requestedFacilityId || requestedFacilityId === 'ALL') return true;
  if (recordFacilityId === requestedFacilityId) return true;
  if (NAPLES_FACILITY_ALIASES.includes(recordFacilityId) && NAPLES_FACILITY_ALIASES.includes(requestedFacilityId)) {
    return true;
  }
  return false;
}

/**
 * Deterministic cryptographic P&L audit hash
 */
export function computePnlProvenanceHash(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  }
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 = Math.imul(h1 ^ str.charCodeAt(i), 0x01000193);
  }
  return `pnl_hash_${(h1 >>> 0).toString(16)}`.padEnd(64, '0');
}

export const PNL_SECTIONS = {
  GROSS_REVENUE: 'GROSS_REVENUE',
  CONTRACTUAL_DEDUCTIONS: 'CONTRACTUAL_DEDUCTIONS',
  NET_REVENUE: 'NET_REVENUE',
  DIRECT_CLINICAL_COSTS: 'DIRECT_CLINICAL_COSTS',
  CLINICAL_MARGIN: 'CLINICAL_MARGIN',
  VARIABLE_FACILITY_COSTS: 'VARIABLE_FACILITY_COSTS',
  GROSS_OPERATING_PROFIT: 'GROSS_OPERATING_PROFIT',
  FIXED_OVERHEAD_OPEX: 'FIXED_OVERHEAD_OPEX',
  EBITDA: 'EBITDA',
  DEPRECIATION_AMORTIZATION: 'DEPRECIATION_AMORTIZATION',
  NET_OPERATING_INCOME: 'NET_OPERATING_INCOME'
};

export const RECONCILIATION_BOUNDARIES = {
  TRANSACTION_LEDGER_TO_REVENUE: 'TRANSACTION_LEDGER_TO_REVENUE',
  REMITTANCE_835_TO_CASH: 'REMITTANCE_835_TO_CASH',
  INVENTORY_PURCHASE_TO_COST: 'INVENTORY_PURCHASE_TO_COST',
  PAYROLL_JOURNAL_TO_LABOR: 'PAYROLL_JOURNAL_TO_LABOR',
  OVERHEAD_ALLOCATION_BALANCE: 'OVERHEAD_ALLOCATION_BALANCE'
};

export const PERIOD_STATUSES = {
  OPEN: 'OPEN',
  PROVISIONAL_CLOSE: 'PROVISIONAL_CLOSE',
  HARD_CLOSE_FROZEN: 'HARD_CLOSE_FROZEN'
};

/**
 * Deterministic Math Invariant Calculators
 */
export function calculateNpr(grossRevenue = 0, contractualAllowances = 0, writeOffs = 0, badDebt = 0) {
  const gross = Math.max(0, Number(grossRevenue || 0));
  if (gross === 0) return 0.00;
  const ded = Math.abs(Number(contractualAllowances || 0)) + Math.abs(Number(writeOffs || 0)) + Math.abs(Number(badDebt || 0));
  return Math.max(0, Math.round((gross - ded) * 100) / 100);
}

export function calculateDirectClinicalMargin(npr = 0, directClinicalCosts = 0) {
  const rev = Number(npr || 0);
  const costs = Math.abs(Number(directClinicalCosts || 0));
  return Math.round((rev - costs) * 100) / 100;
}

export function calculateGrossOperatingProfit(clinicalMargin = 0, variableFacilityCosts = 0) {
  const cm = Number(clinicalMargin || 0);
  const varCosts = Math.abs(Number(variableFacilityCosts || 0));
  return Math.round((cm - varCosts) * 100) / 100;
}

export function calculateEbitda(grossOperatingProfit = 0, fixedOverhead = 0) {
  const gop = Number(grossOperatingProfit || 0);
  const fixedCosts = Math.abs(Number(fixedOverhead || 0));
  return Math.round((gop - fixedCosts) * 100) / 100;
}

export function calculateNetOperatingIncome(ebitda = 0, depreciationAmortization = 0) {
  const e = Number(ebitda || 0);
  const dep = Math.abs(Number(depreciationAmortization || 0));
  return Math.round((e - dep) * 100) / 100;
}

export function calculateMarginPercentage(amount = 0, npr = 0) {
  const base = Number(npr || 0);
  if (base <= 0) return 0.0;
  return Math.round((Number(amount || 0) / base) * 1000) / 10;
}

export function validateReconciliation(sourceAmount = 0, pnlAmount = 0, tolerance = 0.01) {
  const src = Number(sourceAmount || 0);
  const pnl = Number(pnlAmount || 0);
  const diff = Math.round(Math.abs(src - pnl) * 100) / 100;
  const tol = Math.max(0, Number(tolerance || 0.01));
  const isBalanced = diff <= tol;
  return {
    variance: diff,
    isBalanced,
    status: isBalanced ? 'RECONCILED_BALANCED' : 'VARIANCE_FLAGGED'
  };
}

/**
 * Seed Accounting Periods
 */
export const SEED_MANAGEMENT_PNL_PERIODS = [
  {
    id: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M10',
    periodName: 'October 2026 Management P&L',
    periodType: 'MONTHLY',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: PERIOD_STATUSES.PROVISIONAL_CLOSE,
    isClosed: false,
    closedAt: null,
    closedBy: null,
    frozenHash: null,
    createdAt: '2026-11-01T08:00:00Z',
    updatedAt: '2026-11-20T10:00:00Z'
  },
  {
    id: 'pnl-per-2026-09',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M09',
    periodName: 'September 2026 Management P&L',
    periodType: 'MONTHLY',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status: PERIOD_STATUSES.HARD_CLOSE_FROZEN,
    isClosed: true,
    closedAt: '2026-10-05T17:00:00Z',
    closedBy: 'usr_cfo_marcus',
    frozenHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    createdAt: '2026-10-01T08:00:00Z',
    updatedAt: '2026-10-05T17:00:00Z'
  },
  {
    id: 'pnl-per-2026-08',
    facilityId: 'fac-naples-01',
    periodCode: '2026-M08',
    periodName: 'August 2026 Management P&L',
    periodType: 'MONTHLY',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    status: PERIOD_STATUSES.HARD_CLOSE_FROZEN,
    isClosed: true,
    closedAt: '2026-09-04T16:30:00Z',
    closedBy: 'usr_cfo_marcus',
    frozenHash: 'f4c3b2a10987654321fedcba0123456789abcdef0123456789abcdef01234567',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-04T16:30:00Z'
  }
];

/**
 * Seed P&L Statement Lines (October 2026 baseline for Naples Surgery Center)
 */
export const SEED_MANAGEMENT_PNL_STATEMENT_LINES = [
  // --- Tier 1: GROSS PATIENT REVENUE ---
  {
    id: 'line-10-01',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'REV_OR_PROCEDURES',
    lineNumber: 100,
    lineName: 'Operating Room Procedural Fees',
    section: PNL_SECTIONS.GROSS_REVENUE,
    tier: 1,
    isSummaryLine: false,
    parentLineCode: 'GROSS_PATIENT_REVENUE',
    amount: 1840000.00,
    budgetAmount: 1750000.00,
    priorPeriodAmount: 1790000.00,
    varianceAmount: 90000.00,
    percentOfNpr: 160.0,
    calculationFormula: 'Sum of surgical procedural charges'
  },
  {
    id: 'line-10-02',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'REV_IMPLANTS',
    lineNumber: 110,
    lineName: 'Surgical Implants Gross Billing',
    section: PNL_SECTIONS.GROSS_REVENUE,
    tier: 1,
    isSummaryLine: false,
    parentLineCode: 'GROSS_PATIENT_REVENUE',
    amount: 620000.00,
    budgetAmount: 580000.00,
    priorPeriodAmount: 600000.00,
    varianceAmount: 40000.00,
    percentOfNpr: 53.9,
    calculationFormula: 'Total implant charges billed'
  },
  {
    id: 'line-10-03',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'REV_SUPPLIES',
    lineNumber: 120,
    lineName: 'Medical & Surgical Supplies Billing',
    section: PNL_SECTIONS.GROSS_REVENUE,
    tier: 1,
    isSummaryLine: false,
    parentLineCode: 'GROSS_PATIENT_REVENUE',
    amount: 240000.00,
    budgetAmount: 220000.00,
    priorPeriodAmount: 230000.00,
    varianceAmount: 20000.00,
    percentOfNpr: 20.9,
    calculationFormula: 'Specialty supply itemized billings'
  },
  {
    id: 'line-10-04',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'REV_RECOVERY_PACU',
    lineNumber: 130,
    lineName: 'PACU Recovery & Step-Down Care',
    section: PNL_SECTIONS.GROSS_REVENUE,
    tier: 1,
    isSummaryLine: false,
    parentLineCode: 'GROSS_PATIENT_REVENUE',
    amount: 180000.00,
    budgetAmount: 170000.00,
    priorPeriodAmount: 175000.00,
    varianceAmount: 10000.00,
    percentOfNpr: 15.7,
    calculationFormula: 'Recovery room tiered duration billing'
  },
  {
    id: 'line-10-05',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'GROSS_PATIENT_REVENUE',
    lineNumber: 199,
    lineName: 'GROSS PATIENT REVENUE',
    section: PNL_SECTIONS.GROSS_REVENUE,
    tier: 1,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 2880000.00,
    budgetAmount: 2720000.00,
    priorPeriodAmount: 2795000.00,
    varianceAmount: 160000.00,
    percentOfNpr: 250.4,
    calculationFormula: 'Sum of all procedural charges'
  },

  // --- Tier 2: CONTRACTUAL DEDUCTIONS & ALLOWANCES ---
  {
    id: 'line-10-10',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DED_COMMERCIAL',
    lineNumber: 200,
    lineName: 'Commercial Payer Contractual Allowances',
    section: PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS,
    tier: 2,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEDUCTIONS',
    amount: -1120000.00,
    budgetAmount: -1050000.00,
    priorPeriodAmount: -1080000.00,
    varianceAmount: -70000.00,
    percentOfNpr: -97.4,
    calculationFormula: 'Negotiated commercial fee schedule discounts'
  },
  {
    id: 'line-10-11',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DED_MEDICARE',
    lineNumber: 210,
    lineName: 'Medicare Statutory Allowances',
    section: PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS,
    tier: 2,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEDUCTIONS',
    amount: -540000.00,
    budgetAmount: -510000.00,
    priorPeriodAmount: -530000.00,
    varianceAmount: -30000.00,
    percentOfNpr: -47.0,
    calculationFormula: 'CMS ASC prospective payment rate adjustments'
  },
  {
    id: 'line-10-12',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DED_DENIALS_UNCOLLECTED',
    lineNumber: 220,
    lineName: 'Uncollected Denials & Timely Filing',
    section: PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS,
    tier: 2,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEDUCTIONS',
    amount: -45000.00,
    budgetAmount: -40000.00,
    priorPeriodAmount: -52000.00,
    varianceAmount: -5000.00,
    percentOfNpr: -3.9,
    calculationFormula: 'Write-offs for unappealed or expired denials'
  },
  {
    id: 'line-10-13',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DED_BAD_DEBT',
    lineNumber: 230,
    lineName: 'Patient Copay Bad Debt Provision',
    section: PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS,
    tier: 2,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEDUCTIONS',
    amount: -25000.00,
    budgetAmount: -20000.00,
    priorPeriodAmount: -28000.00,
    varianceAmount: -5000.00,
    percentOfNpr: -2.2,
    calculationFormula: 'Estimated uncollectible patient responsibility'
  },
  {
    id: 'line-10-14',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'TOTAL_DEDUCTIONS',
    lineNumber: 299,
    lineName: 'TOTAL CONTRACTUAL DEDUCTIONS',
    section: PNL_SECTIONS.CONTRACTUAL_DEDUCTIONS,
    tier: 2,
    isSummaryLine: true,
    parentLineCode: null,
    amount: -1730000.00,
    budgetAmount: -1620000.00,
    priorPeriodAmount: -1690000.00,
    varianceAmount: -110000.00,
    percentOfNpr: -150.4,
    calculationFormula: 'Sum of allowances, discounts and bad debt'
  },

  // --- NET PATIENT REVENUE ---
  {
    id: 'line-10-20',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'NET_PATIENT_REVENUE',
    lineNumber: 300,
    lineName: 'NET PATIENT REVENUE (NPR)',
    section: PNL_SECTIONS.NET_REVENUE,
    tier: 2,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 1150000.00,
    budgetAmount: 1100000.00,
    priorPeriodAmount: 1105000.00,
    varianceAmount: 50000.00,
    percentOfNpr: 100.0,
    calculationFormula: 'Gross Charges - Contractual Deductions'
  },

  // --- Tier 3: DIRECT CLINICAL COSTS ---
  {
    id: 'line-10-30',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DIR_IMPLANTS_COST',
    lineNumber: 400,
    lineName: 'Surgical Implants Direct Acquisition Cost',
    section: PNL_SECTIONS.DIRECT_CLINICAL_COSTS,
    tier: 3,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DIRECT_CLINICAL_COSTS',
    amount: -285000.00,
    budgetAmount: -270000.00,
    priorPeriodAmount: -280000.00,
    varianceAmount: -15000.00,
    percentOfNpr: -24.8,
    calculationFormula: 'Vendor invoice cost for consumed implants'
  },
  {
    id: 'line-10-31',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DIR_STERILE_SUPPLIES',
    lineNumber: 410,
    lineName: 'Sterile Packs & Procedural Disposables',
    section: PNL_SECTIONS.DIRECT_CLINICAL_COSTS,
    tier: 3,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DIRECT_CLINICAL_COSTS',
    amount: -115000.00,
    budgetAmount: -110000.00,
    priorPeriodAmount: -112000.00,
    varianceAmount: -5000.00,
    percentOfNpr: -10.0,
    calculationFormula: 'Surgical preference card consumable packs'
  },
  {
    id: 'line-10-32',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DIR_PHARMACEUTICALS',
    lineNumber: 420,
    lineName: 'Anesthesia & Intra-Op Pharmaceuticals',
    section: PNL_SECTIONS.DIRECT_CLINICAL_COSTS,
    tier: 3,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DIRECT_CLINICAL_COSTS',
    amount: -48000.00,
    budgetAmount: -45000.00,
    priorPeriodAmount: -47000.00,
    varianceAmount: -3000.00,
    percentOfNpr: -4.2,
    calculationFormula: 'Medications, gases and anesthesia agents'
  },
  {
    id: 'line-10-33',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DIR_CLINICAL_LABOR',
    lineNumber: 430,
    lineName: 'Direct Intra-Op Nursing & Scrub Labor',
    section: PNL_SECTIONS.DIRECT_CLINICAL_COSTS,
    tier: 3,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DIRECT_CLINICAL_COSTS',
    amount: -152000.00,
    budgetAmount: -155000.00,
    priorPeriodAmount: -154000.00,
    varianceAmount: 3000.00,
    percentOfNpr: -13.2,
    calculationFormula: 'Time-logged clinical procedural hours'
  },
  {
    id: 'line-10-34',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'TOTAL_DIRECT_CLINICAL_COSTS',
    lineNumber: 499,
    lineName: 'TOTAL DIRECT CLINICAL COSTS',
    section: PNL_SECTIONS.DIRECT_CLINICAL_COSTS,
    tier: 3,
    isSummaryLine: true,
    parentLineCode: null,
    amount: -600000.00,
    budgetAmount: -580000.00,
    priorPeriodAmount: -593000.00,
    varianceAmount: -20000.00,
    percentOfNpr: -52.2,
    calculationFormula: 'Implants + Supplies + Pharma + Clinical Labor'
  },

  // --- DIRECT CLINICAL MARGIN ---
  {
    id: 'line-10-40',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DIRECT_CLINICAL_MARGIN',
    lineNumber: 500,
    lineName: 'DIRECT CLINICAL MARGIN (CM)',
    section: PNL_SECTIONS.CLINICAL_MARGIN,
    tier: 3,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 550000.00,
    budgetAmount: 520000.00,
    priorPeriodAmount: 512000.00,
    varianceAmount: 30000.00,
    percentOfNpr: 47.8,
    calculationFormula: 'NPR - Total Direct Clinical Costs'
  },

  // --- Tier 4: VARIABLE FACILITY COSTS ---
  {
    id: 'line-10-50',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'VAR_STERILE_PROCESSING',
    lineNumber: 600,
    lineName: 'SPD Tray Sterilization & Autoclaving',
    section: PNL_SECTIONS.VARIABLE_FACILITY_COSTS,
    tier: 4,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_VARIABLE_FACILITY_COSTS',
    amount: -28000.00,
    budgetAmount: -26000.00,
    priorPeriodAmount: -27000.00,
    varianceAmount: -2000.00,
    percentOfNpr: -2.4,
    calculationFormula: 'Autoclave runs and instrument chemical wraps'
  },
  {
    id: 'line-10-51',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'VAR_BIOMED_WASTE',
    lineNumber: 610,
    lineName: 'Regulated Biohazardous Waste Disposal',
    section: PNL_SECTIONS.VARIABLE_FACILITY_COSTS,
    tier: 4,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_VARIABLE_FACILITY_COSTS',
    amount: -8500.00,
    budgetAmount: -8000.00,
    priorPeriodAmount: -8200.00,
    varianceAmount: -500.00,
    percentOfNpr: -0.7,
    calculationFormula: 'Sharps and biological waste container hauling'
  },
  {
    id: 'line-10-52',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'VAR_LINEN_LAUNDRY',
    lineNumber: 620,
    lineName: 'Surgical Drapes & Scrub Laundry Service',
    section: PNL_SECTIONS.VARIABLE_FACILITY_COSTS,
    tier: 4,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_VARIABLE_FACILITY_COSTS',
    amount: -6500.00,
    budgetAmount: -6000.00,
    priorPeriodAmount: -6300.00,
    varianceAmount: -500.00,
    percentOfNpr: -0.6,
    calculationFormula: 'Commercial textile laundry per surgery weight'
  },
  {
    id: 'line-10-53',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'VAR_UTILITIES_VARIABLE',
    lineNumber: 630,
    lineName: 'OR Medical Gases & Variable HVAC Power',
    section: PNL_SECTIONS.VARIABLE_FACILITY_COSTS,
    tier: 4,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_VARIABLE_FACILITY_COSTS',
    amount: -12000.00,
    budgetAmount: -12000.00,
    priorPeriodAmount: -12500.00,
    varianceAmount: 0.00,
    percentOfNpr: -1.0,
    calculationFormula: 'Oxygen/Nitrous tanks and OR positive-pressure air'
  },
  {
    id: 'line-10-54',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'TOTAL_VARIABLE_FACILITY_COSTS',
    lineNumber: 699,
    lineName: 'TOTAL VARIABLE FACILITY COSTS',
    section: PNL_SECTIONS.VARIABLE_FACILITY_COSTS,
    tier: 4,
    isSummaryLine: true,
    parentLineCode: null,
    amount: -55000.00,
    budgetAmount: -52000.00,
    priorPeriodAmount: -54000.00,
    varianceAmount: -3000.00,
    percentOfNpr: -4.8,
    calculationFormula: 'SPD + Biohazard + Linen + Variable Utilities'
  },

  // --- GROSS OPERATING PROFIT ---
  {
    id: 'line-10-60',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'GROSS_OPERATING_PROFIT',
    lineNumber: 700,
    lineName: 'GROSS OPERATING PROFIT (GOP)',
    section: PNL_SECTIONS.GROSS_OPERATING_PROFIT,
    tier: 4,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 495000.00,
    budgetAmount: 468000.00,
    priorPeriodAmount: 458000.00,
    varianceAmount: 27000.00,
    percentOfNpr: 43.0,
    calculationFormula: 'Clinical Margin - Total Variable Facility Costs'
  },

  // --- Tier 5: FIXED OVERHEAD OPEX ---
  {
    id: 'line-10-70',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'FIX_ADMIN_SALARIES',
    lineNumber: 800,
    lineName: 'Executive & Business Office Compensation',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_FIXED_OVERHEAD',
    amount: -75000.00,
    budgetAmount: -75000.00,
    priorPeriodAmount: -75000.00,
    varianceAmount: 0.00,
    percentOfNpr: -6.5,
    calculationFormula: 'Administrator, CFO, DON and billing staff salaries'
  },
  {
    id: 'line-10-71',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'FIX_FACILITY_LEASE',
    lineNumber: 810,
    lineName: 'Building Lease & Physical Plant Rent',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_FIXED_OVERHEAD',
    amount: -55000.00,
    budgetAmount: -55000.00,
    priorPeriodAmount: -55000.00,
    varianceAmount: 0.00,
    percentOfNpr: -4.8,
    calculationFormula: 'ASC commercial facility contractual lease'
  },
  {
    id: 'line-10-72',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'FIX_INSURANCE',
    lineNumber: 820,
    lineName: 'Professional Malpractice & General Liability',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_FIXED_OVERHEAD',
    amount: -18000.00,
    budgetAmount: -18000.00,
    priorPeriodAmount: -18000.00,
    varianceAmount: 0.00,
    percentOfNpr: -1.6,
    calculationFormula: 'ASC facility liability and corporate policies'
  },
  {
    id: 'line-10-73',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'FIX_IT_BILLING',
    lineNumber: 830,
    lineName: 'EHR Cloud, Clearinghouse & IT Services',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_FIXED_OVERHEAD',
    amount: -22000.00,
    budgetAmount: -20000.00,
    priorPeriodAmount: -21000.00,
    varianceAmount: -2000.00,
    percentOfNpr: -1.9,
    calculationFormula: 'HIPAA cloud systems and EDI clearinghouse'
  },
  {
    id: 'line-10-74',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'FIX_REPAIRS_MAINT',
    lineNumber: 840,
    lineName: 'Bio-Medical Equipment Maintenance Contracts',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_FIXED_OVERHEAD',
    amount: -15000.00,
    budgetAmount: -20000.00,
    priorPeriodAmount: -17000.00,
    varianceAmount: 5000.00,
    percentOfNpr: -1.3,
    calculationFormula: 'Sterilizer and anesthesia PM servicing'
  },
  {
    id: 'line-10-75',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'TOTAL_FIXED_OVERHEAD',
    lineNumber: 899,
    lineName: 'TOTAL FIXED OVERHEAD (OPEX)',
    section: PNL_SECTIONS.FIXED_OVERHEAD_OPEX,
    tier: 5,
    isSummaryLine: true,
    parentLineCode: null,
    amount: -185000.00,
    budgetAmount: -188000.00,
    priorPeriodAmount: -186000.00,
    varianceAmount: 3000.00,
    percentOfNpr: -16.1,
    calculationFormula: 'Sum of administrative and fixed facility OPEX'
  },

  // --- OPERATING EBITDA ---
  {
    id: 'line-10-80',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'EBITDA',
    lineNumber: 900,
    lineName: 'OPERATING EBITDA',
    section: PNL_SECTIONS.EBITDA,
    tier: 5,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 310000.00,
    budgetAmount: 280000.00,
    priorPeriodAmount: 272000.00,
    varianceAmount: 30000.00,
    percentOfNpr: 27.0,
    calculationFormula: 'GOP - Total Fixed Overhead OPEX'
  },

  // --- DEPRECIATION & AMORTIZATION ---
  {
    id: 'line-10-85',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DEP_EQUIPMENT',
    lineNumber: 910,
    lineName: 'Medical Equipment Depreciation (C-Arms, Scopes)',
    section: PNL_SECTIONS.DEPRECIATION_AMORTIZATION,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEP_AMORT',
    amount: -32000.00,
    budgetAmount: -32000.00,
    priorPeriodAmount: -32000.00,
    varianceAmount: 0.00,
    percentOfNpr: -2.8,
    calculationFormula: 'Straight-line 7-year capital depreciation'
  },
  {
    id: 'line-10-86',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'DEP_LEASEHOLD',
    lineNumber: 920,
    lineName: 'Leasehold Improvements Amortization',
    section: PNL_SECTIONS.DEPRECIATION_AMORTIZATION,
    tier: 5,
    isSummaryLine: false,
    parentLineCode: 'TOTAL_DEP_AMORT',
    amount: -8000.00,
    budgetAmount: -8000.00,
    priorPeriodAmount: -8000.00,
    varianceAmount: 0.00,
    percentOfNpr: -0.7,
    calculationFormula: 'Straight-line 15-year leasehold amortization'
  },
  {
    id: 'line-10-87',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'TOTAL_DEP_AMORT',
    lineNumber: 949,
    lineName: 'TOTAL DEPRECIATION & AMORTIZATION',
    section: PNL_SECTIONS.DEPRECIATION_AMORTIZATION,
    tier: 5,
    isSummaryLine: true,
    parentLineCode: null,
    amount: -40000.00,
    budgetAmount: -40000.00,
    priorPeriodAmount: -40000.00,
    varianceAmount: 0.00,
    percentOfNpr: -3.5,
    calculationFormula: 'Equipment Depreciation + Leasehold Amortization'
  },

  // --- NET OPERATING INCOME (EBIT) ---
  {
    id: 'line-10-90',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    lineCode: 'NET_OPERATING_INCOME',
    lineNumber: 999,
    lineName: 'NET OPERATING INCOME (EBIT)',
    section: PNL_SECTIONS.NET_OPERATING_INCOME,
    tier: 5,
    isSummaryLine: true,
    parentLineCode: null,
    amount: 270000.00,
    budgetAmount: 240000.00,
    priorPeriodAmount: 232000.00,
    varianceAmount: 30000.00,
    percentOfNpr: 23.5,
    calculationFormula: 'EBITDA - Total Depreciation & Amortization'
  }
];

/**
 * Seed Multi-Boundary Reconciliations for October 2026
 */
export const SEED_MANAGEMENT_PNL_RECONCILIATIONS = [
  {
    id: 'recon-10-01',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    boundaryType: RECONCILIATION_BOUNDARIES.TRANSACTION_LEDGER_TO_REVENUE,
    boundaryName: 'Case Financial Ledger Entries to P&L Gross Charges',
    sourceSystem: 'case_financial_ledger_entries',
    sourceAmount: 2880000.00,
    pnlLineAmount: 2880000.00,
    varianceAmount: 0.00,
    toleranceThreshold: 0.00,
    reconciliationStatus: 'RECONCILED_BALANCED',
    reconciliationNotes: 'Exact 100.00% match across 412 posted surgery cases.',
    reconciledAt: '2026-11-01T10:00:00Z',
    reconciledBy: 'usr_cfo_marcus',
    auditHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0'
  },
  {
    id: 'recon-10-02',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    boundaryType: RECONCILIATION_BOUNDARIES.REMITTANCE_835_TO_CASH,
    boundaryName: 'EDI 835 Remittance Bank Deposits to Net Cash Collections',
    sourceSystem: 'edi_835_remittances',
    sourceAmount: 1149985.00,
    pnlLineAmount: 1150000.00,
    varianceAmount: 15.00,
    toleranceThreshold: 50.00,
    reconciliationStatus: 'RECONCILED_BALANCED',
    reconciliationNotes: '$15.00 unposted transit item within $50 tolerance threshold.',
    reconciledAt: '2026-11-01T10:05:00Z',
    reconciledBy: 'usr_cfo_marcus',
    auditHash: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01'
  },
  {
    id: 'recon-10-03',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    boundaryType: RECONCILIATION_BOUNDARIES.INVENTORY_PURCHASE_TO_COST,
    boundaryName: 'Vendor Purchase Invoices to Consumed Implants & Supplies',
    sourceSystem: 'vendor_purchase_orders',
    sourceAmount: 400000.00,
    pnlLineAmount: 400000.00,
    varianceAmount: 0.00,
    toleranceThreshold: 0.01,
    reconciliationStatus: 'RECONCILED_BALANCED',
    reconciliationNotes: 'Matches $285K implants + $115K sterile supply consumption.',
    reconciledAt: '2026-11-01T10:10:00Z',
    reconciledBy: 'usr_cfo_marcus',
    auditHash: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012'
  },
  {
    id: 'recon-10-04',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    boundaryType: RECONCILIATION_BOUNDARIES.PAYROLL_JOURNAL_TO_LABOR,
    boundaryName: 'Payroll Clinical Labor Ledger to Direct Procedural Wages',
    sourceSystem: 'payroll_journal_entries',
    sourceAmount: 152000.00,
    pnlLineAmount: 152000.00,
    varianceAmount: 0.00,
    toleranceThreshold: 0.01,
    reconciliationStatus: 'RECONCILED_BALANCED',
    reconciliationNotes: '100% of 2,340 logged clinical OR nurse & scrub hours reconciled.',
    reconciledAt: '2026-11-01T10:15:00Z',
    reconciledBy: 'usr_cfo_marcus',
    auditHash: 'd4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0123'
  },
  {
    id: 'recon-10-05',
    periodId: 'pnl-per-2026-10',
    facilityId: 'fac-naples-01',
    boundaryType: RECONCILIATION_BOUNDARIES.OVERHEAD_ALLOCATION_BALANCE,
    boundaryName: 'Facility General Ledger Overhead to P&L OPEX Schedule',
    sourceSystem: 'gl_operating_expenses',
    sourceAmount: 185000.00,
    pnlLineAmount: 185000.00,
    varianceAmount: 0.00,
    toleranceThreshold: 0.00,
    reconciliationStatus: 'RECONCILED_BALANCED',
    reconciliationNotes: 'Exact 100.00% allocation across rent, admin salaries, and insurance.',
    reconciledAt: '2026-11-01T10:20:00Z',
    reconciledBy: 'usr_cfo_marcus',
    auditHash: 'e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01234'
  }
];

// Active In-Memory Store
let activePeriods = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_PERIODS));
let activeLines = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_STATEMENT_LINES));
let activeReconciliations = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_RECONCILIATIONS));

/**
 * Reset Store to Initial Seeds
 */
export function resetManagementPnlStore() {
  activePeriods = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_PERIODS));
  activeLines = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_STATEMENT_LINES));
  activeReconciliations = JSON.parse(JSON.stringify(SEED_MANAGEMENT_PNL_RECONCILIATIONS));
  return { activePeriods, activeLines, activeReconciliations };
}

/**
 * Retrieve Accounting Periods for a Facility
 */
export function getManagementPnlPeriods(facilityId = 'fac-naples-01') {
  return activePeriods.filter(p => matchesFacilityId(p.facilityId, facilityId));
}

/**
 * Retrieve Period by ID or Period Code
 */
export function getPeriodByIdOrCode(periodIdOrCode, facilityId = 'fac-naples-01') {
  if (!periodIdOrCode) return activePeriods[0] || null;
  const target = String(periodIdOrCode).toLowerCase();
  return activePeriods.find(p =>
    matchesFacilityId(p.facilityId, facilityId) &&
    (p.id.toLowerCase() === target || p.periodCode.toLowerCase() === target)
  ) || null;
}

/**
 * Retrieve Statement Lines for a Period
 */
export function getPnlStatementLines(periodId, options = {}) {
  const { section = 'ALL', search = '' } = options;
  let lines = activeLines.filter(l => l.periodId === periodId);

  if (section && section !== 'ALL') {
    lines = lines.filter(l => l.section === section);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    lines = lines.filter(l =>
      l.lineName.toLowerCase().includes(q) ||
      l.lineCode.toLowerCase().includes(q) ||
      (l.calculationFormula && l.calculationFormula.toLowerCase().includes(q))
    );
  }

  return lines.sort((a, b) => a.lineNumber - b.lineNumber);
}

/**
 * Retrieve Reconciliations for a Period
 */
export function getPeriodReconciliations(periodId) {
  return activeReconciliations.filter(r => r.periodId === periodId);
}

/**
 * Compute P&L Summary & Margin Ratios from Statement Lines
 */
export function calculatePnlSummary(statementLines = []) {
  const linesMap = {};
  statementLines.forEach(l => {
    linesMap[l.lineCode] = Number(l.amount || 0);
  });

  const grossPatientRevenue = linesMap['GROSS_PATIENT_REVENUE'] || 0;
  const totalDeductions = linesMap['TOTAL_DEDUCTIONS'] || 0;
  const netPatientRevenue = linesMap['NET_PATIENT_REVENUE'] || calculateNpr(grossPatientRevenue, totalDeductions);
  const totalDirectCosts = linesMap['TOTAL_DIRECT_CLINICAL_COSTS'] || 0;
  const directClinicalMargin = linesMap['DIRECT_CLINICAL_MARGIN'] || calculateDirectClinicalMargin(netPatientRevenue, totalDirectCosts);
  const totalVariableCosts = linesMap['TOTAL_VARIABLE_FACILITY_COSTS'] || 0;
  const grossOperatingProfit = linesMap['GROSS_OPERATING_PROFIT'] || calculateGrossOperatingProfit(directClinicalMargin, totalVariableCosts);
  const totalFixedOverhead = linesMap['TOTAL_FIXED_OVERHEAD'] || 0;
  const ebitda = linesMap['EBITDA'] || calculateEbitda(grossOperatingProfit, totalFixedOverhead);
  const totalDepAmort = linesMap['TOTAL_DEP_AMORT'] || 0;
  const netOperatingIncome = linesMap['NET_OPERATING_INCOME'] || calculateNetOperatingIncome(ebitda, totalDepAmort);

  return {
    grossPatientRevenue,
    totalDeductions,
    netPatientRevenue,
    totalDirectCosts,
    directClinicalMargin,
    clinicalMarginPct: calculateMarginPercentage(directClinicalMargin, netPatientRevenue),
    totalVariableCosts,
    grossOperatingProfit,
    grossOperatingProfitPct: calculateMarginPercentage(grossOperatingProfit, netPatientRevenue),
    totalFixedOverhead,
    ebitda,
    ebitdaMarginPct: calculateMarginPercentage(ebitda, netPatientRevenue),
    totalDepAmort,
    netOperatingIncome,
    operatingMarginPct: calculateMarginPercentage(netOperatingIncome, netPatientRevenue)
  };
}

/**
 * Freeze Accounting Period (Hard Close Governance)
 */
export function freezeAccountingPeriod(periodId, userContext = {}) {
  const period = activePeriods.find(p => p.id === periodId);
  if (!period) throw new Error(`Accounting period "${periodId}" not found.`);

  if (period.status === PERIOD_STATUSES.HARD_CLOSE_FROZEN) {
    throw new Error(`Accounting period "${period.periodCode}" is already frozen.`);
  }

  // Pre-freeze validation: Check all reconciliation boundaries
  const recons = getPeriodReconciliations(periodId);
  const unbalanced = recons.filter(r => r.reconciliationStatus !== 'RECONCILED_BALANCED');
  if (unbalanced.length > 0) {
    throw new Error(`Cannot freeze period: ${unbalanced.length} reconciliation boundary checkpoints are flagged with unresolved variance.`);
  }

  const lines = getPnlStatementLines(periodId);
  const summary = calculatePnlSummary(lines);

  const frozenHash = computePnlProvenanceHash({
    periodId,
    periodCode: period.periodCode,
    summary,
    closedBy: userContext.userId || 'usr_cfo_marcus',
    closedAt: new Date().toISOString()
  });

  period.status = PERIOD_STATUSES.HARD_CLOSE_FROZEN;
  period.isClosed = true;
  period.closedAt = new Date().toISOString();
  period.closedBy = userContext.userId || 'usr_cfo_marcus';
  period.frozenHash = frozenHash;
  period.updatedAt = new Date().toISOString();

  return {
    success: true,
    period,
    frozenHash
  };
}

/**
 * P&L Telemetry Aggregator
 */
export function getManagementPnlTelemetry(facilityId = 'fac-naples-01', periodCode = null) {
  const periods = getManagementPnlPeriods(facilityId);
  const activePeriod = periodCode
    ? getPeriodByIdOrCode(periodCode, facilityId)
    : periods.find(p => p.status === PERIOD_STATUSES.PROVISIONAL_CLOSE) || periods[0];

  if (!activePeriod) {
    return {
      periodCode: 'NONE',
      periodName: 'No Active Period',
      periodStatus: 'NONE',
      netPatientRevenue: 0,
      directClinicalMargin: 0,
      clinicalMarginPct: 0,
      ebitda: 0,
      ebitdaMarginPct: 0,
      netOperatingIncome: 0,
      operatingMarginPct: 0,
      reconciliationsCount: 0,
      balancedCount: 0,
      flaggedCount: 0
    };
  }

  const lines = getPnlStatementLines(activePeriod.id);
  const summary = calculatePnlSummary(lines);
  const recons = getPeriodReconciliations(activePeriod.id);
  const balanced = recons.filter(r => r.reconciliationStatus === 'RECONCILED_BALANCED').length;
  const flagged = recons.length - balanced;

  return {
    periodId: activePeriod.id,
    periodCode: activePeriod.periodCode,
    periodName: activePeriod.periodName,
    periodStatus: activePeriod.status,
    isClosed: activePeriod.isClosed,
    frozenHash: activePeriod.frozenHash,
    ...summary,
    reconciliationsCount: recons.length,
    balancedCount: balanced,
    flaggedCount: flagged,
    reconciliationHealth: flagged === 0 ? '100% Balanced' : `${flagged} Variances Detected`
  };
}
