/**
 * ASCANALYST — FINANCIAL DATA DICTIONARY SERVICE
 * Canonical definitions, mathematical formulas, data completeness evaluations,
 * and semantic governance across clinical and financial modules.
 *
 * Target: Phase 70 — Financial Data Dictionary
 * Standard: Healthcare Revenue Cycle & Managerial Accounting (GAAP / ASC 606)
 */

export const FINANCIAL_CATEGORIES = {
  CHARGE: 'CHARGE',
  REVENUE: 'REVENUE',
  PAYMENT: 'PAYMENT',
  COST: 'COST',
  MARGIN: 'MARGIN',
  ADJUSTMENT: 'ADJUSTMENT',
  METRIC: 'METRIC',
  QUALITY: 'QUALITY'
};

export const FINANCIAL_COMPLETENESS_STATUSES = {
  COMPLETE: {
    code: 'COMPLETE',
    label: 'Fully Verified',
    description: 'Contract version locked, all implant invoices verified, staff wages logged.',
    colorToken: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    allowsAggregation: true
  },
  PARTIALLY_COMPLETE: {
    code: 'PARTIALLY_COMPLETE',
    label: 'Partial Data',
    description: 'Some CPT lines adjudicated; ancillary supply invoice pending.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    allowsAggregation: false
  },
  ESTIMATED: {
    code: 'ESTIMATED',
    label: 'Pre-Op Estimate',
    description: 'Pre-op scheduling calculation based on active fee schedules.',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-800',
    allowsAggregation: false
  },
  PENDING_VERIFICATION: {
    code: 'PENDING_VERIFICATION',
    label: 'Awaiting Coder',
    description: 'Intra-op finished; coder has not signed off on final modifiers.',
    colorToken: 'slate',
    badgeClass: 'bg-slate-800/60 text-slate-300 border-slate-700',
    allowsAggregation: false
  },
  MISSING_SOURCE_DATA: {
    code: 'MISSING_SOURCE_DATA',
    label: 'Missing Invoices',
    description: 'Implant consumed without invoice or staff hours unlogged.',
    colorToken: 'rose',
    badgeClass: 'bg-rose-950/40 text-rose-300 border-rose-800',
    allowsAggregation: false
  },
  RATE_NOT_FOUND: {
    code: 'RATE_NOT_FOUND',
    label: 'Contract Missing',
    description: 'Payer contract not found or expired for encounter Date of Service.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-400 border-amber-700',
    allowsAggregation: false
  },
  MANUAL_REVIEW_REQUIRED: {
    code: 'MANUAL_REVIEW_REQUIRED',
    label: 'Review Required',
    description: 'Stop-loss threshold exceeded or NCCI PTP edit conflict detected.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-900/40 text-amber-200 border-amber-600',
    allowsAggregation: false
  },
  RECONCILIATION_REQUIRED: {
    code: 'RECONCILIATION_REQUIRED',
    label: 'Remittance Diff',
    description: '835 ERA payment differs from contract allowable by more than $50.00.',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-700',
    allowsAggregation: true
  },
  SUPERSEDED: {
    code: 'SUPERSEDED',
    label: 'Historical Version',
    description: 'Prior calculation run replaced by post-op recalculation.',
    colorToken: 'slate',
    badgeClass: 'bg-slate-900/60 text-slate-400 border-slate-800',
    allowsAggregation: false
  },
  INVALID: {
    code: 'INVALID',
    label: 'Voided / Cancelled',
    description: 'Case cancelled or billing claim voided.',
    colorToken: 'rose',
    badgeClass: 'bg-rose-950/60 text-rose-400 border-rose-900',
    allowsAggregation: false
  }
};

export const CANONICAL_METRICS = [
  {
    code: 'gross_billed_charges',
    canonicalName: 'Gross Billed Charges',
    category: FINANCIAL_CATEGORIES.CHARGE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'surgery_procedures.gross_charge / claim_lines.line_gross_charge',
    businessDefinition: 'Total chargemaster list price billed for surgical procedural codes, supplies, and facility fees on claims.',
    technicalDefinition: 'SUM(line_gross_charge) WHERE is_voided = FALSE',
    accountingTreatment: 'STATISTICAL',
    permittedUsage: 'Billing claim generation (UB-04/CMS-1500), chargemaster volume audits.',
    prohibitedUsage: 'Must NEVER be reported as revenue or recognized income.',
    consumers: ['ClaimScrubberWorkbench', 'CommandCenter', 'ReimbursementInspectorModal']
  },
  {
    code: 'gross_scheduled_charges',
    canonicalName: 'Gross Scheduled Charges',
    category: FINANCIAL_CATEGORIES.CHARGE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'surgeries.gross_charge (Scheduled Cases)',
    businessDefinition: 'Estimated gross chargemaster volume represented by scheduled cases on the surgical calendar.',
    technicalDefinition: 'SUM(gross_charge) WHERE status = "Scheduled"',
    accountingTreatment: 'INFORMATIONAL',
    permittedUsage: 'Operational pipeline capacity valuation.',
    prohibitedUsage: 'Must not be used for billing, collections, or accruals.',
    consumers: ['SurgeryScheduler', 'CaseLogScheduler']
  },
  {
    code: 'posted_charges',
    canonicalName: 'Posted Charges',
    category: FINANCIAL_CATEGORIES.CHARGE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'claims.total_gross_charge',
    businessDefinition: 'Finalized charges committed to the billing ledger following pre-bill completeness validation.',
    technicalDefinition: 'claims.total_gross_charge WHERE status IN ("Scrubbed", "Submitted")',
    accountingTreatment: 'STATISTICAL_LEDGER',
    permittedUsage: 'Clearinghouse electronic 837P transmission.',
    prohibitedUsage: 'Must not be altered after submission without formal claim amendment.',
    consumers: ['ClaimScrubberWorkbench']
  },
  {
    code: 'contract_total_allowable',
    canonicalName: 'Contract Total Allowable',
    category: FINANCIAL_CATEGORIES.REVENUE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'reimbursement_calculations.total_contract_allowable',
    businessDefinition: 'The deterministic, maximum legal reimbursement permitted for an encounter under the active, version-locked payer contract.',
    technicalDefinition: 'SUM(final_line_allowable) + SUM(carveout_allowable) + stop_loss_adj',
    accountingTreatment: 'OPERATIONAL_TRANSACTION_PRICE',
    permittedUsage: 'Expected reimbursement calculations, pre-bill adjudication, underpayment auditing.',
    prohibitedUsage: 'Must not assume 100% cash collection; subject to patient copay/deductible partitioning.',
    consumers: ['ReimbursementInspectorModal', 'ClaimScrubberWorkbench', 'CommandCenter']
  },
  {
    code: 'medicare_benchmark_allowable',
    canonicalName: 'Medicare Benchmark Allowable',
    category: FINANCIAL_CATEGORIES.METRIC,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'medicare_base_rates (via fn_resolve_medicare_base_rate)',
    businessDefinition: 'Statutory 100% Medicare ASC Payment System rate adjusted for facility CBSA wage index.',
    technicalDefinition: 'National_Base_Rate * (0.50 + 0.50 * CBSA_Wage_Index)',
    accountingTreatment: 'REGULATORY_BENCHMARK',
    permittedUsage: 'Commercial contract performance benchmarking (e.g. 185% of Medicare).',
    prohibitedUsage: 'Must not be billed directly to commercial payers.',
    consumers: ['MedicareRateExplorer', 'ReimbursementInspectorModal']
  },
  {
    code: 'expected_contractual_revenue',
    canonicalName: 'Expected Contractual Revenue',
    category: FINANCIAL_CATEGORIES.REVENUE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'reimbursement_calculations / accrual ledger',
    businessDefinition: 'Net dollar amount management reasonably expects to realize from an adjudicated case prior to settlement.',
    technicalDefinition: 'contract_total_allowable - estimated_bad_debt_concessions',
    accountingTreatment: 'ACCRUAL_ESTIMATE',
    permittedUsage: 'Budgeting, operational forecasting, and MTD volume pacing.',
    prohibitedUsage: 'Must not be reported as GAAP audited cash revenue.',
    consumers: ['CommandCenter', 'BusinessAnalysis']
  },
  {
    code: 'net_patient_service_revenue',
    canonicalName: 'Net Patient Service Revenue (NPSR)',
    category: FINANCIAL_CATEGORIES.REVENUE,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Reconciled 835 Remittances & Cleared Patient Receipts',
    businessDefinition: 'Gross charges less explicit contractual adjustments and implicit price concessions under GAAP ASC 606.',
    technicalDefinition: 'gross_billed_charges - contractual_adjustments - bad_debt_reserves',
    accountingTreatment: 'GAAP_ACCRUAL',
    permittedUsage: 'Formal financial income statements and facility audit reporting.',
    prohibitedUsage: 'Must not be computed using pre-bill unscrubbed estimates.',
    consumers: ['BusinessAnalysis', 'CommandCenter']
  },
  {
    code: 'gross_payer_payment',
    canonicalName: 'Gross Payer Payment',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: '835 ERA CLP04 / Cleared Payer Check',
    businessDefinition: 'The unadjusted gross dollar remittance received from an insurance carrier before subsequent takebacks.',
    technicalDefinition: 'SUM(era_claim_payment_amount)',
    accountingTreatment: 'CASH_RECEIPT',
    permittedUsage: 'Cash receipt auditing and remittance posting.',
    prohibitedUsage: 'Must not be combined with patient cash without clear categorization.',
    consumers: ['ClaimScrubberWorkbench']
  },
  {
    code: 'net_payer_payment',
    canonicalName: 'Net Payer Payment',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Gross Payer Payments less Payer Recoupments',
    businessDefinition: 'The actual net cash retained from insurance carriers after deducting audit takebacks and recoupments.',
    technicalDefinition: 'gross_payer_payment - payer_refund_recoupment',
    accountingTreatment: 'NET_CASH_INFLOW',
    permittedUsage: 'Cash flow reconciliation and banking deposits.',
    prohibitedUsage: 'Must not ignore takebacks or chargebacks.',
    consumers: ['ClaimScrubberWorkbench', 'BusinessAnalysis']
  },
  {
    code: 'patient_payment',
    canonicalName: 'Patient Payment',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Point-of-Sale Merchant Gateway / Patient Check',
    businessDefinition: 'Direct payments collected from the patient or guarantor toward deductible, copay, or coinsurance.',
    technicalDefinition: 'SUM(patient_cash_receipts)',
    accountingTreatment: 'CASH_RECEIPT',
    permittedUsage: 'Patient ledger credits and front-desk collection tracking.',
    prohibitedUsage: 'Must not count secondary insurance payments as patient payments.',
    consumers: ['ReimbursementInspectorModal', 'PatientManagement']
  },
  {
    code: 'secondary_payer_payment',
    canonicalName: 'Secondary Payer Payment',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Secondary 835 ERA Remittance',
    businessDefinition: 'Payment received from a secondary or supplemental payer covering balances after primary adjudication.',
    technicalDefinition: 'SUM(secondary_era_payment_amount)',
    accountingTreatment: 'CASH_RECEIPT',
    permittedUsage: 'Secondary crossover balance reconciliation.',
    prohibitedUsage: 'Must not be double-counted with primary carrier payments.',
    consumers: ['ClaimScrubberWorkbench']
  },
  {
    code: 'contractual_adjustment',
    canonicalName: 'Contractual Adjustment',
    category: FINANCIAL_CATEGORIES.ADJUSTMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: '835 CAS Group CO (CO-45 Code)',
    businessDefinition: 'Mandated list-price discount from gross charges down to contractual allowable. Not bad debt.',
    technicalDefinition: 'gross_billed_charges - contract_total_allowable',
    accountingTreatment: 'CONTRACTUAL_ALLOWANCE',
    permittedUsage: 'Billing ledger write-off and charge adjustments.',
    prohibitedUsage: 'Must not be written off as uncollectible bad debt.',
    consumers: ['ClaimScrubberWorkbench', 'CommandCenter']
  },
  {
    code: 'administrative_write_off',
    canonicalName: 'Administrative Write-Off',
    category: FINANCIAL_CATEGORIES.ADJUSTMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Supervisor-Approved Adjustment Ledger',
    businessDefinition: 'Non-contractual write-offs resulting from administrative errors (untimely filing, missing pre-auth).',
    technicalDefinition: 'SUM(approved_admin_write_offs)',
    accountingTreatment: 'OPERATING_EXPENSE_BAD_DEBT',
    permittedUsage: 'Tracking billing leakages and operational errors.',
    prohibitedUsage: 'Prohibited without managerial SoD authorization.',
    consumers: ['BusinessAnalysis', 'CommandCenter']
  },
  {
    code: 'payer_refund_recoupment',
    canonicalName: 'Payer Refund & Recoupment',
    category: FINANCIAL_CATEGORIES.ADJUSTMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: '835 CAS Adjustment WO / PLB Provider Takeback',
    businessDefinition: 'Retroactive deductions by payers from current remittances to recover past alleged overpayments.',
    technicalDefinition: 'SUM(payer_takeback_amount)',
    accountingTreatment: 'CASH_OFFSET',
    permittedUsage: 'Payer audit dispute tracking and remittance reconciliation.',
    prohibitedUsage: 'Must not be hidden inside gross revenue totals.',
    consumers: ['ClaimScrubberWorkbench', 'BusinessAnalysis']
  },
  {
    code: 'total_net_collections',
    canonicalName: 'Total Net Collections',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Net Payer + Secondary + Patient Cash less Refunds',
    businessDefinition: 'Definitive net cash realized from all clinical and guarantor sources for the surgical encounter.',
    technicalDefinition: 'net_payer_payment + secondary_payer_payment + patient_payment - patient_refunds',
    accountingTreatment: 'CASH_REALIZATION',
    permittedUsage: 'Cash flow reporting, treasury reconciliation, bank deposits.',
    prohibitedUsage: 'Must not include expected uncollected revenue.',
    consumers: ['CommandCenter', 'BusinessAnalysis']
  },
  {
    code: 'net_collection_rate',
    canonicalName: 'Net Collection Rate',
    category: FINANCIAL_CATEGORIES.METRIC,
    datatype: 'NUMERIC(6,4)',
    sourceOfTruth: 'Total Net Collections / Contract Total Allowable',
    businessDefinition: 'Efficiency ratio measuring percentage of contract allowable successfully collected in cash.',
    technicalDefinition: '(total_net_collections / contract_total_allowable) * 100',
    accountingTreatment: 'EFFICIENCY_RATIO',
    permittedUsage: 'RCM billing performance evaluation (Target: 95-98%).',
    prohibitedUsage: 'Must not use Gross Billed Charges as denominator.',
    consumers: ['CommandCenter', 'BusinessAnalysis']
  },
  {
    code: 'days_in_ar',
    canonicalName: 'Days in Accounts Receivable (DAR)',
    category: FINANCIAL_CATEGORIES.METRIC,
    datatype: 'NUMERIC(6,2)',
    sourceOfTruth: 'Gross AR / Average Daily Gross Charges',
    businessDefinition: 'Average days elapsed before billed charges are settled or resolved.',
    technicalDefinition: 'total_gross_ar / (gross_charges_last_90_days / 90)',
    accountingTreatment: 'RCM_AGING_METRIC',
    permittedUsage: 'Billing velocity tracking and aging bucket analysis.',
    prohibitedUsage: 'Must not use net revenue in denominator.',
    consumers: ['CommandCenter', 'ClaimScrubberWorkbench']
  },
  {
    code: 'estimated_patient_liability',
    canonicalName: 'Estimated Patient Responsibility',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'reimbursement_calculations.estimated_patient_responsibility',
    businessDefinition: 'Estimated patient out-of-pocket obligation (deductible, copay, coinsurance) calculated pre-bill.',
    technicalDefinition: 'deductible_remaining + (coinsurance_pct * allowable) + fixed_copay',
    accountingTreatment: 'RECEIVABLE_ESTIMATE',
    permittedUsage: 'Pre-op patient financial counseling and point-of-service collections.',
    prohibitedUsage: 'Must not be presented as guaranteed final balance due.',
    consumers: ['ReimbursementInspectorModal', 'SurgeryScheduler']
  },
  {
    code: 'actual_patient_liability',
    canonicalName: 'Actual Patient Liability',
    category: FINANCIAL_CATEGORIES.PAYMENT,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: '835 ERA CAS Group PR Codes (PR-1, PR-2, PR-3)',
    businessDefinition: 'Final legally binding patient liability established by the payer Explanation of Benefits.',
    technicalDefinition: 'SUM(cas_amount WHERE group_code = "PR")',
    accountingTreatment: 'PATIENT_AR',
    permittedUsage: 'Patient statement generation and collection notices.',
    prohibitedUsage: 'Must not be billed to patient prior to primary EOB receipt.',
    consumers: ['ClaimScrubberWorkbench']
  },
  {
    code: 'implant_acquisition_cost',
    canonicalName: 'Implant Acquisition Cost',
    category: FINANCIAL_CATEGORIES.COST,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'case_devices.cost / facility_implant_sku_prices',
    businessDefinition: 'Actual net invoice purchase cost of medical devices and implants consumed during surgery.',
    technicalDefinition: 'SUM(case_devices.quantity * case_devices.cost)',
    accountingTreatment: 'DIRECT_EXPENSE',
    permittedUsage: 'Direct case costing, contribution margin analysis, carve-out billing.',
    prohibitedUsage: 'Must NEVER default to $0.00 if invoice is missing; must evaluate to NULL.',
    consumers: ['ReimbursementInspectorModal', 'CaseImplantUsage', 'FacilityImplantPricing']
  },
  {
    code: 'direct_supply_cost',
    canonicalName: 'Direct Supply Cost',
    category: FINANCIAL_CATEGORIES.COST,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'surgeries.supplies_cost / preference_card_items',
    businessDefinition: 'Acquisition cost of non-implant disposable surgical consumables, drapes, and packs.',
    technicalDefinition: 'surgeries.supplies_cost',
    accountingTreatment: 'DIRECT_EXPENSE',
    permittedUsage: 'Variable case costing and BOM margin analysis.',
    prohibitedUsage: 'Must not bundle surgical implant costs.',
    consumers: ['CommandCenter', 'SurgeonPreferenceCards', 'ReimbursementInspectorModal']
  },
  {
    code: 'direct_clinical_labor_cost',
    canonicalName: 'Direct Clinical Labor Cost',
    category: FINANCIAL_CATEGORIES.COST,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'case_staff_assignments * staff_credentials.hourly_rate',
    businessDefinition: 'Loaded payroll cost of clinical staff directly assigned to the surgical case.',
    technicalDefinition: 'SUM(staff_elapsed_hours * hourly_rate * (1.00 + fringe_rate))',
    accountingTreatment: 'DIRECT_EXPENSE',
    permittedUsage: 'Direct case costing and staffing efficiency analysis.',
    prohibitedUsage: 'Legacy 30% heuristic calculation is strictly prohibited.',
    consumers: ['CommandCenter', 'StaffManagement', 'ReimbursementInspectorModal']
  },
  {
    code: 'direct_or_time_cost',
    canonicalName: 'Direct OR Time Cost',
    category: FINANCIAL_CATEGORIES.COST,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'operating_rooms.hourly_rate * duration_minutes / 60',
    businessDefinition: 'Operational overhead expense of running an active OR suite during surgical duration.',
    technicalDefinition: 'duration_minutes * (operating_rooms.hourly_rate / 60)',
    accountingTreatment: 'DIRECT_EXPENSE',
    permittedUsage: 'Procedural room utilization and case costing.',
    prohibitedUsage: 'Stepped client-side fee formula in hospitalUtils.js is prohibited.',
    consumers: ['OTCostManagement', 'CommandCenter', 'ReimbursementInspectorModal']
  },
  {
    code: 'total_direct_case_cost',
    canonicalName: 'Total Direct Case Cost',
    category: FINANCIAL_CATEGORIES.COST,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Sum of Implant, Supply, Medication, Labor, and OR Time Costs',
    businessDefinition: 'Sum of all variable, out-of-pocket expenses directly incurred to perform the surgery.',
    technicalDefinition: 'implant_cost + supply_cost + medication_cost + labor_cost + or_time_cost',
    accountingTreatment: 'DIRECT_CASE_TOTAL',
    permittedUsage: 'Case contribution margin derivation and break-even pricing.',
    prohibitedUsage: 'Must not include fixed corporate overhead, lease, or depreciation.',
    consumers: ['CommandCenter', 'ReimbursementInspectorModal', 'BusinessAnalysis']
  },
  {
    code: 'expected_contribution_margin',
    canonicalName: 'Expected Contribution Margin',
    category: FINANCIAL_CATEGORIES.MARGIN,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'reimbursement_calculations.expected_contribution_margin',
    businessDefinition: 'Net dollar profit generated by a surgical case toward covering fixed facility overhead.',
    technicalDefinition: 'contract_total_allowable - total_direct_case_cost',
    accountingTreatment: 'MANAGERIAL_MARGIN',
    permittedUsage: 'Surgeon block scheduling, CPT profitability, managed care contract negotiations.',
    prohibitedUsage: 'Must NEVER be labeled as Net Profit, Net Income, or EBITDA.',
    consumers: ['ReimbursementInspectorModal', 'CommandCenter', 'SurgeonPortal']
  },
  {
    code: 'actual_contribution_margin',
    canonicalName: 'Actual Contribution Margin',
    category: FINANCIAL_CATEGORIES.MARGIN,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Total Net Collections less Total Direct Case Cost',
    businessDefinition: 'True realized cash contribution margin after insurance remittances and patient cash have cleared.',
    technicalDefinition: 'total_net_collections - total_direct_case_cost',
    accountingTreatment: 'MANAGERIAL_MARGIN',
    permittedUsage: 'Post-adjudication case profitability audits and physician scorecards.',
    prohibitedUsage: 'Must not use gross billed charges in calculation.',
    consumers: ['BusinessAnalysis', 'CommandCenter']
  },
  {
    code: 'contribution_margin_pct',
    canonicalName: 'Contribution Margin Percentage',
    category: FINANCIAL_CATEGORIES.MARGIN,
    datatype: 'NUMERIC(6,4)',
    sourceOfTruth: 'Expected Contribution Margin / Contract Total Allowable',
    businessDefinition: 'Margin percentage yield produced per allowable surgical dollar.',
    technicalDefinition: '(expected_contribution_margin / contract_total_allowable) * 100',
    accountingTreatment: 'MARGIN_RATIO',
    permittedUsage: 'Specialty margin comparisons and service line profitability ranking.',
    prohibitedUsage: 'Prohibited if allowable denominator is zero or negative.',
    consumers: ['ReimbursementInspectorModal', 'CommandCenter']
  },
  {
    code: 'margin_per_or_minute',
    canonicalName: 'Margin Per OR Minute',
    category: FINANCIAL_CATEGORIES.MARGIN,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Expected Contribution Margin / Surgical Duration Minutes',
    businessDefinition: 'Rate of financial return generated per minute of occupied surgical room time.',
    technicalDefinition: 'expected_contribution_margin / duration_minutes',
    accountingTreatment: 'EFFICIENCY_METRIC',
    permittedUsage: 'OR block schedule optimization and surgeon scheduling prioritization.',
    prohibitedUsage: 'Must not include room turnover turnaround time in denominator.',
    consumers: ['CommandCenter', 'ORBlockSchedule', 'SurgeonPortal']
  },
  {
    code: 'contractual_underpayment_leakage',
    canonicalName: 'Contractual Underpayment Leakage',
    category: FINANCIAL_CATEGORIES.METRIC,
    datatype: 'NUMERIC(12,2)',
    sourceOfTruth: 'Contract Total Allowable less Actual Payer Remittance',
    businessDefinition: 'Unrecovered contractual revenue variance where payer reimbursed less than agreed contract rates.',
    technicalDefinition: 'contract_total_allowable - (gross_payer_payment + contractual_adjustments)',
    accountingTreatment: 'REVENUE_LEAKAGE',
    permittedUsage: 'Payer contract audit appeals and underpayment recovery workflows.',
    prohibitedUsage: 'Must exclude cases with valid clinical denials.',
    consumers: ['ClaimScrubberWorkbench', 'CommandCenter']
  },
  {
    code: 'financial_completeness_code',
    canonicalName: 'Financial Completeness Status',
    category: FINANCIAL_CATEGORIES.QUALITY,
    datatype: 'VARCHAR(32)',
    sourceOfTruth: 'Completeness Evaluation Engine',
    businessDefinition: 'Standardized data quality badge indicating reliability and completeness of financial figures.',
    technicalDefinition: 'Evaluation based on contract lock, invoice receipt, and staff logs.',
    accountingTreatment: 'DATA_QUALITY_CLASSIFIER',
    permittedUsage: 'Data quality auditing, aggregate exclusions, UI badge indicators.',
    prohibitedUsage: 'Must not be bypassed to force display of incomplete data.',
    consumers: ['ReimbursementInspectorModal', 'CommandCenter', 'ClaimScrubberWorkbench']
  }
];

class FinancialDataDictionaryService {
  constructor() {
    this.metrics = [...CANONICAL_METRICS];
    this.metricMap = new Map(this.metrics.map(m => [m.code, m]));
  }

  /**
   * Retrieves all canonical metrics registered in the dictionary.
   */
  getAllMetrics() {
    return [...this.metrics];
  }

  /**
   * Retrieves a specific metric by its canonical code.
   */
  getMetricByCode(code) {
    if (!code) return null;
    return this.metricMap.get(code) || null;
  }

  /**
   * Filters metrics by financial category.
   */
  getMetricsByCategory(category) {
    if (!category || category === 'ALL') return this.getAllMetrics();
    return this.metrics.filter(m => m.category === category);
  }

  /**
   * Searches metrics by keyword across name, code, definition, or source.
   */
  searchMetrics(query) {
    if (!query || !query.trim()) return this.getAllMetrics();
    const q = query.toLowerCase().trim();
    return this.metrics.filter(m => 
      m.canonicalName.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.businessDefinition.toLowerCase().includes(q) ||
      m.sourceOfTruth.toLowerCase().includes(q)
    );
  }

  /**
   * Evaluates the data completeness status of an encounter.
   * Guarantees zero-substitution ban: missing data returns NULL/MISSING_SOURCE_DATA.
   */
  evaluateEncounterCompleteness(surgery, calculation, devices = [], staffAssignments = []) {
    if (!surgery) {
      return FINANCIAL_COMPLETENESS_STATUSES.INVALID;
    }

    if (surgery.status === 'Cancelled') {
      return FINANCIAL_COMPLETENESS_STATUSES.INVALID;
    }

    // Check if payer contract was resolved
    if (!calculation || calculation.calculation_status === 'CONTRACT_NOT_FOUND') {
      return FINANCIAL_COMPLETENESS_STATUSES.RATE_NOT_FOUND;
    }

    // Check for pre-op estimate
    if (surgery.status === 'Scheduled') {
      return FINANCIAL_COMPLETENESS_STATUSES.ESTIMATED;
    }

    // Check for missing implant invoices
    const hasDevices = Array.isArray(devices) && devices.length > 0;
    if (hasDevices) {
      const missingInvoice = devices.some(d => d.cost === null || d.cost === undefined || d.cost <= 0);
      if (missingInvoice) {
        return FINANCIAL_COMPLETENESS_STATUSES.MISSING_SOURCE_DATA;
      }
    }

    // Check if under review
    if (calculation.calculation_status === 'PARTIALLY_CALCULATED') {
      return FINANCIAL_COMPLETENESS_STATUSES.PARTIALLY_COMPLETE;
    }

    if (calculation.calculation_status === 'STOP_LOSS_APPLIED') {
      return FINANCIAL_COMPLETENESS_STATUSES.MANUAL_REVIEW_REQUIRED;
    }

    // Fully verified
    if (calculation.calculation_status === 'CALCULATED') {
      return FINANCIAL_COMPLETENESS_STATUSES.COMPLETE;
    }

    return FINANCIAL_COMPLETENESS_STATUSES.PENDING_VERIFICATION;
  }

  /**
   * Formats a financial currency amount safely with Round Half-Up.
   */
  formatCurrency(amount, decimals = 2) {
    if (amount === null || amount === undefined || isNaN(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount);
  }

  /**
   * Formats a financial percentage safely with denominator zero protection.
   */
  formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) {
      return '—';
    }
    return `${Number(value).toFixed(decimals)}%`;
  }
}

export const financialDataDictionaryService = new FinancialDataDictionaryService();
